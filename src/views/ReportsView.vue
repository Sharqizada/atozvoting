<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/reports', {
  stats: [],
  filters: {
    dateRange: '',
    categoryLabel: '',
  },
  timelinePoints: [],
  categoryLegend: [],
  voteSummary: [],
  topEmployees: [],
  totals: {
    votesCast: '0',
    validVotes: '0 (0.00%)',
    invalidVotes: '0 (0.00%)',
    participation: '0.00%',
  },
  systemCurrency: '',
})

const stats = computed(() => data.value.stats || [])
const filters = computed(() => data.value.filters || { dateRange: '', categoryLabel: '' })
const timelinePoints = computed(() => data.value.timelinePoints || [])
const categoryLegend = computed(() => data.value.categoryLegend || [])
const voteSummary = computed(() => data.value.voteSummary || [])
const topEmployees = computed(() => data.value.topEmployees || [])
const totals = computed(() => data.value.totals || {})
const systemCurrency = computed(() => data.value.systemCurrency || '')
const selectedCategory = ref('ALL')
const selectedTimeline = ref('Daily')
const hasReportData = computed(() => voteSummary.value.length > 0 || topEmployees.value.length > 0)

const chartColorMap = {
  'bg-blue-500': '#2563eb',
  'bg-emerald-500': '#22c55e',
  'bg-amber-500': '#f59e0b',
  'bg-violet-500': '#8b5cf6',
  'bg-rose-500': '#ef4444',
  'bg-slate-400': '#94a3b8',
}

