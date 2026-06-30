<script setup>
import { computed } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/dashboard', {
  summaryCards: [],
  currentRound: {
    name: '',
    dateRange: '',
    createdLabel: '',
    status: 'ACTIVE',
    daysRemaining: 0,
    timeElapsedPercent: 0,
    eligibleVoters: 0,
  },
  votesOverview: {
    totalVotes: 0,
    legend: [],
  },
  topCandidates: [],
  activityItems: [],
})

const summaryCards = computed(() => data.value.summaryCards || [])
const currentRound = computed(() => data.value.currentRound)
const votesOverview = computed(() => data.value.votesOverview)
const voteLegend = computed(() => data.value.votesOverview?.legend || [])
const topCandidates = computed(() => data.value.topCandidates || [])
const activityItems = computed(() => data.value.activityItems || [])
const roundStatusClass = computed(() =>
  currentRound.value?.status === 'NO DATA' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-600',
)
const roundIntro = computed(() =>
  currentRound.value?.status === 'NO DATA'
    ? 'Create a voting round to populate the dashboard.'
    : `${currentRound.value?.name || ''} is now active.`,
)

const chartColorMap = {
  'bg-blue-500': '#2563eb',
  'bg-emerald-500': '#22c55e',
  'bg-amber-500': '#f59e0b',
  'bg-violet-500': '#8b5cf6',
  'bg-rose-500': '#ef4444',
  'bg-slate-400': '#94a3b8',
}

const votesOverviewStyle = computed(() => {
  let currentStop = 0
  const segments = voteLegend.value.map((item) => {
    const nextStop = Math.min(100, currentStop + Number(item.percent || 0))
    const color = chartColorMap[item.color] || chartColorMap['bg-slate-400']
    const segment = `${color} ${currentStop}% ${nextStop}%`
    currentStop = nextStop
    return segment
  })

  if (!segments.length) {
    return {
      background: 'conic-gradient(#e2e8f0 0 100%)',
    }
  }

  if (currentStop < 100) {
    segments.push(`#e2e8f0 ${currentStop}% 100%`)
  }

  return {
    background: `conic-gradient(${segments.join(', ')})`,
  }
})
</script>

