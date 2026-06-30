<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/rosters-v2', {
  stats: [],
  rosters: [],
  rosterSections: [],
  sectionDetailOptions: {
    ISS: [],
    WATER_SPIDER: [],
  },
  floors: ['P2', 'P3', 'P4'],
  stationTypes: ['AR', 'UNIVERSAL', 'QUANTITY_STOW'],
  stations: [],
  employeeOptions: [],
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const rosters = computed(() => data.value.rosters || [])
const rosterSections = computed(() => data.value.rosterSections || [])
const sectionDetailOptions = computed(() => data.value.sectionDetailOptions || { ISS: [], WATER_SPIDER: [] })
const floors = computed(() => data.value.floors || ['P2', 'P3', 'P4'])
const stationTypes = computed(() => data.value.stationTypes || ['AR', 'UNIVERSAL', 'QUANTITY_STOW'])
const stations = computed(() => data.value.stations || [])
const employeeOptions = computed(() => data.value.employeeOptions || [])
const searchTerm = ref('')
const employeeSearch = ref('')
const showCreateModal = ref(false)
const showStationsModal = ref(false)
const showStationListModal = ref(false)
const showAssignmentEditorModal = ref(false)
const showSectionSummaryModal = ref(false)
const showSwapModal = ref(false)
const editingRosterId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const isUpdatingHomeVisibility = ref(false)
const isSavingStation = ref(false)
const deletingStationId = ref(null)
const createForm = reactive({
  name: '',
  description: '',
  assignments: [],
})
const stationForm = reactive({
  floorCode: 'P2',
  stationCode: '',
  stationType: 'AR',
  isFarAway: false,
})
const pendingSwap = reactive({
  employeeId: null,
  targetStationId: null,
  occupiedEmployeeId: null,
})
const stationListModalState = reactive({
  title: '',
  description: '',
  accentClass: '',
  emptyMessage: '',
  stations: [],
})
const assignmentEditorState = reactive({
  employeeId: null,
})
const sectionSummaryModalState = reactive({
  sectionKey: '',
  title: '',
  associates: [],
  assignedStations: 0,
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
      `${employee.badgeId} ${employee.badgeUsername || ''} ${employee.fullName} ${employee.departmentName} ${employee.roleName}`.toLowerCase()
    return !employeeSearch.value || haystack.includes(employeeSearch.value.toLowerCase())
  }),
)

const employeeLookup = computed(() =>
  employeeOptions.value.reduce((accumulator, employee) => {
    accumulator[employee.id] = employee
    return accumulator
  }, {}),
)

const stationLookup = computed(() =>
  stations.value.reduce((accumulator, station) => {
    accumulator[station.id] = station
    return accumulator
  }, {}),
)

const assignmentLookup = computed(() =>
  createForm.assignments.reduce((accumulator, assignment) => {
    accumulator[assignment.employeeId] = assignment
    return accumulator
  }, {}),
)
const activeAssignmentEmployee = computed(() => employeeLookup.value[assignmentEditorState.employeeId] || null)
const activeAssignment = computed(() => assignmentLookup.value[assignmentEditorState.employeeId] || null)

const stationOccupancyLookup = computed(() =>
  createForm.assignments.reduce((accumulator, assignment) => {
    if (assignment.stationId) {
      accumulator[assignment.stationId] = assignment.employeeId
    }
    return accumulator
  }, {}),
)

const sectionSummary = computed(() =>
  rosterSections.value.map((section) => {
    const associates = createForm.assignments
      .filter((assignment) => assignment.sectionKey === section.key)
      .map((assignment) => {
        const employee = employeeLookup.value[assignment.employeeId]
        const station = stationLookup.value[assignment.stationId]

        if (!employee) {
          return null
        }

        return {
          ...employee,
          station,
          detailKey: assignment.detailKey || '',
          floorCode: assignment.floorCode || '',
        }
      })
      .filter(Boolean)

    return {
      ...section,
      associates,
      assignedStations: associates.filter((associate) => associate.station).length,
    }
  }),
)

