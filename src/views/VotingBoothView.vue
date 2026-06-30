<script setup>
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJson, postJson } from '../lib/api'
import { getCachedSiteBranding, hexToRgba, resolveBrandingColors, syncSiteBrandingCache } from '../lib/branding'
import { isWebNfcSupported, scanSingleNfcBadge } from '../lib/nfc'

const router = useRouter()
const cachedBranding = getCachedSiteBranding()
const homeSiteLogo = ref(cachedBranding.siteLogo)
const homeSiteName = ref(cachedBranding.siteName)
const homeSiteTagline = ref(cachedBranding.siteTagline)
const brandingColors = ref(resolveBrandingColors(cachedBranding.brandingColors))
const roundSummary = ref(null)
const finishedRoundSummary = ref(null)
const rosterSummary = ref(null)
const publicCategories = ref([])
const pendingVoteCard = ref(null)
const verifiedVoter = ref(null)
const badgeId = ref('')
const isRosterLookupModalOpen = ref(false)
const rosterBadgeId = ref('')
const rosterLookupError = ref('')
const rosterLookupResult = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const toast = ref({
  visible: false,
  type: 'success',
  title: '',
  message: '',
})
const isLoadingRound = ref(true)
const isMobileMenuOpen = ref(false)
const isPreparingVote = ref(false)
const isSubmitting = ref(false)
const isCameraModalOpen = ref(false)
const isMobileTipsModalOpen = ref(false)
const isCameraOpen = ref(false)
const isCameraLoading = ref(false)
const isNfcScanning = ref(false)
const isCheckingRoster = ref(false)
const cameraMode = ref('environment')
const availableCameras = ref([])
const selectedCameraId = ref('')
const scannerContext = ref('vote')
const scannerMessage = ref('Starting camera...')
const videoRef = ref(null)
const nowTick = ref(Date.now())

let scannerReader = null
let audioContext = null
let lastDetectedBadge = ''
let lastDetectedAt = 0
let countdownInterval = null
let roundRefreshInterval = null
let toastTimeout = null
let hasReloadedAfterCountdown = false
let scannerTuneInterval = null
let nfcAbortController = null
const canUseNfc = isWebNfcSupported()
const brandingVars = computed(() => {
  const palette = resolveBrandingColors(brandingColors.value)

  return {
    '--brand-primary': palette.primaryColor,
    '--brand-secondary': palette.secondaryColor,
    '--brand-accent': palette.accentColor,
    '--brand-surface': palette.surfaceColor,
    '--brand-border': palette.borderColor,
    '--brand-primary-soft': hexToRgba(palette.primaryColor, 0.18),
    '--brand-secondary-soft': hexToRgba(palette.secondaryColor, 0.18),
    '--brand-accent-soft': hexToRgba(palette.accentColor, 0.14),
    '--brand-surface-soft': hexToRgba(palette.surfaceColor, 0.92),
    '--brand-border-soft': hexToRgba(palette.borderColor, 0.7),
  }
})

const buildScannerConstraints = (mode = 'vote') => {
  const baseConstraints = {
    width: { ideal: mode === 'roster' ? 2560 : 1920, min: 640 },
    height: { ideal: mode === 'roster' ? 1440 : 1080, min: 480 },
    aspectRatio: { ideal: 1.7777777778 },
    frameRate: { ideal: mode === 'roster' ? 90 : 60, min: 24 },
  }

  return selectedCameraId.value
    ? {
        ...baseConstraints,
        deviceId: { exact: selectedCameraId.value },
      }
    : {
        ...baseConstraints,
        facingMode: { ideal: cameraMode.value },
      }
}

const optimizeScannerTrack = async () => {
  const track = videoRef.value?.srcObject?.getVideoTracks?.()[0]

  if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') {
    return
  }

  const capabilities = track.getCapabilities()
  const advanced = []

  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' })
  }

  if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
    advanced.push({ exposureMode: 'continuous' })
  }

  if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  if (typeof capabilities.zoom?.max === 'number' && capabilities.zoom.max > 1) {
    const minZoom = typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 1
    advanced.push({ zoom: Math.min(capabilities.zoom.max, Math.max(minZoom, 1.35)) })
  }

  if (typeof capabilities.brightness?.max === 'number' && typeof capabilities.brightness?.min === 'number') {
    advanced.push({
      brightness: Math.min(capabilities.brightness.max, Math.max(capabilities.brightness.min, 0.18)),
    })
  }

  if (typeof capabilities.contrast?.max === 'number' && typeof capabilities.contrast?.min === 'number') {
    advanced.push({
      contrast: Math.min(capabilities.contrast.max, Math.max(capabilities.contrast.min, 1)),
    })
  }

  if (
    typeof capabilities.exposureCompensation?.max === 'number' &&
    typeof capabilities.exposureCompensation?.min === 'number'
  ) {
    advanced.push({
      exposureCompensation: Math.min(
        capabilities.exposureCompensation.max,
        Math.max(capabilities.exposureCompensation.min, 0.25),
      ),
    })
  }

  if (typeof capabilities.sharpness?.max === 'number' && typeof capabilities.sharpness?.min === 'number') {
    advanced.push({
      sharpness: Math.min(capabilities.sharpness.max, Math.max(capabilities.sharpness.min, 22)),
    })
  }

  if (capabilities.torch === true) {
    advanced.push({ torch: true })
  }

  if (!advanced.length) {
    return
  }

  try {
    await track.applyConstraints({ advanced })
  } catch {
    // Ignore unsupported camera tuning constraints.
  }
}

const scannerFormats = [
  BarcodeFormat.CODABAR,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_8,
  BarcodeFormat.EAN_13,
  BarcodeFormat.ITF,
  BarcodeFormat.PDF_417,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]

