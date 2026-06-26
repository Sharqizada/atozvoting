<script setup>
import { computed, ref, watch } from 'vue'
import AdminShell from '../components/AdminShell.vue'
import { useAdminPage } from '../composables/useAdminPage'

const { data, error } = useAdminPage('/api/past-winners', {
  stats: [],
  rounds: [],
  selectedRound: {
    name: '',
    summary: '',
  },
  tabs: [],
  podium: [],
  ranking: [],
  roundResults: [],
})

const stats = computed(() => data.value.stats || [])
const rounds = computed(() => data.value.rounds || [])
const roundResults = computed(() => data.value.roundResults || [])
const selectedRoundName = ref('')
const selectedCategory = ref('')

watch(
  roundResults,
  (value) => {
    if (!selectedRoundName.value && value.length) {
      selectedRoundName.value = value[0].name
    }
  },
  { immediate: true },
)

const currentRound = computed(
  () => roundResults.value.find((entry) => entry.name === selectedRoundName.value) || { name: '', summary: '', tabs: [], categories: [] },
)

watch(
  currentRound,
  (value) => {
    if (!value.tabs?.includes(selectedCategory.value)) {
      selectedCategory.value = value.tabs?.[0] || ''
    }
  },
  { immediate: true },
)

const selectedRound = computed(() => ({ name: currentRound.value.name, summary: currentRound.value.summary }))
const tabs = computed(() => currentRound.value.tabs || [])
const hasPastWinners = computed(() => rounds.value.length > 0)
const currentCategory = computed(
  () => currentRound.value.categories?.find((entry) => entry.category === selectedCategory.value) || { podium: [], ranking: [] },
)
const podium = computed(() => currentCategory.value.podium || [])
const ranking = computed(() => currentCategory.value.ranking || [])
</script>

<template>
  <AdminShell title="Past Winners">
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

    <section class="mt-6 grid gap-6 xl:grid-cols-[300px_1fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between gap-4">
          <p class="text-lg font-semibold text-slate-900">Past Voting Rounds</p>
        </div>

        <div class="mt-4 space-y-3">
          <button
            v-for="round in rounds"
            :key="round[0]"
            type="button"
            @click="selectedRoundName = round[0]"
            class="w-full rounded-2xl border px-4 py-3 text-left transition"
            :class="selectedRoundName === round[0] ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-800">{{ round[0] }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ round[1] }}</p>
              </div>
              <span class="rounded-lg bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                Completed
              </span>
            </div>
          </button>
        </div>

        <button v-if="hasPastWinners" type="button" class="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm text-slate-600">
          Load more
          <span class="material-symbols-outlined text-base">expand_more</span>
        </button>
        <div v-else class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          No completed rounds yet.
        </div>
      </article>

      <div class="space-y-4">
        <article class="rounded-3xl border border-slate-200 bg-white p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex items-start gap-4">
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <span class="material-symbols-outlined text-xl">emoji_events</span>
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-3">
                  <p class="text-lg font-semibold text-slate-900">{{ selectedRound.name }}</p>
                  <span class="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">Completed</span>
                </div>
                <p class="mt-1 text-sm text-slate-500">{{ selectedRound.summary }}</p>
              </div>
            </div>

            <button :disabled="!hasPastWinners" type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300">
              <span class="material-symbols-outlined text-base">download</span>
              Export Results
            </button>
          </div>
        </article>

        <article v-if="tabs.length" class="rounded-2xl border border-slate-200 bg-white p-2">
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
        </article>
        <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          Past winner categories will appear here after a completed round has votes.
        </div>

        <article class="rounded-3xl border border-slate-200 bg-white p-5">
          <div v-if="podium.length" class="grid gap-5 md:grid-cols-3">
            <div
              v-for="person in podium"
              :key="person.place"
              class="rounded-3xl border border-slate-100 p-5 text-center"
              :class="person.panel"
            >
              <div class="text-4xl">{{ person.crown }}</div>
              <div class="mx-auto mt-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-300 text-slate-600">
                <span class="material-symbols-outlined text-4xl">person</span>
              </div>
              <div class="mx-auto mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-semibold text-white">
                {{ person.place }}
              </div>
              <p class="mt-4 text-xl font-semibold text-slate-900">{{ person.name }}</p>
              <p class="text-xs text-slate-400">{{ person.badge }}</p>
              <p class="mt-4 text-3xl font-bold text-blue-600">{{ person.votes }}</p>
              <p class="text-sm text-slate-500">{{ person.share }}</p>
            </div>
          </div>
          <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No winner data is available for this round yet.
          </div>

          <div class="mt-6">
            <p class="text-lg font-semibold text-slate-900">Full Ranking - {{ selectedCategory || 'Category' }}</p>
            <div class="mt-4 overflow-x-auto">
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

            <div v-if="hasPastWinners" class="mt-5 flex justify-center">
              <button type="button" class="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600">
                <span class="material-symbols-outlined text-base">visibility</span>
                View All Results for this Round
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </AdminShell>
</template>