<template>
  <AdminShell title="Dashboard">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <section class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <article
        v-for="card in summaryCards"
        :key="card.title"
        class="rounded-3xl border border-slate-200 p-4 xl:p-5"
        :class="card.panelBg"
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl text-white xl:h-14 xl:w-14"
            :class="card.iconBg"
          >
            <span class="material-symbols-outlined text-xl xl:text-2xl">{{ card.icon }}</span>
          </div>
          <div>
            <p class="text-sm text-slate-500">{{ card.title }}</p>
            <p class="mt-1 text-2xl font-bold text-slate-900 xl:text-3xl">{{ card.value }}</p>
            <p class="mt-2 text-xs text-slate-400 xl:text-sm">{{ card.subtitle }}</p>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-4 xl:p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-lg font-semibold text-slate-900">Current Voting Round</p>
            <p class="mt-1 text-sm text-slate-500">{{ roundIntro }}</p>
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 p-4 lg:flex-row lg:items-center xl:p-5">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 xl:h-20 xl:w-20">
            <span class="material-symbols-outlined text-3xl xl:text-4xl">calendar_month</span>
          </div>
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-3">
              <p class="text-xl font-bold text-slate-900 xl:text-2xl">{{ currentRound.name }}</p>
              <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="roundStatusClass">
                {{ currentRound.status }}
              </span>
            </div>
            <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <span class="inline-flex items-center gap-2">
                <span class="material-symbols-outlined text-base">calendar_today</span>
                {{ currentRound.dateRange }}
              </span>
              <span class="inline-flex items-center gap-2">
                <span class="material-symbols-outlined text-base">schedule</span>
                {{ currentRound.createdLabel }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 xl:p-5">
          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <p class="text-2xl font-bold text-slate-900 xl:text-3xl">{{ currentRound.daysRemaining }}</p>
              <p class="mt-2 text-sm text-slate-400">Days Remaining</p>
            </div>
            <div>
              <div class="flex items-center justify-between text-sm text-slate-500">
                <span>{{ Math.round(currentRound.timeElapsedPercent) }}%</span>
                <span>Time Elapsed</span>
              </div>
              <div class="mt-3 h-2 rounded-full bg-slate-200">
                <div class="h-2 rounded-full bg-blue-600" :style="{ width: `${currentRound.timeElapsedPercent}%` }"></div>
              </div>
            </div>
            <div class="md:text-right">
              <p class="text-2xl font-bold text-slate-900 xl:text-3xl">{{ currentRound.eligibleVoters }}</p>
              <p class="mt-2 text-sm text-slate-400">Eligible Voters</p>
            </div>
          </div>
          <button
            type="button"
            class="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <span class="material-symbols-outlined text-base">tune</span>
            Manage Round
          </button>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-4 xl:p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-lg font-semibold text-slate-900">Votes Overview</p>
            <p class="mt-1 text-sm text-slate-500">This round performance by category.</p>
          </div>
          <button
            type="button"
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500"
          >
            This Round
          </button>
        </div>

        <div class="mt-6 flex flex-col gap-5 lg:flex-row lg:items-center">
          <div class="relative mx-auto flex h-44 w-44 items-center justify-center xl:h-52 xl:w-52">
            <div
              class="h-44 w-44 rounded-full xl:h-52 xl:w-52"
              :style="votesOverviewStyle"
            ></div>
            <div class="absolute flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white xl:h-28 xl:w-28">
              <p class="text-2xl font-bold text-slate-900 xl:text-3xl">{{ votesOverview.totalVotes }}</p>
              <p class="text-sm text-slate-400">Total Votes</p>
            </div>
          </div>

          <div class="w-full space-y-4">
            <div
              v-for="item in voteLegend"
              :key="item.label"
              class="flex items-center justify-between gap-4"
            >
              <div class="flex items-center gap-3">
                <span class="h-3 w-3 rounded-full" :class="item.color"></span>
                <p class="text-sm text-slate-600">{{ item.label }}</p>
              </div>
              <p class="text-sm font-semibold text-slate-700">{{ item.value }}</p>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-4 xl:p-5">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-semibold text-slate-900">Top Candidates (Current Round)</p>
          <button type="button" class="text-sm font-medium text-blue-600">View All Results</button>
        </div>

        <div class="mt-5 overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th class="pb-4 pr-4 font-medium">Category</th>
                <th class="pb-4 pr-4 font-medium">Rank 1</th>
                <th class="pb-4 pr-4 font-medium">Rank 2</th>
                <th class="pb-4 font-medium">Rank 3</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in topCandidates"
                :key="row.category"
                class="border-b border-slate-100 text-slate-600 last:border-b-0"
              >
                <td class="py-4 pr-4 font-medium text-slate-800">{{ row.category }}</td>
                <td class="py-4 pr-4">{{ row.rank1 }}</td>
                <td class="py-4 pr-4">{{ row.rank2 }}</td>
                <td class="py-4">{{ row.rank3 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-4 xl:p-5">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-semibold text-slate-900">Recent Activity</p>
          <button type="button" class="text-sm font-medium text-blue-600">View All Logs</button>
        </div>

        <div class="mt-5 space-y-4">
          <div
            v-for="item in activityItems"
            :key="item.title"
            class="flex items-start gap-4 rounded-3xl border border-slate-200 p-4"
          >
            <div class="flex h-11 w-11 items-center justify-center rounded-2xl" :class="item.panel">
              <span class="material-symbols-outlined text-lg">{{ item.icon }}</span>
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-slate-800">{{ item.title }}</p>
              <p class="mt-2 text-xs text-slate-400">by {{ item.actor || 'Admin' }}</p>
            </div>
            <p class="text-xs text-slate-400">{{ item.time }}</p>
          </div>
        </div>
      </article>
    </section>
  </AdminShell>
</template>