const canFlipCamera = computed(
  () => availableCameras.value.length > 1 || isCameraOpen.value || isCameraModalOpen.value,
)
const roundInfo = computed(() => roundSummary.value)
const finishedRoundInfo = computed(() => finishedRoundSummary.value)
const rosterInfo = computed(() => rosterSummary.value)
const displayRound = computed(() => roundInfo.value || finishedRoundInfo.value || rosterInfo.value)
const isRosterState = computed(() => !roundInfo.value && Boolean(rosterInfo.value))
const isFinishedRoundState = computed(() => !roundInfo.value && Boolean(finishedRoundInfo.value))
const finishedRoundVisibility = computed(() => {
  const visibility = finishedRoundInfo.value?.resultVisibility
  return visibility === 'VISIBLE' || visibility === 'HIDDEN' || visibility === 'WAITING'
    ? visibility
    : finishedRoundInfo.value?.winnersPublished
      ? 'VISIBLE'
      : 'WAITING'
})
const hasPublishedWinners = computed(
  () => isFinishedRoundState.value && Boolean(finishedRoundInfo.value?.winnersPublished) && (finishedRoundInfo.value?.winners?.length || 0) > 0,
)
const showResultsOnlyPage = computed(
  () => isFinishedRoundState.value && finishedRoundVisibility.value === 'VISIBLE' && hasPublishedWinners.value,
)
const rosterSections = computed(() => rosterInfo.value?.sections || [])
const filledRosterSections = computed(() =>
  rosterSections.value.filter((section) => (section.associates?.length || 0) > 0),
)
const rosterAssociateCount = computed(() =>
  rosterSections.value.reduce((sum, section) => sum + (section.associates?.length || 0), 0),
)
const rosterSectionCount = computed(() => filledRosterSections.value.length)
const rosterStationCount = computed(() =>
  rosterSections.value.reduce(
    (sum, section) => sum + section.associates.filter((associate) => associate.stationId).length,
    0,
  ),
)
const showConfirmVoteStep = computed(
  () =>
    scannerContext.value === 'vote' &&
    isCameraModalOpen.value &&
    Boolean(pendingVoteCard.value && verifiedVoter.value),
)
const isRosterScannerMode = computed(() => scannerContext.value === 'roster')
const padTwoDigits = (value) => {
  const normalized = String(value)
  return normalized.length >= 2 ? normalized : `0${normalized}`
}
const countdownParts = computed(() => {
  if (!displayRound.value?.endDate) {
    return null
  }

  const endTime = new Date(displayRound.value.endDate).getTime()
  const diff = Math.max(0, endTime - nowTick.value)
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    days,
    hours,
    minutes,
    seconds,
    isEnded: diff <= 0,
  }
})
const heroEyebrowLabel = computed(() =>
  isRosterState.value ? 'Roster Live' : isFinishedRoundState.value ? 'Voting Closed' : 'Live Round',
)
const publicWinnerCards = computed(() => {
  const ordered = finishedRoundInfo.value?.winners || []
  const first = ordered.find((entry) => entry.place === 1)
  const second = ordered.find((entry) => entry.place === 2)
  const third = ordered.find((entry) => entry.place === 3)
  return [second, first, third].filter(Boolean)
})
const heroTitle = computed(() => displayRound.value?.name || 'Voting Round')
const heroDescription = computed(() =>
  isRosterState.value
    ? displayRound.value?.description || 'Review the published roster sections and the assigned associates below.'
    : isFinishedRoundState.value
    ? hasPublishedWinners.value
      ? 'The voting round is finished and the official top 3 winners are now live below.'
      : 'This voting round has finished. Please wait for the result announcement from the admin.'
    : displayRound.value?.description || 'Browse the live nominee associate cards below and vote by scanning the badge, then confirming the vote.',
)
const countdownLabel = computed(() => {
  if (!countdownParts.value) {
    return 'Voting period not available'
  }

  if (isFinishedRoundState.value || countdownParts.value.isEnded) {
    return 'Voting period ended'
  }

  const parts = [
    `${padTwoDigits(countdownParts.value.days)}d`,
    `${padTwoDigits(countdownParts.value.hours)}h`,
    `${padTwoDigits(countdownParts.value.minutes)}m`,
    `${padTwoDigits(countdownParts.value.seconds)}s`,
  ]

  return parts.join(' : ')
})
const countdownDisplayParts = computed(() => {
  if (!countdownParts.value || isFinishedRoundState.value || countdownParts.value.isEnded) {
    return []
  }

  const units = [
    { key: 'days', label: 'd', value: countdownParts.value.days },
    { key: 'hours', label: 'h', value: countdownParts.value.hours },
    { key: 'minutes', label: 'm', value: countdownParts.value.minutes },
    { key: 'seconds', label: 's', value: countdownParts.value.seconds },
  ]
  const visibleUnits = units.filter((unit) => unit.value > 0)

  return visibleUnits.length ? visibleUnits : [{ key: 'seconds', label: 's', value: 0 }]
})
const countdownStateLabel = computed(() => {
  if (!countdownParts.value) {
    return 'Voting period not available'
  }

  return isFinishedRoundState.value || countdownParts.value.isEnded ? 'Voting period ended' : ''
})
const copyrightYear = computed(() => new Date().getFullYear())
const nomineeCards = computed(() => {
  return publicCategories.value.reduce((cards, category) => {
    const categoryCards = category.candidates.map((candidate) => ({
      key: `${category.id}-${candidate.id}`,
      categoryId: category.id,
      categoryName: category.name,
      candidateId: candidate.id,
      badgeId: candidate.badgeId,
      fullName: candidate.fullName,
      departmentName: candidate.departmentName,
      roleName: candidate.roleName,
      photoData: candidate.photoData,
    }))

    return cards.concat(categoryCards)
  }, [])
})

