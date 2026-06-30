<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/employees-v2', {
  stats: [],
  employees: [],
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const employees = computed(() => data.value.employees || [])
const searchTerm = ref('')
const statusFilter = ref('ALL')
const showCreateModal = ref(false)
const editingEmployeeId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const isImporting = ref(false)
const importInputRef = ref(null)
const createForm = reactive({
  badgeId: '',
  badgeUsername: '',
  fullName: '',
  departmentName: 'Inbound Stow',
  roleName: 'Stower',
  email: '',
  photoData: '',
  employmentStatus: 'ACTIVE',
  joinDate: '',
})

const filteredEmployees = computed(() =>
  employees.value.filter((employee) => {
    const haystack =
      `${employee.badgeId} ${employee.badgeUsername || ''} ${employee.fullName} ${employee.departmentName} ${employee.roleName} ${employee.email}`.toLowerCase()
    const matchesSearch = !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
    const matchesStatus = statusFilter.value === 'ALL' || employee.employmentStatus === statusFilter.value
    return matchesSearch && matchesStatus
  }),
)

const paginationLabel = computed(() => `Showing 1 to ${filteredEmployees.value.length} of ${employees.value.length} associates`)

const resetForm = () => {
  createForm.badgeId = ''
  createForm.badgeUsername = ''
  createForm.fullName = ''
  createForm.departmentName = 'Inbound Stow'
  createForm.roleName = 'Stower'
  createForm.email = ''
  createForm.photoData = ''
  createForm.employmentStatus = 'ACTIVE'
  createForm.joinDate = ''
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  editingEmployeeId.value = null
  resetForm()
  showCreateModal.value = true
}

const openEditModal = (employee) => {
  submitError.value = ''
  submitSuccess.value = ''
  editingEmployeeId.value = employee.id
  createForm.badgeId = employee.badgeId
  createForm.badgeUsername = employee.badgeUsername || ''
  createForm.fullName = employee.fullName
  createForm.departmentName = employee.departmentName
  createForm.roleName = employee.roleName
  createForm.email = employee.email
  createForm.photoData = employee.photoData || ''
  createForm.employmentStatus = employee.employmentStatus
  createForm.joinDate = employee.joinDateValue
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const handlePhotoSelected = (event) => {
  const [file] = event.target.files || []

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    submitError.value = 'Please select an image file for the associate photo.'
    event.target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    createForm.photoData = typeof reader.result === 'string' ? reader.result : ''
    submitError.value = ''
  }
  reader.readAsDataURL(file)
}

const removePhoto = () => {
  createForm.photoData = ''
}

const submitEmployee = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSubmitting.value = true

  try {
    if (editingEmployeeId.value) {
      await putJson(`/api/employees-v2/${editingEmployeeId.value}`, { ...createForm })
      submitSuccess.value = 'Associate updated successfully.'
    } else {
      await postJson('/api/employees-v2', { ...createForm })
      submitSuccess.value = 'Associate added successfully.'
    }
    await load()
    closeCreateModal()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to save associate.'
  } finally {
    isSubmitting.value = false
  }
}

const deleteEmployee = async (employee) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete associate "${employee.fullName}"?`)) {
    return
  }

  try {
    await deleteJson(`/api/employees-v2/${employee.id}`)
    submitSuccess.value = 'Associate deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete associate.'
  }
}

const normalizeImportHeader = (value) =>
  `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const getImportValue = (row, aliases) => {
  const normalizedAliasSet = new Set(aliases.map(normalizeImportHeader))
  const entry = Object.entries(row).find(([key]) => normalizedAliasSet.has(normalizeImportHeader(key)))
  return `${entry?.[1] ?? ''}`.trim()
}

const triggerImportPicker = () => {
  submitError.value = ''
  submitSuccess.value = ''
  importInputRef.value?.click()
}

const downloadExampleFile = async () => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'Badge ID': '15357920',
      'Badge User Name': 'jdoe',
      'Full Name': 'Jane Doe',
      Department: 'Inbound Stow',
      Role: 'Stower',
      Email: 'jane.doe@example.com',
      Status: 'ACTIVE',
      'Join Date': '2026-06-30',
    },
  ])

  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 30 },
    { wch: 12 },
    { wch: 14 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Associates')
  XLSX.writeFile(workbook, 'associate-import-example.xlsx')
}

const handleImportSelected = async (event) => {
  const [file] = event.target.files || []

  if (!file) {
    return
  }

  submitError.value = ''
  submitSuccess.value = ''
  isImporting.value = true

  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]

    if (!worksheet) {
      throw new Error('The Excel file does not contain any worksheet.')
    }

    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd',
    })

    if (!rawRows.length) {
      throw new Error('The Excel file does not contain any associate rows.')
    }

    const rows = rawRows
      .map((row) => ({
        badgeId: getImportValue(row, ['Badge ID']),
        badgeUsername: getImportValue(row, ['Badge User Name', 'Badge Username', 'User Name']),
        fullName: getImportValue(row, ['Full Name', 'Associate Name', 'Name']),
        departmentName: getImportValue(row, ['Department', 'Department Name']),
        roleName: getImportValue(row, ['Role', 'Role Name']),
        email: getImportValue(row, ['Email', 'Email Address']),
        employmentStatus: getImportValue(row, ['Status', 'Employment Status']),
        joinDate: getImportValue(row, ['Join Date', 'Start Date']),
      }))
      .filter((row) =>
        [
          row.badgeId,
          row.badgeUsername,
          row.fullName,
          row.departmentName,
          row.roleName,
          row.email,
          row.employmentStatus,
          row.joinDate,
        ].some(Boolean),
      )

    if (!rows.length) {
      throw new Error('The Excel file does not contain any usable associate rows.')
    }

    const response = await postJson('/api/employees-v2/import', { rows })
    submitSuccess.value =
      response.message ||
      `Excel import finished successfully. ${response.createdCount || 0} associates created and ${response.updatedCount || 0} associates updated.`
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to import associates from Excel.'
  } finally {
    isImporting.value = false
    event.target.value = ''
  }
}
</script>

