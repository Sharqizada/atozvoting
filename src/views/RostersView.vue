<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/rosters', {
  stats: [],
  rosters: [],
  rosterSections: [],
  employeeOptions: [],
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const rosters = computed(() => data.value.rosters || [])
const rosterSections = computed(() => data.value.rosterSections || [])
const employeeOptions = computed(() => data.value.employeeOptions || [])
const searchTerm = ref('')
const employeeSearch = ref('')
const showCreateModal = ref(false)
const editingRosterId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const isUpdatingHomeVisibility = ref(false)
const createForm = reactive({
  name: '',
  description: '',
  assignments: [],
})

const filteredRosters = computed(() =>
  rosters.value.filter((roster) => {
    const haystack = `${roster.name} ${roster.description || ''} ${roster.creator || ''}`.toLowerCase()
    return !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
  }),
)

const filteredEmployeeOptions = computed(() =>
  employeeOptions.value.filter((employee) => {
    const haystack =
      `${employee.badgeId} ${employee.fullName} ${employee.departmentName} ${employee.roleName}`.toLowerCase()
    return !employeeSearch.value || haystack.includes(employeeSearch.value.toLowerCase())
  }),
)

const assignmentLookup = computed(() =>
  createForm.assignments.reduce((accumulator, assignment) => {
    accumulator[assignment.employeeId] = assignment.sectionKey
    return accumulator
  }, {}),
)

const sectionSummary = computed(() =>
  rosterSections.value.map((section) => ({
    ...section,
    associates: createForm.assignments
      .filter((assignment) => assignment.sectionKey === section.key)
      .map((assignment) => employeeOptions.value.find((employee) => employee.id === assignment.employeeId))
      .filter(Boolean),
  })),
)

const paginationLabel = computed(
  () => `Showing 1 to ${filteredRosters.value.length} of ${rosters.value.length} rosters`,
)

const resetForm = () => {
  createForm.name = ''
  createForm.description = ''
  createForm.assignments = []
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  employeeSearch.value = ''
  editingRosterId.value = null
  resetForm()
  showCreateModal.value = true
}

const openEditModal = (roster) => {
  submitError.value = ''
  submitSuccess.value = ''
  employeeSearch.value = ''
  editingRosterId.value = roster.id
  createForm.name = roster.name
  createForm.description = roster.description || ''
  createForm.assignments = roster.sections.flatMap((section) =>
    (section.associates || []).map((associate) => ({
      employeeId: associate.id,
      sectionKey: section.key,
    })),
  )
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const setEmployeeSection = (employeeId, sectionKey) => {
  const normalizedSectionKey = `${sectionKey || ''}`.trim().toUpperCase()
  const currentAssignments = createForm.assignments.filter((assignment) => assignment.employeeId !== employeeId)

  if (!normalizedSectionKey) {
    createForm.assignments = currentAssignments
    return
  }

  createForm.assignments = [...currentAssignments, { employeeId, sectionKey: normalizedSectionKey }]
}

const submitRoster = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSubmitting.value = true

  try {
    const payload = {
      name: createForm.name,
      description: createForm.description,
      assignments: createForm.assignments,
    }

    if (editingRosterId.value) {
      await putJson(`/api/rosters/${editingRosterId.value}`, payload)
      submitSuccess.value = 'Roster updated successfully.'
    } else {
      await postJson('/api/rosters', payload)
      submitSuccess.value = 'Roster created successfully.'
    }

    await load()
    closeCreateModal()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to save roster.'
  } finally {
    isSubmitting.value = false
  }
}

const toggleHomeVisibility = async (roster) => {
  submitError.value = ''
  submitSuccess.value = ''
  isUpdatingHomeVisibility.value = true

  try {
    const response = await postJson(`/api/rosters/${roster.id}/home-visibility`, {
      visible: !roster.homeVisibility,
    })
    submitSuccess.value =
      response.message ||
      (roster.homeVisibility
        ? 'Roster is now hidden from the Home page.'
        : 'Roster is now live on the Home page.')
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to update Home page visibility.'
  } finally {
    isUpdatingHomeVisibility.value = false
  }
}

