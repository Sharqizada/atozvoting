<script setup>
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJson, postJson } from '../lib/api'

const router = useRouter()
const homeSiteLogo = ref('')
const homeSiteName = ref('Inbound Star Voting')
const homeSiteTagline = ref('Recognize. Appreciate. Celebrate.')
const roundSummary = ref(null)
const finishedRoundSummary = ref(null)
const publicCategories = ref([])
const pendingVoteCard = ref(null)
const verifiedVoter = ref(null)
const badgeId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const toast = ref({
  visible: false,
  type: 'success',
  title: '',
  message: '',
})
const isLoadingRound = ref(true)
const isPreparingVote = ref(false)
const isSubmitting = ref(false)
const isCameraModalOpen = ref(false)
const isCameraOpen = ref(false)
const isCameraLoading = ref(false)
const cameraMode = ref('environment')
const availableCameras = ref([])
const selectedCameraId = ref('')
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

const buildScannerConstraints = () => {
  const baseConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60, min: 24 },
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
    advanced.push({ zoom: Math.min(capabilities.zoom.max, Math.max(minZoom, 1.4)) })
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
  BarcodeFormat.AZTEC,
  BarcodeFormat.CODABAR,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODE_128,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.EAN_8,
  BarcodeFormat.EAN_13,
  BarcodeFormat.ITF,
  BarcodeFormat.PDF_417,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.UPC_EAN_EXTENSION,
]

const canFlipCamera = computed(
  () => availableCameras.value.length > 1 || isCameraOpen.value || isCameraModalOpen.value,
)
const roundInfo = computed(() => roundSummary.value)
const finishedRoundInfo = computed(() => finishedRoundSummary.value)
const displayRound = computed(() => roundInfo.value || finishedRoundInfo.value)
const isFinishedRoundState = computed(() => !roundInfo.value && Boolean(finishedRoundInfo.value))
const hasPublishedWinners = computed(
  () => isFinishedRoundState.value && Boolean(finishedRoundInfo.value?.winnersPublished) && (finishedRoundInfo.value?.winners?.length || 0) > 0,
)
const showConfirmVoteStep = computed(
  () => isCameraModalOpen.value && Boolean(pendingVoteCard.value && verifiedVoter.value),
)
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
const heroEyebrowLabel = computed(() => (isFinishedRoundState.value ? 'Voting Closed' : 'Live Round'))
const publicWinnerCards = computed(() => {
  const ordered = finishedRoundInfo.value?.winners || []
  const first = ordered.find((entry) => entry.place === 1)
  const second = ordered.find((entry) => entry.place === 2)
  const third = ordered.find((entry) => entry.place === 3)
  return [second, first, third].filter(Boolean)
})
const heroTitle = computed(() => displayRound.value?.name || 'Voting Round')
const heroDescription = computed(() =>
  isFinishedRoundState.value
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

const loadPublicVotingPage = async () => {
  isLoadingRound.value = true
  clearMessages()

  try {
    const response = await fetchJson('/api/voting/live-ballot')
    homeSiteLogo.value = response.siteLogo || ''
    homeSiteName.value = response.siteName || 'Inbound Star Voting'
    homeSiteTagline.value = response.siteTagline || 'Recognize. Appreciate. Celebrate.'

    if (!response.hasActiveRound || !response.round) {
      roundSummary.value = null
      finishedRoundSummary.value = response.finishedRound || null
      publicCategories.value = []
      return
    }

    roundSummary.value = response.round
    finishedRoundSummary.value = null
    publicCategories.value = response.categories || []
  } catch (error) {
    homeSiteLogo.value = ''
    homeSiteName.value = 'Inbound Star Voting'
    homeSiteTagline.value = 'Recognize. Appreciate. Celebrate.'
    roundSummary.value = null
    finishedRoundSummary.value = null
    publicCategories.value = []
    setError(error.message || 'Unable to load the live voting page.')
  } finally {
    isLoadingRound.value = false
  }
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

const closeCameraModal = () => {
  stopCamera()
  isCameraModalOpen.value = false
}

const cancelVoteFlow = () => {
  closeCameraModal()
  resetPendingVote()
}

const prepareBadgeForVote = async (fromScanner = false) => {
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
      fromScanner
        ? 'Badge scanned successfully. Press confirm to submit the vote.'
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

const handleScannedCode = async (scannedValue) => {
  const normalizedValue = scannedValue?.trim()
  const now = Date.now()

  if (!normalizedValue || (normalizedValue === lastDetectedBadge && now - lastDetectedAt <= 1500)) {
    return
  }

  lastDetectedBadge = normalizedValue
  lastDetectedAt = now
  badgeId.value = normalizedValue
  scannerMessage.value = `Badge detected: ${normalizedValue}`

  await playScanBeep()
  const isReady = await prepareBadgeForVote(true)

  if (isReady) {
    stopCamera()
  }
}

const startScanner = async (constraints) => {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, scannerFormats)
  hints.set(DecodeHintType.TRY_HARDER, true)

  scannerReader = new BrowserMultiFormatReader(hints, 120)
  scannerReader.timeBetweenDecodingAttempts = 45

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
        scannerMessage.value = 'Scanning camera is active. Hold the badge steady inside the frame.'
      }
    },
  )
}

