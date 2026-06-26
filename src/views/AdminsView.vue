<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/admins', {
  stats: [],
  admins: [],
  info: '',
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const admins = computed(() => data.value.admins || [])
const info = computed(() => data.value.info || '')
const searchTerm = ref('')
const statusFilter = ref('ALL')
const showCreateModal = ref(false)
const editingAdminId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const createForm = reactive({
  badgeCode: '',
  fullName: '',
  username: '',
  email: '',
  accessLevel: 'Administrator',
  password: '',
  isActive: true,
})

const filteredAdmins = computed(() =>
  admins.value.filter((row) => {
    const matchesSearch =
      !searchTerm.value || `${row[1]} ${row[2]} ${row[3]} ${row[4]}`.toLowerCase().includes(searchTerm.value.toLowerCase())
    const matchesStatus = statusFilter.value === 'ALL' || row[5].toUpperCase() === statusFilter.value
    return matchesSearch && matchesStatus
  }),
)

const paginationLabel = computed(() => `Showing 1 to ${filteredAdmins.value.length} of ${admins.value.length} admins`)

const roleClass = {
  'Super Administrator': 'bg-violet-100 text-violet-600',
  Administrator: 'bg-blue-100 text-blue-600',
  Manager: 'bg-amber-100 text-amber-600',
  Viewer: 'bg-slate-100 text-slate-500',
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  editingAdminId.value = null
  createForm.badgeCode = ''
  createForm.fullName = ''
  createForm.username = ''
  createForm.email = ''
  createForm.accessLevel = 'Administrator'
  createForm.password = ''
  createForm.isActive = true
  showCreateModal.value = true
}

const openEditModal = (row) => {
  submitError.value = ''
  submitSuccess.value = ''
  editingAdminId.value = row[10]
  createForm.badgeCode = row[11]
  createForm.fullName = row[1]
  createForm.username = row[2]
  createForm.email = row[3]
  createForm.accessLevel = row[4]
  createForm.password = ''
  createForm.isActive = row[5] === 'Active'
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const submitAdmin = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSubmitting.value = true

  try {
    if (editingAdminId.value) {
      await putJson(`/api/admins/${editingAdminId.value}`, { ...createForm })
      submitSuccess.value = 'Admin updated successfully.'
    } else {
      await postJson('/api/admins', { ...createForm })
      submitSuccess.value = 'Admin created successfully.'
    }
    await load()
    closeCreateModal()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to create admin.'
  } finally {
    isSubmitting.value = false
  }
}

const deleteAdmin = async (row) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete admin "${row[1]}"?`)) {
    return
  }

  try {
    await deleteJson(`/api/admins/${row[10]}`)
    submitSuccess.value = 'Admin deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete admin.'
  }
}
</script>

<template>
  <AdminShell title="Admins">
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
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-white" :class="card.iconBg">
            <span class="material-symbols-outlined text-xl">{{ card.icon === 'crown' ? 'workspace_premium' : card.icon }}</span>
          </div>
          <div>
            <p class="text-sm text-slate-500">{{ card.title }}</p>
            <p class="mt-1 text-3xl font-bold text-slate-900">{{ card.value }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ card.note }}</p>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <div class="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div class="grid gap-3 md:grid-cols-[1.2fr_0.7fr] xl:w-[45%]">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
            <input v-model="searchTerm" type="text" placeholder="Search by name, email or username..." class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none" />
          </div>
          <label class="inline-flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
            <select v-model="statusFilter" class="w-full bg-transparent outline-none">
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>

        <div class="flex items-center gap-3 self-end">
          <button type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            <span class="material-symbols-outlined text-base">download</span>
            Export
          </button>
          <button type="button" @click="openCreateModal" class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
            <span class="material-symbols-outlined text-base">add</span>
            Add New Admin
          </button>
        </div>
      </div>

      <div class="mt-5 overflow-x-auto">
        <table class="min-w-[1100px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-4 py-4 font-medium">#</th>
              <th class="px-4 py-4 font-medium">Admin</th>
              <th class="px-4 py-4 font-medium">Username</th>
              <th class="px-4 py-4 font-medium">Email</th>
              <th class="px-4 py-4 font-medium">Role</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium">Last Login</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredAdmins" :key="row[0]" class="border-b border-slate-100 last:border-b-0">
              <td class="px-4 py-4 text-slate-500">{{ row[0] }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold" :class="row[8]">
                    {{ row[7] }}
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <p class="font-semibold text-slate-800">{{ row[1] }}</p>
                      <span
                        v-if="row[9]"
                        class="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-600"
                      >
                        {{ row[9] }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ row[2] }}</td>
              <td class="px-4 py-4 text-slate-600">{{ row[3] }}</td>
              <td class="px-4 py-4">
                <span class="rounded-lg px-3 py-1 text-xs font-semibold" :class="roleClass[row[4]]">
                  {{ row[4] }}
                </span>
              </td>
              <td class="px-4 py-4">
                <span
                  class="rounded-lg px-3 py-1 text-xs font-semibold"
                  :class="row[5] === 'Active' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'"
                >
                  {{ row[5] }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ row[6] }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <button type="button" @click="openEditModal(row)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button
                    type="button"
                    @click="deleteAdmin(row)"
                    :disabled="row[4] === 'Super Administrator'"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
        <p>{{ paginationLabel }}</p>
      </div>

      <div class="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-600">
        {{ info }}
      </div>
    </section>

    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div class="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ editingAdminId ? 'Edit Admin' : 'Add New Admin' }}</p>
            <p class="mt-1 text-sm text-slate-500">Save admin details directly to the database.</p>
          </div>
          <button type="button" @click="closeCreateModal" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div v-if="submitError" class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {{ submitError }}
        </div>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Badge ID</span>
            <input v-model="createForm.badgeCode" type="text" inputmode="numeric" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Full Name</span>
            <input v-model="createForm.fullName" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Username</span>
            <input v-model="createForm.username" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Email</span>
            <input v-model="createForm.email" type="email" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Access Level</span>
            <select v-model="createForm.accessLevel" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
              <option value="Super Administrator">Super Administrator</option>
              <option value="Administrator">Administrator</option>
              <option value="Manager">Manager</option>
              <option value="Viewer">Viewer</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Password</span>
            <input v-model="createForm.password" type="password" :placeholder="editingAdminId ? 'Leave blank to keep current password' : ''" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="inline-flex items-center gap-3 text-sm text-slate-600">
            <input v-model="createForm.isActive" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
            Active account
          </label>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" @click="closeCreateModal" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            Cancel
          </button>
          <button type="button" @click="submitAdmin" :disabled="isSubmitting" class="inline-flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
            {{ isSubmitting ? 'Saving...' : editingAdminId ? 'Update Admin' : 'Create Admin' }}
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
