<script setup>
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJson, postJson } from '../lib/api'
import { hexToRgba, resolveBrandingColors } from '../lib/branding'
import { isWebNfcSupported, scanSingleNfcBadge } from '../lib/nfc'

const router = useRouter()
const DEV_LOGIN_BADGE = '15357920'
const DEV_LOGIN_PASSWORD = '21322455'
const homeSiteLogo = ref('')
const homeSiteName = ref('')
const homeSiteTagline = ref('')
const brandingColors = ref(resolveBrandingColors())

const password = ref('')
const badgeCode = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const isVerifyingBadge = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const detectedAdmin = ref(null)
const scannerMessage = ref('Starting camera...')
const isCameraModalOpen = ref(false)
const isCameraOpen = ref(false)
const isCameraLoading = ref(false)
const isNfcScanning = ref(false)
const cameraMode = ref('environment')
const availableCameras = ref([])
const selectedCameraId = ref('')
const videoRef = ref(null)

let scannerReader = null
let lastDetectedBadge = ''
let lastDetectedAt = 0
let audioContext = null
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
    '--brand-secondary-soft': hexToRgba(palette.secondaryColor, 0.2),
    '--brand-accent-soft': hexToRgba(palette.accentColor, 0.14),
    '--brand-surface-soft': hexToRgba(palette.surfaceColor, 0.95),
    '--brand-border-soft': hexToRgba(palette.borderColor, 0.68),
  }
})

const buildScannerConstraints = () => {
  const baseConstraints = {
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    aspectRatio: { ideal: 1.7777777778 },
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

const canFlipCamera = computed(
  () => availableCameras.value.length > 1 || isCameraOpen.value || isCameraModalOpen.value,
)

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

const clearMessages = () => {
  errorMessage.value = ''
  successMessage.value = ''
}

const loadBranding = async () => {
  try {
    const response = await fetchJson('/api/public/branding')
    homeSiteLogo.value = response.siteLogo || ''
    homeSiteName.value = response.siteName || ''
    homeSiteTagline.value = response.siteTagline || ''
    brandingColors.value = resolveBrandingColors(response.brandingColors || {})
  } catch {
    // Keep the current palette if branding cannot be loaded.
  }
}

const fillDevelopmentLogin = () => {
  clearMessages()
  badgeCode.value = DEV_LOGIN_BADGE
  password.value = DEV_LOGIN_PASSWORD
  detectedAdmin.value = null
}

const persistAdminSession = (admin) => {
  localStorage.removeItem('adminSession')
  sessionStorage.removeItem('adminSession')
  localStorage.setItem('adminSession', JSON.stringify(admin))
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

const closeCameraModal = () => {
  stopCamera()
  isCameraModalOpen.value = false
}

const stopNfcScan = () => {
  if (nfcAbortController) {
    nfcAbortController.abort()
    nfcAbortController = null
  }

  isNfcScanning.value = false
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
    // Ignore audio playback issues in restricted browsers.
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
  badgeCode.value = normalizedValue
  scannerMessage.value = `Badge detected: ${normalizedValue}`

  await playScanBeep()
  closeCameraModal()
  await verifyBadge('barcode')
}

const startScanner = async (constraints) => {
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

  scannerReader = new BrowserMultiFormatReader(hints, 80)
  scannerReader.timeBetweenDecodingAttempts = 30
  scannerReader.timeBetweenScansMillis = 30

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
        await handleScannedCode(result.getText(), result.getBarcodeFormat())
        return
      }

      if (error && !(error instanceof NotFoundException)) {
        scannerMessage.value = 'Scanning camera is active. Keep the barcode near the center line for instant detection.'
      }
    },
  )
}

const openCamera = async () => {
  clearMessages()
  isCameraModalOpen.value = true
  await nextTick()

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
    scannerTuneInterval = window.setInterval(() => {
      optimizeScannerTrack()
    }, 900)
    await refreshCameraList()
    isCameraOpen.value = true
    scannerMessage.value = 'Camera is ready. Move the barcode across the scanner line. Detection is now optimized for faster reads.'
  } catch (error) {
    errorMessage.value = error.message || 'Unable to access the camera.'
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

const verifyBadge = async (source = 'manual') => {
  clearMessages()

  if (!badgeCode.value.trim()) {
    errorMessage.value = 'Enter or scan a badge code first.'
    return false
  }

  isVerifyingBadge.value = true

  try {
    const data = await postJson('/api/auth/badge', {
      badgeCode: badgeCode.value.trim(),
    })

    detectedAdmin.value = data.admin
    successMessage.value =
      source === 'barcode'
        ? 'Badge scanned and verified successfully.'
        : source === 'nfc'
          ? 'Badge tapped and verified successfully.'
          : 'Badge verified successfully.'

    return true
  } catch (error) {
    detectedAdmin.value = null
    errorMessage.value = error.message || 'Unable to verify badge right now.'
    return false
  } finally {
    isVerifyingBadge.value = false
  }
}

const readBadgeWithNfc = async () => {
  clearMessages()

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
        successMessage.value = message
      },
    })

    badgeCode.value = scannedBadgeId
    detectedAdmin.value = null
    await playScanBeep()
    await verifyBadge('nfc')
  } catch (error) {
    if (error?.name !== 'AbortError') {
      errorMessage.value = error.message || 'Unable to read the NFC badge.'
      successMessage.value = ''
    }
  } finally {
    nfcAbortController = null
    isNfcScanning.value = false
  }
}