const categoryChartStyle = computed(() => {
  let currentStop = 0
  const segments = chartLegend.value.map((item) => {
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

const categoryOptions = computed(() => ['ALL', ...categoryLegend.value.map((item) => item.label)])

const filteredCategoryLegend = computed(() =>
  selectedCategory.value === 'ALL'
    ? categoryLegend.value
    : categoryLegend.value.filter((item) => item.label === selectedCategory.value),
)

const filteredVoteSummary = computed(() =>
  selectedCategory.value === 'ALL' ? voteSummary.value : voteSummary.value.filter((row) => row[0] === selectedCategory.value),
)

const chartLegend = computed(() => filteredCategoryLegend.value)

const timelineLinePoints = computed(() =>
  timelinePoints.value
    .map((point) => {
      const x = Number.parseFloat(point.left || '0')
      const y = 100 - Number.parseFloat(point.bottom || '0')
      return `${x},${y}`
    })
    .join(' '),
)

const timelineAreaPoints = computed(() => {
  if (!timelineLinePoints.value) {
    return '2,100 98,100'
  }

  return `2,100 ${timelineLinePoints.value} 98,100`
})
</script>

<template>
  <AdminShell title="Reports">
    <div v-if="error" class="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ error }}
    </div>

    <section class="grid gap-4 xl:grid-cols-5">
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
            <p class="mt-1 text-sm" :class="card.noteColor">{{ card.note }}</p>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.95fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-4">
          <p class="text-lg font-semibold text-slate-900">Votes Over Time</p>
          <label class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-500">
            <span class="material-symbols-outlined text-base">calendar_month</span>
            <select v-model="selectedTimeline" class="bg-transparent outline-none">
              <option value="Daily">Daily</option>
              <option value="Summary">{{ filters.dateRange }}</option>
            </select>
          </label>
        </div>

        <div class="mt-5 rounded-3xl bg-slate-50 p-4">
          <div class="relative h-64 rounded-2xl border border-slate-200 bg-[linear-gradient(to_top,_#eef2ff_0%,_#f8fafc_100%)] px-6 pb-8 pt-4">
            <div class="absolute inset-x-6 top-4 bottom-8">
              <div v-for="line in 5" :key="line" class="absolute left-0 right-0 border-t border-slate-200" :style="{ bottom: `${line * 20}%` }"></div>
              <svg class="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  fill="rgba(59,130,246,0.12)"
                  stroke="rgba(59,130,246,0.9)"
                  stroke-width="2"
                  :points="timelineAreaPoints"
                />
                <polyline
                  fill="none"
                  stroke="rgba(59,130,246,0.95)"
                  stroke-width="2"
                  :points="timelineLinePoints"
                />
              </svg>
            </div>

            <div
              v-for="point in timelinePoints"
              :key="point.day"
              class="absolute -translate-x-1/2 translate-y-1/2"
              :style="{ left: point.left, bottom: point.bottom }"
            >
              <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-500">{{ point.value }}</span>
              <span class="block h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100"></span>
              <span class="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400">{{ point.day }}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-4">
          <p class="text-lg font-semibold text-slate-900">Votes by Category</p>
        </div>

        <div class="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
          <div class="relative mx-auto flex h-52 w-52 items-center justify-center">
            <div
              class="h-52 w-52 rounded-full"
              :style="categoryChartStyle"
            ></div>
            <div class="absolute flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
              <p class="text-4xl font-bold text-slate-900">{{ totals.votesCast }}</p>
              <p class="text-sm text-slate-400">Total Votes</p>
            </div>
          </div>

          <div class="w-full space-y-4">
            <div v-for="item in chartLegend" :key="item.label" class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <span class="h-3 w-3 rounded-full" :class="item.color"></span>
                <p class="text-sm text-slate-600">{{ item.label }}</p>
              </div>
              <p class="text-sm font-medium text-slate-700">{{ item.value }}</p>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <div class="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <p class="text-lg font-semibold text-slate-900">Voting Summary</p>
          <div class="flex flex-wrap items-center gap-3">
            <label class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600">
              <span class="material-symbols-outlined text-base">filter_alt</span>
              <select v-model="selectedCategory" class="bg-transparent outline-none">
                <option v-for="category in categoryOptions" :key="category" :value="category">
                  {{ category === 'ALL' ? filters.categoryLabel : category }}
                </option>
              </select>
            </label>
            <button :disabled="!hasReportData" type="button" class="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300">
              <span class="material-symbols-outlined text-base">download</span>
              Export Report
            </button>
          </div>
        </div>

        <div class="mt-5 overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead>
              <tr class="bg-slate-50 text-slate-500">
                <th class="rounded-l-2xl px-4 py-3 font-medium">Category</th>
                <th class="px-4 py-3 font-medium">Votes Cast</th>
                <th class="px-4 py-3 font-medium">Valid Votes</th>
                <th class="px-4 py-3 font-medium">Invalid Votes</th>
                <th class="rounded-r-2xl px-4 py-3 font-medium">Participation</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredVoteSummary" :key="row[0]" class="border-b border-slate-100 last:border-b-0">
                <td class="px-4 py-4">
                  <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 items-center justify-center rounded-xl" :class="row[6]">
                      <span class="material-symbols-outlined text-lg">{{ row[5] }}</span>
                    </div>
                    <span class="font-medium text-slate-800">{{ row[0] }}</span>
                  </div>
                </td>
                <td class="px-4 py-4 text-slate-700">{{ row[1] }}</td>
                <td class="px-4 py-4 text-emerald-600">{{ row[2] }}</td>
                <td class="px-4 py-4 text-rose-500">{{ row[3] }}</td>
                <td class="px-4 py-4">
                  <div class="flex items-center gap-3">
                    <div class="h-2 w-20 rounded-full bg-slate-200">
                      <div class="h-2 rounded-full bg-blue-600" :style="{ width: row[4] }"></div>
                    </div>
                    <span class="text-slate-500">{{ row[4] }}</span>
                  </div>
                </td>
              </tr>
              <tr class="font-semibold text-slate-800">
                <td class="px-4 py-4">Total</td>
                <td class="px-4 py-4">{{ totals.votesCast }}</td>
                <td class="px-4 py-4 text-emerald-600">{{ totals.validVotes }}</td>
                <td class="px-4 py-4 text-rose-500">{{ totals.invalidVotes }}</td>
                <td class="px-4 py-4">
                  <div class="flex items-center gap-3">
                    <div class="h-2 w-20 rounded-full bg-slate-200">
                      <div class="h-2 rounded-full bg-blue-600" :style="{ width: totals.participation }"></div>
                    </div>
                    <span class="text-slate-500">{{ totals.participation }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-600">
          Participation rate is calculated based on total associates.
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-4">
          <p class="text-lg font-semibold text-slate-900">Top Voted Associates (Overall)</p>
        </div>

        <div class="mt-5 space-y-4">
          <div
            v-for="row in topEmployees"
            :key="row[0]"
            class="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3"
          >
            <div class="w-8 text-center text-xl text-amber-500">{{ row[5] }}</div>
            <div class="min-w-0">
              <p class="font-semibold text-slate-800">{{ row[1] }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ row[2] }}</p>
            </div>
            <div class="flex min-w-[140px] items-center gap-3">
              <div class="h-2 flex-1 rounded-full bg-slate-200">
                <div class="h-2 rounded-full bg-blue-600" :style="{ width: row[4] }"></div>
              </div>
              <span class="text-sm font-medium text-slate-700">{{ row[3] }}</span>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
      <p class="text-sm text-blue-600">Download detailed report in PDF, Excel or CSV format. Currency: {{ systemCurrency }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm text-rose-600">
          <span class="material-symbols-outlined text-base">picture_as_pdf</span>
          PDF
        </button>
        <button type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm text-emerald-600">
          <span class="material-symbols-outlined text-base">table_view</span>
          Excel
        </button>
        <button type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm text-blue-600">
          <span class="material-symbols-outlined text-base">description</span>
          CSV
        </button>
      </div>
    </section>
  </AdminShell>
</template>
