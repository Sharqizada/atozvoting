<script setup>
import { computed, ref, watch } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/live-results', {
  summary: [],
  tabs: [],
  selectedRoundName: '',
  selectedCategory: '',
  categoryResults: [],
  liveActivity: [],
  footer: {
    updatedAt: '',
  },
})

const summary = computed(() => data.value.summary || [])
const tabs = computed(() => data.value.tabs || [])
const selectedRoundName = computed(() => data.value.selectedRoundName || '')
const selectedCategory = ref('')
const categoryResults = computed(() => data.value.categoryResults || [])
const liveActivity = computed(() => data.value.liveActivity || [])
const footer = computed(() => data.value.footer || { updatedAt: '' })
const hasLiveResults = computed(() => categoryResults.value.length > 0)

watch(
  tabs,
  (value) => {
    if (!selectedCategory.value && value.length) {
      selectedCategory.value = data.value.selectedCategory || value[0]
    }
  },
  { immediate: true },
)

const currentCategory = computed(
  () => categoryResults.value.find((entry) => entry.category === selectedCategory.value) || { podium: [], ranking: [], distribution: [], totalVotes: 0 },
)

const podium = computed(() => currentCategory.value.podium || [])
const ranking = computed(() => currentCategory.value.ranking || [])
const distribution = computed(() => currentCategory.value.distribution || [])

const chartColorMap = {
  'bg-blue-500': '#2563eb',
  'bg-emerald-500': '#22c55e',
  'bg-amber-500': '#f59e0b',
  'bg-violet-500': '#8b5cf6',
  'bg-rose-500': '#ef4444',
  'bg-slate-400': '#94a3b8',
}

const distributionChartStyle = computed(() => {
  let currentStop = 0
  const segments = distribution.value.map((item) => {
    const match = item[1].match(/\(([\d.]+)%\)/)
    const percent = Number(match?.[1] || 0)
    const nextStop = Math.min(100, currentStop + percent)
    const color = chartColorMap[item[2]] || chartColorMap['bg-slate-400']
    const segment = `${color} ${currentStop}% ${nextStop}%`
    currentStop = nextStop
    return segment
  })

  if (!segments.length) {
    return { background: 'conic-gradient(#e2e8f0 0 100%)' }
  }

  if (currentStop < 100) {
    segments.push(`#e2e8f0 ${currentStop}% 100%`)
  }

  return { background: `conic-gradient(${segments.join(', ')})` }
})
</script>