const stationGroups = computed(() =>
  floors.value.map((floorCode) => ({
    floorCode,
    title: `${floorCode} Stations`,
    stations: stations.value.filter((station) => !station.isFarAway && station.floorCode === floorCode),
  })),
)

const farAwayStations = computed(() => stations.value.filter((station) => station.isFarAway))
const assignedCount = computed(() => createForm.assignments.length)
const assignedStationCount = computed(
  () => createForm.assignments.filter((assignment) => Number(assignment.stationId)).length,
)
const farAwayAssignedCount = computed(() =>
  createForm.assignments.filter((assignment) => stationLookup.value[assignment.stationId]?.isFarAway).length,
)

const paginationLabel = computed(
  () => `Showing 1 to ${filteredRosters.value.length} of ${rosters.value.length} rosters`,
)

const normalizeSectionKey = (value) => `${value || ''}`.trim().toUpperCase()
const normalizeFloorCode = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return floors.value.includes(normalized) ? normalized : ''
}
const inferFloorCodeFromDetailKey = (detailKey) => {
  const normalizedDetailKey = `${detailKey || ''}`.trim().toUpperCase()
  const matchedFloor = normalizedDetailKey.match(/P[234]/)?.[0]
  return normalizeFloorCode(matchedFloor)
}
const isQuantityStowSection = (sectionKey) => normalizeSectionKey(sectionKey) === 'QUANTITY_STOW'
const supportsStationAssignment = (sectionKey) =>
  ['STOW', 'CUBISCAN', 'QUANTITY_STOW'].includes(normalizeSectionKey(sectionKey))
const getSectionDetailOptions = (sectionKey) => sectionDetailOptions.value[normalizeSectionKey(sectionKey)] || []
const requiresDetailSelection = (sectionKey) => getSectionDetailOptions(sectionKey).length > 0
const formatStationTypeLabel = (stationType) => {
  const normalized = `${stationType || ''}`.trim().toUpperCase()

  if (normalized === 'AR') {
    return 'AR Station'
  }

  if (normalized === 'QUANTITY_STOW') {
    return 'Quantity Stow Station'
  }

  return 'Universal Station'
}
const isDetailCompatibleWithFloor = (sectionKey, detailKey, floorCode) => {
  const normalizedSectionKey = normalizeSectionKey(sectionKey)
  const normalizedDetailKey = `${detailKey || ''}`.trim().toUpperCase()
  const normalizedFloorCode = normalizeFloorCode(floorCode)

  if (!normalizedDetailKey || !normalizedFloorCode) {
    return true
  }

  if (normalizedSectionKey === 'WATER_SPIDER') {
    return normalizedDetailKey.startsWith(`${normalizedFloorCode}_`)
  }

  if (normalizedSectionKey === 'ISS' && /^STOW_ANDON_P[234]$/.test(normalizedDetailKey)) {
    return normalizedDetailKey.endsWith(normalizedFloorCode)
  }

  return true
}
const getAllowedStationsForAssignment = (assignment) => {
  const floorCode = normalizeFloorCode(assignment?.floorCode)
  const sectionKey = normalizeSectionKey(assignment?.sectionKey)

  if (!floorCode || !supportsStationAssignment(sectionKey)) {
    return []
  }

  return stations.value.filter((station) => {
    if (station.floorCode !== floorCode) {
      return false
    }

    if (sectionKey === 'QUANTITY_STOW') {
      return station.stationType === 'QUANTITY_STOW'
    }

    return station.stationType !== 'QUANTITY_STOW'
  })
}
const getAllowedStationsForEmployee = (employeeId) => getAllowedStationsForAssignment(assignmentLookup.value[employeeId])
const sanitizeAssignment = (assignment) => {
  const employeeId = Number(assignment?.employeeId)
  const sectionKey = normalizeSectionKey(assignment?.sectionKey)
  const floorCode = normalizeFloorCode(assignment?.floorCode) || floors.value[0] || 'P2'
  let detailKey = `${assignment?.detailKey || ''}`.trim().toUpperCase()
  let stationId = Number(assignment?.stationId) || null

  if (!employeeId || !sectionKey) {
    return null
  }

  if (!requiresDetailSelection(sectionKey)) {
    detailKey = ''
  } else if (
    !getSectionDetailOptions(sectionKey).some((option) => option.key === detailKey) ||
    !isDetailCompatibleWithFloor(sectionKey, detailKey, floorCode)
  ) {
    detailKey = ''
  }

  if (!supportsStationAssignment(sectionKey)) {
    stationId = null
  }

  if (stationId) {
    const station = stationLookup.value[stationId]
    const matchesFloor = station?.floorCode === floorCode
    const matchesType =
      sectionKey === 'QUANTITY_STOW'
        ? station?.stationType === 'QUANTITY_STOW'
        : station?.stationType !== 'QUANTITY_STOW'

    if (!matchesFloor || !matchesType) {
      stationId = null
    }
  }

  return {
    employeeId,
    sectionKey,
    floorCode,
    stationId,
    detailKey,
  }
}
const getSectionDetailLabel = (sectionKey, detailKey) =>
  getSectionDetailOptions(sectionKey).find((option) => option.key === detailKey)?.label || detailKey || ''
