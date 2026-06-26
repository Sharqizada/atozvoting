<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { postJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/settings', {
  menuItems: [],
  siteInfo: {
    siteName: '',
    siteTagline: '',
    timezone: '',
    dateFormat: '',
    timeFormat: '',
    currency: '',
  },
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
  systemInfo: [],
  securityInfo: [],
  backupInfo: [],
  databaseStatus: '',
})

const menuItems = computed(() => data.value.menuItems || [])
const systemInfo = computed(() => data.value.systemInfo || [])
const securityInfo = computed(() => data.value.securityInfo || [])
const backupInfo = computed(() => data.value.backupInfo || [])
const databaseStatus = computed(() => data.value.databaseStatus || '')
const selectedMenu = ref('General')
const saveError = ref('')
const saveSuccess = ref('')
const isSaving = ref(false)
const siteInfo = reactive({
  siteName: '',
  siteTagline: '',
  timezone: '',
  dateFormat: '',
  timeFormat: '',
  currency: '',
})
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

watch(
  data,
  (value) => {
    Object.assign(siteInfo, value.siteInfo || {})
    Object.assign(votingSettings, value.votingSettings || {})
    Object.assign(emailSettings, value.emailSettings || {})
  },
  { immediate: true },
)

const saveSettings = async () => {
  saveError.value = ''
  saveSuccess.value = ''
  isSaving.value = true

  try {
    await postJson('/api/settings', {
      siteInfo,
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
    subtitle="Manage system preferences and configurations."
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

    <section class="grid gap-6 xl:grid-cols-[280px_1fr_320px]">
      <article class="rounded-3xl border border-slate-200 bg-white p-4">
        <p class="text-lg font-semibold text-slate-900">Settings</p>
        <p class="mt-1 text-sm text-slate-500">Manage system preferences and configurations.</p>

        <div class="mt-5 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.label"
            type="button"
            @click="selectedMenu = item.label"
            class="flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left"
            :class="selectedMenu === item.label ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'"
          >
            <span class="material-symbols-outlined text-lg">{{ item.icon }}</span>
            <span>
              <span class="block text-sm font-medium">{{ item.label }}</span>
              <span class="mt-1 block text-xs text-slate-400">{{ item.description }}</span>
            </span>
          </button>
        </div>
      </article>

      <div class="space-y-6">
        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <p class="text-2xl font-semibold text-slate-900">General Settings</p>
          <p class="mt-1 text-sm text-slate-500">Manage general information and basic system settings.</p>

          <div class="mt-6 rounded-3xl border border-slate-200 p-5">
            <p class="text-lg font-semibold text-slate-900">Site Information</p>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Site Name</span>
                <input v-model="siteInfo.siteName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Site Tagline</span>
                <input v-model="siteInfo.siteTagline" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              </label>
              <div>
                <span class="mb-2 block text-sm text-slate-600">Logo</span>
                <div class="flex items-center gap-3">
                  <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-amber-400">
                    <span class="material-symbols-outlined text-3xl">stars</span>
                  </div>
                  <button type="button" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-blue-600">Change Logo</button>
                </div>
                <p class="mt-2 text-xs text-slate-400">PNG, JPG up to 2MB</p>
              </div>
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
              <label class="block md:col-span-2">
                <span class="mb-2 block text-sm text-slate-600">Currency</span>
                <select v-model="siteInfo.currency" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none md:w-1/2">
                  <option>USD - US Dollar ($)</option>
                  <option>INR - Indian Rupee (Rs)</option>
                  <option>EUR - Euro (EUR)</option>
                </select>
              </label>
            </div>
          </div>

          <div class="mt-6 rounded-3xl border border-slate-200 p-5">
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
          </div>

          <div class="mt-6 rounded-3xl border border-slate-200 p-5">
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
          </div>
        </article>
      </div>

      <div class="space-y-6">
        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <p class="text-lg font-semibold text-slate-900">System Information</p>
          <div class="mt-4 space-y-4 text-sm">
            <div v-for="row in systemInfo" :key="row[0]" class="flex items-center justify-between gap-4">
              <span class="text-slate-500">{{ row[0] }}</span>
              <span class="font-medium text-slate-800">{{ row[1] }}</span>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-slate-500">Database Status</span>
              <span class="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">{{ databaseStatus }}</span>
            </div>
          </div>
          <button type="button" class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm text-blue-600">
            <span class="material-symbols-outlined text-base">monitor_heart</span>
            View System Health
          </button>
        </article>

        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <p class="text-lg font-semibold text-slate-900">Security Settings</p>
          <div class="mt-4 space-y-4 text-sm">
            <div v-for="row in securityInfo" :key="row[0]" class="flex items-center justify-between gap-4">
              <span class="text-slate-500">{{ row[0] }}</span>
              <span
                class="rounded-lg px-3 py-1 text-xs font-semibold"
                :class="row[1] === 'Strong' || row[1] === 'Enabled' ? 'bg-emerald-100 text-emerald-600' : 'text-slate-700'"
              >
                {{ row[1] }}
              </span>
            </div>
          </div>
          <button type="button" class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm text-blue-600">
            <span class="material-symbols-outlined text-base">shield</span>
            Manage Security
          </button>
        </article>

        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <p class="text-lg font-semibold text-slate-900">Backup & Maintenance</p>
          <div class="mt-4 space-y-4 text-sm">
            <div v-for="row in backupInfo" :key="row[0]" class="flex items-center justify-between gap-4">
              <span class="text-slate-500">{{ row[0] }}</span>
              <span class="font-medium text-slate-800">{{ row[1] }}</span>
            </div>
          </div>
          <button type="button" class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm text-blue-600">
            <span class="material-symbols-outlined text-base">backup</span>
            Backup Now
          </button>
        </article>
      </div>
    </section>
  </AdminShell>
</template>