<template>
  <AdminShell title="Live Results">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <template #actions>
      <div class="flex flex-wrap items-center justify-end gap-3">
        <button type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
          <span class="material-symbols-outlined text-base">calendar_month</span>
          {{ selectedRoundName }}
        </button>
        <button :disabled="!hasLiveResults" type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300">
          <span class="material-symbols-outlined text-base">upload</span>
          Export Results
        </button>
      </div>
    </template>

    <section class="rounded-3xl border border-slate-200 bg-white px-5 py-4">
      <div class="grid gap-4 lg:grid-cols-4">
        <div v-for="card in summary" :key="card.title" class="flex items-center gap-4 border-slate-100 lg:border-r last:border-r-0">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl" :class="card.panel">
            <span class="material-symbols-outlined text-2xl">{{ card.icon }}</span>
          </div>
          <div>
            <p class="text-3xl font-bold text-slate-900">{{ card.value }}</p>
            <p class="text-sm font-medium text-slate-700">{{ card.title }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ card.note }}</p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tabs.length" class="mt-5 rounded-2xl border border-slate-200 bg-white p-2">
      <div class="grid gap-2 lg:grid-cols-5">
        <button
          v-for="(tab, index) in tabs"
          :key="tab"
          type="button"
          @click="selectedCategory = tab"
          class="rounded-xl px-4 py-3 text-sm font-medium"
          :class="selectedCategory === tab || (!selectedCategory && index === 0) ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'"
        >
          {{ tab }}
        </button>
      </div>
    </section>
    <div v-else class="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
      Categories will appear here once votes are recorded in an active round.
    </div>

    <section class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
      <div class="space-y-6">
        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between gap-4">
            <p class="text-lg font-semibold text-slate-900">Top 3 - {{ selectedCategory || 'Category' }}</p>
          </div>

          <div v-if="podium.length" class="mt-6 grid gap-4 md:grid-cols-3">
            <div v-for="person in podium" :key="person.place" class="rounded-3xl border border-slate-100 p-4 text-center" :class="person.panel">
              <div class="text-4xl text-amber-500">{{ person.crown }}</div>
              <div class="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-300 text-slate-600">
                <span class="material-symbols-outlined text-3xl">person</span>
              </div>
              <div class="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                {{ person.place }}
              </div>
              <p class="mt-3 text-lg font-semibold text-slate-900">{{ person.name }}</p>
              <p class="text-xs text-slate-400">{{ person.badge }}</p>
              <p class="mt-3 text-3xl font-bold text-blue-600">{{ person.votes }}</p>
              <p class="text-sm text-slate-500">votes</p>
              <p class="mt-2 text-xs text-slate-400">{{ person.share }}</p>
            </div>
          </div>
          <div v-else class="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No live results are available yet.
          </div>
        </article>

        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between gap-4">
            <p class="text-lg font-semibold text-slate-900">Ranking - {{ selectedCategory || 'Category' }}</p>
          </div>

          <div class="mt-5 overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500">
                  <th class="pb-4 pr-4 font-medium">Rank</th>
                  <th class="pb-4 pr-4 font-medium">Associate</th>
                  <th class="pb-4 pr-4 font-medium">Badge ID</th>
                  <th class="pb-4 pr-4 font-medium">Votes</th>
                  <th class="pb-4 font-medium">Percentage</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in ranking" :key="row[0]" class="border-b border-slate-100 last:border-b-0">
                  <td class="py-4 pr-4 text-slate-600">{{ row[0] }}</td>
                  <td class="py-4 pr-4">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                        <span class="material-symbols-outlined text-sm">person</span>
                      </div>
                      <span class="font-medium text-slate-800">{{ row[1] }}</span>
                    </div>
                  </td>
                  <td class="py-4 pr-4 text-slate-500">{{ row[2] }}</td>
                  <td class="py-4 pr-4 text-slate-700">{{ row[3] }}</td>
                  <td class="py-4">
                    <div class="flex items-center gap-3">
                      <div class="h-2 flex-1 rounded-full bg-slate-200">
                        <div class="h-2 rounded-full bg-blue-600" :style="{ width: row[5] }"></div>
                      </div>
                      <span class="text-slate-500">{{ row[4] }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div class="space-y-6">
        <article class="rounded-3xl border border-slate-200 bg-white p-5">
            <p class="text-lg font-semibold text-slate-900">Votes Distribution - {{ selectedCategory }}</p>

          <div class="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
            <div class="relative mx-auto flex h-52 w-52 items-center justify-center">
              <div
                class="h-52 w-52 rounded-full"
                :style="distributionChartStyle"
              ></div>
              <div class="absolute flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                <p class="text-3xl font-bold text-slate-900">{{ currentCategory.totalVotes }}</p>
                <p class="text-sm text-slate-400">Total Votes</p>
              </div>
            </div>

            <div class="w-full space-y-4">
              <div v-for="item in distribution" :key="item[0]" class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full" :class="item[2]"></span>
                  <span class="text-sm text-slate-600">{{ item[0] }}</span>
                </div>
                <span class="text-sm font-medium text-slate-700">{{ item[1] }}</span>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between gap-4">
            <p class="text-lg font-semibold text-slate-900">Voting Activity (Live)</p>
          </div>

          <div class="mt-5 space-y-4">
            <div
              v-for="activity in liveActivity"
              :key="activity[0]"
              class="flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
            >
              <span class="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              <p class="flex-1 text-sm text-slate-700">{{ activity[0] }}</p>
              <span class="text-xs text-slate-400">{{ activity[1] }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="mt-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 md:flex-row md:items-center md:justify-between">
      <p>Results update in real-time. Data is refreshed automatically every 10 seconds.</p>
      <div class="flex items-center gap-5 text-xs text-slate-500">
        <span>Last updated at {{ footer.updatedAt }}</span>
        <span class="inline-flex items-center gap-2 text-emerald-600">
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          Live
        </span>
      </div>
    </section>
  </AdminShell>
</template>