const submitLogin = async () => {
  clearMessages()

  if (!badgeCode.value.trim()) {
    errorMessage.value = 'Badge code is required.'
    return
  }

  if (!password.value) {
    errorMessage.value = 'Password is required.'
    return
  }

  if (!detectedAdmin.value) {
    const badgeIsValid = await verifyBadge()

    if (!badgeIsValid) {
      return
    }
  }

  isSubmitting.value = true

  try {
    const data = await postJson('/api/auth/login', {
      badgeCode: badgeCode.value.trim(),
      password: password.value,
    })

    persistAdminSession(data.admin)

    successMessage.value = 'Login successful. Redirecting to dashboard...'
    router.push('/admin/dashboard')
  } catch (error) {
    errorMessage.value = error.message || 'Unable to complete login right now.'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(loadBranding)

onBeforeUnmount(() => {
  stopNfcScan()
  stopCamera()
})
</script>

<template>
  <div class="login-brand-shell min-h-screen font-sans text-slate-900" :style="brandingVars">
    <main class="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6">
      <div class="login-brand-card w-full max-w-md rounded-[28px] border bg-white/92 p-5 shadow-xl backdrop-blur sm:max-w-lg sm:p-7">
        <div class="flex items-center justify-center gap-3">
          <button
            type="button"
            @click="router.push('/')"
            aria-label="Go to home"
            class="login-brand-logo flex h-16 w-16 items-center justify-center rounded-full transition sm:h-[72px] sm:w-[72px]"
          >
            <img v-if="homeSiteLogo" :src="homeSiteLogo" :alt="homeSiteName || 'Website logo'" class="h-full w-full rounded-full object-cover" />
            <span v-else class="material-symbols-outlined text-4xl">shield_lock</span>
          </button>
        </div>

        <div v-if="homeSiteName || homeSiteTagline" class="mt-4 text-center">
          <p v-if="homeSiteName" class="text-xl font-semibold text-slate-900">{{ homeSiteName }}</p>
          <p v-if="homeSiteTagline" class="mt-1 text-sm text-slate-500">{{ homeSiteTagline }}</p>
        </div>

        <div class="mt-6 space-y-4">
          <div class="login-brand-surface rounded-3xl border p-4 sm:p-5">
            <div class="flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div class="flex min-w-0 flex-1 items-center px-4 py-4">
                <span class="material-symbols-outlined login-brand-accent text-xl">badge</span>
                <input
                  v-model="badgeCode"
                  type="text"
                  placeholder="Badge ID"
                  class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                v-if="canUseNfc"
                type="button"
                @click="readBadgeWithNfc"
                class="login-brand-outline inline-flex h-[58px] w-16 shrink-0 items-center justify-center border-l border-slate-200 bg-white text-slate-700 transition"
              >
                <span class="material-symbols-outlined text-lg">{{ isNfcScanning ? 'close' : 'nfc' }}</span>
              </button>
              <button
                type="button"
                @click="openCamera"
                :disabled="isCameraLoading"
                class="login-brand-action inline-flex h-[58px] w-16 shrink-0 items-center justify-center text-white transition disabled:cursor-not-allowed"
              >
                <span class="material-symbols-outlined text-lg">barcode_scanner</span>
              </button>
            </div>

            <label class="mt-4 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <span class="material-symbols-outlined login-brand-accent text-xl">lock</span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Password"
                class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button type="button" class="text-slate-400" @click="showPassword = !showPassword">
                <span class="material-symbols-outlined text-xl">
                  {{ showPassword ? 'visibility_off' : 'visibility' }}
                </span>
              </button>
            </label>

            <div
              v-if="errorMessage"
              class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {{ errorMessage }}
            </div>

            <div
              v-if="successMessage"
              class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {{ successMessage }}
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                @click="fillDevelopmentLogin"
                class="login-brand-outline inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-5 py-4 text-base font-medium text-slate-700 transition"
              >
                <span class="material-symbols-outlined text-xl">bolt</span>
                Quick Login
              </button>

              <button
                type="button"
                @click="submitLogin"
                :disabled="isSubmitting || isVerifyingBadge"
                class="login-brand-action inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-medium text-white transition disabled:cursor-not-allowed"
              >
                <span class="material-symbols-outlined text-xl">login</span>
                {{ isSubmitting ? 'Signing In...' : isVerifyingBadge ? 'Checking...' : 'Continue' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="isCameraModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg rounded-[28px] bg-white p-4 shadow-2xl sm:p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-lg font-semibold text-slate-900">Scan Badge Barcode</p>
          </div>
          <button
            type="button"
            @click="closeCameraModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="login-brand-scanner-shell mt-4 rounded-3xl border border-dashed p-3">
          <div class="login-brand-scanner-frame relative overflow-hidden rounded-[24px] border-2 border-dashed bg-slate-950">
            <video
              ref="videoRef"
              autoplay
              playsinline
              muted
              class="h-40 w-full object-cover sm:h-48"
            ></video>

            <div
              v-if="!isCameraOpen"
              class="absolute inset-0 flex items-center justify-center bg-slate-950/95"
            >
              <span class="material-symbols-outlined login-brand-accent text-5xl">barcode_scanner</span>
            </div>

            <div class="pointer-events-none absolute inset-0">
              <div class="login-brand-guide absolute inset-x-0 top-1/2 h-20 -translate-y-1/2 rounded-3xl border bg-white/5"></div>
              <div class="login-brand-scan-band absolute inset-x-0 top-1/2 h-20 -translate-y-1/2 rounded-3xl"></div>
              <div class="login-brand-corner absolute left-3 top-1/2 h-6 w-6 -translate-y-10 border-l-4 border-t-4"></div>
              <div class="login-brand-corner absolute right-3 top-1/2 h-6 w-6 -translate-y-10 border-r-4 border-t-4"></div>
              <div class="login-brand-corner absolute left-3 top-1/2 h-6 w-6 translate-y-4 border-b-4 border-l-4"></div>
              <div class="login-brand-corner absolute right-3 top-1/2 h-6 w-6 translate-y-4 border-b-4 border-r-4"></div>
              <div class="login-brand-scan-line absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full"></div>
            </div>
          </div>

          <p class="mt-4 text-center text-sm text-slate-500">{{ scannerMessage }}</p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              @click="switchCamera"
              :disabled="!canFlipCamera || isCameraLoading"
              class="login-brand-outline inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <span class="material-symbols-outlined text-lg">flip_camera_android</span>
              Flip Camera
            </button>

            <button
              type="button"
              @click="closeCameraModal"
              class="login-brand-outline inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium text-slate-700 transition"
            >
              <span class="material-symbols-outlined text-lg">videocam_off</span>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-brand-shell {
  background:
    radial-gradient(circle at top, var(--brand-primary-soft), transparent 32%),
    radial-gradient(circle at bottom right, var(--brand-secondary-soft), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #eefbf6 42%, #f8fafc 100%);
}

.login-brand-card {
  border-color: var(--brand-border-soft);
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.12);
}

.login-brand-logo {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  color: #ffffff;
  box-shadow: 0 18px 42px var(--brand-primary-soft);
}

.login-brand-surface {
  border-color: var(--brand-border-soft);
  background: linear-gradient(180deg, var(--brand-surface-soft), rgba(255, 255, 255, 0.98));
}

.login-brand-action {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  box-shadow: 0 16px 34px var(--brand-primary-soft);
}

.login-brand-action:hover:not(:disabled) {
  filter: brightness(1.03);
}

.login-brand-action:disabled {
  box-shadow: none;
  opacity: 0.72;
}

.login-brand-outline {
  border-color: var(--brand-border-soft);
}

.login-brand-outline:hover:not(:disabled) {
  background-color: var(--brand-accent-soft);
  border-color: var(--brand-border);
}

.login-brand-accent {
  color: var(--brand-accent);
}

.login-brand-scanner-shell,
.login-brand-scanner-frame {
  border-color: var(--brand-border-soft);
}

.login-brand-guide {
  border-color: rgba(255, 255, 255, 0.36);
  animation: loginScannerFramePulse 2.2s ease-in-out infinite;
}

.login-brand-scan-band {
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
  animation: loginScannerSweep 2s ease-in-out infinite;
}

.login-brand-corner {
  border-color: var(--brand-accent);
  animation: loginScannerCornerPulse 1.5s ease-in-out infinite;
}

.login-brand-scan-line {
  background: linear-gradient(90deg, transparent, var(--brand-accent), transparent);
  box-shadow: 0 0 28px var(--brand-accent-soft);
  animation: loginScannerSweep 2s ease-in-out infinite;
}

@keyframes loginScannerSweep {
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

@keyframes loginScannerFramePulse {
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

@keyframes loginScannerCornerPulse {
  0%,
  100% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }
}
</style>
