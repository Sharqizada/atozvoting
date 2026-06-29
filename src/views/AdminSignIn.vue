<script setup>
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { postJson } from '../lib/api'

const router = useRouter()
const DEV_LOGIN_BADGE = '15357920'
const DEV_LOGIN_PASSWORD = '21322455'

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
const cameraMode = ref('environment')
const availableCameras = ref([])
const selectedCameraId = ref('')
const videoRef = ref(null)

let scannerReader = null
let lastDetectedBadge = ''
let lastDetectedAt = 0
let audioContext = null

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

const canFlipCamera = computed(
  () => availableCameras.value.length > 1 || isCameraOpen.value || isCameraModalOpen.value,
)

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

const clearMessages = () => {
  errorMessage.value = ''
  successMessage.value = ''
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
  await verifyBadge(true)
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
        await handleScannedCode(result.getText(), result.getBarcodeFormat())
        return
      }

      if (error && !(error instanceof NotFoundException)) {
        scannerMessage.value = 'Scanning camera is active. Align the barcode inside the frame.'
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
    scannerMessage.value = 'Camera is ready. Move the barcode slowly across the center line for faster scanning.'
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

const verifyBadge = async (fromScanner = false) => {
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
    successMessage.value = fromScanner
      ? 'Badge scanned and verified successfully.'
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

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 font-sans text-slate-900">
    <main class="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6">
      <div class="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl sm:max-w-lg sm:p-7">
        <div class="flex items-center justify-center gap-3">
          <button
            type="button"
            @click="router.push('/')"
            aria-label="Go to home"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition hover:bg-blue-100 sm:h-16 sm:w-16"
          >
            <span class="material-symbols-outlined text-4xl">shield_lock</span>
          </button>
        </div>

        <div class="mt-6 space-y-4">
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div class="flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div class="flex min-w-0 flex-1 items-center px-4 py-4">
                <span class="material-symbols-outlined text-xl text-slate-400">badge</span>
                <input
                  v-model="badgeCode"
                  type="text"
                  placeholder="Badge ID"
                  class="w-full border-none bg-transparent px-3 text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="button"
                @click="openCamera"
                :disabled="isCameraLoading"
                class="inline-flex h-[58px] w-16 shrink-0 items-center justify-center bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                <span class="material-symbols-outlined text-lg">barcode_scanner</span>
              </button>
            </div>

            <label class="mt-4 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <span class="material-symbols-outlined text-xl text-slate-400">lock</span>
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
              v-if="detectedAdmin"
              class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <p class="text-sm font-medium text-emerald-700">{{ detectedAdmin.full_name }}</p>
              <p class="mt-1 text-sm text-slate-500">
                {{ detectedAdmin.role }} · {{ detectedAdmin.badge_code }}
              </p>
            </div>

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
                class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <span class="material-symbols-outlined text-xl">bolt</span>
                Quick Login
              </button>

              <button
                type="button"
                @click="submitLogin"
                :disabled="isSubmitting || isVerifyingBadge"
                class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
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

        <div class="mt-4 rounded-3xl border border-dashed border-blue-200 bg-slate-50 p-3">
          <div class="relative overflow-hidden rounded-[24px] border-2 border-dashed border-blue-200 bg-slate-950">
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
              <span class="material-symbols-outlined text-5xl text-blue-300">barcode_scanner</span>
            </div>

            <div class="pointer-events-none absolute inset-0">
              <div class="absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-3xl border border-white/30 bg-white/5"></div>
              <div class="absolute left-6 top-1/2 h-6 w-6 -translate-y-12 border-l-4 border-t-4 border-blue-500"></div>
              <div class="absolute right-6 top-1/2 h-6 w-6 -translate-y-12 border-r-4 border-t-4 border-blue-500"></div>
              <div class="absolute left-6 top-1/2 h-6 w-6 translate-y-6 border-b-4 border-l-4 border-blue-500"></div>
              <div class="absolute right-6 top-1/2 h-6 w-6 translate-y-6 border-b-4 border-r-4 border-blue-500"></div>
              <div
                class="absolute inset-x-10 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent"
              ></div>
            </div>
          </div>

          <p class="mt-4 text-center text-sm text-slate-500">{{ scannerMessage }}</p>

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
              @click="closeCameraModal"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
