<script setup>
import { computed, reactive } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/audit-logs', {
  stats: [],
  logs: [],
  filters: {
    actions: [],
    users: [],
    modules: [],
    statuses: [],
  },
  retention: '',
  pagination: {
    showing: '',
  },
})

const stats = computed(() => data.value.stats || [])
const logs = computed(() => data.value.logs || [])
const filterOptions = computed(() => data.value.filters || { actions: [], users: [], modules: [], statuses: [] })
const retention = computed(() => data.value.retention || '')
const filters = reactive({
  search: '',
  action: 'ALL',
  user: 'ALL',
  module: 'ALL',
  status: 'ALL',
})

const filteredLogs = computed(() =>
  logs.value.filter((row) => {
    const haystack = `${row[2]} ${row[4]} ${row[5]} ${row[7]}`.toLowerCase()
    const matchesSearch = !filters.search || haystack.includes(filters.search.toLowerCase())
    const matchesAction = filters.action === 'ALL' || row[4] === filters.action
    const matchesUser = filters.user === 'ALL' || row[2] === filters.user
    const matchesModule = filters.module === 'ALL' || row[6] === filters.module
    const matchesStatus = filters.status === 'ALL' || row[9] === filters.status
    return matchesSearch && matchesAction && matchesUser && matchesModule && matchesStatus
  }),
)

const paginationLabel = computed(() => `Showing 1 to ${filteredLogs.value.length} of ${logs.value.length} activities`)

const resetFilters = () => {
  filters.search = ''
  filters.action = 'ALL'
  filters.user = 'ALL'
  filters.module = 'ALL'
  filters.status = 'ALL'
}
</script>

<template>
  <AdminShell title="Audit Logs">
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
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-white" :class="card.iconBg">
            <span class="material-symbols-outlined text-xl">{{ card.icon }}</span>
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
      <div class="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <p class="text-lg font-semibold text-slate-900">Audit Activity</p>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
            <span class="material-symbols-outlined text-base">calendar_month</span>
            May 1 - May 31, 2026
          </button>
          <button type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm text-blue-600">
            <span class="material-symbols-outlined text-base">download</span>
            Export
          </button>
        </div>
      </div>

      <div class="grid gap-3 xl:grid-cols-[1.4fr_0.75fr_0.75fr_0.75fr_0.75fr_auto_auto]">
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
          <input v-model="filters.search" type="text" placeholder="Search by user, action or details..." class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none" />
        </div>
        <label class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
          <select v-model="filters.action" class="w-full bg-transparent outline-none">
            <option value="ALL">All Actions</option>
            <option v-for="action in filterOptions.actions" :key="action" :value="action">{{ action }}</option>
          </select>
        </label>
        <label class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
          <select v-model="filters.user" class="w-full bg-transparent outline-none">
            <option value="ALL">All Users</option>
            <option v-for="user in filterOptions.users" :key="user" :value="user">{{ user }}</option>
          </select>
        </label>
        <label class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
          <select v-model="filters.module" class="w-full bg-transparent outline-none">
            <option value="ALL">All Modules</option>
            <option v-for="moduleName in filterOptions.modules" :key="moduleName" :value="moduleName">{{ moduleName }}</option>
          </select>
        </label>
        <label class="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
          <select v-model="filters.status" class="w-full bg-transparent outline-none">
            <option value="ALL">All Status</option>
            <option v-for="status in filterOptions.statuses" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
        <button type="button" @click="resetFilters" class="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm text-blue-600">Reset</button>
        <button type="button" class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white">
          <span class="material-symbols-outlined text-base">filter_alt</span>
          {{ filteredLogs.length }} Results
        </button>
      </div>

      <div class="mt-5 overflow-x-auto">
        <table class="min-w-[1350px] w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th class="px-4 py-4 font-medium">#</th>
              <th class="px-4 py-4 font-medium">Time</th>
              <th class="px-4 py-4 font-medium">User</th>
              <th class="px-4 py-4 font-medium">Action</th>
              <th class="px-4 py-4 font-medium">Module</th>
              <th class="px-4 py-4 font-medium">Details</th>
              <th class="px-4 py-4 font-medium">IP Address</th>
              <th class="px-4 py-4 font-medium">Status</th>
              <th class="px-4 py-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredLogs" :key="row[0]" class="border-b border-slate-100 last:border-b-0">
              <td class="px-4 py-4 text-slate-500">{{ row[0] }}</td>
              <td class="px-4 py-4 text-slate-600">{{ row[1] }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold" :class="row[10].avatarColor">
                    {{ row[10].initials }}
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ row[2] }}</p>
                    <p class="mt-1 text-xs text-slate-400">{{ row[3] }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-start gap-3">
                  <span class="material-symbols-outlined text-base text-blue-600">{{ row[10].icon }}</span>
                  <div>
                    <p class="font-medium text-slate-800">{{ row[4] }}</p>
                    <p class="mt-1 text-xs text-slate-400">{{ row[5] }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <span class="rounded-lg px-3 py-1 text-xs font-semibold" :class="row[10].moduleClass">
                  {{ row[6] }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-600">{{ row[7] }}</td>
              <td class="px-4 py-4 text-slate-600">{{ row[8] }}</td>
              <td class="px-4 py-4">
                <span class="inline-flex items-center gap-2 rounded-lg px-3 py-1 text-xs font-semibold" :class="row[10].statusClass">
                  <span class="h-2 w-2 rounded-full" :class="row[9] === 'Success' ? 'bg-emerald-500' : row[9] === 'Warning' ? 'bg-amber-500' : 'bg-rose-500'"></span>
                  {{ row[9] }}
                </span>
              </td>
              <td class="px-4 py-4 text-slate-400">
                <button type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200">
                  <span class="material-symbols-outlined text-base">more_vert</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p class="text-sm text-slate-500">{{ paginationLabel }}</p>
      </div>

      <div class="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-600">
        {{ retention }}
      </div>
    </section>
  </AdminShell>
</template>
