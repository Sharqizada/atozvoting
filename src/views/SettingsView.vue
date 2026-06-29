<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { hexToRgba, resolveBrandingColors } from '../lib/branding'
import { postJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/settings', {
  siteInfo: {
    siteName: '',
    siteTagline: '',
    siteLogo: '',
    timezone: '',
    dateFormat: '',
    timeFormat: '',
    currency: '',
  },
  brandingColors: resolveBrandingColors(),
  votingSettings: {
    allowDuplicateVoting: false,
    requireVoteConfirmation: false,
    voteEditing: false,
    votesPerUser: '',
    liveExtensionMinutes: '15',
  },
  emailSettings: {
    fromEmail: '',
    fromName: '',
    smtpProvider: '',
  },
})

const saveError = ref('')
const saveSuccess = ref('')
const isSaving = ref(false)
const logoInputRef = ref(null)
const siteInfo = reactive({
  siteName: '',
  siteTagline: '',
  siteLogo: '',
  timezone: '',
  dateFormat: '',
  timeFormat: '',
  currency: '',
})
const brandingColors = reactive(resolveBrandingColors())
const votingSettings = reactive({
  allowDuplicateVoting: false,
  requireVoteConfirmation: false,
  voteEditing: false,
  votesPerUser: '',
  liveExtensionMinutes: '15',
  ipRestriction: '',
})
const emailSettings = reactive({
  fromEmail: '',
  fromName: '',
  smtpProvider: '',
})
const brandingFields = [
  { key: 'primaryColor', label: 'Primary Buttons', description: 'Main vote and save button color.' },
  { key: 'secondaryColor', label: 'Hero Gradient', description: 'Secondary accent used in gradients and highlights.' },
  { key: 'accentColor', label: 'Icons & Hover', description: 'Icon color and hover border accent.' },
  { key: 'surfaceColor', label: 'Soft Background', description: 'Soft tinted cards and helper panels.' },
  { key: 'borderColor', label: 'Border Color', description: 'Visible border and outline accent color.' },
]
const previewBranding = computed(() => resolveBrandingColors(brandingColors))
const brandingHeroPreviewStyle = computed(() => ({
  background: `linear-gradient(135deg, ${previewBranding.value.primaryColor}, ${previewBranding.value.secondaryColor})`,
  boxShadow: `0 22px 48px ${hexToRgba(previewBranding.value.primaryColor, 0.22)}`,
}))
const brandingSurfacePreviewStyle = computed(() => ({
  backgroundColor: previewBranding.value.surfaceColor,
  borderColor: previewBranding.value.borderColor,
}))
const brandingButtonPreviewStyle = computed(() => ({
  backgroundColor: previewBranding.value.primaryColor,
  boxShadow: `0 12px 30px ${hexToRgba(previewBranding.value.primaryColor, 0.24)}`,
}))
const brandingIconPreviewStyle = computed(() => ({
  color: previewBranding.value.accentColor,
  backgroundColor: hexToRgba(previewBranding.value.accentColor, 0.12),
}))

watch(
  data,
  (value) => {
    Object.assign(siteInfo, value.siteInfo || {})
    Object.assign(brandingColors, resolveBrandingColors(value.brandingColors || {}))
    Object.assign(votingSettings, value.votingSettings || {})
    Object.assign(emailSettings, value.emailSettings || {})
  },
  { immediate: true },
)

const openLogoPicker = () => {
  logoInputRef.value?.click()
}

const clearLogo = () => {
  siteInfo.siteLogo = ''

  if (logoInputRef.value) {
    logoInputRef.value.value = ''
  }
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(`${reader.result || ''}`)
    reader.onerror = () => reject(new Error('Unable to read the selected logo file.'))
    reader.readAsDataURL(file)
  })

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to process the selected logo image.'))
    image.src = src
  })

