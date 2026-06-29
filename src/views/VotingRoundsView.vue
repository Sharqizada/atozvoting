<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, fetchJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/voting-rounds', {
  stats: [],
  rounds: [],
  employeeOptions: [],
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const rounds = computed(() => data.value.rounds || [])
const employeeOptions = computed(() => data.value.employeeOptions || [])
const searchTerm = ref('')
const statusFilter = ref('ALL')
const employeeSearch = ref('')
const copiedRoundId = ref('')
const showCreateModal = ref(false)
const showWinnerModal = ref(false)
const showDetailModal = ref(false)
const detailModalMode = ref('duration')
const detailModalRound = ref(null)
const editingRoundId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const isLoadingWinners = ref(false)
const winnerPreview = ref({
  round: null,
  winners: [],
})
const createForm = reactive({
  name: '',
  description: '',
  roundId: '',
  startDate: '',
  endDate: '',
  status: 'UPCOMING',
  participantIds: [],
})

const getStatusLabel = (status) => (status === 'ACTIVE' ? 'LIVE' : status)

const filteredRounds = computed(() =>
  rounds.value.filter((round) => {
    const matchesSearch =
      !searchTerm.value ||
      `${round.name} ${round.description || ''} ${round.creator} ${round.status}`.toLowerCase().includes(searchTerm.value.toLowerCase())
    const matchesStatus = statusFilter.value === 'ALL' || round.status === statusFilter.value
    return matchesSearch && matchesStatus
  }),
)

const filteredEmployeeOptions = computed(() =>
  employeeOptions.value.filter((employee) => {
    const haystack =
      `${employee.badgeId} ${employee.fullName} ${employee.departmentName} ${employee.roleName}`.toLowerCase()
    return !employeeSearch.value || haystack.includes(employeeSearch.value.toLowerCase())
  }),
)

const selectedEmployees = computed(() =>
  employeeOptions.value.filter((employee) => createForm.participantIds.includes(employee.id)),
)

const paginationLabel = computed(() => `Showing 1 to ${filteredRounds.value.length} of ${rounds.value.length} rounds`)
const winnerCards = computed(() => {
  const ordered = winnerPreview.value.winners || []
  const first = ordered.find((entry) => entry.place === 1)
  const second = ordered.find((entry) => entry.place === 2)
  const third = ordered.find((entry) => entry.place === 3)
  return [second, first, third].filter(Boolean)
})

const resetForm = () => {
  createForm.name = ''
  createForm.description = ''
  createForm.roundId = ''
  createForm.startDate = ''
  createForm.endDate = ''
  createForm.status = 'UPCOMING'
  createForm.participantIds = []
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  employeeSearch.value = ''
  editingRoundId.value = null
  resetForm()
  showCreateModal.value = true
}

const openEditModal = (round) => {
  submitError.value = ''
  submitSuccess.value = ''
  employeeSearch.value = ''
  editingRoundId.value = round.id
  createForm.name = round.name
  createForm.description = round.description || ''
  createForm.roundId = round.roundId || ''
  createForm.startDate = round.rawStartDate
  createForm.endDate = round.rawEndDate
  createForm.status = round.status
  createForm.participantIds = [...(round.participantIds || [])]
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const closeWinnerModal = () => {
  showWinnerModal.value = false
  winnerPreview.value = {
    round: null,
    winners: [],
  }
}

const openRoundDetailModal = (mode, round) => {
  detailModalMode.value = mode
  detailModalRound.value = round
  showDetailModal.value = true
}

const closeRoundDetailModal = () => {
  showDetailModal.value = false
  detailModalRound.value = null
}

const copyRoundId = async (roundId) => {
  try {
    await navigator.clipboard.writeText(roundId)
    copiedRoundId.value = roundId
    window.setTimeout(() => {
      if (copiedRoundId.value === roundId) {
        copiedRoundId.value = ''
      }
    }, 1800)
  } catch {
    submitError.value = 'Unable to copy the round ID.'
  }
}

const toggleParticipant = (employeeId) => {
  if (createForm.participantIds.includes(employeeId)) {
    createForm.participantIds = createForm.participantIds.filter((id) => id !== employeeId)
    return
  }

  createForm.participantIds = [...createForm.participantIds, employeeId]
}

const submitRound = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSubmitting.value = true

  try {
    const payload = {
      name: createForm.name,
      description: createForm.description,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      status: createForm.status,
      participantIds: createForm.participantIds,
    }

    if (editingRoundId.value) {
      await putJson(`/api/voting-rounds/${editingRoundId.value}`, payload)
      submitSuccess.value = 'Voting round updated successfully.'
    } else {
      await postJson('/api/voting-rounds', payload)
      submitSuccess.value = 'Voting round created successfully.'
    }

    await load()
    closeCreateModal()
  } catch (requestError) {
    submitError.value =
      requestError.message ||
      (editingRoundId.value ? 'Unable to update voting round.' : 'Unable to create voting round.')
  } finally {
    isSubmitting.value = false
  }
}

