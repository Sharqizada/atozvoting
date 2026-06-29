<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJson } from '../lib/api'

const router = useRouter()
const liveRound = ref(null)
const upcomingRounds = ref([])
const pageError = ref('')
const isLoading = ref(true)

const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 'Schedule will be announced'
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`
}

const heroCards = computed(() => {
  if (!liveRound.value) {
    return []
  }

  return [
    {
      title: 'Round ID',
      value: liveRound.value.roundId,
      icon: 'confirmation_number',
    },
    {
      title: 'Eligible Associates',
      value: `${liveRound.value.eligibleAssociates || 0} Associates`,
      icon: 'groups',
    },
    {
      title: 'Voting Period',
      value: formatDateRange(liveRound.value.startDate, liveRound.value.endDate),
      icon: 'calendar_month',
    },
  ]
})

const loadVotingHome = async () => {
  isLoading.value = true
  pageError.value = ''
  sessionStorage.removeItem('votingRoundAccessCode')
  sessionStorage.removeItem('votingRoundSummary')

  try {
    const response = await fetchJson('/api/voting/home')
    liveRound.value = response.liveRound || null
    upcomingRounds.value = response.upcomingRounds || []
  } catch (error) {
    pageError.value = error.message || 'Unable to load the voting home page.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadVotingHome)
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-slate-950 font-sans text-white">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#111827_100%)]"></div>
    <div class="absolute -left-16 top-16 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl animate-pulse"></div>
    <div class="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl animate-pulse"></div>
    <div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl animate-pulse"></div>

    <main class="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-emerald-300 backdrop-blur">
            <span class="material-symbols-outlined text-4xl">how_to_vote</span>
          </div>
          <div>
            <p class="text-2xl font-semibold">Inbound Star Voting</p>
            <p class="text-sm text-slate-300">Recognize excellence through the current live round and upcoming schedules.</p>
          </div>
        </div>

        <button
          type="button"
          @click="router.push('/login')"
          class="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm text-white backdrop-blur transition hover:bg-white/15"
        >
          <span class="material-symbols-outlined text-base">admin_panel_settings</span>
          Login
        </button>
      </header>

      <section class="mt-8 rounded-[36px] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur sm:p-8">
        <div class="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span class="inline-flex rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-300">
              {{ liveRound ? 'Live Voting Round' : 'Voting Schedule' }}
            </span>
            <h1 class="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              {{ isLoading ? 'Loading voting rounds...' : liveRound?.name || 'No live round at the moment' }}
            </h1>
            <p class="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              <span v-if="liveRound">
                The current round is live now. Associates can open the voting page, scan their badge, and vote one time for this round.
              </span>
              <span v-else>
                There is no live round right now. You can still review the upcoming round cards below for the next scheduled voting sessions.
              </span>
            </p>

            <div v-if="pageError" class="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {{ pageError }}
            </div>

            <div class="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                @click="router.push('/vote')"
                :disabled="!liveRound"
                class="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-base font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                <span class="material-symbols-outlined text-xl">arrow_forward</span>
                Open Live Voting
              </button>
              <button
                type="button"
                @click="router.push('/login')"
                class="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 text-base font-medium text-white transition hover:bg-white/15"
              >
                <span class="material-symbols-outlined text-xl">settings</span>
                Manage Rounds
              </button>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <article
              v-for="card in heroCards"
              :key="card.title"
              class="rounded-3xl border border-white/10 bg-slate-950/30 p-5"
            >
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-emerald-300">
                  <span class="material-symbols-outlined text-2xl">{{ card.icon }}</span>
                </div>
                <div>
                  <p class="text-sm text-slate-300">{{ card.title }}</p>
                  <p class="mt-1 text-lg font-semibold text-white">{{ card.value }}</p>
                </div>
              </div>
            </article>

            <article v-if="!heroCards.length" class="rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-6 text-sm text-slate-300">
              The next live voting round will appear here automatically once an admin makes one round live.
            </article>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-2xl font-semibold">Upcoming Voting Rounds</p>
            <p class="mt-1 text-sm text-slate-300">Preview the next scheduled rounds that admins have already prepared.</p>
          </div>
        </div>

        <div v-if="upcomingRounds.length" class="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="round in upcomingRounds"
            :key="round.id"
            class="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur transition hover:bg-white/15"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <span class="inline-flex rounded-full bg-blue-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
                  {{ round.status }}
                </span>
                <p class="mt-4 text-xl font-semibold text-white">{{ round.name }}</p>
              </div>
              <span class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold tracking-[0.2em] text-emerald-200">
                {{ round.roundId }}
              </span>
            </div>

            <div class="mt-6 space-y-3 text-sm text-slate-300">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-base text-emerald-300">calendar_month</span>
                <span>{{ formatDateRange(round.startDate, round.endDate) }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-base text-emerald-300">groups</span>
                <span>{{ round.eligibleAssociates || 0 }} Associates</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-base text-emerald-300">confirmation_number</span>
                <span>Random Round ID: {{ round.roundId }}</span>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="!isLoading" class="mt-6 rounded-[28px] border border-dashed border-white/15 bg-white/5 px-5 py-12 text-center text-sm text-slate-300">
          No upcoming voting rounds are available yet.
        </div>
      </section>

      <footer class="mt-10 text-center text-xs text-slate-400">
        © 2026 Inbound Star Voting. All rights reserved.
      </footer>
    </main>
  </div>
</template>