const getAssignmentStationLabel = (assignment) =>
  assignment?.stationId ? stationLookup.value[assignment.stationId]?.displayLabel || 'Station selected.' : 'No station assigned.'
const getAssignmentCardSummary = (employeeId) => {
  const assignment = assignmentLookup.value[employeeId]

  if (!assignment) {
    return 'No assignment yet.'
  }

  const sectionLabel =
    rosterSections.value.find((section) => section.key === assignment.sectionKey)?.label || assignment.sectionKey || 'No section'
  const detailLabel = assignment.detailKey ? getSectionDetailLabel(assignment.sectionKey, assignment.detailKey) : ''
  const stationLabel = getAssignmentStationLabel(assignment)

  return [sectionLabel, assignment.floorCode || '', detailLabel, stationLabel].filter(Boolean).join(' | ')
}

const shuffleItems = (items) => {
  const cloned = [...items]

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[cloned[index], cloned[randomIndex]] = [cloned[randomIndex], cloned[index]]
  }

  return cloned
}

const buildDefaultAssignments = () => {
  const usedStationIds = new Set()
  const normalStations = shuffleItems(
    stations.value.filter((station) => !station.isFarAway && station.stationType !== 'QUANTITY_STOW'),
  )
  const fallbackFarStations = shuffleItems(
    stations.value.filter((station) => station.isFarAway && station.stationType !== 'QUANTITY_STOW'),
  )

  const pickStation = (pool = []) => {
    const station = pool.find((entry) => !usedStationIds.has(entry.id))

    if (station) {
      usedStationIds.add(station.id)
    }

    return station || null
  }

  return employeeOptions.value.map((employee, index) => {
    const station = pickStation(normalStations) || pickStation(fallbackFarStations)

    return {
      employeeId: employee.id,
      sectionKey: 'STOW',
      floorCode: station?.floorCode || floors.value[0] || 'P2',
      stationId: station?.id || null,
      detailKey: '',
    }
  })
}

const resetForm = () => {
  createForm.name = ''
  createForm.description = ''
  createForm.assignments = []
}

const resetStationForm = () => {
  stationForm.floorCode = floors.value[0] || 'P2'
  stationForm.stationCode = ''
  stationForm.stationType = stationTypes.value[0] || 'AR'
  stationForm.isFarAway = false
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  employeeSearch.value = ''
  editingRosterId.value = null
  resetForm()
  createForm.assignments = buildDefaultAssignments()
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
      stationId: associate.stationId || null,
      floorCode: associate.floorCode || associate.stationFloorCode || floors.value[0] || 'P2',
      detailKey: associate.detailKey || '',
    })),
  )
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const openStationsModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  resetStationForm()
  showStationsModal.value = true
}