const openCamera = async () => {
  clearMessages()
  isCameraModalOpen.value = true

  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Camera access is not available in this browser.'
    return
  }

  isCameraLoading.value = true
  scannerMessage.value = 'Starting camera...'

  try {
    stopCamera()
    await refreshCameraList()

    if (!selectedCameraId.value && availableCameras.value.length) {
      selectedCameraId.value = getPreferredCameraId()
    }

    await startScanner(buildScannerConstraints())
    await optimizeScannerTrack()
    await refreshCameraList()
    isCameraOpen.value = true
    scannerMessage.value = 'Camera is ready. Move the badge slowly across the center line for faster scanning.'
  } catch (error) {
    setError(error.message || 'Unable to access the camera.')
    scannerMessage.value = 'Camera permission is required for scanning.'
  } finally {
    isCameraLoading.value = false
  }
}

const switchCamera = async () => {
  clearMessages()

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

  await openCamera()
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
    const isReady = await prepareBadgeForVote(false)

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
  <div class="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_30%),linear-gradient(180deg,_#effdf5_0%,_#f8fafc_38%,_#ecfeff_100%)] font-sans text-slate-900">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -left-16 top-16 h-56 w-56 rounded-full bg-emerald-200/35 blur-3xl"></div>
      <div class="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl"></div>
      <div class="absolute bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-200/20 blur-3xl"></div>
    </div>

    <main class="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div class="sticky top-0 z-30 -mx-4 border-b border-white/60 bg-white/72 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-3 sm:gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 text-emerald-600 shadow-lg shadow-emerald-100/70 ring-1 ring-white/70 backdrop-blur sm:h-14 sm:w-14">
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
          @click="router.push('/login')"
          class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/85 px-4 text-sm text-slate-600 shadow-sm backdrop-blur transition hover:bg-white sm:w-auto"
        >
          <span class="material-symbols-outlined text-base">admin_panel_settings</span>
          Admin Login
        </button>
      </div>
      </div>

      <section class="mt-4 overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:mt-6 sm:rounded-[36px] sm:p-8">
        <div class="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div class="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,_rgba(5,150,105,0.96),_rgba(14,165,233,0.92))] px-6 py-7 text-white shadow-[0_18px_50px_rgba(16,185,129,0.28)] sm:px-8">
            <div class="absolute right-[-48px] top-[-48px] h-40 w-40 rounded-full border border-white/15 bg-white/10"></div>
            <div class="absolute bottom-[-64px] left-[-32px] h-44 w-44 rounded-full border border-white/10 bg-white/10"></div>
            <div class="relative">
              <p class="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-100">{{ heroEyebrowLabel }}</p>
              <p class="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{{ heroTitle }}</p>
              <p class="mt-4 max-w-2xl text-sm text-emerald-50/90 sm:text-base">
                {{ heroDescription }}
              </p>
              <div class="mt-6 flex flex-wrap gap-3">
                <div class="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white/95 ring-1 ring-white/15">
                  <span class="material-symbols-outlined text-base">calendar_month</span>
                  {{ formatDateRange(displayRound?.startDate, displayRound?.endDate) || 'Schedule not available' }}
                </div>
                <div class="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white/95 ring-1 ring-white/15">
                  <span class="material-symbols-outlined text-base">verified_user</span>
                  One vote per associate
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-[32px] border border-emerald-100 bg-[linear-gradient(180deg,_rgba(236,253,245,0.95),_rgba(255,255,255,0.98))] p-6 shadow-[0_14px_40px_rgba(16,185,129,0.08)]">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Voting Timer</p>
            <p class="mt-3 text-3xl font-semibold leading-tight text-slate-900">{{ countdownLabel }}</p>
            <p class="mt-2 text-sm text-slate-500">
              <span v-if="isLoadingRound">Loading live voting page...</span>
              <span v-else>{{ displayRound?.name || 'No live voting round' }}</span>
            </p>

            <div class="mt-6 grid gap-3">
              <div class="rounded-2xl border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <p class="text-sm font-semibold text-slate-900">How It Works</p>
                <p class="mt-1 text-sm text-slate-500">Choose a nominee card, scan your badge, then confirm your vote.</p>
              </div>
              <div class="rounded-2xl border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                <p class="text-sm font-semibold text-slate-900">Scanner Tip</p>
                <p class="mt-1 text-sm text-slate-500">Move the barcode gently across the center scanner line for faster detection.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-6 rounded-[36px] border border-white/70 bg-white/82 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <div v-if="!isFinishedRoundState" class="flex flex-col gap-2">
          <p class="text-xl font-semibold text-slate-900">Choose A Nominee</p>
          <p class="text-sm text-slate-500">
            Tap `Vote` on any nominee card below to open the scanner and submit your badge.
          </p>
        </div>

        <div v-if="isFinishedRoundState && !hasPublishedWinners" class="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
            <span class="material-symbols-outlined text-3xl">campaign</span>
          </div>
          <p class="mt-5 text-2xl font-semibold text-slate-900">Voting round finished</p>
          <p class="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
            Please wait for the result announcement from the admin. The live vote cards are hidden because this round is already completed.
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
            class="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(248,250,252,0.98))] p-5 text-center shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_18px_45px_rgba(16,185,129,0.12)]"
          >
            <div class="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50">
              <img
                v-if="card.photoData"
                :src="card.photoData"
                :alt="card.fullName"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-2xl font-semibold">{{ getInitials(card.fullName) }}</span>
            </div>

            <p class="mt-5 text-xl font-semibold text-slate-900">{{ card.fullName }}</p>
            <div class="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
              {{ card.categoryName }}
            </div>
            <p class="mt-3 text-xs text-slate-400">{{ card.departmentName }} / {{ card.roleName }}</p>

            <button
              type="button"
              @click="startVoteFlow(card)"
              class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg rounded-[28px] bg-white p-4 shadow-2xl sm:p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-lg font-semibold text-slate-900">
              {{ showConfirmVoteStep ? 'Confirm Your Vote' : 'Scan Associate Badge' }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              {{ showConfirmVoteStep ? 'Review the nominee and confirm the vote inside this modal.' : `Scanning for: ${pendingVoteCard?.fullName || 'Selected nominee'}` }}
            </p>
          </div>
          <button
            type="button"
            @click="cancelVoteFlow"
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
                class="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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

        <div v-else class="mt-4 rounded-3xl border border-dashed border-emerald-200 bg-slate-50 p-3">
          <div class="relative overflow-hidden rounded-[24px] border-2 border-dashed border-emerald-200 bg-slate-950">
            <video
              ref="videoRef"
              autoplay
              playsinline
              muted
              class="h-44 w-full object-cover sm:h-52"
            ></video>

            <div
              v-if="!isCameraOpen"
              class="absolute inset-0 flex items-center justify-center bg-slate-950/95"
            >
              <span class="material-symbols-outlined text-5xl text-emerald-300">barcode_scanner</span>
            </div>

            <div class="pointer-events-none absolute inset-0">
              <div class="absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-3xl border border-white/30 bg-white/5"></div>
              <div class="absolute left-6 top-1/2 h-6 w-6 -translate-y-12 border-l-4 border-t-4 border-emerald-500"></div>
              <div class="absolute right-6 top-1/2 h-6 w-6 -translate-y-12 border-r-4 border-t-4 border-emerald-500"></div>
              <div class="absolute left-6 top-1/2 h-6 w-6 translate-y-6 border-b-4 border-l-4 border-emerald-500"></div>
              <div class="absolute right-6 top-1/2 h-6 w-6 translate-y-6 border-b-4 border-r-4 border-emerald-500"></div>
              <div
                class="absolute inset-x-10 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
              ></div>
            </div>
          </div>

          <p class="mt-4 text-center text-sm text-slate-500">{{ scannerMessage }}</p>

          <div class="mt-4 flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div class="flex min-w-0 flex-1 items-center px-4 py-4">
              <span class="material-symbols-outlined text-xl text-slate-400">badge</span>
              <input
                v-model="badgeId"
                type="text"
                inputmode="numeric"
                placeholder="Associate Badge ID"
                class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              @click="prepareBadgeForVote"
              :disabled="isPreparingVote || isSubmitting"
              class="inline-flex h-[58px] shrink-0 items-center justify-center bg-emerald-600 px-5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {{ isPreparingVote ? 'Checking...' : 'Check' }}
            </button>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              @click="switchCamera"
              :disabled="!canFlipCamera || isCameraLoading"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <span class="material-symbols-outlined text-lg">flip_camera_android</span>
              Flip Camera
            </button>

            <button
              type="button"
              @click="cancelVoteFlow"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <span class="material-symbols-outlined text-lg">videocam_off</span>
              Close
            </button>
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
  </div>
</template>
