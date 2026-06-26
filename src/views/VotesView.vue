<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/votes', {
  stats: [],
  roundName: '',
  categories: [],
  statuses: [],
  votes: [],
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const roundName = computed(() => data.value.roundName || '')
const votes = computed(() => data.value.votes || [])
const categories = computed(() => data.value.categories || [])
const statuses = computed(() => data.value.statuses || [])
const searchTerm = ref('')
const selectedCategory = ref('ALL')
const selectedStatus = ref('ALL')
const activeTab = ref('All Votes')
const hasVotesData = computed(() => votes.value.length > 0)

const filteredVotes = computed(() => {
  const items = votes.value.filter((vote) => {
    const haystack = `${vote[1]} ${vote[2]} ${vote[3]} ${vote[4]} ${vote[5]}`.toLowerCase()
    const matchesSearch = !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
    const matchesCategory = selectedCategory.value === 'ALL' || vote[5] === selectedCategory.value
    const matchesStatus = selectedStatus.value === 'ALL' || vote[7] === selectedStatus.value
    return matchesSearch && matchesCategory && matchesStatus
  })

  if (activeTab.value === 'By Category') {
    return [...items].sort((left, right) => left[5].localeCompare(right[5]))
  }

  if (activeTab.value === 'By Associate') {
    return [...items].sort((left, right) => left[1].localeCompare(right[1]))
  }

  if (activeTab.value === 'Vote Summary') {
    return [...items].sort((left, right) => left[7].localeCompare(right[7]))
  }

  return items
})

const paginationLabel = computed(() => `Showing 1 to ${filteredVotes.value.length} of ${votes.value.length} votes`)

const categoryClass = {
  'Best Stower': 'bg-blue-100 text-blue-600',
  'Best Problem Solver': 'bg-emerald-100 text-emerald-600',
  'Best Water Spider': 'bg-amber-100 text-amber-600',
  'Best Team Support': 'bg-violet-100 text-violet-600',
  'Best Safety Focused': 'bg-rose-100 text-rose-600',
}

const resetFilters = () => {
  searchTerm.value = ''
  selectedCategory.value = 'ALL'
  selectedStatus.value = 'ALL'
}
</script>

<template>
  <AdminShell title="Votes">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
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
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-8 text-sm font-medium text-slate-500">
            <button type="button" @click="activeTab = 'All Votes'" :class="activeTab === 'All Votes' ? 'text-blue-600' : ''">All Votes</button>
            <button type="button" @click="activeTab = 'By Category'" :class="activeTab === 'By Category' ? 'text-blue-600' : ''">By Category</button>
            <button type="button" @click="activeTab = 'By Associate'" :class="activeTab === 'By Associate' ? 'text-blue-600' : ''">By Associate</button>
            <button type="button" @click="activeTab = 'Vote Summary'" :class="activeTab === 'Vote Summary' ? 'text-blue-600' : ''">Vote Summary</button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
              <span class="material-symbols-outlined text-base">calendar_month</span>
              {{ roundName }}
            </button>
            <button :disabled="!hasVotesData" type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300">
              <span class="material-symbols-outlined text-base">upload</span>
              Export
            </button>
          </div>
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
            <input v-model="searchTerm" type="text" placeholder="Search by associate name or badge ID..." class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none" />
          </div>
          <label class="inline-flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
            <select v-model="selectedCategory" class="w-full bg-transparent outline-none">
              <option value="ALL">All Categories</option>
              <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
            </select>
          </label>
          <label class="inline-flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
            <select v-model="selectedStatus" class="w-full bg-transparent outline-none">
              <option value="ALL">All Status</option>
              <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <button type="button" @click="resetFilters" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
            <span class="material-symbols-outlined text-base">restart_alt</span>
            Clear Filters
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[1150px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-5 py-4 font-medium">#</th>
              <th class="px-4 py-4 font-medium">Voter (Badge ID)</th>
              <th class="px-4 py-4 font-medium">Voted For</th>
              <th class="px-4 py-4 font-medium">Category</th>
              <th class="px-4 py-4 font-medium">Vote Date & Time</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(vote, index) in filteredVotes" :key="vote[0]" class="border-b border-slate-100 last:border-b-0">
              <td class="px-5 py-4 text-slate-500">{{ index + 1 }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                    <span class="material-symbols-outlined text-base">person</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ vote[1] }}</p>
                    <p class="mt-1 text-xs text-slate-400">{{ vote[2] }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                    <span class="material-symbols-outlined text-base">person</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ vote[3] }}</p>
                    <p class="mt-1 text-xs text-slate-400">{{ vote[4] }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <span class="rounded-lg px-3 py-1 text-xs font-semibold" :class="categoryClass[vote[5]]">
                  {{ vote[5] }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ vote[6] }}</td>
              <td class="px-4 py-4">
                <span
                  class="rounded-lg px-3 py-1 text-xs font-semibold"
                  :class="vote[7] === 'Valid' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'"
                >
                  {{ vote[7] }}
                </span>
              </td>
              <td class="px-4 py-4">
                <button type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
                  <span class="material-symbols-outlined text-base">visibility</span>
                </button>
              </td>
            </tr>
            <tr v-if="!filteredVotes.length">
              <td colspan="7" class="px-5 py-10 text-center text-sm text-slate-500">
                No votes found for the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-col gap-4 px-5 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>{{ paginationLabel }}</p>
      </div>
    </section>
  </AdminShell>
</template>
