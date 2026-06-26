export const getAdminSession = () => {
  const storedSession =
    localStorage.getItem('adminSession') || sessionStorage.getItem('adminSession')

  if (!storedSession) {
    return {
      full_name: 'Admin User',
      role: 'Administrator',
    }
  }

  try {
    return JSON.parse(storedSession)
  } catch {
    return {
      full_name: 'Admin User',
      role: 'Administrator',
    }
  }
}

export const adminNavigationGroups = [
  {
    title: '',
    items: [{ label: 'Dashboard', icon: 'home', route: '/admin/dashboard' }],
  },
  {
    title: 'Voting Management',
    items: [
      { label: 'Voting Rounds', icon: 'calendar_month', route: '/admin/voting-rounds' },
      { label: 'Categories', icon: 'sell', route: '/admin/categories' },
      { label: 'Associates', icon: 'group', route: '/admin/employees' },
      { label: 'Votes', icon: 'bar_chart', route: '/admin/votes' },
    ],
  },
  {
    title: 'Results & Reports',
    items: [
      { label: 'Live Results', icon: 'trophy', route: '/admin/live-results' },
      { label: 'Reports', icon: 'description', route: '/admin/reports' },
      { label: 'Past Winners', icon: 'workspace_premium', route: '/admin/past-winners' },
    ],
  },
  {
    title: 'System Management',
    items: [
      { label: 'Admins', icon: 'admin_panel_settings', route: '/admin/admins' },
      { label: 'Settings', icon: 'settings', route: '/admin/settings' },
      { label: 'Audit Logs', icon: 'history', route: '/admin/audit-logs' },
    ],
  },
  {
    title: 'Other',
    items: [
      { label: 'Help & Support', icon: 'help' },
      { label: 'Logout', icon: 'logout', action: 'logout' },
    ],
  },
]
