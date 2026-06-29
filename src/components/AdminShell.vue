<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminNavigationGroups, getAdminSession } from '../data/adminPanel'
import { fetchJson } from '../lib/api'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  breadcrumbs: {
    type: Array,
    default: () => [],
  },
})

const route = useRoute()
const router = useRouter()
const mobileMenuOpen = ref(false)
const adminSession = ref(getAdminSession())
const meta = ref({
  siteName: '',
  siteTagline: '',
  siteLogo: '',
  notificationCount: 0,
})

const navigationGroups = computed(() =>
  adminNavigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active: item.route === route.path,
    })),
  })),
)

const handleMenuAction = (item) => {
  if (item.action === 'logout') {
    localStorage.removeItem('adminSession')
    sessionStorage.removeItem('adminSession')
    router.push('/login')
    return
  }

  if (item.route) {
    mobileMenuOpen.value = false
    router.push(item.route)
  }
}

onMounted(async () => {
  try {
    meta.value = await fetchJson('/api/admin/meta')
  } catch {
    meta.value = {
      siteName: '',
      siteTagline: '',
      siteLogo: '',
      notificationCount: 0,
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 font-sans text-slate-900">
    <div class="flex min-h-screen">
      <div
        v-if="mobileMenuOpen"
        class="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
        @click="mobileMenuOpen = false"
      ></div>

      <aside
        class="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-slate-950 text-white transition-transform duration-200 lg:z-30"
        :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
      >
        <div class="shrink-0 border-b border-white/10 px-5 py-6">
          <div class="flex items-start gap-3">
            <div class="overflow-hidden rounded-2xl border border-amber-300/30 bg-amber-400/10 p-2">
              <img
                v-if="meta.siteLogo"
                :src="meta.siteLogo"
                :alt="meta.siteName || 'Website logo'"
                class="h-10 w-10 rounded-xl object-cover"
              />
              <span v-else class="material-symbols-outlined text-3xl text-amber-400">stars</span>
            </div>
            <div>
              <p class="text-xl font-bold">{{ meta.siteName }}</p>
              <p class="text-sm text-slate-400">{{ meta.siteTagline }}</p>
            </div>
          </div>
        </div>

        <nav class="flex-1 overflow-y-auto px-4 py-5">
          <div v-for="group in navigationGroups" :key="group.title || 'main'" class="mb-7">
            <p
              v-if="group.title"
              class="mb-3 px-3 text-xs font-medium uppercase tracking-[0.22em] text-slate-500"
            >
              {{ group.title }}
            </p>
            <div class="space-y-1.5">
              <button
                v-for="item in group.items"
                :key="item.label"
                type="button"
                @click="handleMenuAction(item)"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition"
                :class="
                  item.active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                "
              >
                <span class="material-symbols-outlined text-lg">{{ item.icon }}</span>
                {{ item.label }}
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <div class="flex-1 lg:pl-[280px]">
        <header
          class="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:fixed lg:left-[280px] lg:right-0"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex items-center gap-4">
              <button
                type="button"
                class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
                @click="mobileMenuOpen = true"
              >
                <span class="material-symbols-outlined">menu</span>
              </button>

              <div>
                <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">{{ title }}</h1>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-3">
              <slot name="actions"></slot>

              <button
                type="button"
                class="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600"
              >
                <span class="material-symbols-outlined">notifications</span>
                <span
                  class="absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
                >
                  {{ meta.notificationCount }}
                </span>
              </button>

              <div class="flex items-center gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200">
                  <span class="material-symbols-outlined text-slate-600">person</span>
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">{{ adminSession.full_name }}</p>
                  <p class="text-xs text-slate-500">{{ adminSession.role }}</p>
                </div>
                <span class="material-symbols-outlined text-slate-400">expand_more</span>
              </div>
            </div>
          </div>
        </header>

        <main class="px-4 py-6 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:pt-[112px]">
          <slot></slot>
        </main>
      </div>
    </div>
  </div>
</template>