const deleteRoster = async (roster) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete roster "${roster.name}"?`)) {
    return
  }

  try {
    await deleteJson(`/api/rosters/${roster.id}`)
    submitSuccess.value = 'Roster deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete roster.'
  }
}
</script>

<template>
  <AdminShell title="Rosters">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <div
      v-if="submitSuccess"
      class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600"
    >
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
          <div>
            <p class="text-lg font-semibold text-slate-900">All Rosters</p>
            <p class="mt-1 text-sm text-slate-500">
              Manage roster pages and choose which roster can appear on the Home page.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                search
              </span>
              <input
                v-model="searchTerm"
                type="text"
                placeholder="Search rosters..."
                class="h-11 w-full min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
              />
            </div>
            <button
              type="button"
              @click="openCreateModal"
              class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white"
            >
              <span class="material-symbols-outlined text-base">add</span>
              Create Roster
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[1100px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-5 py-4 font-medium">Roster Name</th>
              <th class="px-4 py-4 font-medium">Sections</th>
              <th class="px-4 py-4 font-medium">Assigned Associates</th>
              <th class="px-4 py-4 font-medium">Home Page</th>
              <th class="px-4 py-4 font-medium">Updated</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="roster in filteredRosters" :key="roster.id" class="border-b border-slate-100 last:border-b-0">
              <td class="px-5 py-5">
                <p class="font-semibold text-slate-800">{{ roster.name }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ roster.description || 'No roster description provided.' }}</p>
                <p class="mt-2 text-xs text-slate-400">Created by {{ roster.creator }}</p>
              </td>
              <td class="px-4 py-5">
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="section in roster.sections.filter((entry) => entry.associates.length)"
                    :key="`${roster.id}-${section.key}`"
                    class="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600"
                  >
                    {{ section.label }} ({{ section.associates.length }})
                  </span>
                  <span
                    v-if="!roster.sections.some((entry) => entry.associates.length)"
                    class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500"
                  >
                    No sections assigned
                  </span>
                </div>
              </td>
              <td class="px-4 py-5">
                <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                  {{ roster.totalAssociates }} associates
                </span>
              </td>
              <td class="px-4 py-5">
                <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="roster.homeStatusClass">
                  {{ roster.homeStatusLabel }}
                </span>
              </td>
              <td class="px-4 py-5 text-xs text-slate-500">
                <p class="font-medium text-slate-700">{{ roster.updatedAt }}</p>
                <p class="mt-1">Created {{ roster.createdAt }}</p>
              </td>
              <td class="px-4 py-5">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    @click="toggleHomeVisibility(roster)"
                    :disabled="isUpdatingHomeVisibility"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm disabled:opacity-60"
                    :class="
                      roster.homeVisibility
                        ? 'border-amber-200 text-amber-600'
                        : 'border-emerald-200 text-emerald-600'
                    "
                  >
                    <span class="material-symbols-outlined text-base">
                      {{ roster.homeVisibility ? 'visibility_off' : 'home' }}
                    </span>
                  </button>
                  <button
                    type="button"
                    @click="openEditModal(roster)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                  >
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button
                    type="button"
                    @click="deleteRoster(roster)"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-500"
                  >
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredRosters.length">
              <td colspan="6" class="px-5 py-10 text-center text-sm text-slate-500">
                No rosters found for the current search.
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
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ editingRosterId ? 'Edit Roster' : 'Create Roster' }}</p>
            <p class="mt-1 text-sm text-slate-500">
              Assign associates to the roster sections, then choose from the table if it should show on the Home page.
            </p>
          </div>
          <button
            type="button"
            @click="closeCreateModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div v-if="submitError" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {{ submitError }}
          </div>

          <div class="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div class="space-y-5">
              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Roster Name</span>
                <input
                  v-model="createForm.name"
                  type="text"
                  class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none"
                />
              </label>

              <label class="block">
                <span class="mb-2 block text-sm text-slate-600">Description</span>
                <textarea
                  v-model="createForm.description"
                  rows="4"
                  placeholder="Enter the roster description shown on the Home page."
                  class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                ></textarea>
              </label>

              <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-slate-800">Roster Section Summary</p>
                  <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                    {{ createForm.assignments.length }} assigned
                  </span>
                </div>

                <div class="mt-4 space-y-3">
                  <div
                    v-for="section in sectionSummary"
                    :key="section.key"
                    class="rounded-2xl border border-white bg-white px-4 py-3"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-semibold text-slate-800">{{ section.label }}</p>
                      <span class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                        {{ section.associates.length }} associates
                      </span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <span
                        v-for="associate in section.associates.slice(0, 5)"
                        :key="`${section.key}-${associate.id}`"
                        class="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-600"
                      >
                        {{ associate.fullName }}
                      </span>
                      <span
                        v-if="section.associates.length > 5"
                        class="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600"
                      >
                        +{{ section.associates.length - 5 }} more
                      </span>
                      <p v-if="!section.associates.length" class="text-xs text-slate-400">No associates assigned yet.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white">
              <div class="border-b border-slate-200 px-5 py-4">
                <div class="flex flex-col gap-3">
                  <p class="text-lg font-semibold text-slate-900">Assign Associates</p>
                  <div class="relative">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                      search
                    </span>
                    <input
                      v-model="employeeSearch"
                      type="text"
                      placeholder="Search associates..."
                      class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div class="max-h-[480px] space-y-3 overflow-y-auto px-5 py-4">
                <article
                  v-for="employee in filteredEmployeeOptions"
                  :key="employee.id"
                  class="grid gap-4 rounded-2xl border border-slate-200 px-4 py-3 md:grid-cols-[1fr_220px]"
                >
                  <div class="flex items-center gap-3">
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
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-800">{{ employee.fullName }}</p>
                      <p class="mt-1 text-xs text-slate-400">
                        {{ employee.badgeId }} · {{ employee.departmentName }} / {{ employee.roleName }}
                      </p>
                    </div>
                  </div>

                  <label class="block">
                    <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Section
                    </span>
                    <select
                      :value="assignmentLookup[employee.id] || ''"
                      class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none"
                      @change="setEmployeeSection(employee.id, $event.target.value)"
                    >
                      <option value="">Not assigned</option>
                      <option v-for="section in rosterSections" :key="section.key" :value="section.key">
                        {{ section.label }}
                      </option>
                    </select>
                  </label>
                </article>

                <div
                  v-if="!filteredEmployeeOptions.length"
                  class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
                >
                  No active associates match this search.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            @click="closeCreateModal"
            class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="submitRoster"
            :disabled="isSubmitting"
            class="inline-flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {{ isSubmitting ? 'Saving...' : editingRosterId ? 'Update Roster' : 'Create Roster' }}
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