const closeStationsModal = () => {
  showStationsModal.value = false
}

const closeStationListModal = () => {
  showStationListModal.value = false
  stationListModalState.title = ''
  stationListModalState.description = ''
  stationListModalState.accentClass = ''
  stationListModalState.emptyMessage = ''
  stationListModalState.stations = []
}

const closeSectionSummaryModal = () => {
  showSectionSummaryModal.value = false
  sectionSummaryModalState.sectionKey = ''
  sectionSummaryModalState.title = ''
  sectionSummaryModalState.associates = []
  sectionSummaryModalState.assignedStations = 0
}

const openSectionSummaryModal = (section) => {
  sectionSummaryModalState.sectionKey = section.key
  sectionSummaryModalState.title = section.label
  sectionSummaryModalState.associates = section.associates || []
  sectionSummaryModalState.assignedStations = section.assignedStations || 0
  showSectionSummaryModal.value = true
}

const openStationListModal = ({ title, description, accentClass, emptyMessage, stations: entries }) => {
  stationListModalState.title = title
  stationListModalState.description = description
  stationListModalState.accentClass = accentClass
  stationListModalState.emptyMessage = emptyMessage
  stationListModalState.stations = entries
  showStationListModal.value = true
}

const closeAssignmentEditorModal = () => {
  showAssignmentEditorModal.value = false
  assignmentEditorState.employeeId = null
}

const openAssignmentEditorModal = (employeeId) => {
  assignmentEditorState.employeeId = employeeId
  showAssignmentEditorModal.value = true
}

const updateAssignment = (employeeId, nextAssignment) => {
  const currentAssignments = createForm.assignments.filter((assignment) => assignment.employeeId !== employeeId)
  const sanitizedAssignment = nextAssignment ? sanitizeAssignment({ ...nextAssignment, employeeId }) : null

  if (!sanitizedAssignment?.sectionKey) {
    createForm.assignments = currentAssignments
    return
  }

  createForm.assignments = [...currentAssignments, sanitizedAssignment]
}

const setEmployeeFloor = (employeeId, floorCode) => {
  const currentAssignment = assignmentLookup.value[employeeId]
  const normalizedFloorCode = normalizeFloorCode(floorCode)

  if (!currentAssignment || !normalizedFloorCode) {
    return
  }

  updateAssignment(employeeId, {
    ...currentAssignment,
    floorCode: normalizedFloorCode,
  })

  const updatedAssignment = assignmentLookup.value[employeeId]

  if (!updatedAssignment) {
    return
  }
}

const setEmployeeSection = (employeeId, sectionKey) => {
  const normalizedSectionKey = normalizeSectionKey(sectionKey)
  const currentAssignment = assignmentLookup.value[employeeId]

  if (!normalizedSectionKey) {
    updateAssignment(employeeId, null)
    return
  }

  updateAssignment(employeeId, {
    employeeId,
    sectionKey: normalizedSectionKey,
    floorCode: currentAssignment?.floorCode || floors.value[0] || 'P2',
    stationId: currentAssignment?.stationId || null,
    detailKey: currentAssignment?.detailKey || '',
  })
}

const selectAssignmentDetail = (detailKey) => {
  const employeeId = assignmentEditorState.employeeId
  const currentAssignment = assignmentLookup.value[employeeId]

  if (!employeeId || !currentAssignment) {
    return
  }

  const inferredFloorCode = inferFloorCodeFromDetailKey(detailKey)

  updateAssignment(employeeId, {
    ...currentAssignment,
    floorCode: inferredFloorCode || currentAssignment.floorCode,
    detailKey,
    stationId: null,
  })
}