<template>
  <AdminShell title="Associates">
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
          <p class="text-lg font-semibold text-slate-900">All Associates</p>
          <div class="flex flex-wrap items-center gap-3">
            <input
              ref="importInputRef"
              type="file"
              accept=".xlsx,.xls"
              class="hidden"
              @change="handleImportSelected"
            />
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
              <input
                v-model="searchTerm"
                type="text"
                placeholder="Search associates..."
                class="h-11 w-full min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
              />
            </div>
            <label class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
              <span class="material-symbols-outlined text-base">filter_alt</span>
              <select v-model="statusFilter" class="bg-transparent outline-none">
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <button
              type="button"
              @click="triggerImportPicker"
              :disabled="isImporting"
              class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 disabled:opacity-60"
            >
              <span class="material-symbols-outlined text-base">upload_file</span>
              {{ isImporting ? 'Importing...' : 'Import Excel' }}
            </button>
            <button
              type="button"
              @click="downloadExampleFile"
              class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600"
            >
              <span class="material-symbols-outlined text-base">download</span>
              Download Example
            </button>
            <button type="button" @click="openCreateModal" class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
              <span class="material-symbols-outlined text-base">add</span>
              Add Associate
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[1180px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-5 py-4 font-medium">#</th>
              <th class="px-4 py-4 font-medium">Badge ID</th>
              <th class="px-4 py-4 font-medium">Badge User Name</th>
              <th class="px-4 py-4 font-medium">Associate</th>
              <th class="px-4 py-4 font-medium">Department / Role</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium">Join Date</th>
              <th class="px-4 py-4 font-medium">Email</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(employee, index) in filteredEmployees"
              :key="employee.id"
              class="border-b border-slate-100 last:border-b-0"
            >
              <td class="px-5 py-4 text-slate-500">{{ index + 1 }}</td>
              <td class="px-4 py-4 text-slate-600">{{ employee.badgeId }}</td>
              <td class="px-4 py-4 text-slate-600">{{ employee.badgeUsername || '-' }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <img
                    v-if="employee.photoData"
                    :src="employee.photoData"
                    :alt="employee.fullName"
                    class="h-10 w-10 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600"
                  >
                    <span class="material-symbols-outlined text-base">person</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ employee.fullName }}</p>
                    <p class="mt-1 text-xs text-slate-400">{{ employee.roleName }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ employee.departmentName }} / {{ employee.roleName }}</td>
              <td class="px-4 py-4">
                <span
                  class="rounded-lg px-3 py-1 text-xs font-semibold"
                  :class="employee.employmentStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'"
                >
                  {{ employee.employmentStatus }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ employee.joinDateLabel }}</td>
              <td class="px-4 py-4 text-slate-600">{{ employee.email }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <button type="button" @click="openEditModal(employee)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button type="button" @click="deleteEmployee(employee)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-500">
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredEmployees.length">
              <td colspan="9" class="px-5 py-10 text-center text-sm text-slate-500">
                No associates found for the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-col gap-4 px-5 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>{{ paginationLabel }}</p>
      </div>
    </section>

    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div class="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ editingEmployeeId ? 'Edit Associate' : 'Add Associate' }}</p>
            <p class="mt-1 text-sm text-slate-500">Save associate details and an optional profile photo.</p>
          </div>
          <button type="button" @click="closeCreateModal" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div v-if="submitError" class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {{ submitError }}
        </div>

        <div class="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p class="text-sm font-medium text-slate-700">Associate Photo</p>
            <div class="mt-4 flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white p-5">
              <img
                v-if="createForm.photoData"
                :src="createForm.photoData"
                alt="Associate preview"
                class="h-36 w-36 rounded-full object-cover"
              />
              <div
                v-else
                class="flex h-36 w-36 items-center justify-center rounded-full bg-slate-200 text-slate-500"
              >
                <span class="material-symbols-outlined text-5xl">person</span>
              </div>
              <label class="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white">
                <span class="material-symbols-outlined text-base">photo_camera</span>
                Upload Photo
                <input type="file" accept="image/*" class="hidden" @change="handlePhotoSelected" />
              </label>
              <button
                v-if="createForm.photoData"
                type="button"
                @click="removePhoto"
                class="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600"
              >
                <span class="material-symbols-outlined text-base">delete</span>
                Remove Photo
              </button>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Badge ID</span>
              <input v-model="createForm.badgeId" type="text" inputmode="numeric" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Full Name</span>
              <input v-model="createForm.fullName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Badge User Name</span>
              <input v-model="createForm.badgeUsername" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Department</span>
              <input v-model="createForm.departmentName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Role</span>
              <input v-model="createForm.roleName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Email</span>
              <input v-model="createForm.email" type="email" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm text-slate-600">Join Date</span>
              <input v-model="createForm.joinDate" type="date" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
            </label>
            <label class="block md:col-span-2">
              <span class="mb-2 block text-sm text-slate-600">Status</span>
              <select v-model="createForm.employmentStatus" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" @click="closeCreateModal" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            Cancel
          </button>
          <button type="button" @click="submitEmployee" :disabled="isSubmitting" class="inline-flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
            {{ isSubmitting ? 'Saving...' : editingEmployeeId ? 'Update Associate' : 'Add Associate' }}
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