const buildOptimizedLogoDataUrl = async (file) => {
  if (file.type === 'image/svg+xml') {
    return readFileAsDataUrl(file)
  }

  const sourceUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(sourceUrl)
  const maxDimension = 320
  const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
  const width = Math.max(1, Math.round((image.width || 1) * scale))
  const height = Math.max(1, Math.round((image.height || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to prepare the logo image.')
  }

  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/webp', 0.82)
}

const handleLogoSelection = async (event) => {
  const file = event.target?.files?.[0]

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    saveError.value = 'Please choose a valid image file for the logo.'
    event.target.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    saveError.value = 'Logo image must be 5MB or smaller.'
    event.target.value = ''
    return
  }

  try {
    siteInfo.siteLogo = await buildOptimizedLogoDataUrl(file)
    saveError.value = ''
  } catch (error) {
    saveError.value = error.message || 'Unable to process the selected logo file.'
    event.target.value = ''
  }
}

const saveSettings = async () => {
  saveError.value = ''
  saveSuccess.value = ''
  isSaving.value = true

  try {
    await postJson('/api/settings', {
      siteInfo,
      brandingColors: resolveBrandingColors(brandingColors),
      votingSettings,
      emailSettings,
    })
    await load()
    saveSuccess.value = 'Settings saved successfully.'
  } catch (requestError) {
    saveError.value = requestError.message || 'Unable to save settings.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <AdminShell
    title="Settings"
    subtitle="Manage branding and voting preferences."
    :breadcrumbs="[{ label: 'Home' }, { label: 'Settings' }]"
  >
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <template #actions>
      <button type="button" @click="saveSettings" :disabled="isSaving" class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
        <span class="material-symbols-outlined text-base">check</span>
        {{ isSaving ? 'Saving...' : 'Save Changes' }}
      </button>
    </template>

    <div v-if="saveError" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ saveError }}
    </div>
    <div v-if="saveSuccess" class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
      {{ saveSuccess }}
    </div>

    <section class="space-y-6">
      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <p class="text-2xl font-semibold text-slate-900">Home Page Branding</p>
        <p class="mt-1 text-sm text-slate-500">Update the logo, title, and subtitle shown on the public home page.</p>

        <div class="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p class="text-sm font-medium text-slate-700">Logo Preview</p>
            <div class="mt-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <img
                v-if="siteInfo.siteLogo"
                :src="siteInfo.siteLogo"
                alt="Site logo"
                class="h-full w-full object-cover"
              />
              <span v-else class="material-symbols-outlined text-5xl text-slate-300">image</span>
            </div>
            <input
              ref="logoInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleLogoSelection"
            />
            <div class="mt-4 flex flex-wrap gap-3">
              <button type="button" @click="openLogoPicker" class="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm text-blue-600">
                Change Logo
              </button>
              <button v-if="siteInfo.siteLogo" type="button" @click="clearLogo" class="inline-flex h-11 items-center rounded-xl border border-rose-200 bg-white px-4 text-sm text-rose-600">
                Remove
              </button>
            </div>
            <p class="mt-3 text-xs text-slate-400">PNG, JPG, WEBP, or SVG. Large images are optimized automatically before save.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Home Logo Title</span>
              <input v-model="siteInfo.siteName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Home Logo Subtitle</span>
              <input v-model="siteInfo.siteTagline" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Timezone</span>
              <select v-model="siteInfo.timezone" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                <option>(UTC+05:30) Asia/Kolkata</option>
                <option>(UTC+00:00) UTC</option>
                <option>(UTC-05:00) America/New_York</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Date Format</span>
              <select v-model="siteInfo.dateFormat" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                <option>June 3, 2026</option>
                <option>03/06/2026</option>
                <option>2026-06-03</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Time Format</span>
              <select v-model="siteInfo.timeFormat" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                <option>12 Hour (hh:mm AM/PM)</option>
                <option>24 Hour (HH:mm)</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Currency</span>
              <select v-model="siteInfo.currency" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                <option>USD - US Dollar ($)</option>
                <option>INR - Indian Rupee (Rs)</option>
                <option>EUR - Euro (EUR)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="mt-6 grid gap-6 xl:grid-cols-[1.05fr_1fr]">
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p class="text-base font-semibold text-slate-900">Branding Preview</p>
            <p class="mt-1 text-sm text-slate-500">Preview how the public website colors will look on the hero, buttons, icons, and soft panels.</p>

            <div class="mt-5 rounded-[28px] p-5 text-white" :style="brandingHeroPreviewStyle">
              <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15" :style="brandingIconPreviewStyle">
                  <span class="material-symbols-outlined text-2xl">palette</span>
                </div>
                <div>
                  <p class="text-lg font-semibold">{{ siteInfo.siteName || 'Website branding' }}</p>
                  <p class="text-sm text-white/85">{{ siteInfo.siteTagline || 'Preview the public website palette before saving.' }}</p>
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-3">
                <button type="button" class="inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-medium text-white" :style="brandingButtonPreviewStyle">
                  <span class="material-symbols-outlined text-base">how_to_vote</span>
                  Vote Button
                </button>
                <div class="inline-flex h-11 items-center gap-2 rounded-2xl border bg-white/10 px-4 text-sm font-medium text-white/95" :style="{ borderColor: hexToRgba(previewBranding.borderColor, 0.75) }">
                  <span class="material-symbols-outlined text-base" :style="{ color: previewBranding.accentColor }">verified_user</span>
                  Icon Accent
                </div>
              </div>
            </div>

            <div class="mt-5 rounded-3xl border p-4" :style="brandingSurfacePreviewStyle">
              <p class="text-sm font-semibold text-slate-900">Border & Hover Surface</p>
              <p class="mt-1 text-sm text-slate-600">This tinted surface is used for soft cards, help panels, and highlighted areas on mobile and desktop views.</p>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label v-for="field in brandingFields" :key="field.key" class="block rounded-3xl border border-slate-200 bg-white p-4">
              <span class="block text-sm font-medium text-slate-700">{{ field.label }}</span>
              <span class="mt-1 block text-xs text-slate-400">{{ field.description }}</span>
              <div class="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  v-model="brandingColors[field.key]"
                  type="color"
                  class="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                />
                <input
                  v-model="brandingColors[field.key]"
                  type="text"
                  maxlength="7"
                  class="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm uppercase outline-none"
                />
              </div>
            </label>
          </div>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <p class="text-lg font-semibold text-slate-900">Voting Settings</p>
        <div class="mt-4 space-y-5">
          <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div>
              <p class="font-medium text-slate-800">One Vote Per Round</p>
              <p class="text-sm text-slate-500">Each associate can vote only once in the same voting round. This is enforced automatically by badge ID and round.</p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="font-medium text-slate-800">Require Vote Confirmation</p>
              <p class="text-sm text-slate-400">Show confirmation dialog before submitting a vote.</p>
            </div>
            <button
              type="button"
              @click="votingSettings.requireVoteConfirmation = !votingSettings.requireVoteConfirmation"
              class="inline-flex h-6 w-12 p-1"
              :class="votingSettings.requireVoteConfirmation ? 'justify-end rounded-full bg-blue-600' : 'rounded-full bg-slate-200'"
            >
              <span class="h-4 w-4 rounded-full bg-white"></span>
            </button>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Live Extension (Minutes)</span>
              <input v-model="votingSettings.liveExtensionMinutes" type="number" min="1" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              <p class="mt-2 text-xs text-slate-400">Used by the `Extend Live` action on the voting rounds page.</p>
            </label>
            <div>
              <span class="mb-2 block text-sm text-slate-600">IP Restriction</span>
              <div class="flex gap-3">
                <input v-model="votingSettings.ipRestriction" type="text" placeholder="Restrict voting to specific IP addresses" class="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none" />
                <button type="button" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-blue-600">Manage IPs</button>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <p class="text-lg font-semibold text-slate-900">Email Settings</p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">From Email</span>
            <input v-model="emailSettings.fromEmail" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">From Name</span>
            <input v-model="emailSettings.fromName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">SMTP Provider</span>
            <select v-model="emailSettings.smtpProvider" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
              <option>SendGrid</option>
              <option>Mailgun</option>
              <option>Amazon SES</option>
            </select>
          </label>
          <div class="flex items-end">
            <button type="button" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-blue-600">
              Configure SMTP
            </button>
          </div>
        </div>
      </article>
    </section>
  </AdminShell>
</template>
