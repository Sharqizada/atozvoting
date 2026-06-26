<script setup>
import { computed, reactive, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'
import { deleteJson, postJson, putJson } from '../lib/api'

const { data, error, load } = useAdminPage('/api/categories', {
  stats: [],
  categories: [],
  pagination: {
    showing: '',
  },
})

const searchTerm = ref('')
const statusFilter = ref('ALL')
const showCreateModal = ref(false)
const editingCategoryId = ref(null)
const submitError = ref('')
const submitSuccess = ref('')
const isSubmitting = ref(false)
const createForm = reactive({
  name: '',
  description: '',
  icon: 'emoji_events',
  isActive: true,
})

const stats = computed(() => data.value.stats || [])
const categories = computed(() => data.value.categories || [])

const filteredCategories = computed(() =>
  categories.value.filter((category) => {
    const matchesSearch =
      !searchTerm.value ||
      `${category.name} ${category.description} ${category.createdBy}`.toLowerCase().includes(searchTerm.value.toLowerCase())
    const matchesStatus = statusFilter.value === 'ALL' || category.status === statusFilter.value
    return matchesSearch && matchesStatus
  }),
)

const paginationLabel = computed(() => `Showing 1 to ${filteredCategories.value.length} of ${categories.value.length} categories`)

const resetCreateForm = () => {
  createForm.name = ''
  createForm.description = ''
  createForm.icon = 'emoji_events'
  createForm.isActive = true
}

const openCreateModal = () => {
  submitError.value = ''
  submitSuccess.value = ''
  editingCategoryId.value = null
  resetCreateForm()
  showCreateModal.value = true
}

const openEditModal = (category) => {
  submitError.value = ''
  submitSuccess.value = ''
  editingCategoryId.value = category.rowId
  createForm.name = category.name
  createForm.description = category.description
  createForm.icon = category.icon
  createForm.isActive = category.status === 'ACTIVE'
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const submitCategory = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  isSubmitting.value = true

  try {
    const payload = {
      name: createForm.name,
      description: createForm.description,
      icon: createForm.icon,
      isActive: createForm.isActive,
    }

    if (editingCategoryId.value) {
      await putJson(`/api/categories/${editingCategoryId.value}`, payload)
      submitSuccess.value = 'Category updated successfully.'
    } else {
      await postJson('/api/categories', payload)
      submitSuccess.value = 'Category created successfully.'
    }

    await load()
    closeCreateModal()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to create category.'
  } finally {
    isSubmitting.value = false
  }
}

const deleteCategory = async (category) => {
  submitError.value = ''
  submitSuccess.value = ''

  if (!window.confirm(`Delete category "${category.name}"?`)) {
    return
  }

  try {
    await deleteJson(`/api/categories/${category.rowId}`)
    submitSuccess.value = 'Category deleted successfully.'
    await load()
  } catch (requestError) {
    submitError.value = requestError.message || 'Unable to delete category.'
  }
}
</script>

<template>
  <AdminShell title="Categories">
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
          <p class="text-lg font-semibold text-slate-900">All Categories</p>
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
              <input
                v-model="searchTerm"
                type="text"
                placeholder="Search categories..."
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
            <button type="button" @click="openCreateModal" class="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
              <span class="material-symbols-outlined text-base">add</span>
              Add New Category
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[1100px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-5 py-4 font-medium">#</th>
              <th class="px-4 py-4 font-medium">Category Name</th>
              <th class="px-4 py-4 font-medium">Description</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium">Used In Rounds</th>
              <th class="px-4 py-4 font-medium">Created By</th>
              <th class="px-4 py-4 font-medium">Created At</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="category in filteredCategories"
              :key="category.id"
              class="border-b border-slate-100 last:border-b-0"
            >
              <td class="px-5 py-5 text-slate-500">{{ category.id }}</td>
              <td class="px-4 py-5">
                <div class="flex items-center gap-3">
                  <div class="flex h-11 w-11 items-center justify-center rounded-xl" :class="category.iconPanel">
                    <span class="material-symbols-outlined text-lg">{{ category.icon }}</span>
                  </div>
                  <p class="font-semibold text-slate-800">{{ category.name }}</p>
                </div>
              </td>
              <td class="px-4 py-5 text-slate-600">
                <p class="max-w-[320px] leading-6">{{ category.description }}</p>
              </td>
              <td class="px-4 py-5">
                <span class="rounded-lg px-3 py-1 text-xs font-semibold" :class="category.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'">
                  {{ category.status }}
                </span>
              </td>
              <td class="px-4 py-5 text-slate-700">{{ category.rounds }}</td>
              <td class="px-4 py-5 text-slate-600">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-lg text-slate-400">account_circle</span>
                  {{ category.createdBy }}
                </div>
              </td>
              <td class="px-4 py-5 text-slate-500">{{ category.createdAt }}</td>
              <td class="px-4 py-5">
                <div class="flex items-center gap-2">
                  <button type="button" @click="openEditModal(category)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button type="button" @click="deleteCategory(category)" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-500">
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
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
      <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xl font-semibold text-slate-900">{{ editingCategoryId ? 'Edit Category' : 'Create Category' }}</p>
            <p class="mt-1 text-sm text-slate-500">Save category details directly to the database.</p>
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
            <span class="mb-2 block text-sm text-slate-600">Category Name</span>
            <input v-model="createForm.name" type="text" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-slate-600">Icon</span>
            <select v-model="createForm.icon" class="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none">
              <option value="emoji_events">Trophy</option>
              <option value="lightbulb">Lightbulb</option>
              <option value="shopping_cart">Cart</option>
              <option value="groups">Groups</option>
              <option value="shield">Shield</option>
            </select>
          </label>
          <label class="block md:col-span-2">
            <span class="mb-2 block text-sm text-slate-600">Description</span>
            <textarea v-model="createForm.description" rows="4" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"></textarea>
          </label>
          <label class="inline-flex items-center gap-3 text-sm text-slate-600">
            <input v-model="createForm.isActive" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
            Active category
          </label>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" @click="closeCreateModal" class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
            Cancel
          </button>
          <button type="button" @click="submitCategory" :disabled="isSubmitting" class="inline-flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
            {{ isSubmitting ? 'Saving...' : editingCategoryId ? 'Update Category' : 'Create Category' }}
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