const deleteRound = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete voting round "${round.name}"?`)) {
    return
  }

  try {
    await deleteJson(`/api/voting-rounds/${round.id}`)
    submitSuccess.value = 'Voting round deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete voting round.'
  }
}

const makeRoundLive = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''

  try {
    await postJson(`/api/voting-rounds/${round.id}/make-live`, {})
    submitSuccess.value = `"${round.name}" is now the live voting round.`
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to make this voting round live.'
  }
}

const stopRoundLive = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''

  try {
    await postJson(`/api/voting-rounds/${round.id}/stop-live`, {})
    submitSuccess.value = `"${round.name}" is no longer live.`
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to stop the live voting round.'
  }
}

const extendRoundLive = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''

  try {
    await postJson(`/api/voting-rounds/${round.id}/extend-live`, {})
    submitSuccess.value = `Extended the live time for "${round.name}".`
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to extend the live voting round.'
  }
}

const endRoundEarly = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`End voting round "${round.name}" now?`)) {
    return
  }

  try {
    await postJson(`/api/voting-rounds/${round.id}/end`, {})
    submitSuccess.value = `"${round.name}" was ended successfully.`
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to end the voting round.'
  }
}

const openWinnerPreview = async (round) => {
  submitError.value = ''
  submitSuccess.value = ''
  isLoadingWinners.value = true
  showWinnerModal.value = true
  winnerPreview.value = {
    round: {
      name: round.name,
    },
    winners: [],
  }

  try {
    const response = await postJson(`/api/voting-rounds/${round.id}/publish-winners`, {})
    winnerPreview.value = response
    submitSuccess.value = response.message || `"${round.name}" winner list is now live on the Home page.`
    await load()
  } catch (requestError) {
    showWinnerModal.value = false
    submitError.value = requestError.message || 'Unable to publish the winner list.'
  } finally {
    isLoadingWinners.value = false
  }
}
</script>

<template>
  <AdminShell title="Voting Rounds">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <div v-if="submitSuccess" class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
      {{ submitSuccess }}
    </div>

    <section class="grid gap-4 xl:grid-cols-4">
      <article
        v-for="card in stats"
        :key="card.title"
        class="rounded-3xl border border-slate-200 p-5"
        :class="card.panel"
      >
        <div class="flex items-start gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl text-white" :class="card.iconBg">
            <span class="material-symbols-outlined text-2xl">{{ card.icon }}</span>
          </div>
          <div>
            <p class="text-sm text-slate-500">{{ card.title }}</p>
            <p class="mt-1 text-3xl font-bold text-slate-900">{{ card.value }}</p>
            <p class="mt-2 text-sm text-slate-400">{{ card.note }}</p>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 rounded-3xl border border-slate-200 bg-white">
      <div class="border-b border-slate-200 px-5 py-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p class="text-lg font-semibold text-slate-900">All Voting Rounds</p>
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
              <input
                v-model="searchTerm"
                type="text"
                placeholder="Search rounds..."
                class="h-11 w-full min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
              />
            </div>
            <label class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
              <span class="material-symbols-outlined text-base">filter_alt</span>
              <select v-model="statusFilter" class="bg-transparent outline-none">
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Live</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
            <button type="button" @click="openCreateModal" class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
              <span class="material-symbols-outlined text-base">add</span>
              Create New Round
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[1180px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-5 py-4 font-medium">Round Name</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium">Duration</th>
              <th class="px-4 py-4 font-medium">Round ID</th>
              <th class="px-4 py-4 font-medium">Categories</th>
              <th class="px-4 py-4 font-medium">Assigned Nominees</th>
              <th class="px-4 py-4 font-medium">Votes Cast</th>
              <th class="px-4 py-4 font-medium">Created By</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="round in filteredRounds" :key="round.id" class="border-b border-slate-100 last:border-b-0">
              <td class="px-5 py-5">
                <div class="flex items-start gap-3">
                  <span class="mt-2 h-2.5 w-2.5 rounded-full" :class="round.dot"></span>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold text-slate-800">{{ round.name }}</p>
                      <span
                        v-if="round.winnersPublished"
                        class="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-600"
                      >
                        Winners Live
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate-400">{{ round.dates }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-5">
                <span class="rounded-lg px-3 py-1 text-xs font-semibold" :class="round.statusClass">
                  {{ getStatusLabel(round.status) }}
                </span>
              </td>
              <td class="px-4 py-5 text-xs text-slate-500">
                <p class="font-medium text-slate-700">{{ round.duration[2] }}</p>
                <p class="mt-1">{{ round.duration[0] }}</p>
                <p class="mt-1">{{ round.duration[1] }}</p>
                <span class="mt-2 inline-flex rounded-lg px-3 py-1 font-medium" :class="round.durationClass">
                  {{ round.status }}
                </span>
                <button
                  type="button"
                  @click="openRoundDetailModal('duration', round)"
                  class="mt-3 block text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  View details
                </button>
              </td>
              <td class="px-4 py-5">
                <div class="flex items-center gap-2">
                  <span class="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold tracking-[0.2em] text-slate-700">
                    {{ round.roundId }}
                  </span>
                  <button
                    type="button"
                    @click="copyRoundId(round.roundId)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                  >
                    <span class="material-symbols-outlined text-base">
                      {{ copiedRoundId === round.roundId ? 'task_alt' : 'content_copy' }}
                    </span>
                  </button>
                </div>
              </td>
              <td class="px-4 py-5">
                <div class="space-y-2">
                  <p class="font-semibold text-slate-700">{{ round.categories }} categories</p>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="category in round.categoryPreview.slice(0, 3)"
                      :key="`${round.id}-${category.id}`"
                      class="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-600"
                    >
                      {{ category.name }}
                    </span>
                    <span
                      v-if="round.categoryPreview.length > 3"
                      class="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600"
                    >
                      +{{ round.categoryPreview.length - 3 }} more
                    </span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-5">
                <div class="space-y-2">
                  <p class="font-semibold text-slate-700">{{ round.employees }} nominees</p>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="participant in round.participantPreview.slice(0, 3)"
                      :key="participant.id"
                      class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                    >
                      {{ participant.fullName }}
                    </span>
                    <span
                      v-if="round.participantPreview.length > 3"
                      class="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600"
                    >
                      +{{ round.participantPreview.length - 3 }} more
                    </span>
                  </div>
                  <button
                    type="button"
                    @click="openRoundDetailModal('nominees', round)"
                    class="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                  >
                    View full list
                  </button>
                </div>
              </td>
              <td class="px-4 py-5">
                <div class="w-28">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-semibold text-slate-700">{{ round.votes }}</span>
                    <span class="text-slate-400">({{ round.percent }})</span>
                  </div>
                  <div class="mt-2 h-2 rounded-full bg-slate-200">
                    <div class="h-2 rounded-full bg-blue-600" :style="{ width: round.percentWidth }"></div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-5 text-xs text-slate-500">
                <p class="font-medium text-slate-700">{{ round.creator }}</p>
                <p class="mt-1">{{ round.createdAt }}</p>
              </td>
              <td class="px-4 py-5">
                <div class="flex items-center gap-2">
                  <button
                    v-if="round.status !== 'ACTIVE' && round.status !== 'COMPLETED'"
                    type="button"
                    @click="makeRoundLive(round)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600"
                  >
                    <span class="material-symbols-outlined text-base">play_arrow</span>
                  </button>
                  <button
                    v-if="round.status === 'ACTIVE'"
                    type="button"
                    @click="extendRoundLive(round)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 text-blue-600"
                  >
                    <span class="material-symbols-outlined text-base">schedule</span>
                  </button>
                  <button
                    v-if="round.status === 'ACTIVE'"
                    type="button"
                    @click="stopRoundLive(round)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 text-amber-600"
                  >
                    <span class="material-symbols-outlined text-base">pause</span>
                  </button>
                  <button
                    v-if="round.status === 'ACTIVE'"
                    type="button"
                    @click="endRoundEarly(round)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600"
                  >
                    <span class="material-symbols-outlined text-base">stop_circle</span>
                  </button>
                  <button
                    v-if="round.status === 'COMPLETED'"
                    type="button"
                    @click="openWinnerPreview(round)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200 text-violet-600"
                  >
                    <span class="material-symbols-outlined text-base">emoji_events</span>
                  </button>
                  <button type="button" @click="openEditModal(round)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button type="button" @click="deleteRound(round)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-500">
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredRounds.length">
              <td colspan="9" class="px-5 py-10 text-center text-sm text-slate-500">
                No voting rounds found for the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-col gap-4 px-5 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>{{ paginationLabel }}</p>
      </div>
    </section>

    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-4">
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ editingRoundId ? 'Edit Voting Round' : 'Create Voting Round' }}</p>
          </div>
          <button type="button" @click="closeCreateModal" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div v-if="submitError" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {{ submitError }}
          </div>

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div class="grid gap-4">
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Round Name</span>
                <input v-model="createForm.name" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Description</span>
                <textarea
                  v-model="createForm.description"
                  rows="4"
                  placeholder="Enter the voting round description shown on the Home page."
                  class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                ></textarea>
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Random Round ID</span>
                <input
                  :value="createForm.roundId || 'Auto-generated after save'"
                  type="text"
                  readonly
                  class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500 outline-none"
                />
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Start Date</span>
                <input v-model="createForm.startDate" type="date" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">End Date</span>
                <input v-model="createForm.endDate" type="date" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Status</span>
                <select v-model="createForm.status" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTIVE">Live</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <p class="mt-2 text-xs text-slate-400">Only one round can be live at a time. You can also control this from the row action buttons.</p>
              </label>

              <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex items-center justify-between gap-4">
                  <p class="text-sm font-medium text-slate-700">Selected Nominees</p>
                  <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                    {{ createForm.participantIds.length }} selected
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="employee in selectedEmployees"
                    :key="employee.id"
                    class="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-600"
                  >
                    {{ employee.fullName }}
                    <button type="button" @click="toggleParticipant(employee.id)" class="text-slate-400">
                      <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                  </span>
                  <p v-if="!selectedEmployees.length" class="text-sm text-slate-500">
                    No nominees selected yet.
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white">
              <div class="border-b border-slate-200 px-5 py-4">
                <div class="flex flex-col gap-3">
                  <p class="text-lg font-semibold text-slate-900">Assign Nominees</p>
                  <div class="relative">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
                    <input
                      v-model="employeeSearch"
                      type="text"
                      placeholder="Search nominees..."
                      class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
              <div class="max-h-[420px] space-y-3 overflow-y-auto px-5 py-4">
                <label
                  v-for="employee in filteredEmployeeOptions"
                  :key="employee.id"
                  class="flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <input
                    :checked="createForm.participantIds.includes(employee.id)"
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-blue-600"
                    @change="toggleParticipant(employee.id)"
                  />
                  <img
                    v-if="employee.photoData"
                    :src="employee.photoData"
                    :alt="employee.fullName"
                    class="h-11 w-11 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-600"
                  >
                    <span class="material-symbols-outlined text-base">person</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-slate-800">{{ employee.fullName }}</p>
                    <p class="mt-1 text-xs text-slate-400">
                      {{ employee.badgeId }} · {{ employee.departmentName }} / {{ employee.roleName }}
                    </p>
                  </div>
                </label>
                <div v-if="!filteredEmployeeOptions.length" class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No active associates match this search.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button type="button" @click="closeCreateModal" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            Cancel
          </button>
          <button type="button" @click="submitRound" :disabled="isSubmitting" class="inline-flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
            {{ isSubmitting ? 'Saving...' : editingRoundId ? 'Update Round' : 'Create Round' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showWinnerModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div class="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">Winner List Live</p>
            <p class="mt-1 text-sm text-slate-500">{{ winnerPreview.round?.name || 'Completed voting round' }}</p>
          </div>
          <button type="button" @click="closeWinnerModal" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Only the top 3 winners are shown for this round, and this list is now visible on the Home page.
        </div>

        <div v-if="isLoadingWinners" class="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          Loading winner preview...
        </div>

        <div v-else-if="winnerCards.length" class="mt-8 grid gap-5 md:grid-cols-3">
          <article
            v-for="person in winnerCards"
            :key="person.place"
            class="rounded-3xl border p-5 text-center shadow-sm"
            :class="[person.panel, person.place === 1 ? 'md:-mt-6 md:scale-[1.03]' : '']"
          >
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
              <span class="material-symbols-outlined text-3xl">{{ person.crown }}</span>
            </div>
            <div class="mt-4">
              <span
                class="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                :class="person.place === 1 ? 'bg-amber-100 text-amber-700' : person.place === 2 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'"
              >
                {{ person.medal }}
              </span>
            </div>
            <p class="mt-4 text-2xl font-semibold text-slate-900">{{ person.name }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ person.badge }}</p>
            <p class="mt-5 text-4xl font-bold text-slate-900">{{ person.votes }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ person.share }} of valid votes</p>
          </article>
        </div>

        <div v-else class="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          No winner data is available for this round yet.
        </div>

        <div v-if="winnerPreview.round" class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <span>Total votes: {{ winnerPreview.round.totalVotes || 0 }}</span>
          <span>Valid votes: {{ winnerPreview.round.validVotes || 0 }}</span>
          <span>{{ winnerPreview.round.status || 'Completed' }}</span>
        </div>
      </div>
    </div>

    <div v-if="showDetailModal && detailModalRound" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">
              {{ detailModalMode === 'duration' ? 'Duration Details' : 'Assigned Nominees' }}
            </p>
            <p class="mt-1 text-sm text-slate-500">{{ detailModalRound.name }}</p>
          </div>
          <button type="button" @click="closeRoundDetailModal" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div v-if="detailModalMode === 'duration'" class="space-y-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Start Date</p>
              <p class="mt-2 text-base font-semibold text-slate-900">{{ detailModalRound.duration[0] }}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">End Date</p>
              <p class="mt-2 text-base font-semibold text-slate-900">{{ detailModalRound.duration[1] }}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Round Status</p>
              <p class="mt-2 text-base font-semibold text-slate-900">{{ detailModalRound.duration[2] }}</p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="participant in detailModalRound.participantPreview"
              :key="participant.id"
              class="flex items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3"
            >
              <img
                v-if="participant.photoData"
                :src="participant.photoData"
                :alt="participant.fullName"
                class="h-12 w-12 rounded-full object-cover"
              />
              <div
                v-else
                class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                <span class="material-symbols-outlined text-base">person</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-800">{{ participant.fullName }}</p>
                <p class="mt-1 text-xs text-slate-400">
                  {{ participant.badgeId }} · {{ participant.departmentName }} / {{ participant.roleName }}
                </p>
              </div>
            </div>
            <div v-if="!detailModalRound.participantPreview.length" class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No nominees assigned to this round yet.
            </div>
          </div>
        </div>

        <div class="border-t border-slate-200 px-6 py-4">
          <button type="button" @click="closeRoundDetailModal" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            Close
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
