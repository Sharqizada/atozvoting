import { createRouter, createWebHistory } from 'vue-router'
import AdminSignIn from '../views/AdminSignIn.vue'
import DashboardView from '../views/DashboardView.vue'
import VotingRoundsView from '../views/VotingRoundsView.vue'
import CategoriesView from '../views/CategoriesView.vue'
import EmployeesView from '../views/EmployeesView.vue'
import VotesView from '../views/VotesView.vue'
import LiveResultsView from '../views/LiveResultsView.vue'
import ReportsView from '../views/ReportsView.vue'
import PastWinnersView from '../views/PastWinnersView.vue'
import AdminsView from '../views/AdminsView.vue'
import SettingsView from '../views/SettingsView.vue'
import AuditLogsView from '../views/AuditLogsView.vue'
import RostersView from '../views/RostersView.vue'
import VotingBoothView from '../views/VotingBoothView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: VotingBoothView,
    },
    {
      path: '/admin',
      redirect: '/admin/dashboard',
    },
    {
      path: '/login',
      name: 'login',
      component: AdminSignIn,
      meta: {
        guestOnly: true,
      },
    },
    {
      path: '/vote',
      name: 'vote',
      redirect: '/',
    },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: DashboardView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/voting-rounds',
      name: 'admin-voting-rounds',
      component: VotingRoundsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/categories',
      name: 'admin-categories',
      component: CategoriesView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/employees',
      name: 'admin-employees',
      component: EmployeesView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/rosters',
      name: 'admin-rosters',
      component: RostersView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/votes',
      name: 'admin-votes',
      component: VotesView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/live-results',
      name: 'admin-live-results',
      component: LiveResultsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/reports',
      name: 'admin-reports',
      component: ReportsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/past-winners',
      name: 'admin-past-winners',
      component: PastWinnersView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/admins',
      name: 'admin-admins',
      component: AdminsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: SettingsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin/audit-logs',
      name: 'admin-audit-logs',
      component: AuditLogsView,
      meta: {
        requiresAuth: true,
      },
    },
  ],
})

router.beforeEach((to) => {
  const adminSession =
    localStorage.getItem('adminSession') || sessionStorage.getItem('adminSession')

  if (to.meta.requiresAuth && !adminSession) {
    return '/login'
  }

  if (to.meta.guestOnly && adminSession) {
    return '/admin/dashboard'
  }

  return true
})

export default router