const assignStationToEmployee = (employeeId, stationId) => {
  const currentAssignment = assignmentLookup.value[employeeId]
  const station = stationLookup.value[stationId]

  updateAssignment(employeeId, {
    employeeId,
    sectionKey: currentAssignment?.sectionKey || 'STOW',
    floorCode: station?.floorCode || currentAssignment?.floorCode || floors.value[0] || 'P2',
    detailKey: currentAssignment?.detailKey || '',
    stationId,
  })
}

const requestStationAssignment = (employeeId, rawStationId) => {
  const stationId = Number(rawStationId) || null

  if (!stationId) {
    assignStationToEmployee(employeeId, null)
    return
  }

  const occupiedEmployeeId = stationOccupancyLookup.value[stationId]

  if (occupiedEmployeeId && occupiedEmployeeId !== employeeId) {
    pendingSwap.employeeId = employeeId
    pendingSwap.targetStationId = stationId
    pendingSwap.occupiedEmployeeId = occupiedEmployeeId
    showSwapModal.value = true
    return
  }

  assignStationToEmployee(employeeId, stationId)
}

const closeSwapModal = () => {
  pendingSwap.employeeId = null
  pendingSwap.targetStationId = null
  pendingSwap.occupiedEmployeeId = null
  showSwapModal.value = false
}

const confirmStationSwap = () => {
  const sourceEmployeeId = pendingSwap.employeeId
  const targetStationId = pendingSwap.targetStationId
  const occupiedEmployeeId = pendingSwap.occupiedEmployeeId

  if (!sourceEmployeeId || !targetStationId || !occupiedEmployeeId) {
    closeSwapModal()
    return
  }

  const sourceAssignment = assignmentLookup.value[sourceEmployeeId]
  const previousStationId = sourceAssignment?.stationId || null

  assignStationToEmployee(sourceEmployeeId, targetStationId)
  assignStationToEmployee(occupiedEmployeeId, previousStationId)
  closeSwapModal()
}

const saveStation = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSavingStation.value = true

  try {
    const response = await postJson('/api/stations-v2', { ...stationForm })
    submitSuccess.value = response.message || 'Station added successfully.'
    resetStationForm()
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to save station.'
  } finally {
    isSavingStation.value = false
  }
}