const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return ''
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`
}

const getInitials = (name) =>
  `${name || ''}`
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

const getWinnerPanelClass = (place) =>
  place === 1
    ? 'border-amber-300 bg-[radial-gradient(circle_at_top,_rgba(255,244,214,0.9),_rgba(255,255,255,0.98)_58%)] shadow-[0_18px_40px_rgba(245,158,11,0.16)]'
    : place === 2
      ? 'border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,1))] shadow-[0_14px_34px_rgba(148,163,184,0.14)]'
      : 'border-orange-200 bg-[linear-gradient(180deg,_rgba(255,247,245,0.98),_rgba(255,255,255,1))] shadow-[0_14px_34px_rgba(251,146,60,0.12)]'

const getWinnerBadgeClass = (place) =>
  place === 1
    ? 'bg-amber-100 text-amber-700'
    : place === 2
      ? 'bg-blue-100 text-blue-700'
      : 'bg-orange-100 text-orange-700'

const getWinnerIconWrapClass = (place) =>
  place === 1
    ? 'border-amber-200 bg-amber-50 text-amber-500'
    : place === 2
      ? 'border-slate-200 bg-slate-50 text-blue-500'
      : 'border-orange-200 bg-orange-50 text-orange-500'

const getWinnerAvatarClass = (place) =>
  place === 1
    ? 'bg-amber-100'
    : place === 2
      ? 'bg-blue-100'
      : 'bg-orange-100'

const getWinnerValueClass = (place) =>
  place === 1 ? 'text-amber-500' : place === 2 ? 'text-blue-600' : 'text-orange-500'

const getWinnerIcon = (place) =>
  place === 1 ? 'trophy' : 'military_tech'

const clearMessages = () => {
  errorMessage.value = ''
  successMessage.value = ''
}

const hideToast = () => {
  toast.value.visible = false

  if (toastTimeout) {
    window.clearTimeout(toastTimeout)
    toastTimeout = null
  }
}

const showToast = (type, message, title = type === 'error' ? 'Error' : 'Success') => {
  toast.value = {
    visible: true,
    type,
    title,
    message,
  }

  if (toastTimeout) {
    window.clearTimeout(toastTimeout)
  }

  toastTimeout = window.setTimeout(() => {
    toast.value.visible = false
    toastTimeout = null
  }, 3200)
}

const setError = (message, title = 'Error') => {
  errorMessage.value = message
  successMessage.value = ''
  showToast('error', message, title)
}

const setSuccess = (message, title = 'Success') => {
  successMessage.value = message
  errorMessage.value = ''
  showToast('success', message, title)
}

const startCountdown = () => {
  if (countdownInterval) {
    window.clearInterval(countdownInterval)
  }

  nowTick.value = Date.now()
  countdownInterval = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
}

const resetPendingVote = () => {
  pendingVoteCard.value = null
  verifiedVoter.value = null
  badgeId.value = ''
}

const clearRosterLookupFeedback = () => {
  rosterLookupError.value = ''
  rosterLookupResult.value = null
}

const loadPublicVotingPage = async () => {
  isLoadingRound.value = true
  clearMessages()

  try {
    const response = await fetchJson('/api/voting/live-ballot-v2')
    const normalizedBranding = syncSiteBrandingCache(response)
    homeSiteLogo.value = normalizedBranding.siteLogo
    homeSiteName.value = normalizedBranding.siteName
    homeSiteTagline.value = normalizedBranding.siteTagline
    brandingColors.value = resolveBrandingColors(normalizedBranding.brandingColors)

    if (!response.hasActiveRound || !response.round) {
      roundSummary.value = null
      finishedRoundSummary.value = response.finishedRound || null
      rosterSummary.value = response.roster || null
      publicCategories.value = []
      return
    }

    roundSummary.value = response.round
    finishedRoundSummary.value = null
    rosterSummary.value = null
    publicCategories.value = response.categories || []
  } catch (error) {
    homeSiteLogo.value = ''
    homeSiteName.value = ''
    homeSiteTagline.value = ''
    roundSummary.value = null
    finishedRoundSummary.value = null
    rosterSummary.value = null
    publicCategories.value = []
    setError(error.message || 'Unable to load the live voting page.')
  } finally {
    isLoadingRound.value = false
  }
}

const navigateToLogin = () => {
  isMobileMenuOpen.value = false
  router.push('/login')
}

const openRosterLookupModal = () => {
  isMobileMenuOpen.value = false
  clearMessages()
  clearRosterLookupFeedback()
  isRosterLookupModalOpen.value = true
}

const closeRosterLookupModal = () => {
  if (isRosterScannerMode.value) {
    closeCameraModal()
    scannerContext.value = 'vote'
  }

  isRosterLookupModalOpen.value = false
  rosterBadgeId.value = ''
  clearRosterLookupFeedback()
}

const refreshCameraList = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  availableCameras.value = devices.filter((device) => device.kind === 'videoinput')
}

const getPreferredCameraId = () => {
  if (!availableCameras.value.length) {
    return ''
  }

  const preferredCamera =
    availableCameras.value.find((camera) => !/virtual/i.test(camera.label || '')) ||
    availableCameras.value[0]

  return preferredCamera?.deviceId || ''
}

const playScanBeep = async () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext

    if (!AudioContextClass) {
      return
    }

    if (!audioContext) {
      audioContext = new AudioContextClass()
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(1046.5, audioContext.currentTime)
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.16)
  } catch {
    // Ignore browsers that block short audio playback.
  }
}

const stopCamera = () => {
  if (scannerTuneInterval) {
    window.clearInterval(scannerTuneInterval)
    scannerTuneInterval = null
  }

  if (scannerReader) {
    scannerReader.reset()
    scannerReader = null
  }

  if (videoRef.value) {
    const stream = videoRef.value.srcObject

    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop())
    }

    videoRef.value.srcObject = null
  }

  isCameraOpen.value = false
}

const stopNfcScan = () => {
  if (nfcAbortController) {
    nfcAbortController.abort()
    nfcAbortController = null
  }

  isNfcScanning.value = false
}

const closeCameraModal = () => {
  stopNfcScan()
  stopCamera()
  isCameraModalOpen.value = false
}

const cancelVoteFlow = () => {
  closeCameraModal()
  resetPendingVote()
  scannerContext.value = 'vote'
}

const closeActiveScannerModal = () => {
  if (isRosterScannerMode.value) {
    closeCameraModal()
    scannerContext.value = 'vote'
    return
  }

  cancelVoteFlow()
}

const prepareBadgeForVote = async (source = 'manual') => {
  clearMessages()

  if (!pendingVoteCard.value) {
    setError('Select a nominee card first.')
    return false
  }

  if (!badgeId.value.trim()) {
    setError('Scan or enter an associate badge first.')
    return false
  }

  isPreparingVote.value = true

  try {
    const ballot = await postJson('/api/voting/ballot', {
      badgeId: badgeId.value.trim(),
    })

    verifiedVoter.value = ballot.voter

    if (verifiedVoter.value?.id === pendingVoteCard.value?.candidateId) {
      setError('Associates cannot vote for themselves.')
      return false
    }

    setSuccess(
      source === 'barcode'
        ? 'Badge scanned successfully. Press confirm to submit the vote.'
        : source === 'nfc'
          ? 'Badge tapped successfully. Press confirm to submit the vote.'
          : 'Badge checked successfully. Press confirm to submit the vote.',
      'Badge Verified',
    )

    return true
  } catch (error) {
    verifiedVoter.value = null
    setError(error.message || 'Unable to verify the associate badge.')
    return false
  } finally {
    isPreparingVote.value = false
  }
}

const readBadgeWithNfc = async () => {
  clearMessages()

  if (isRosterScannerMode.value) {
    clearRosterLookupFeedback()
  } else if (!pendingVoteCard.value) {
    setError('Select a nominee card first.')
    return
  }

  if (isNfcScanning.value) {
    stopNfcScan()
    return
  }

  isNfcScanning.value = true
  nfcAbortController = new AbortController()

  try {
    const scannedBadgeId = await scanSingleNfcBadge({
      signal: nfcAbortController.signal,
      onStatus: (message) => {
        scannerMessage.value = message
      },
    })

    scannerMessage.value = `NFC badge detected: ${scannedBadgeId}`
    await playScanBeep()

    if (isRosterScannerMode.value) {
      rosterBadgeId.value = scannedBadgeId
      closeCameraModal()
      scannerContext.value = 'vote'
      await checkRosterAssignment('nfc', scannedBadgeId)
      return
    }

    badgeId.value = scannedBadgeId
    await prepareBadgeForVote('nfc')
  } catch (error) {
    if (error?.name !== 'AbortError') {
      setError(error.message || 'Unable to read the NFC badge.')
      scannerMessage.value = 'NFC reading is not available right now.'
    }
  } finally {
    nfcAbortController = null
    isNfcScanning.value = false
  }
}

const checkRosterAssignment = async (source = 'manual', scannedBadgeId = '') => {
  clearRosterLookupFeedback()

  const lookupValue = `${scannedBadgeId || rosterBadgeId.value || ''}`.trim()

  if (!lookupValue) {
    rosterLookupError.value = 'Enter Badge ID or Badge User Name, or scan the badge first.'
    return
  }

  rosterBadgeId.value = lookupValue
  isCheckingRoster.value = true

  try {
    const data = await postJson('/api/public/roster-check', {
      badgeId: lookupValue,
      badgeUsername: lookupValue,
    })

    rosterLookupResult.value = {
      ...data,
      source,
    }
  } catch (error) {
    rosterLookupResult.value = null
    rosterLookupError.value = error.message || 'Unable to check the roster right now.'
  } finally {
    isCheckingRoster.value = false
  }
}

const handleScannedCode = async (scannedValue) => {
  const normalizedValue = scannedValue?.trim()
  const now = Date.now()

  if (!normalizedValue || (normalizedValue === lastDetectedBadge && now - lastDetectedAt <= 1500)) {
    return
  }

  lastDetectedBadge = normalizedValue
  lastDetectedAt = now
  scannerMessage.value = `Badge detected: ${normalizedValue}`

  await playScanBeep()

  if (isRosterScannerMode.value) {
    rosterBadgeId.value = normalizedValue
    closeCameraModal()
    scannerContext.value = 'vote'
    await checkRosterAssignment('barcode', normalizedValue)
    return
  }

  badgeId.value = normalizedValue
  const isReady = await prepareBadgeForVote('barcode')

  if (isReady) {
    stopCamera()
  }
}

const startScanner = async (constraints, mode = 'vote') => {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, scannerFormats)
  hints.set(DecodeHintType.TRY_HARDER, true)
  hints.set(DecodeHintType.ALSO_INVERTED, true)

  if (!videoRef.value) {
    for (let attempt = 0; attempt < 8 && !videoRef.value; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    }
  }

  if (!videoRef.value) {
    throw new Error('Scanner preview is not ready yet.')
  }

  scannerReader = new BrowserMultiFormatReader(hints, mode === 'roster' ? 60 : 80)
  scannerReader.timeBetweenDecodingAttempts = mode === 'roster' ? 18 : 30
  scannerReader.timeBetweenScansMillis = mode === 'roster' ? 18 : 30

  await scannerReader.decodeFromConstraints(
    {
      video: constraints,
      audio: false,
    },
    videoRef.value,
    async (result, error) => {
      if (!isCameraModalOpen.value) {
        return
      }

      if (result) {
        await handleScannedCode(result.getText())
        return
      }

      if (error && !(error instanceof NotFoundException)) {
        scannerMessage.value = 'Scanning camera is active. Keep the badge near the center line for instant detection.'
      }
    },
  )
}

const openCamera = async (mode = 'vote') => {
  scannerContext.value = mode
  clearMessages()
  if (mode === 'roster') {
    resetPendingVote()
    clearRosterLookupFeedback()
  }
  isCameraModalOpen.value = true
  await nextTick()

  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Camera access is not available in this browser.'
    return
  }

  isCameraLoading.value = true
  scannerMessage.value = mode === 'roster' ? 'Starting roster scanner...' : 'Starting camera...'

  try {
    stopCamera()
    await refreshCameraList()

    if (!selectedCameraId.value && availableCameras.value.length) {
      selectedCameraId.value = getPreferredCameraId()
    }

    await startScanner(buildScannerConstraints(mode), mode)
    await optimizeScannerTrack()
    scannerTuneInterval = window.setInterval(() => {
      optimizeScannerTrack()
    }, 900)
    await refreshCameraList()
    isCameraOpen.value = true
    scannerMessage.value =
      mode === 'roster'
        ? 'Camera is ready. Move the badge across the scanner line to check your roster assignment.'
        : 'Camera is ready. Move the badge across the scanner line. Detection is now optimized for faster reads.'
  } catch (error) {
    setError(error.message || 'Unable to access the camera.')
    scannerMessage.value = 'Camera permission is required for scanning.'
  } finally {
    isCameraLoading.value = false
  }
}

const switchCamera = async () => {
  clearMessages()
  const nextMode = scannerContext.value

  if (availableCameras.value.length > 1) {
    const currentIndex = availableCameras.value.findIndex(
      (camera) => camera.deviceId === selectedCameraId.value,
    )
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableCameras.value.length : 0
    selectedCameraId.value = availableCameras.value[nextIndex].deviceId
  } else {
    cameraMode.value = cameraMode.value === 'environment' ? 'user' : 'environment'
    selectedCameraId.value = ''
  }

  await openCamera(nextMode)
}

const startVoteFlow = async (card) => {
  clearMessages()
  pendingVoteCard.value = card
  verifiedVoter.value = null
  badgeId.value = ''
  await openCamera()
}

const confirmVote = async () => {
  clearMessages()

  if (!pendingVoteCard.value) {
    setError('Select a nominee card first.')
    return
  }

  if (!verifiedVoter.value) {
    const isReady = await prepareBadgeForVote()

    if (!isReady) {
      return
    }
  }

  isSubmitting.value = true

  try {
    const response = await postJson('/api/voting/cast', {
      badgeId: badgeId.value.trim(),
      selections: [
        {
          categoryId: pendingVoteCard.value.categoryId,
          candidateEmployeeId: pendingVoteCard.value.candidateId,
        },
      ],
    })

    setSuccess(response.message || 'Vote submitted successfully.', 'Vote Submitted')
    cancelVoteFlow()
  } catch (error) {
    setError(error.message || 'Unable to submit the vote.')
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  startCountdown()
  loadPublicVotingPage()
  roundRefreshInterval = window.setInterval(() => {
    if (!isCameraModalOpen.value && !isPreparingVote.value && !isSubmitting.value) {
      loadPublicVotingPage()
    }
  }, 15000)
})

watch(
  () => countdownParts.value?.isEnded,
  async (isEnded) => {
    if (isEnded && roundInfo.value && !hasReloadedAfterCountdown) {
      hasReloadedAfterCountdown = true
      await loadPublicVotingPage()
      return
    }

    if (!isEnded) {
      hasReloadedAfterCountdown = false
    }
  },
)

onBeforeUnmount(() => {
  stopNfcScan()
  stopCamera()

  if (countdownInterval) {
    window.clearInterval(countdownInterval)
  }

  if (roundRefreshInterval) {
    window.clearInterval(roundRefreshInterval)
  }

  if (toastTimeout) {
    window.clearTimeout(toastTimeout)
  }
})
</script>

<template>
  <div
    v-if="showResultsOnlyPage"
    class="public-brand-results-screen min-h-screen font-sans text-slate-900"
    :style="brandingVars"
  >
    <div class="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section class="rounded-[36px] border border-white/70 bg-white/88 px-5 py-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:px-8 sm:py-10">
        <p class="text-xs font-semibold uppercase tracking-[0.26em] text-violet-600">Official Result</p>
        <h1 class="mt-4 text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">{{ finishedRoundInfo?.name || 'Voting Result' }}</h1>
        <p class="mx-auto mt-4 max-w-3xl text-sm text-slate-500 sm:text-base">
          Voting is finished. Here are the official top 3 associates selected from this round.
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <span class="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 sm:text-sm">
            <span class="material-symbols-outlined text-base">calendar_month</span>
            {{ formatDateRange(finishedRoundInfo?.startDate, finishedRoundInfo?.endDate) || 'Schedule not available' }}
          </span>
          <span class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 sm:text-sm">
            <span class="material-symbols-outlined text-base">task_alt</span>
            {{ finishedRoundInfo?.winners?.length || 0 }} winners published
          </span>
        </div>
      </section>

      <section class="mt-8 grid gap-5 md:grid-cols-3 md:items-center">
        <article
          v-for="person in publicWinnerCards"
          :key="person.place"
          class="relative overflow-hidden rounded-[32px] border px-5 py-6 text-center"
          :class="[getWinnerPanelClass(person.place), person.place === 1 ? 'md:min-h-[450px] md:-mt-6 md:py-8 shadow-[0_20px_50px_rgba(245,158,11,0.16)]' : 'md:min-h-[405px] shadow-[0_16px_38px_rgba(15,23,42,0.08)]']"
        >
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm"
            :class="getWinnerIconWrapClass(person.place)"
          >
            <span class="material-symbols-outlined text-3xl">{{ getWinnerIcon(person.place) }}</span>
          </div>
          <div class="relative mx-auto mt-5 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full ring-8 ring-white/70 shadow-sm sm:h-32 sm:w-32" :class="getWinnerAvatarClass(person.place)">
            <img
              v-if="person.photoData"
              :src="person.photoData"
              :alt="person.name"
              class="h-full w-full object-cover"
            />
            <span v-else class="text-2xl font-semibold text-slate-700">{{ getInitials(person.name) }}</span>
          </div>
          <div class="mt-4">
            <span
              class="inline-flex rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
              :class="getWinnerBadgeClass(person.place)"
            >
              {{ person.medal }}
            </span>
          </div>
          <p class="mt-5 text-[28px] font-semibold leading-tight text-slate-900">{{ person.name }}</p>
          <p class="mt-2 text-sm text-slate-500">{{ person.categoriesText || 'Voting Categories' }}</p>
          <div class="mx-auto mt-5 h-px w-[78%] bg-slate-200"></div>
          <p class="mt-5 text-[42px] font-bold" :class="getWinnerValueClass(person.place)">{{ person.votes }}</p>
          <p class="mt-1 text-sm text-slate-500">votes received</p>
          <div class="mx-auto mt-5 h-px w-[78%] border-t border-dashed border-slate-200"></div>
          <p class="mt-5 text-[28px] font-bold" :class="getWinnerValueClass(person.place)">{{ person.share }}</p>
          <p class="mt-1 text-sm text-slate-500">of valid votes</p>
        </article>
      </section>

      <section class="mt-8 grid gap-4 md:grid-cols-3">
        <div class="rounded-[28px] border border-white/70 bg-white/88 px-5 py-5 text-center shadow-[0_14px_38px_rgba(15,23,42,0.06)] backdrop-blur">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Round</p>
          <p class="mt-3 text-lg font-semibold text-slate-900">{{ finishedRoundInfo?.name || 'Completed voting round' }}</p>
        </div>
        <div class="rounded-[28px] border border-white/70 bg-white/88 px-5 py-5 text-center shadow-[0_14px_38px_rgba(15,23,42,0.06)] backdrop-blur">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Voting Period</p>
          <p class="mt-3 text-lg font-semibold text-slate-900">{{ formatDateRange(finishedRoundInfo?.startDate, finishedRoundInfo?.endDate) || 'Not available' }}</p>
        </div>
        <div class="rounded-[28px] border border-white/70 bg-white/88 px-5 py-5 text-center shadow-[0_14px_38px_rgba(15,23,42,0.06)] backdrop-blur">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Result Status</p>
          <p class="mt-3 text-lg font-semibold text-violet-700">Published on Home page</p>
        </div>
      </section>
    </div>
  </div>

  <div v-else class="public-brand-shell relative min-h-screen overflow-hidden font-sans text-slate-900" :style="brandingVars">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -left-16 top-16 h-56 w-56 rounded-full bg-emerald-200/35 blur-3xl"></div>
      <div class="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl"></div>
      <div class="absolute bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-200/20 blur-3xl"></div>
    </div>

    <div class="public-brand-header fixed inset-x-0 top-0 z-40 border-b backdrop-blur">
      <div class="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3 sm:gap-4">
            <div class="public-brand-logo flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg backdrop-blur sm:h-14 sm:w-14">
              <img
                v-if="homeSiteLogo"
                :src="homeSiteLogo"
                :alt="homeSiteName"
                class="h-full w-full object-cover"
              />
              <span v-else class="material-symbols-outlined text-4xl">how_to_vote</span>
            </div>
            <div class="min-w-0">
              <p class="truncate text-lg font-semibold text-slate-900 sm:text-2xl">{{ homeSiteName }}</p>
              <p class="line-clamp-2 text-xs text-slate-500 sm:text-sm">{{ homeSiteTagline }}</p>
            </div>
          </div>

          <button
            type="button"
            @click="isMobileMenuOpen = !isMobileMenuOpen"
            class="public-brand-outline inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-white/85 text-slate-600 shadow-sm backdrop-blur transition sm:hidden"
            :aria-expanded="isMobileMenuOpen"
            aria-label="Toggle menu"
          >
            <span class="material-symbols-outlined text-xl">{{ isMobileMenuOpen ? 'close' : 'menu' }}</span>
          </button>

          <div class="hidden items-center gap-3 sm:flex">
            <button
              type="button"
              @click="openRosterLookupModal"
              class="public-brand-outline inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-white/85 px-4 text-sm text-slate-600 shadow-sm backdrop-blur transition"
            >
              <span class="material-symbols-outlined text-base">assignment_ind</span>
              Check Roster
            </button>
            <button
              type="button"
              @click="navigateToLogin"
              class="public-brand-outline inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-white/85 px-4 text-sm text-slate-600 shadow-sm backdrop-blur transition"
            >
              <span class="material-symbols-outlined text-base">admin_panel_settings</span>
              Login
            </button>
          </div>
        </div>

        <div v-if="isMobileMenuOpen" class="mt-3 rounded-2xl border bg-white/90 p-3 shadow-sm sm:hidden public-brand-outline">
          <button
            type="button"
            @click="openRosterLookupModal"
            class="public-brand-outline mb-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm text-slate-600 transition"
          >
            <span class="material-symbols-outlined text-base">assignment_ind</span>
            Check Roster
          </button>
          <button
            type="button"
            @click="navigateToLogin"
            class="public-brand-outline inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm text-slate-600 transition"
          >
            <span class="material-symbols-outlined text-base">admin_panel_settings</span>
            Login
          </button>
        </div>
      </div>
    </div>

    <main class="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      <section class="mt-4 overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:mt-6 sm:rounded-[36px] sm:p-8">
        <div class="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div class="public-brand-hero relative overflow-hidden rounded-[32px] px-5 py-6 text-white sm:px-8 sm:py-7">
            <div class="absolute right-[-48px] top-[-48px] h-40 w-40 rounded-full border border-white/15 bg-white/10"></div>
            <div class="absolute bottom-[-64px] left-[-32px] h-44 w-44 rounded-full border border-white/10 bg-white/10"></div>
            <div class="relative">
              <p class="public-brand-eyebrow text-xs font-semibold uppercase tracking-[0.22em] sm:text-sm">{{ heroEyebrowLabel }}</p>
              <p class="mt-3 text-2xl font-semibold leading-tight sm:text-4xl">{{ heroTitle }}</p>
              <p class="mt-3 max-w-2xl text-xs text-white/90 sm:mt-4 sm:text-base">
                {{ heroDescription }}
              </p>
              <div class="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:flex sm:flex-wrap">
                <div class="inline-flex w-full items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs text-white/95 ring-1 ring-white/15 sm:w-auto sm:px-4 sm:text-sm">
                  <span class="material-symbols-outlined text-base">
                    {{ isRosterState ? 'dashboard_customize' : 'calendar_month' }}
                  </span>
                  {{
                    isRosterState
                      ? `${rosterSectionCount} sections live`
                      : formatDateRange(displayRound?.startDate, displayRound?.endDate) || 'Schedule not available'
                  }}
                </div>
                <div class="inline-flex w-full items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs text-white/95 ring-1 ring-white/15 sm:w-auto sm:px-4 sm:text-sm">
                  <span class="material-symbols-outlined text-base">
                    {{ isRosterState ? 'pin_drop' : isFinishedRoundState ? 'campaign' : 'verified_user' }}
                  </span>
                  {{
                    isRosterState
                      ? `${rosterStationCount} stations assigned`
                      : isFinishedRoundState
                        ? hasPublishedWinners
                          ? `${finishedRoundInfo?.winners?.length || 0} winners published`
                          : 'Waiting for result'
                        : 'One vote per associate'
                  }}
                </div>
              </div>
            </div>
          </div>

          <div class="public-brand-timer rounded-[32px] border p-5 shadow-[0_14px_40px_rgba(16,185,129,0.08)] sm:p-6">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] public-brand-accent-text">
              {{ isRosterState ? 'Roster Overview' : 'Voting Timer' }}
            </p>
            <div v-if="isRosterState" class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="public-brand-countdown-chip rounded-2xl border px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sections Filled</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">{{ rosterSectionCount }}</p>
              </div>
              <div class="public-brand-countdown-chip rounded-2xl border px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Associates</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">{{ rosterAssociateCount }}</p>
              </div>
                <div class="public-brand-countdown-chip rounded-2xl border px-4 py-4 sm:col-span-2">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Stations Assigned</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-900">{{ rosterStationCount }}</p>
                </div>
            </div>
            <div v-else class="mt-3 flex flex-wrap gap-2">
              <template v-if="countdownDisplayParts.length">
                <div
                  v-for="segment in countdownDisplayParts"
                  :key="segment.key"
                  class="public-brand-countdown-chip inline-flex items-center rounded-2xl border px-3 py-2 text-lg font-semibold text-slate-900 sm:text-xl"
                >
                  {{ segment.value }}{{ segment.label }}
                </div>
              </template>
              <div
                v-else
                class="public-brand-countdown-chip inline-flex items-center rounded-2xl border px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {{ countdownStateLabel }}
              </div>
            </div>
            <p class="mt-2 text-sm text-slate-500">
              <span v-if="isLoadingRound">Loading live voting page...</span>
              <span v-else>
                {{
                  isRosterState
                    ? displayRound?.name || 'No live roster'
                    : displayRound?.name || 'No live voting round'
                }}
              </span>
            </p>

            <button
              v-if="!isRosterState && !isFinishedRoundState"
              type="button"
              @click="isMobileTipsModalOpen = true"
              class="public-brand-outline mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border bg-white/90 px-4 text-sm font-medium text-slate-700 transition sm:hidden"
            >
              <span class="material-symbols-outlined text-base">info</span>
              How It Works & Scanner Tips
            </button>

            <div v-if="!isRosterState && !isFinishedRoundState" class="mt-6 hidden gap-3 sm:grid">
              <div class="rounded-2xl border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <p class="text-sm font-semibold text-slate-900">How It Works</p>
                <p class="mt-1 text-sm text-slate-500">Choose a nominee card, scan your badge, then confirm your vote.</p>
              </div>
              <div class="rounded-2xl border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <p class="text-sm font-semibold text-slate-900">Scanner Tip</p>
                <p class="mt-1 text-sm text-slate-500">Move the barcode across the center scanner line for stronger, faster detection.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-6 rounded-[36px] border border-white/70 bg-white/82 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <div v-if="isRosterState" class="flex flex-col gap-2">
          <p class="text-xl font-semibold text-slate-900">Published Roster</p>
          <p class="text-sm text-slate-500">
            Review the active roster sections and the associates assigned to each team below.
          </p>
        </div>

        <div v-else-if="!isFinishedRoundState" class="flex flex-col gap-2">
          <p class="text-xl font-semibold text-slate-900">Choose A Nominee</p>
          <p class="text-sm text-slate-500">
            Tap `Vote` on any nominee card below to open the scanner and submit your badge.
          </p>
        </div>

        <div v-if="isFinishedRoundState && !hasPublishedWinners" class="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
            <span class="material-symbols-outlined text-3xl">campaign</span>
          </div>
          <p class="mt-5 text-2xl font-semibold text-slate-900">Voting is finished</p>
          <p class="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
            Waiting for result. The admin has not shown the official top 3 on the Home page yet.
          </p>
          <p class="mt-4 text-xs text-slate-500">
            {{ formatDateRange(finishedRoundInfo?.startDate, finishedRoundInfo?.endDate) || 'Result timing not available' }}
          </p>
        </div>

        <div v-else-if="isFinishedRoundState && hasPublishedWinners" class="rounded-[32px] bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.98))] p-4 shadow-[0_14px_45px_rgba(15,23,42,0.06)] sm:p-6">
          <div class="flex items-center justify-between gap-4 rounded-3xl border border-violet-200 bg-[linear-gradient(90deg,_rgba(245,243,255,0.95),_rgba(255,255,255,0.98))] px-4 py-4 text-violet-700 sm:px-5">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                <span class="material-symbols-outlined text-2xl">campaign</span>
              </div>
              <p class="text-sm font-medium text-slate-700 sm:text-base">
                <span class="font-semibold text-violet-700">Winner list is now live.</span>
                Only the official top 3 winners are shown below.
              </p>
            </div>
            <div class="hidden h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-400 sm:flex">
              <span class="material-symbols-outlined text-2xl">celebration</span>
            </div>
          </div>

          <div class="mt-6 grid gap-5 md:grid-cols-3 md:items-center">
            <article
              v-for="person in publicWinnerCards"
              :key="person.place"
              class="relative overflow-hidden rounded-[30px] border px-5 py-5 text-center"
              :class="[getWinnerPanelClass(person.place), person.place === 1 ? 'md:min-h-[430px] md:-mt-4 md:py-6' : 'md:min-h-[390px]']"
            >
              <div
                v-if="person.place === 1"
                class="pointer-events-none absolute inset-x-0 top-14 hidden items-center justify-between px-8 text-amber-300 md:flex"
              >
                <span class="material-symbols-outlined text-2xl">auto_awesome</span>
                <span class="material-symbols-outlined text-2xl">auto_awesome</span>
              </div>

              <div
                class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm"
                :class="getWinnerIconWrapClass(person.place)"
              >
                <span class="material-symbols-outlined text-3xl">{{ getWinnerIcon(person.place) }}</span>
              </div>
              <div class="relative mx-auto mt-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full ring-8 ring-white/70 shadow-sm sm:h-32 sm:w-32" :class="getWinnerAvatarClass(person.place)">
                <img
                  v-if="person.photoData"
                  :src="person.photoData"
                  :alt="person.name"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-2xl font-semibold text-slate-700">{{ getInitials(person.name) }}</span>
                <div class="absolute inset-x-0 bottom-[-10px] flex justify-center">
                  <span
                    class="inline-flex rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
                    :class="getWinnerBadgeClass(person.place)"
                  >
                    {{ person.medal }}
                  </span>
                </div>
              </div>

              <p class="mt-5 text-[26px] font-semibold leading-tight text-slate-900">{{ person.name }}</p>
              <p class="mt-1 text-sm text-slate-500">{{ person.categoriesText || 'Voting Categories' }}</p>

              <div class="mx-auto mt-4 h-px w-[78%] bg-slate-200"></div>

              <p class="mt-4 text-[40px] font-bold" :class="getWinnerValueClass(person.place)">{{ person.votes }}</p>
              <p class="mt-1 text-sm text-slate-500">Vote Received</p>

              <div class="mx-auto mt-4 h-px w-[78%] border-t border-dashed border-slate-200"></div>

              <p class="mt-4 text-[26px] font-bold" :class="getWinnerValueClass(person.place)">{{ person.share }}</p>
              <p class="mt-1 text-sm text-slate-500">of valid votes</p>

              <div
                v-if="person.place === 1"
                class="absolute inset-x-0 bottom-[-1px] flex items-end justify-center"
              >
                <div class="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-t-[18px] bg-[linear-gradient(90deg,_#fbbf24,_#f59e0b)] px-6 py-2 text-sm font-semibold text-white shadow-[0_-6px_18px_rgba(245,158,11,0.25)]">
                  <span class="material-symbols-outlined text-base">trophy</span>
                  Winner
                </div>
              </div>
            </article>
          </div>
        </div>

        <div v-else-if="isRosterState" class="mt-6 grid gap-5 xl:grid-cols-2">
          <article
            v-for="section in rosterSections"
            :key="section.key"
            class="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.98))] p-5 shadow-[0_14px_45px_rgba(15,23,42,0.05)]"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="public-brand-category flex h-12 w-12 items-center justify-center rounded-2xl">
                  <span class="material-symbols-outlined text-xl">groups</span>
                </div>
                <div>
                  <p class="text-lg font-semibold text-slate-900">{{ section.label }}</p>
                  <p class="mt-1 text-sm text-slate-500">
                    {{ section.associates.length ? 'Assigned team members' : 'No associates assigned yet' }}
                  </p>
                </div>
              </div>
              <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {{ section.associates.length }} associates
              </span>
            </div>

            <div v-if="section.associates.length" class="mt-5 grid gap-3">
              <div
                v-for="associate in section.associates"
                :key="associate.id"
                class="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div class="public-brand-avatar flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-4">
                  <img
                    v-if="associate.photoData"
                    :src="associate.photoData"
                    :alt="associate.fullName"
                    class="h-full w-full object-cover"
                  />
                  <span v-else class="text-sm font-semibold">{{ getInitials(associate.fullName) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-900">{{ associate.fullName }}</p>
                  <p class="mt-1 truncate text-xs text-slate-400">
                    {{ associate.badgeId }} · {{ associate.departmentName }} / {{ associate.roleName }}
                  </p>
                  <div v-if="associate.stationId" class="mt-2 flex flex-wrap gap-2">
                    <span class="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                      {{ associate.stationLabel }}
                    </span>
                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {{ associate.stationType }}
                    </span>
                    <span
                      v-if="associate.isFarAwayStation"
                      class="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                    >
                      Far Away
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
            >
              This section is currently empty.
            </div>
          </article>
        </div>

        <div v-else-if="!roundInfo && !isLoadingRound" class="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No live voting round is available right now.
        </div>

        <div v-else-if="!nomineeCards.length && !isLoadingRound" class="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No nominee associates are available right now.
        </div>

        <div v-else class="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in nomineeCards"
            :key="card.key"
            class="public-brand-card rounded-[28px] border p-5 text-center shadow-sm transition hover:-translate-y-1"
          >
            <div class="public-brand-avatar mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ring-8">
              <img
                v-if="card.photoData"
                :src="card.photoData"
                :alt="card.fullName"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-2xl font-semibold">{{ getInitials(card.fullName) }}</span>
            </div>

            <p class="mt-5 text-xl font-semibold text-slate-900">{{ card.fullName }}</p>
            <div class="public-brand-category mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold">
              {{ card.categoryName }}
            </div>
            <p class="mt-3 text-xs text-slate-400">{{ card.departmentName }} / {{ card.roleName }}</p>

            <button
              type="button"
              @click="startVoteFlow(card)"
              class="public-brand-action mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white transition"
            >
              <span class="material-symbols-outlined text-base">qr_code_scanner</span>
              Vote
            </button>
          </article>
        </div>
      </section>
    </main>

    <div
      v-if="isCameraModalOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg rounded-[28px] bg-white p-4 shadow-2xl sm:p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-lg font-semibold text-slate-900">
              {{
                showConfirmVoteStep
                  ? 'Confirm Your Vote'
                  : isRosterScannerMode
                    ? 'Scan Roster Badge Barcode'
                    : 'Scan Associate Badge'
              }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              {{
                showConfirmVoteStep
                  ? 'Review the nominee and confirm the vote inside this modal.'
                  : isRosterScannerMode
                    ? 'Scan the badge barcode to search the current roster assignment.'
                    : `Scanning for: ${pendingVoteCard?.fullName || 'Selected nominee'}`
              }}
            </p>
          </div>
          <button
            type="button"
            @click="closeActiveScannerModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div v-if="showConfirmVoteStep" class="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
          <div class="rounded-3xl border border-emerald-200 bg-white p-5">
            <div class="flex items-center gap-4">
              <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700">
                <img
                  v-if="pendingVoteCard?.photoData"
                  :src="pendingVoteCard.photoData"
                  :alt="pendingVoteCard?.fullName"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-xl font-semibold">{{ getInitials(pendingVoteCard?.fullName) }}</span>
              </div>
              <div>
                <p class="text-lg font-semibold text-slate-900">{{ pendingVoteCard?.fullName }}</p>
                <p class="mt-1 text-sm font-medium text-emerald-600">{{ pendingVoteCard?.categoryName }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ pendingVoteCard?.departmentName }} / {{ pendingVoteCard?.roleName }}</p>
              </div>
            </div>

            <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-semibold text-slate-900">Scanned Associate</p>
              <div class="mt-4 flex items-center gap-4">
                <img
                  v-if="verifiedVoter?.photoData"
                  :src="verifiedVoter.photoData"
                  :alt="verifiedVoter?.fullName"
                  class="h-16 w-16 rounded-full object-cover"
                />
                <div
                  v-else
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-emerald-600"
                >
                  <span class="text-xl font-semibold">{{ getInitials(verifiedVoter?.fullName) }}</span>
                </div>
                <div>
                  <p class="text-base font-semibold text-slate-900">{{ verifiedVoter?.fullName }}</p>
                  <p class="mt-1 text-sm text-slate-500">{{ verifiedVoter?.badgeId }}</p>
                  <p class="mt-1 text-sm text-slate-500">{{ verifiedVoter?.departmentName }} / {{ verifiedVoter?.roleName }}</p>
                </div>
              </div>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                @click="confirmVote"
                :disabled="isSubmitting || isPreparingVote"
                class="public-brand-action inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span class="material-symbols-outlined text-base">how_to_vote</span>
                {{ isSubmitting ? 'Submitting...' : 'Confirm Vote' }}
              </button>
              <button
                type="button"
                @click="cancelVoteFlow"
                class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <span class="material-symbols-outlined text-base">close</span>
                Cancel
              </button>
            </div>
          </div>
        </div>

        <div v-else class="public-brand-scanner-shell mt-4 rounded-3xl border border-dashed bg-slate-50 p-3">
          <div class="public-brand-scanner-frame relative overflow-hidden rounded-[24px] border-2 border-dashed bg-slate-950">
            <video
              ref="videoRef"
              autoplay
              playsinline
              muted
              class="h-44 w-full object-cover sm:h-56"
            ></video>

            <div
              v-if="!isCameraOpen"
              class="absolute inset-0 flex items-center justify-center bg-slate-950/95"
            >
              <span class="material-symbols-outlined public-brand-accent text-5xl">barcode_scanner</span>
            </div>

            <div class="pointer-events-none absolute inset-0">
              <div class="public-brand-guide absolute inset-x-0 top-1/2 h-20 -translate-y-1/2 rounded-3xl border bg-white/5"></div>
              <div class="public-brand-scan-band absolute inset-x-0 top-1/2 h-20 -translate-y-1/2 rounded-3xl"></div>
              <div class="public-brand-corner absolute left-3 top-1/2 h-6 w-6 -translate-y-10 border-l-4 border-t-4"></div>
              <div class="public-brand-corner absolute right-3 top-1/2 h-6 w-6 -translate-y-10 border-r-4 border-t-4"></div>
              <div class="public-brand-corner absolute left-3 top-1/2 h-6 w-6 translate-y-4 border-b-4 border-l-4"></div>
              <div class="public-brand-corner absolute right-3 top-1/2 h-6 w-6 translate-y-4 border-b-4 border-r-4"></div>
              <div class="public-brand-scan-line absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full"></div>
            </div>
          </div>

          <p class="mt-4 text-center text-sm text-slate-500">{{ scannerMessage }}</p>

          <div class="mt-4 flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div class="flex min-w-0 flex-1 items-center px-4 py-4">
              <span class="material-symbols-outlined text-xl text-slate-400">badge</span>
              <input
                :value="isRosterScannerMode ? rosterBadgeId : badgeId"
                type="text"
                inputmode="numeric"
                :placeholder="isRosterScannerMode ? 'Badge ID or Badge User Name' : 'Associate Badge ID'"
                class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
                @input="
                  isRosterScannerMode
                    ? (rosterBadgeId = $event.target.value)
                    : (badgeId = $event.target.value)
                "
              />
            </div>
            <button
              v-if="canUseNfc"
              type="button"
              @click="readBadgeWithNfc"
              :disabled="isRosterScannerMode ? isCheckingRoster : isPreparingVote || isSubmitting"
              class="public-brand-outline inline-flex h-[58px] shrink-0 items-center justify-center border-l border-slate-200 bg-white px-4 text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span class="material-symbols-outlined text-lg">{{ isNfcScanning ? 'close' : 'nfc' }}</span>
            </button>
            <button
              type="button"
              @click="isRosterScannerMode ? checkRosterAssignment() : prepareBadgeForVote()"
              :disabled="isRosterScannerMode ? isCheckingRoster : isPreparingVote || isSubmitting"
              class="public-brand-action inline-flex h-[58px] shrink-0 items-center justify-center px-5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              {{
                isRosterScannerMode
                  ? isCheckingRoster
                    ? 'Checking...'
                    : 'Check'
                  : isPreparingVote
                    ? 'Checking...'
                    : 'Check'
              }}
            </button>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              @click="switchCamera"
              :disabled="!canFlipCamera || isCameraLoading"
              class="public-brand-outline inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <span class="material-symbols-outlined text-lg">flip_camera_android</span>
              Flip Camera
            </button>

            <button
              type="button"
              @click="closeActiveScannerModal"
              class="public-brand-outline inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium text-slate-700 transition"
            >
              <span class="material-symbols-outlined text-lg">videocam_off</span>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isRosterLookupModalOpen"
      class="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">Check Roster</p>
            <p class="mt-1 text-sm text-slate-500">
              Search using Badge User Name, Badge ID, or scan the badge barcode.
            </p>
          </div>
          <button
            type="button"
            @click="closeRosterLookupModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="mt-5 space-y-4">
          <div class="flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div class="flex min-w-0 flex-1 items-center px-4 py-4">
              <span class="material-symbols-outlined public-brand-accent text-xl">person_search</span>
              <input
                v-model="rosterBadgeId"
                type="text"
                placeholder="Badge ID or Badge User Name"
                class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              @click="openCamera('roster')"
              :disabled="isCameraLoading || isCheckingRoster"
              class="public-brand-action inline-flex h-[58px] w-16 shrink-0 items-center justify-center text-white transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span class="material-symbols-outlined text-lg">barcode_scanner</span>
            </button>
          </div>

          <div
            v-if="rosterLookupError"
            class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {{ rosterLookupError }}
          </div>

          <div
            v-if="rosterLookupResult"
            class="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
          >
            <p class="text-sm text-slate-500">
              {{ rosterLookupResult.associate?.fullName || 'Associate' }}
              <span v-if="rosterLookupResult.rosterName"> | {{ rosterLookupResult.rosterName }}</span>
            </p>
            <p class="mt-3 text-2xl font-semibold text-slate-900">
              {{ rosterLookupResult.assignmentLabel }}
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              @click="closeRosterLookupModal"
              class="public-brand-outline inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium text-slate-700 transition"
            >
              <span class="material-symbols-outlined text-lg">close</span>
              Close
            </button>

            <button
              type="button"
              @click="checkRosterAssignment"
              :disabled="isCheckingRoster"
              class="public-brand-action inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span class="material-symbols-outlined text-lg">search</span>
              {{ isCheckingRoster ? 'Checking...' : 'Check Assignment' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isMobileTipsModalOpen"
      class="fixed inset-0 z-[60] flex items-end bg-slate-950/70 px-4 py-6 backdrop-blur-sm sm:hidden"
    >
      <div class="w-full rounded-[28px] bg-white p-5 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-lg font-semibold text-slate-900">How It Works</p>
            <p class="mt-1 text-sm text-slate-500">Quick steps and scanner tips for stronger badge detection on mobile.</p>
          </div>
          <button
            type="button"
            @click="isMobileTipsModalOpen = false"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="mt-5 grid gap-3">
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p class="text-sm font-semibold text-slate-900">How It Works</p>
            <p class="mt-1 text-sm text-slate-500">Choose a nominee card, scan your badge, then confirm your vote.</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p class="text-sm font-semibold text-slate-900">Scanner Tip</p>
            <p class="mt-1 text-sm text-slate-500">Keep the barcode moving across the center line and let the full-width scanner guide fill the camera frame.</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="toast.visible"
      class="fixed bottom-4 left-4 z-[70] w-full max-w-sm rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur transition"
      :class="toast.type === 'error' ? 'border-rose-200 bg-white text-rose-600' : 'border-emerald-200 bg-white text-emerald-600'"
    >
      <div class="flex items-start gap-3">
        <div
          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          :class="toast.type === 'error' ? 'bg-rose-50' : 'bg-emerald-50'"
        >
          <span class="material-symbols-outlined text-lg">
            {{ toast.type === 'error' ? 'error' : 'check_circle' }}
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-slate-900">{{ toast.title }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ toast.message }}</p>
        </div>
        <button
          type="button"
          @click="hideToast"
          class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100"
        >
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    </div>

    <footer class="relative z-10 border-t border-white/60 bg-white/55 px-4 py-4 text-center text-sm text-slate-500 backdrop-blur sm:px-6 lg:px-8">
      Copyright © {{ copyrightYear }} <span v-if="homeSiteName">{{ homeSiteName }}. </span>All rights reserved.
    </footer>
  </div>
</template>

<style scoped>
.public-brand-results-screen {
  background:
    radial-gradient(circle at top, rgba(245, 243, 255, 0.9), transparent 32%),
    linear-gradient(180deg, #f8fafc 0%, #eef2ff 45%, #f8fafc 100%);
}

.public-brand-shell {
  background:
    radial-gradient(circle at top, var(--brand-primary-soft), transparent 30%),
    linear-gradient(180deg, #effdf5 0%, #f8fafc 38%, #ecfeff 100%);
}

.public-brand-header {
  background: rgba(255, 255, 255, 0.8);
  border-color: var(--brand-border-soft);
}

.public-brand-logo {
  color: var(--brand-accent);
  background: transparent;
  box-shadow: none;
  border: none;
}

.public-brand-hero {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  box-shadow: 0 18px 50px var(--brand-primary-soft);
}

.public-brand-eyebrow {
  color: rgba(255, 255, 255, 0.82);
}

.public-brand-timer {
  background: linear-gradient(180deg, var(--brand-surface-soft), rgba(255, 255, 255, 0.98));
  border-color: var(--brand-border-soft);
}

.public-brand-countdown-chip {
  background: rgba(255, 255, 255, 0.86);
  border-color: var(--brand-border-soft);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
}

.public-brand-card {
  border-color: rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(248, 250, 252, 0.98));
}

.public-brand-card:hover {
  border-color: var(--brand-border);
  box-shadow: 0 18px 45px var(--brand-primary-soft);
}

.public-brand-avatar {
  background: var(--brand-surface);
  color: var(--brand-primary);
  --tw-ring-color: var(--brand-surface);
}

.public-brand-category {
  background: var(--brand-surface);
  color: var(--brand-primary);
}

.public-brand-action {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  box-shadow: 0 14px 32px var(--brand-primary-soft);
}

.public-brand-action:hover:not(:disabled) {
  filter: brightness(1.03);
}

.public-brand-outline {
  border-color: var(--brand-border-soft);
}

.public-brand-outline:hover:not(:disabled) {
  background-color: var(--brand-accent-soft);
  border-color: var(--brand-border);
}

.public-brand-accent,
.public-brand-accent-text {
  color: var(--brand-accent);
}

.public-brand-scanner-shell,
.public-brand-scanner-frame {
  border-color: var(--brand-border-soft);
}

.public-brand-guide {
  border-color: rgba(255, 255, 255, 0.36);
  animation: publicScannerFramePulse 2.2s ease-in-out infinite;
}

.public-brand-scan-band {
  background:
    linear-gradient(
      180deg,
      transparent 0%,
      rgba(255, 255, 255, 0.04) 18%,
      var(--brand-accent-soft) 50%,
      rgba(255, 255, 255, 0.04) 82%,
      transparent 100%
    );
  opacity: 0.85;
  animation: publicScannerSweep 2s ease-in-out infinite;
}

.public-brand-corner {
  border-color: var(--brand-accent);
  animation: publicScannerCornerPulse 1.5s ease-in-out infinite;
}

.public-brand-scan-line {
  background: linear-gradient(90deg, transparent, var(--brand-accent), transparent);
  box-shadow: 0 0 30px var(--brand-accent-soft);
  animation: publicScannerSweep 2s ease-in-out infinite;
}

@keyframes publicScannerSweep {
  0%,
  100% {
    transform: translateY(-34px);
    opacity: 0.4;
  }

  50% {
    transform: translateY(34px);
    opacity: 1;
  }
}

@keyframes publicScannerFramePulse {
  0%,
  100% {
    box-shadow: inset 0 0 0 rgba(255, 255, 255, 0);
    opacity: 0.72;
  }

  50% {
    box-shadow: inset 0 0 24px var(--brand-accent-soft);
    opacity: 1;
  }
}

@keyframes publicScannerCornerPulse {
  0%,
  100% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }
}
</style>