const deleteStation = async (station) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete station "${station.displayLabel}"?`)) {
    return
  }

  deletingStationId.value = station.id

  try {
    const response = await deleteJson(`/api/stations-v2/${station.id}`)
    submitSuccess.value = response.message || 'Station deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete station.'
  } finally {
    deletingStationId.value = null
  }
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
      await putJson(`/api/rosters-v2/${editingRosterId.value}`, payload)
      submitSuccess.value = 'Roster updated successfully.'
    } else {
      await postJson('/api/rosters-v2', payload)
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
    const response = await postJson(`/api/rosters-v2/${roster.id}/home-visibility`, {
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
    await deleteJson(`/api/rosters-v2/${roster.id}`)
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
              Manage roster pages, shared floor stations, and choose which roster can appear on the Home page.
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
              @click="openStationsModal"
              class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
            >
              <span class="material-symbols-outlined text-base">pin_drop</span>
              Add Stations
            </button>
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
                <p class="mt-2 text-xs text-slate-400">
                  {{ roster.assignedStationCount || 0 }} stations assigned
                  <span v-if="roster.farAwayAssignedCount"> | {{ roster.farAwayAssignedCount }} far away</span>
                </p>
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
              All active associates start in `Stow` with random stations, and you can edit each associate from the action button on the right.
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

                <div class="mt-4 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-2xl border border-white bg-white px-4 py-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Stations</p>
                    <p class="mt-2 text-2xl font-semibold text-slate-900">{{ assignedStationCount }}</p>
                  </div>
                  <div class="rounded-2xl border border-white bg-white px-4 py-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Far Away</p>
                    <p class="mt-2 text-2xl font-semibold text-slate-900">{{ farAwayAssignedCount }}</p>
                  </div>
                  <div class="rounded-2xl border border-white bg-white px-4 py-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Unassigned</p>
                    <p class="mt-2 text-2xl font-semibold text-slate-900">{{ assignedCount - assignedStationCount }}</p>
                  </div>
                </div>

                <div class="mt-4 space-y-3">
                  <div
                    v-for="section in sectionSummary"
                    :key="section.key"
                    class="rounded-2xl border border-white bg-white px-4 py-3"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-semibold text-slate-800">{{ section.label }}</p>
                      <button
                        type="button"
                        @click="openSectionSummaryModal(section)"
                        class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-200"
                      >
                        {{ section.associates.length }} associates | {{ section.assignedStations }} stations
                      </button>
                    </div>
                    <div class="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                      Click the count chip to review all associates and station details in a separate popup.
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
                      placeholder="Search by full name, badge ID, or badge username"
                      class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div class="max-h-[480px] space-y-3 overflow-y-auto px-5 py-4">
                <div class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Shared stations are managed from `Add Stations`. Choosing an occupied one-person station will open a swap dialog.
                </div>

                <article
                  v-for="employee in filteredEmployeeOptions"
                  :key="employee.id"
                  class="rounded-2xl border border-slate-200 px-4 py-4"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex min-w-0 items-center gap-3">
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
                          {{ employee.badgeId }}<span v-if="employee.badgeUsername"> | {{ employee.badgeUsername }}</span> | {{ employee.departmentName }} / {{ employee.roleName }}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      @click="openAssignmentEditorModal(employee.id)"
                      class="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                    >
                      <span class="material-symbols-outlined text-base">edit_note</span>
                      View Station Details
                    </button>
                  </div>

                  <div class="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    {{ getAssignmentCardSummary(employee.id) }}
                  </div>
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

    <div
      v-if="showAssignmentEditorModal && activeAssignmentEmployee && activeAssignment"
      class="fixed inset-0 z-[58] flex items-center justify-center bg-slate-950/50 px-4 py-4"
    >
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">Edit Associate Assignment</p>
            <p class="mt-1 text-sm text-slate-500">
              {{ activeAssignmentEmployee.fullName }} | {{ activeAssignmentEmployee.badgeId }}
              <span v-if="activeAssignmentEmployee.badgeUsername">| {{ activeAssignmentEmployee.badgeUsername }}</span>
            </p>
          </div>
          <button
            type="button"
            @click="closeAssignmentEditorModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Floor</span>
              <select
                :value="activeAssignment.floorCode || ''"
                class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
                @change="setEmployeeFloor(activeAssignmentEmployee.id, $event.target.value)"
              >
                <option v-for="floor in floors" :key="floor" :value="floor">{{ floor }}</option>
              </select>
            </label>

            <label class="block">
              <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Section</span>
              <select
                :value="activeAssignment.sectionKey || ''"
                class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
                @change="setEmployeeSection(activeAssignmentEmployee.id, $event.target.value)"
              >
                <option value="">Not assigned</option>
                <option v-for="section in rosterSections" :key="section.key" :value="section.key">
                  {{ section.label }}
                </option>
              </select>
            </label>

            <label class="block" :class="requiresDetailSelection(activeAssignment.sectionKey) ? '' : 'opacity-60'">
              <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Role / Task</span>
              <select
                :value="activeAssignment.detailKey || ''"
                :disabled="!requiresDetailSelection(activeAssignment.sectionKey)"
                class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none disabled:cursor-not-allowed"
                @change="selectAssignmentDetail($event.target.value)"
              >
                <option value="">
                  {{ requiresDetailSelection(activeAssignment.sectionKey) ? 'Choose role / task' : 'No role / task for this section' }}
                </option>
                <option
                  v-for="option in getSectionDetailOptions(activeAssignment.sectionKey)"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="block" :class="supportsStationAssignment(activeAssignment.sectionKey) ? '' : 'opacity-60'">
              <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Station</span>
              <select
                :value="activeAssignment.stationId || ''"
                :disabled="!supportsStationAssignment(activeAssignment.sectionKey)"
                class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none disabled:cursor-not-allowed"
                @change="requestStationAssignment(activeAssignmentEmployee.id, $event.target.value)"
              >
                <option value="">
                  {{ supportsStationAssignment(activeAssignment.sectionKey) ? 'No station assigned' : 'No station for this section' }}
                </option>
                <option
                  v-for="station in getAllowedStationsForEmployee(activeAssignmentEmployee.id)"
                  :key="station.id"
                  :value="station.id"
                >
                  {{ station.displayLabel }}
                </option>
              </select>
            </label>
          </div>

          <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            {{ getAssignmentCardSummary(activeAssignmentEmployee.id) }}
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showSectionSummaryModal"
      class="fixed inset-0 z-[59] flex items-center justify-center bg-slate-950/50 px-4 py-4"
    >
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ sectionSummaryModalState.title }}</p>
            <p class="mt-1 text-sm text-slate-500">
              {{ sectionSummaryModalState.associates.length }} associates | {{ sectionSummaryModalState.assignedStations }} stations
            </p>
          </div>
          <button
            type="button"
            @click="closeSectionSummaryModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div v-if="sectionSummaryModalState.associates.length" class="grid gap-3">
            <div
              v-for="associate in sectionSummaryModalState.associates"
              :key="associate.id"
              class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900">{{ associate.fullName }}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ associate.badgeId }}<span v-if="associate.badgeUsername"> | {{ associate.badgeUsername }}</span>
                  </p>
                </div>
                <span class="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                  {{ associate.floorCode || 'No floor' }}
                </span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-if="associate.detailKey"
                  class="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600"
                >
                  {{ getSectionDetailLabel(sectionSummaryModalState.sectionKey, associate.detailKey) }}
                </span>
                <span
                  v-if="associate.station"
                  class="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-600"
                >
                  {{ associate.station.displayLabel }}
                </span>
                <span
                  v-if="!associate.detailKey && !associate.station"
                  class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500"
                >
                  No extra details
                </span>
              </div>
            </div>
          </div>
          <div
            v-else
            class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500"
          >
            No associates assigned yet.
          </div>
        </div>
      </div>
    </div>

    <div v-if="showStationsModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-4">
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">Station IDs</p>
            <p class="mt-1 text-sm text-slate-500">
              Add shared stations for floors `P2`, `P3`, and `P4`. Far away stations stay in a separate section and only work as fallback capacity.
            </p>
          </div>
          <button
            type="button"
            @click="closeStationsModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div class="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p class="text-lg font-semibold text-slate-900">Add Station</p>
              <div class="mt-5 grid gap-4">
                <label class="block">
                  <span class="mb-2 block text-sm text-slate-600">Floor</span>
                  <select v-model="stationForm.floorCode" class="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none">
                    <option v-for="floor in floors" :key="floor" :value="floor">{{ floor }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-2 block text-sm text-slate-600">Station Type</span>
                  <select v-model="stationForm.stationType" class="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none">
                    <option v-for="stationType in stationTypes" :key="stationType" :value="stationType">
                      {{ formatStationTypeLabel(stationType) }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-2 block text-sm text-slate-600">Station ID</span>
                  <input
                    v-model="stationForm.stationCode"
                    type="text"
                    placeholder="Example: 203"
                    class="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none"
                  />
                </label>
                <label class="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input v-model="stationForm.isFarAway" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                  Add this station to the Far Away station list
                </label>
                <button
                  type="button"
                  @click="saveStation"
                  :disabled="isSavingStation"
                  class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  <span class="material-symbols-outlined text-base">add</span>
                  {{ isSavingStation ? 'Saving...' : 'Save Station' }}
                </button>
              </div>
            </div>

            <div class="grid gap-5">
              <section
                v-for="group in stationGroups"
                :key="group.floorCode"
                class="rounded-3xl border border-slate-200 bg-white p-5"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-lg font-semibold text-slate-900">{{ group.title }}</p>
                    <p class="mt-1 text-sm text-slate-500">Normal station pool for {{ group.floorCode }}.</p>
                  </div>
                  <button
                    type="button"
                    @click="
                      openStationListModal({
                        title: group.title,
                        description: 'Created normal stations for ' + group.floorCode + '.',
                        accentClass: 'bg-slate-100 text-slate-700',
                        emptyMessage: 'No stations added for ' + group.floorCode + ' yet.',
                        stations: group.stations,
                      })
                    "
                    class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    {{ group.stations.length }} stations
                  </button>
                </div>
                <div class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Click the station count to view the full {{ group.floorCode }} list in a separate popup.
                </div>
              </section>

              <section class="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-lg font-semibold text-slate-900">Far Away Stations</p>
                    <p class="mt-1 text-sm text-slate-500">Use these only when there is no empty normal station left.</p>
                  </div>
                  <button
                    type="button"
                    @click="
                      openStationListModal({
                        title: 'Far Away Stations',
                        description: 'Fallback stations that should only be assigned when no normal station is empty.',
                        accentClass: 'bg-amber-50 text-amber-700',
                        emptyMessage: 'No far away stations added yet.',
                        stations: farAwayStations,
                      })
                    "
                    class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-amber-100"
                  >
                    {{ farAwayStations.length }} stations
                  </button>
                </div>
                <div class="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white/90 px-4 py-4 text-sm text-slate-500">
                  Click the station count to open the Far Away list in a separate popup.
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showStationListModal"
      class="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/50 px-4 py-4"
    >
      <div class="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ stationListModalState.title }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ stationListModalState.description }}</p>
          </div>
          <button
            type="button"
            @click="closeStationListModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div class="flex items-center justify-between gap-3">
            <span
              class="rounded-full px-3 py-1 text-xs font-semibold"
              :class="stationListModalState.accentClass || 'bg-slate-100 text-slate-700'"
            >
              {{ stationListModalState.stations.length }} stations
            </span>
          </div>

          <div v-if="stationListModalState.stations.length" class="mt-5 grid gap-3 sm:grid-cols-2">
            <div
              v-for="station in stationListModalState.stations"
              :key="station.id"
              class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="font-semibold text-slate-800">{{ station.label }}</p>
                <p class="mt-1 text-xs text-slate-500">
                  {{ station.stationType }}<span v-if="station.isFarAway"> · Far Away</span>
                </p>
              </div>
              <button
                type="button"
                @click="deleteStation(station)"
                :disabled="deletingStationId === station.id"
                class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 disabled:opacity-60"
              >
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>

          <div
            v-else
            class="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500"
          >
            {{ stationListModalState.emptyMessage }}
          </div>
        </div>
      </div>
    </div>
    <div v-if="showSwapModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4">
      <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">Station Already Assigned</p>
            <p class="mt-1 text-sm text-slate-500">
              {{ stationLookup[pendingSwap.targetStationId]?.displayLabel }} is already assigned to
              {{ employeeLookup[pendingSwap.occupiedEmployeeId]?.fullName || 'another associate' }}.
            </p>
          </div>
          <button
            type="button"
            @click="closeSwapModal"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
          >
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          One click will swap the station between
          <span class="font-semibold text-slate-900">{{ employeeLookup[pendingSwap.employeeId]?.fullName || 'selected associate' }}</span>
          and
          <span class="font-semibold text-slate-900">{{ employeeLookup[pendingSwap.occupiedEmployeeId]?.fullName || 'current associate' }}</span>.
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            @click="closeSwapModal"
            class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmStationSwap"
            class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white"
          >
            <span class="material-symbols-outlined text-base">swap_horiz</span>
            Swap Stations
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
