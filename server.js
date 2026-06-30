import crypto from 'crypto'
import cors from 'cors'
import express from 'express'
import { existsSync } from 'fs'
import mysql from 'mysql2/promise'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const port = process.env.PORT || 5000
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDistPath = path.join(__dirname, 'dist')
const protectedSuperAdmin = {
  badgeCode: process.env.SUPER_ADMIN_BADGE_CODE || '15357920',
  fullName: process.env.SUPER_ADMIN_FULL_NAME || 'Admin User',
  username: process.env.SUPER_ADMIN_USERNAME || 'admin',
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@inboundstar.com',
  role: process.env.SUPER_ADMIN_ROLE || 'Administrator',
  accessLevel: process.env.SUPER_ADMIN_ACCESS_LEVEL || 'Super Administrator',
  password: process.env.SUPER_ADMIN_PASSWORD || '21322455',
  avatarColor: process.env.SUPER_ADMIN_AVATAR_COLOR || 'bg-slate-950 text-white',
}

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'voting_system',
}
const allowedCorsOrigins = (
  process.env.CORS_ORIGINS || 'https://atozvote.cloud,https://www.atozvote.cloud'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const DEFAULT_SITE_INFO = Object.freeze({
  siteName: 'Inbound Star Voting',
  siteTagline: 'Recognize. Appreciate. Celebrate.',
  siteLogo: '',
  timezone: '(UTC+05:30) Asia/Kolkata',
  dateFormat: 'June 3, 2026',
  timeFormat: '12 Hour (hh:mm AM/PM)',
  currency: 'USD - US Dollar ($)',
})
const DEFAULT_BRANDING_COLORS = Object.freeze({
  primaryColor: '#059669',
  secondaryColor: '#0EA5E9',
  accentColor: '#10B981',
  surfaceColor: '#ECFDF5',
  borderColor: '#A7F3D0',
})
const BRANDING_COLOR_PATTERN = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

let pool

const normalizeBrandingColor = (value, fallback) => {
  const normalized = `${value || ''}`.trim()

  if (!normalized) {
    return fallback
  }

  const candidate = normalized.startsWith('#') ? normalized : `#${normalized}`

  if (!BRANDING_COLOR_PATTERN.test(candidate)) {
    return fallback
  }

  if (candidate.length === 4) {
    return `#${candidate[1]}${candidate[1]}${candidate[2]}${candidate[2]}${candidate[3]}${candidate[3]}`.toUpperCase()
  }

  return candidate.toUpperCase()
}

const getBrandingSettings = (settings = {}) => ({
  primaryColor: normalizeBrandingColor(settings.primary_color, DEFAULT_BRANDING_COLORS.primaryColor),
  secondaryColor: normalizeBrandingColor(settings.secondary_color, DEFAULT_BRANDING_COLORS.secondaryColor),
  accentColor: normalizeBrandingColor(settings.accent_color, DEFAULT_BRANDING_COLORS.accentColor),
  surfaceColor: normalizeBrandingColor(settings.surface_color, DEFAULT_BRANDING_COLORS.surfaceColor),
  borderColor: normalizeBrandingColor(settings.border_color, DEFAULT_BRANDING_COLORS.borderColor),
})

const getPublicBrandingSettings = (settings = {}) => ({
  siteName: settings.site_name || DEFAULT_SITE_INFO.siteName,
  siteTagline: settings.site_tagline || DEFAULT_SITE_INFO.siteTagline,
  siteLogo: settings.site_logo || DEFAULT_SITE_INFO.siteLogo,
  brandingColors: getBrandingSettings(settings),
})
const normalizeRoundResultVisibility = (value, fallback = 'WAITING') => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return ['WAITING', 'VISIBLE', 'HIDDEN'].includes(normalized) ? normalized : fallback
}
const ROSTER_SECTIONS = Object.freeze([
  { key: 'STOW', label: 'Stow' },
  { key: 'QUANTITY_STOW', label: 'Quantity Stow' },
  { key: 'CUBISCAN', label: 'Cubiscan' },
  { key: 'STOW_PG', label: 'Stow PG' },
  { key: 'ISS_WATER_SPIDER', label: 'ISS Water Spider' },
])
const rosterSectionLabelMap = new Map(ROSTER_SECTIONS.map((section) => [section.key, section.label]))
const normalizeRosterSectionKey = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return rosterSectionLabelMap.has(normalized) ? normalized : ''
}
const getRosterSectionLabel = (value) => rosterSectionLabelMap.get(normalizeRosterSectionKey(value)) || ''

const getDefaultSettingEntries = () => [
  ['site_name', 'general', DEFAULT_SITE_INFO.siteName],
  ['site_tagline', 'general', DEFAULT_SITE_INFO.siteTagline],
  ['site_logo', 'general', DEFAULT_SITE_INFO.siteLogo],
  ['timezone', 'general', DEFAULT_SITE_INFO.timezone],
  ['date_format', 'general', DEFAULT_SITE_INFO.dateFormat],
  ['time_format', 'general', DEFAULT_SITE_INFO.timeFormat],
  ['currency', 'general', DEFAULT_SITE_INFO.currency],
  ['primary_color', 'branding', DEFAULT_BRANDING_COLORS.primaryColor],
  ['secondary_color', 'branding', DEFAULT_BRANDING_COLORS.secondaryColor],
  ['accent_color', 'branding', DEFAULT_BRANDING_COLORS.accentColor],
  ['surface_color', 'branding', DEFAULT_BRANDING_COLORS.surfaceColor],
  ['border_color', 'branding', DEFAULT_BRANDING_COLORS.borderColor],
  ['allow_duplicate_voting', 'voting', 'false'],
  ['require_vote_confirmation', 'voting', 'true'],
  ['vote_editing', 'voting', 'true'],
  ['votes_per_user', 'voting', '10'],
  ['live_extension_minutes', 'voting', '15'],
  ['smtp_provider', 'email', 'SendGrid'],
  ['from_email', 'email', 'no-reply@inboundstar.com'],
  ['from_name', 'email', DEFAULT_SITE_INFO.siteName],
  ['version', 'system', 'v2.5.0'],
  ['last_updated', 'system', 'May 31, 2026 10:15 AM'],
  ['backup_frequency', 'system', 'Daily'],
  ['last_backup', 'system', 'June 3, 2026 02:30 AM'],
  ['next_backup', 'system', 'June 4, 2026 02:30 AM'],
  ['password_policy', 'security', 'Strong'],
  ['two_factor_authentication', 'security', 'Enabled'],
  ['session_timeout', 'security', '30 minutes'],
  ['login_attempts_limit', 'security', '5 attempts'],
]

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex')
const numberFormatter = new Intl.NumberFormat('en-US')
const monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const shortDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const formatNumber = (value) => numberFormatter.format(Number(value || 0))
const formatPercent = (value, total, decimals = 2) =>
  total ? `${((Number(value) / Number(total)) * 100).toFixed(decimals)}%` : `0.${'0'.repeat(decimals)}%`
const formatDate = (value) => shortDateFormatter.format(new Date(value))
const formatDateTime = (value) => shortDateTimeFormatter.format(new Date(value))
const formatMonthDay = (value) => monthDayFormatter.format(new Date(value))
const formatLongDate = (value) => longDateFormatter.format(new Date(value))
const formatDurationRange = (startDate, endDate) => `${formatLongDate(startDate)} - ${formatLongDate(endDate)}`
const formatDateValue = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const formatDateTimeValue = (value) => {
  const date = new Date(value)
  return `${formatDateValue(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const formatMySqlDateTime = (value) => {
  const date = new Date(value)
  return `${formatDateValue(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}
const normalizeVotingRoundDateInput = (value, boundary = 'start') => {
  const trimmed = `${value || ''}`.trim()

  if (!trimmed) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${boundary === 'end' ? '23:59:59' : '00:00:00'}`
  }

  const normalizedValue = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return formatMySqlDateTime(parsedDate)
}
const formatDateLabel = (value) => {
  const date = new Date(value)
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`
}
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const buildWidthClass = (percent) => {
  const rounded = Math.round(clamp(percent))

  if (rounded <= 0) return 'w-0'
  if (rounded >= 100) return 'w-full'

  return `w-[${rounded}%]`
}
const getInitials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

const sanitizeImageData = (value, label = 'Image', maxLength = 2_000_000) => {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (!normalized) {
    return null
  }

  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(normalized)) {
    return null
  }

  if (normalized.length > maxLength) {
    throw new Error(`${label} is too large.`)
  }

  return normalized
}
const sanitizePhotoData = (value) => sanitizeImageData(value, 'Associate photo')
const sanitizeSiteLogoData = (value) => sanitizeImageData(value, 'Site logo', 1_500_000)

const parseIdList = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0))]
}

const generateFiveDigitCode = () => `${crypto.randomInt(10000, 100000)}`

const statusClassMap = {
  ACTIVE: 'bg-emerald-100 text-emerald-600',
  UPCOMING: 'bg-blue-100 text-blue-600',
  COMPLETED: 'bg-slate-100 text-slate-500',
  ACTIVE_EMPLOYEE: 'bg-emerald-100 text-emerald-600',
  INACTIVE_EMPLOYEE: 'bg-rose-100 text-rose-600',
  ACTIVE_ADMIN: 'bg-emerald-100 text-emerald-600',
  INACTIVE_ADMIN: 'bg-rose-100 text-rose-600',
  VALID: 'bg-emerald-100 text-emerald-600',
  INVALID: 'bg-rose-100 text-rose-600',
  SUCCESS: 'bg-emerald-100 text-emerald-600',
  WARNING: 'bg-amber-100 text-amber-600',
  FAILED: 'bg-rose-100 text-rose-600',
}

const categoryDisplayConfig = {
  'Best Stower': {
    icon: 'emoji_events',
    iconPanel: 'bg-blue-50 text-blue-600',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-600',
  },
  'Best Problem Solver': {
    icon: 'lightbulb',
    iconPanel: 'bg-emerald-50 text-emerald-600',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-600',
  },
  'Best Water Spider': {
    icon: 'shopping_cart',
    iconPanel: 'bg-amber-50 text-amber-600',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-600',
  },
  'Best Team Support': {
    icon: 'groups',
    iconPanel: 'bg-violet-50 text-violet-600',
    dot: 'bg-violet-500',
    chip: 'bg-violet-100 text-violet-600',
  },
  'Best Safety Focused': {
    icon: 'shield',
    iconPanel: 'bg-rose-50 text-rose-600',
    dot: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-600',
  },
}

const reportColorByIndex = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500']

const employeeSeedNames = [
  'John Smith',
  'Sarah Johnson',
  'Michael Brown',
  'Emily Davis',
  'David Wilson',
  'Robert Martinez',
  'Jessica Lee',
  'Daniel Garcia',
  'James Taylor',
  'Emma Thomas',
  'Liam Anderson',
  'Olivia Martinez',
  'Noah Jackson',
  'Michael Johnson',
  'Sarah Davis',
  'Chris Miller',
  'Amanda Thomas',
  'Brian Moore',
  'Matthew Wilson',
  'Kevin Lee',
]

const activeRoundVotePlan = {
  'Best Stower': {
    valid: [
      ['John Smith', 36],
      ['Michael Brown', 24],
      ['David Wilson', 18],
      ['Sarah Johnson', 12],
      ['Robert Martinez', 6],
      ['Emily Davis', 4],
    ],
    invalid: [
      ['John Smith', 2],
    ],
  },
  'Best Problem Solver': {
    valid: [
      ['Sarah Davis', 28],
      ['James Taylor', 18],
      ['Michael Johnson', 12],
      ['Emma Thomas', 10],
      ['Olivia Martinez', 9],
    ],
    invalid: [
      ['Sarah Davis', 1],
    ],
  },
  'Best Water Spider': {
    valid: [
      ['Daniel Garcia', 20],
      ['Robert Martinez', 12],
      ['Liam Anderson', 10],
      ['Noah Jackson', 7],
      ['Jessica Lee', 6],
    ],
    invalid: [
      ['Daniel Garcia', 1],
    ],
  },
  'Best Team Support': {
    valid: [
      ['Jessica Lee', 12],
      ['Emily Davis', 8],
      ['Emma Thomas', 5],
      ['Olivia Martinez', 3],
      ['Sarah Johnson', 2],
    ],
    invalid: [],
  },
  'Best Safety Focused': {
    valid: [
      ['Michael Brown', 5],
      ['Sarah Johnson', 4],
      ['John Smith', 3],
      ['Robert Martinez', 3],
      ['Noah Jackson', 2],
    ],
    invalid: [
      ['Michael Brown', 1],
    ],
  },
}

const completedRoundVotePlan = {
  'Best Stower': {
    valid: [
      ['John Smith', 48],
      ['Michael Brown', 36],
      ['David Wilson', 24],
      ['Sarah Johnson', 12],
      ['Robert Martinez', 8],
    ],
    invalid: [],
  },
  'Best Problem Solver': {
    valid: [
      ['Sarah Davis', 24],
      ['James Taylor', 14],
      ['Michael Johnson', 10],
      ['Emma Thomas', 7],
      ['Olivia Martinez', 5],
    ],
    invalid: [],
  },
  'Best Water Spider': {
    valid: [
      ['Daniel Garcia', 16],
      ['Robert Martinez', 10],
      ['Liam Anderson', 8],
      ['Noah Jackson', 4],
      ['Jessica Lee', 2],
    ],
    invalid: [],
  },
  'Best Team Support': {
    valid: [
      ['Jessica Lee', 12],
      ['Emily Davis', 8],
      ['Emma Thomas', 6],
      ['Olivia Martinez', 4],
      ['Sarah Johnson', 2],
    ],
    invalid: [],
  },
  'Best Safety Focused': {
    valid: [
      ['Michael Brown', 9],
      ['Sarah Johnson', 6],
      ['John Smith', 4],
      ['Robert Martinez', 3],
      ['Noah Jackson', 2],
    ],
    invalid: [],
  },
}

const baseAuditTemplates = [
  ['Admin', 'Super Administrator', 'Updated Voting Round', 'Round: Q2 2026 Voting', 'Voting Rounds', 'Changed start date from May 1 to May 3, 2026', '192.168.1.10', 'Success', 'link'],
  ['James Miller', 'Administrator', 'Added New Category', 'Best Problem Solver', 'Categories', 'Category "Best Problem Solver" created', '192.168.1.14', 'Success', 'add_circle'],
  ['Sarah Roberts', 'Administrator', 'Deleted Associate', 'Associate ID: EMP-1024', 'Associates', 'Associate "John Doe" was deleted', '192.168.1.26', 'Warning', 'delete'],
  ['David Wilson', 'Manager', 'Exported Report', 'Live Results Report', 'Reports', 'Exported live results in CSV format', '192.168.1.18', 'Success', 'download'],
  ['Lisa Parker', 'Manager', 'Updated Voting Settings', 'Votes per user', 'Settings', 'Changed votes per user from 5 to 10', '192.168.1.22', 'Success', 'settings'],
  ['Nancy Brown', 'Viewer', 'Failed Login Attempt', 'Invalid password', 'Authentication', 'Incorrect password entered', '203.0.113.45', 'Failed', 'lock'],
  ['Admin', 'Super Administrator', 'Bulk Import Associates', 'File: associates_may28.xlsx', 'Associates', 'Imported 45 associates', '192.168.1.10', 'Success', 'upload'],
  ['James Miller', 'Administrator', 'Updated Admin Role', 'User: Lisa Parker', 'Admins', 'Changed role from Manager to Administrator', '192.168.1.14', 'Success', 'workspace_premium'],
  ['Sarah Roberts', 'Administrator', 'Changed Round Status', 'Q2 2026 Voting', 'Voting Rounds', 'Status changed from Draft to Active', '192.168.1.26', 'Success', 'autorenew'],
  ['David Wilson', 'Manager', 'Attempted Unauthorized Access', 'Admin Settings', 'Settings', 'User does not have permission', '203.0.113.45', 'Failed', 'gpp_bad'],
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        callback(null, true)
        return
      }

      if (allowedCorsOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '5mb' }))
app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ message: 'Request payload is too large.' })
  }

  next(error)
})

const queryWith = async (runner, sql, params = []) => {
  const [rows] = await runner.query(sql, params)
  return rows
}

const executeWith = async (runner, sql, params = []) => {
  const [result] = await runner.query(sql, params)
  return result
}

const query = async (sql, params = []) => queryWith(pool, sql, params)

const execute = async (sql, params = []) => executeWith(pool, sql, params)

const getTableCount = async (tableName) => {
  const rows = await query(`SELECT COUNT(*) AS total FROM ${tableName}`)
  return Number(rows[0]?.total || 0)
}

const isSeedRequired = async (tableName) => (await getTableCount(tableName)) === 0

const ensureColumn = async (tableName, columnDefinition) => {
  try {
    await execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`)
  } catch (error) {
    if (!`${error.message}`.toLowerCase().includes('duplicate column')) {
      throw error
    }
  }
}

const chunkInsert = async (sql, rows, chunkSize = 500, runner = pool) => {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    await runner.query(sql, [chunk])
  }
}

const createDatabaseIfNeeded = async () => {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  })

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``)
  await connection.end()
}

const createSchema = async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      badge_code VARCHAR(50) NOT NULL UNIQUE,
      full_name VARCHAR(120) NOT NULL,
      username VARCHAR(80) NULL,
      email VARCHAR(160) NULL,
      role VARCHAR(80) NOT NULL DEFAULT 'Administrator',
      access_level VARCHAR(80) NOT NULL DEFAULT 'Administrator',
      password_hash CHAR(64) NOT NULL,
      avatar_color VARCHAR(80) DEFAULT 'bg-slate-950 text-white',
      last_login DATETIME NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await ensureColumn('admins', "username VARCHAR(80) NULL AFTER full_name")
  await ensureColumn('admins', "email VARCHAR(160) NULL AFTER username")
  await ensureColumn('admins', "access_level VARCHAR(80) NOT NULL DEFAULT 'Administrator' AFTER role")
  await ensureColumn('admins', "avatar_color VARCHAR(80) DEFAULT 'bg-slate-950 text-white' AFTER password_hash")
  await ensureColumn('admins', "last_login DATETIME NULL AFTER avatar_color")

  await execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      description TEXT NOT NULL,
      icon VARCHAR(80) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by_admin_id INT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      badge_id VARCHAR(50) NOT NULL UNIQUE,
      full_name VARCHAR(120) NOT NULL,
      department_name VARCHAR(120) NOT NULL,
      role_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      photo_data LONGTEXT NULL,
      employment_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      join_date DATE NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await ensureColumn('employees', 'photo_data LONGTEXT NULL AFTER email')

  await execute(`
    CREATE TABLE IF NOT EXISTS voting_rounds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(140) NOT NULL UNIQUE,
      description TEXT NULL,
      access_code VARCHAR(5) NOT NULL UNIQUE,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL,
      participant_count INT NOT NULL DEFAULT 0,
      total_votes INT NOT NULL DEFAULT 0,
      valid_votes INT NOT NULL DEFAULT 0,
      invalid_votes INT NOT NULL DEFAULT 0,
      winners_published TINYINT(1) NOT NULL DEFAULT 0,
      result_visibility VARCHAR(20) NOT NULL DEFAULT 'WAITING',
      created_by_admin_id INT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await ensureColumn('voting_rounds', 'description TEXT NULL AFTER name')
  await ensureColumn('voting_rounds', "access_code VARCHAR(5) NOT NULL UNIQUE AFTER name")
  await ensureColumn('voting_rounds', 'winners_published TINYINT(1) NOT NULL DEFAULT 0 AFTER invalid_votes')
  await ensureColumn('voting_rounds', "result_visibility VARCHAR(20) NOT NULL DEFAULT 'WAITING' AFTER winners_published")

  await execute(`
    CREATE TABLE IF NOT EXISTS voting_round_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      voting_round_id INT NOT NULL,
      category_id INT NOT NULL,
      UNIQUE KEY unique_round_category (voting_round_id, category_id)
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS voting_round_participants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      voting_round_id INT NOT NULL,
      employee_id INT NOT NULL,
      UNIQUE KEY unique_round_participant (voting_round_id, employee_id)
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      voting_round_id INT NOT NULL,
      voter_employee_id INT NOT NULL,
      candidate_employee_id INT NOT NULL,
      category_id INT NOT NULL,
      vote_status VARCHAR(20) NOT NULL DEFAULT 'Valid',
      is_valid TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS rosters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      description TEXT NULL,
      home_visibility TINYINT(1) NOT NULL DEFAULT 0,
      created_by_admin_id INT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS roster_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      roster_id INT NOT NULL,
      employee_id INT NOT NULL,
      section_key VARCHAR(40) NOT NULL,
      UNIQUE KEY unique_roster_assignment (roster_id, employee_id)
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(120) PRIMARY KEY,
      setting_group VARCHAR(80) NOT NULL,
      setting_value LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_name VARCHAR(120) NOT NULL,
      user_role VARCHAR(80) NOT NULL,
      action_title VARCHAR(160) NOT NULL,
      action_subject VARCHAR(160) NOT NULL,
      module_name VARCHAR(80) NOT NULL,
      details TEXT NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      status VARCHAR(20) NOT NULL,
      icon VARCHAR(80) NOT NULL,
      created_at DATETIME NOT NULL
    )
  `)
}

const seedAdmins = async () => {
  await execute(
    `
      INSERT INTO admins
      (badge_code, full_name, username, email, role, access_level, password_hash, avatar_color, last_login, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        username = VALUES(username),
        email = VALUES(email),
        role = VALUES(role),
        access_level = VALUES(access_level),
        password_hash = VALUES(password_hash),
        avatar_color = VALUES(avatar_color),
        is_active = VALUES(is_active)
    `,
    [
      protectedSuperAdmin.badgeCode,
      protectedSuperAdmin.fullName,
      protectedSuperAdmin.username,
      protectedSuperAdmin.email,
      protectedSuperAdmin.role,
      protectedSuperAdmin.accessLevel,
      hashPassword(protectedSuperAdmin.password),
      protectedSuperAdmin.avatarColor,
    ],
  )
}

const seedCategories = async () => {
  if (!(await isSeedRequired('categories'))) {
    return
  }

  const createdAt = '2026-05-10 10:15:00'
  const categories = [
    ['Best Stower', 'Recognizes the associate who consistently stows with speed, accuracy and quality.', 'emoji_events', 1, 1, createdAt],
    ['Best Problem Solver', 'Awarded to the associate who solves problems quickly and effectively.', 'lightbulb', 1, 1, '2026-05-10 10:16:00'],
    ['Best Water Spider', 'Honors the Water Spider who supports the team and keeps workflow smooth.', 'shopping_cart', 1, 1, '2026-05-10 10:17:00'],
    ['Best Team Support', 'For the associate who is always helpful, positive and supports teammates.', 'groups', 1, 1, '2026-05-10 10:18:00'],
    ['Best Safety Focused', 'Recognizes the associate who follows safety rules and promotes a safe workplace.', 'shield', 1, 1, '2026-05-10 10:19:00'],
  ]

  await chunkInsert(
    `
      INSERT INTO categories
      (name, description, icon, is_active, created_by_admin_id, created_at)
      VALUES ?
    `,
    categories,
  )
}

const seedEmployees = async () => {
  if (!(await isSeedRequired('employees'))) {
    return
  }

  const roleCycle = ['Stower', 'Problem Solver', 'Water Spider', 'Team Support', 'Safety Focused']
  const employees = []

  for (let index = 0; index < 152; index += 1) {
    const number = index + 1
    const baseName = employeeSeedNames[index] || `Employee ${String(number).padStart(3, '0')}`
    const badgeId = `${1234500 + number}`
    const roleName = roleCycle[index % roleCycle.length]
    const status = number <= 148 ? 'ACTIVE' : 'INACTIVE'
    const joinDate = new Date(2024, 0, 1 + index * 4)
    const month = String(joinDate.getMonth() + 1).padStart(2, '0')
    const day = String(joinDate.getDate()).padStart(2, '0')
    const dateLabel = `${joinDate.getFullYear()}-${month}-${day}`
    const emailName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '')

    employees.push([
      badgeId,
      baseName,
      'Inbound Stow',
      roleName,
      `${emailName}@amazon.com`,
      status,
      dateLabel,
      `${dateLabel} 09:00:00`,
    ])
  }

  await chunkInsert(
    `
      INSERT INTO employees
      (badge_id, full_name, department_name, role_name, email, employment_status, join_date, created_at)
      VALUES ?
    `,
    employees,
  )
}

const seedVotingRounds = async () => {
  if (!(await isSeedRequired('voting_rounds'))) {
    return
  }

  const rounds = [
    ['June 2026 Voting', '2026-06-01 00:00:00', '2026-06-15 23:59:00', 'ACTIVE', 128, 284, 279, 5, 1, '2026-05-28 10:30:00'],
    ['July 2026 Voting', '2026-07-01 00:00:00', '2026-07-15 23:59:00', 'UPCOMING', 0, 0, 0, 0, 1, '2026-05-29 09:15:00'],
    ['Q3 2026 Voting', '2026-07-16 00:00:00', '2026-07-31 23:59:00', 'UPCOMING', 0, 0, 0, 0, 1, '2026-05-29 09:20:00'],
    ['May 2026 Voting', '2026-05-01 00:00:00', '2026-05-31 23:59:00', 'COMPLETED', 128, 284, 284, 0, 1, '2026-04-30 14:45:00'],
    ['April 2026 Voting', '2026-04-01 00:00:00', '2026-04-15 23:59:00', 'COMPLETED', 145, 298, 292, 6, 1, '2026-03-31 11:10:00'],
    ['March 2026 Voting', '2026-03-01 00:00:00', '2026-03-31 23:59:00', 'COMPLETED', 140, 320, 314, 6, 1, '2026-02-28 09:30:00'],
    ['February 2026 Voting', '2026-02-01 00:00:00', '2026-02-28 23:59:00', 'COMPLETED', 138, 310, 304, 6, 1, '2026-01-31 12:00:00'],
    ['January 2026 Voting', '2026-01-01 00:00:00', '2026-01-31 23:59:00', 'COMPLETED', 136, 305, 300, 5, 1, '2025-12-31 12:00:00'],
    ['December 2025 Voting', '2025-12-01 00:00:00', '2025-12-31 23:59:00', 'COMPLETED', 133, 298, 292, 6, 1, '2025-11-30 12:00:00'],
    ['November 2025 Voting', '2025-11-01 00:00:00', '2025-11-30 23:59:00', 'COMPLETED', 132, 290, 284, 6, 1, '2025-10-31 12:00:00'],
    ['October 2025 Voting', '2025-10-01 00:00:00', '2025-10-31 23:59:00', 'COMPLETED', 129, 279, 274, 5, 1, '2025-09-30 12:00:00'],
    ['September 2025 Voting', '2025-09-01 00:00:00', '2025-09-30 23:59:00', 'COMPLETED', 128, 400, 390, 10, 1, '2025-08-31 12:00:00'],
  ]

  await chunkInsert(
    `
      INSERT INTO voting_rounds
      (name, start_date, end_date, status, participant_count, total_votes, valid_votes, invalid_votes, created_by_admin_id, created_at)
      VALUES ?
    `,
    rounds,
  )
}

const seedRoundCategories = async () => {
  if (!(await isSeedRequired('voting_round_categories'))) {
    return
  }

  const rounds = await query('SELECT id FROM voting_rounds ORDER BY id')
  const categories = await query('SELECT id FROM categories ORDER BY id')
  const mappings = []

  rounds.forEach((round) => {
    categories.forEach((category) => {
      mappings.push([round.id, category.id])
    })
  })

  await chunkInsert(
    `
      INSERT INTO voting_round_categories
      (voting_round_id, category_id)
      VALUES ?
    `,
    mappings,
  )
}

const seedVotesForRound = async (roundName, votePlan, options = {}) => {
  const round = await query('SELECT id, start_date FROM voting_rounds WHERE name = ? LIMIT 1', [roundName])
  const existingVotes = await query('SELECT COUNT(*) AS total FROM votes WHERE voting_round_id = ?', [round[0].id])

  if (Number(existingVotes[0]?.total || 0) > 0) {
    return
  }

  const categories = await query('SELECT id, name FROM categories')
  const employees = await query('SELECT id, full_name FROM employees ORDER BY id')
  const categoryMap = Object.fromEntries(categories.map((row) => [row.name, row.id]))
  const employeeMap = Object.fromEntries(employees.map((row) => [row.full_name, row.id]))
  const voterPool = employees.slice(0, options.participantCount || 128).map((row) => row.id)
  const voteRows = []
  let voterIndex = 0
  let minuteOffset = 0

  for (const [categoryName, plan] of Object.entries(votePlan)) {
    const categoryId = categoryMap[categoryName]

    for (const [candidateName, count] of plan.valid) {
      for (let index = 0; index < count; index += 1) {
        const createdAt = new Date(round[0].start_date)
        createdAt.setDate(createdAt.getDate() + Math.floor(minuteOffset / 90))
        createdAt.setHours(9 + (minuteOffset % 6), (minuteOffset * 3) % 60, 0, 0)

        voteRows.push([
          round[0].id,
          voterPool[voterIndex % voterPool.length],
          employeeMap[candidateName],
          categoryId,
          'Valid',
          1,
          createdAt.toISOString().slice(0, 19).replace('T', ' '),
        ])

        voterIndex += 1
        minuteOffset += 1
      }
    }

    for (const [candidateName, count] of plan.invalid) {
      for (let index = 0; index < count; index += 1) {
        const createdAt = new Date(round[0].start_date)
        createdAt.setDate(createdAt.getDate() + Math.floor(minuteOffset / 90))
        createdAt.setHours(9 + (minuteOffset % 6), (minuteOffset * 3) % 60, 0, 0)

        voteRows.push([
          round[0].id,
          voterPool[voterIndex % voterPool.length],
          employeeMap[candidateName],
          categoryId,
          'Invalid',
          0,
          createdAt.toISOString().slice(0, 19).replace('T', ' '),
        ])

        voterIndex += 1
        minuteOffset += 1
      }
    }
  }

  await chunkInsert(
    `
      INSERT INTO votes
      (voting_round_id, voter_employee_id, candidate_employee_id, category_id, vote_status, is_valid, created_at)
      VALUES ?
    `,
    voteRows,
  )
}

const seedSettings = async () => {
  if (!(await isSeedRequired('app_settings'))) {
    return
  }

  await chunkInsert(
    `
      INSERT INTO app_settings
      (setting_key, setting_group, setting_value)
      VALUES ?
    `,
    getDefaultSettingEntries(),
  )
}

const seedAuditLogs = async () => {
  if (!(await isSeedRequired('audit_logs'))) {
    return
  }

  const rows = []
  const statusTargets = {
    Success: 1984,
    Warning: 421,
    Failed: 132,
  }
  const counters = {
    Success: 0,
    Warning: 0,
    Failed: 0,
  }

  const pushLog = (template, date) => {
    rows.push([
      template[0],
      template[1],
      template[2],
      template[3],
      template[4],
      template[5],
      template[6],
      template[7],
      template[8],
      date.toISOString().slice(0, 19).replace('T', ' '),
    ])
  }

  let createdIndex = 0
  while (rows.length < 2537) {
    for (const template of baseAuditTemplates) {
      const status = template[7]

      if (counters[status] >= statusTargets[status]) {
        continue
      }

      const date = new Date('2026-05-31T10:15:00')
      date.setMinutes(date.getMinutes() - createdIndex * 37)
      pushLog(template, date)
      counters[status] += 1
      createdIndex += 1

      if (rows.length >= 2537) {
        break
      }
    }
  }

  await chunkInsert(
    `
      INSERT INTO audit_logs
      (user_name, user_role, action_title, action_subject, module_name, details, ip_address, status, icon, created_at)
      VALUES ?
    `,
    rows,
  )
}

const initializeDatabase = async () => {
  await createDatabaseIfNeeded()

  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
  })

  await createSchema()
  await seedAdmins()
  await seedSettings()
  await ensureSettingDefaults(getDefaultSettingEntries())
  await ensureRoundAccessCodes()
}

const getSettingMap = async () => {
  const rows = await query('SELECT setting_key, setting_value FROM app_settings')
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]))
}

const ensureSettingDefaults = async (entries) => {
  for (const [settingKey, settingGroup, settingValue] of entries) {
    await execute(
      `
        INSERT IGNORE INTO app_settings (setting_key, setting_group, setting_value)
        VALUES (?, ?, ?)
      `,
      [settingKey, settingGroup, settingValue],
    )
  }
}

const getUniqueRoundAccessCode = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const accessCode = generateFiveDigitCode()
    const rows = await query('SELECT id FROM voting_rounds WHERE access_code = ? LIMIT 1', [accessCode])

    if (!rows.length) {
      return accessCode
    }
  }

  throw new Error('Unable to generate a unique voting round ID.')
}

const ensureRoundAccessCodes = async () => {
  const rounds = await query('SELECT id, access_code FROM voting_rounds')

  for (const round of rounds) {
    if (`${round.access_code || ''}`.trim()) {
      continue
    }

    const accessCode = await getUniqueRoundAccessCode()
    await execute('UPDATE voting_rounds SET access_code = ? WHERE id = ?', [accessCode, round.id])
  }
}

const getActiveCategories = async (runner = pool) =>
  queryWith(
    runner,
    `
      SELECT id, name
      FROM categories
      WHERE is_active = 1
      ORDER BY name ASC
    `,
  )

const syncRoundCategories = async (roundId, categoryIds = null, runner = pool) => {
  await executeWith(runner, 'DELETE FROM voting_round_categories WHERE voting_round_id = ?', [roundId])

  const categories = categoryIds === null
    ? await getActiveCategories(runner)
    : parseIdList(categoryIds).map((categoryId) => ({ id: categoryId }))

  if (!categories.length) {
    return
  }

  await chunkInsert(
    `
      INSERT INTO voting_round_categories (voting_round_id, category_id)
      VALUES ?
    `,
    categories.map((category) => [roundId, category.id]),
    500,
    runner,
  )
}

const syncAllRoundCategories = async () => {
  const rounds = await query('SELECT id FROM voting_rounds')

  for (const round of rounds) {
    await syncRoundCategories(round.id)
  }
}

const syncRoundParticipants = async (roundId, participantIds, runner = pool) => {
  await executeWith(runner, 'DELETE FROM voting_round_participants WHERE voting_round_id = ?', [roundId])

  if (!participantIds.length) {
    await executeWith(runner, 'UPDATE voting_rounds SET participant_count = 0 WHERE id = ?', [roundId])
    return
  }

  await chunkInsert(
    `
      INSERT INTO voting_round_participants (voting_round_id, employee_id)
      VALUES ?
    `,
    participantIds.map((employeeId) => [roundId, employeeId]),
    500,
    runner,
  )

  await executeWith(runner, 'UPDATE voting_rounds SET participant_count = ? WHERE id = ?', [participantIds.length, roundId])
}

const recalculateRoundStats = async (roundId) => {
  const stats = await query(
    `
      SELECT
        COUNT(*) AS total_votes,
        SUM(is_valid = 1) AS valid_votes,
        SUM(is_valid = 0) AS invalid_votes
      FROM votes
      WHERE voting_round_id = ?
    `,
    [roundId],
  )

  const participantCountRows = await query(
    `
      SELECT COUNT(*) AS participant_count
      FROM voting_round_participants
      WHERE voting_round_id = ?
    `,
    [roundId],
  )

  await execute(
    `
      UPDATE voting_rounds
      SET participant_count = ?, total_votes = ?, valid_votes = ?, invalid_votes = ?
      WHERE id = ?
    `,
    [
      Number(participantCountRows[0]?.participant_count || 0),
      Number(stats[0]?.total_votes || 0),
      Number(stats[0]?.valid_votes || 0),
      Number(stats[0]?.invalid_votes || 0),
      roundId,
    ],
  )
}

const getRoundVotes = async (roundId) =>
  query(
    `
      SELECT
        votes.id,
        votes.vote_status,
        votes.is_valid,
        votes.created_at,
        voter.badge_id AS voter_badge_id,
        voter.full_name AS voter_name,
        candidate.badge_id AS candidate_badge_id,
        candidate.full_name AS candidate_name,
        categories.name AS category_name
      FROM votes
      INNER JOIN employees AS voter ON voter.id = votes.voter_employee_id
      INNER JOIN employees AS candidate ON candidate.id = votes.candidate_employee_id
      INNER JOIN categories ON categories.id = votes.category_id
      WHERE votes.voting_round_id = ?
      ORDER BY votes.created_at ASC, votes.id ASC
    `,
    [roundId],
  )

const aggregateVotesByCategory = (votes) => {
  const categoryMap = new Map()

  votes.forEach((vote) => {
    if (!categoryMap.has(vote.category_name)) {
      categoryMap.set(vote.category_name, {
        category: vote.category_name,
        totalVotes: 0,
        validVotes: 0,
        invalidVotes: 0,
        distinctVoters: new Set(),
        candidates: new Map(),
      })
    }

    const entry = categoryMap.get(vote.category_name)
    entry.totalVotes += 1
    entry.validVotes += vote.is_valid ? 1 : 0
    entry.invalidVotes += vote.is_valid ? 0 : 1
    entry.distinctVoters.add(vote.voter_badge_id)

    if (vote.is_valid) {
      const candidateKey = `${vote.candidate_name}|${vote.candidate_badge_id}`
      if (!entry.candidates.has(candidateKey)) {
        entry.candidates.set(candidateKey, {
          name: vote.candidate_name,
          badge: vote.candidate_badge_id,
          votes: 0,
        })
      }

      entry.candidates.get(candidateKey).votes += 1
    }
  })

  return Array.from(categoryMap.values()).map((entry) => ({
    ...entry,
    distinctVoters: entry.distinctVoters.size,
    candidates: Array.from(entry.candidates.values()).sort((left, right) => right.votes - left.votes),
  }))
}

const aggregateCandidateTotals = (votes) => {
  const totals = new Map()

  votes
    .filter((vote) => vote.is_valid)
    .forEach((vote) => {
      const key = `${vote.candidate_name}|${vote.candidate_badge_id}`

      if (!totals.has(key)) {
        totals.set(key, {
          name: vote.candidate_name,
          badge: vote.candidate_badge_id,
          votes: 0,
        })
      }

      totals.get(key).votes += 1
    })

  return Array.from(totals.values()).sort((left, right) => right.votes - left.votes)
}

const buildTimelinePoints = (votes) => {
  const totalVotes = votes.length
  const dayTotals = new Map()

  votes.forEach((vote) => {
    const dayKey = formatMonthDay(vote.created_at)
    dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + 1)
  })

  let runningTotal = 0
  const labels = Array.from(dayTotals.entries()).map(([day, count]) => {
    runningTotal += count
    return {
      day,
      value: runningTotal,
    }
  })

  return labels.map((entry, index) => ({
    ...entry,
    left: `${2 + index * (94 / Math.max(1, labels.length - 1))}%`,
    bottom: `${Math.max(8, Math.round((entry.value / Math.max(1, totalVotes)) * 100))}%`,
  }))
}

const getRoleClass = (role) =>
  ({
    'Super Administrator': 'bg-violet-100 text-violet-600',
    Administrator: 'bg-blue-100 text-blue-600',
    Manager: 'bg-amber-100 text-amber-600',
    Viewer: 'bg-slate-100 text-slate-500',
  })[role] || 'bg-slate-100 text-slate-500'

const getModuleClass = (moduleName) =>
  ({
    'Voting Rounds': 'bg-blue-100 text-blue-600',
    Categories: 'bg-emerald-100 text-emerald-600',
    Associates: 'bg-violet-100 text-violet-600',
    Employees: 'bg-violet-100 text-violet-600',
    Reports: 'bg-amber-100 text-amber-600',
    Settings: 'bg-slate-100 text-slate-500',
    Authentication: 'bg-rose-100 text-rose-600',
    Admins: 'bg-indigo-100 text-indigo-600',
  })[moduleName] || 'bg-slate-100 text-slate-500'

const completeExpiredVotingRounds = async () => {
  await execute(
    `
      UPDATE voting_rounds
      SET status = 'COMPLETED', updated_at = NOW()
      WHERE status = 'ACTIVE' AND end_date <= NOW()
    `,
  )
}

const getActiveRound = async () => {
  await completeExpiredVotingRounds()

  const rounds = await query(
    `
      SELECT voting_rounds.*, admins.full_name AS creator_name
      FROM voting_rounds
      LEFT JOIN admins ON admins.id = voting_rounds.created_by_admin_id
      WHERE voting_rounds.status = 'ACTIVE'
      ORDER BY voting_rounds.start_date ASC
      LIMIT 1
    `,
  )

  return rounds[0]
}

const getVotingRoundById = async (roundId, runner = pool) => {
  const rows = await queryWith(
    runner,
    `
      SELECT voting_rounds.*, admins.full_name AS creator_name
      FROM voting_rounds
      LEFT JOIN admins ON admins.id = voting_rounds.created_by_admin_id
      WHERE voting_rounds.id = ?
      LIMIT 1
    `,
    [roundId],
  )

  return rows[0]
}

const activateVotingRound = async (roundId, runner = pool) => {
  const round = await getVotingRoundById(roundId, runner)

  if (!round) {
    throw new Error('Voting round not found.')
  }

  if (round.status === 'COMPLETED') {
    throw new Error('Completed voting rounds cannot be made live.')
  }

  await executeWith(
    runner,
    `
      UPDATE voting_rounds
      SET status = 'UPCOMING', updated_at = NOW()
      WHERE status = 'ACTIVE' AND id <> ?
    `,
    [roundId],
  )

  await executeWith(
    runner,
    `
      UPDATE voting_rounds
      SET status = 'ACTIVE', updated_at = NOW()
      WHERE id = ?
    `,
    [roundId],
  )
}

const stopVotingRound = async (roundId) => {
  const round = await getVotingRoundById(roundId)

  if (!round) {
    throw new Error('Voting round not found.')
  }

  if (round.status !== 'ACTIVE') {
    throw new Error('Only a live voting round can be stopped.')
  }

  await execute(
    `
      UPDATE voting_rounds
      SET status = 'UPCOMING', updated_at = NOW()
      WHERE id = ?
    `,
    [roundId],
  )
}

const completeVotingRound = async (roundId) => {
  const round = await getVotingRoundById(roundId)

  if (!round) {
    throw new Error('Voting round not found.')
  }

  if (round.status !== 'ACTIVE') {
    throw new Error('Only a live voting round can be ended early.')
  }

  await execute(
    `
      UPDATE voting_rounds
      SET status = 'COMPLETED', end_date = NOW(), winners_published = 0, result_visibility = 'WAITING', updated_at = NOW()
      WHERE id = ?
    `,
    [roundId],
  )
}

const extendLiveVotingRound = async (roundId) => {
  const round = await getVotingRoundById(roundId)

  if (!round) {
    throw new Error('Voting round not found.')
  }

  if (round.status !== 'ACTIVE') {
    throw new Error('Only a live voting round can be extended.')
  }

  const settings = await getSettingMap()
  const extensionMinutes = Math.max(1, Number(settings.live_extension_minutes || 15))
  const currentEndDate = new Date(round.end_date)
  const baselineDate = currentEndDate > new Date() ? currentEndDate : new Date()
  const updatedEndDate = new Date(baselineDate.getTime() + extensionMinutes * 60 * 1000)

  await execute(
    `
      UPDATE voting_rounds
      SET end_date = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [updatedEndDate, roundId],
  )

  return {
    extensionMinutes,
    updatedEndDate,
  }
}

const getLatestCompletedRound = async () => {
  const rounds = await query(
    `
      SELECT voting_rounds.*, admins.full_name AS creator_name
      FROM voting_rounds
      LEFT JOIN admins ON admins.id = voting_rounds.created_by_admin_id
      WHERE voting_rounds.status = 'COMPLETED'
      ORDER BY voting_rounds.start_date DESC
      LIMIT 1
    `,
  )

  return rounds[0]
}

const getLatestPublishedWinnerRound = async () => {
  const rounds = await query(
    `
      SELECT voting_rounds.*, admins.full_name AS creator_name
      FROM voting_rounds
      LEFT JOIN admins ON admins.id = voting_rounds.created_by_admin_id
      WHERE voting_rounds.status = 'COMPLETED' AND voting_rounds.winners_published = 1
      ORDER BY voting_rounds.end_date DESC, voting_rounds.id DESC
      LIMIT 1
    `,
  )

  return rounds[0]
}

const getRoundWinnerPreview = async (roundId) => {
  const round = await getVotingRoundById(roundId)

  if (!round) {
    throw new Error('Voting round not found.')
  }

  const votes = await getRoundVotes(roundId)
  const validVotes = votes.filter((vote) => vote.is_valid).length
  const winnerTotals = aggregateCandidateTotals(votes).slice(0, 3)
  const winnerCategoryMap = votes
    .filter((vote) => vote.is_valid)
    .reduce((accumulator, vote) => {
      const candidateKey = `${vote.candidate_name}|${vote.candidate_badge_id}`

      if (!accumulator.has(candidateKey)) {
        accumulator.set(candidateKey, new Set())
      }

      accumulator.get(candidateKey).add(vote.category_name)
      return accumulator
    }, new Map())
  const winnerBadges = winnerTotals.map((entry) => entry.badge).filter(Boolean)
  const winnerPhotoRows = winnerBadges.length
    ? await query(
        `
          SELECT badge_id, photo_data
          FROM employees
          WHERE badge_id IN (?)
        `,
        [winnerBadges],
      )
    : []
  const winnerPhotoMap = new Map(
    winnerPhotoRows.map((row) => [row.badge_id, row.photo_data || '']),
  )

  return {
    round,
    totalVotes: votes.length,
    validVotes,
    winnersPublished: Boolean(round.winners_published),
    resultVisibility: normalizeRoundResultVisibility(
      round.result_visibility,
      round.winners_published ? 'VISIBLE' : 'WAITING',
    ),
    winners: winnerTotals.map((entry, index) => {
      const candidateKey = `${entry.name}|${entry.badge}`
      const categories = Array.from(winnerCategoryMap.get(candidateKey) || [])

      return {
        place: index + 1,
        name: entry.name,
        badge: entry.badge,
        photoData: winnerPhotoMap.get(entry.badge) || '',
        categories,
        categoriesText: categories.join(' / '),
        votes: entry.votes,
        share: formatPercent(entry.votes, validVotes),
        panel:
          index === 0
            ? 'border-amber-200 bg-amber-50'
            : index === 1
              ? 'border-slate-200 bg-slate-100'
              : 'border-orange-200 bg-orange-50',
        crown: index === 0 ? 'emoji_events' : index === 1 ? 'workspace_premium' : 'military_tech',
        medal: index === 0 ? '1st' : index === 1 ? '2nd' : '3rd',
      }
    }),
  }
}

const setRoundResultVisibility = async (roundId, requestedVisibility) => {
  const preview = await getRoundWinnerPreview(roundId)
  const visibility = normalizeRoundResultVisibility(requestedVisibility)

  if (preview.round.status !== 'COMPLETED') {
    throw new Error('Only a completed voting round can update result visibility.')
  }

  if (visibility === 'VISIBLE' && !preview.winners.length) {
    throw new Error('No winner data is available to show for this voting round.')
  }

  if (visibility === 'VISIBLE') {
    await getHomePageBlockerForRoundResult()
  }

  await execute(
    `
      UPDATE voting_rounds
      SET winners_published = ?, result_visibility = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [visibility === 'VISIBLE' ? 1 : 0, visibility, roundId],
  )

  return {
    ...preview,
    winnersPublished: visibility === 'VISIBLE',
    resultVisibility: visibility,
  }
}

const publishRoundWinners = async (roundId) => setRoundResultVisibility(roundId, 'VISIBLE')

const getVisibleRoster = async (excludeRosterId = 0) => {
  const rows = await query(
    `
      SELECT rosters.*, admins.full_name AS creator_name
      FROM rosters
      LEFT JOIN admins ON admins.id = rosters.created_by_admin_id
      WHERE rosters.home_visibility = 1
        AND (? = 0 OR rosters.id <> ?)
      ORDER BY rosters.updated_at DESC, rosters.id DESC
      LIMIT 1
    `,
    [excludeRosterId, excludeRosterId],
  )

  return rows[0]
}

const getRosterById = async (rosterId) => {
  const rows = await query(
    `
      SELECT rosters.*, admins.full_name AS creator_name
      FROM rosters
      LEFT JOIN admins ON admins.id = rosters.created_by_admin_id
      WHERE rosters.id = ?
      LIMIT 1
    `,
    [rosterId],
  )

  return rows[0]
}

const getRosterAssignments = async (rosterIds) => {
  const normalizedRosterIds = Array.isArray(rosterIds) ? rosterIds.filter(Boolean) : [rosterIds].filter(Boolean)

  if (!normalizedRosterIds.length) {
    return []
  }

  return query(
    `
      SELECT
        roster_assignments.roster_id,
        roster_assignments.section_key,
        employees.id,
        employees.badge_id,
        employees.full_name,
        employees.department_name,
        employees.role_name,
        employees.photo_data
      FROM roster_assignments
      INNER JOIN employees ON employees.id = roster_assignments.employee_id
      WHERE roster_assignments.roster_id IN (?)
      ORDER BY employees.full_name ASC
    `,
    [normalizedRosterIds],
  )
}

const buildRosterSections = (assignmentRows = []) =>
  ROSTER_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    associates: assignmentRows
      .filter((row) => normalizeRosterSectionKey(row.section_key) === section.key)
      .map((row) => ({
        id: row.id,
        badgeId: row.badge_id,
        fullName: row.full_name,
        departmentName: row.department_name,
        roleName: row.role_name,
        photoData: row.photo_data || '',
      })),
  }))

const formatRosterPayload = (roster, assignmentRows = []) => {
  const sections = buildRosterSections(assignmentRows)
  const totalAssociates = sections.reduce((sum, section) => sum + section.associates.length, 0)

  return {
    id: roster.id,
    name: roster.name,
    description: roster.description || '',
    homeVisibility: Boolean(roster.home_visibility),
    creator: roster.creator_name || 'Admin',
    createdAt: formatDateTime(roster.created_at),
    updatedAt: formatDateTime(roster.updated_at || roster.created_at),
    totalAssociates,
    sectionCount: sections.filter((section) => section.associates.length).length,
    sections,
  }
}

const parseRosterAssignments = (assignments) => {
  if (!Array.isArray(assignments)) {
    return []
  }

  const normalized = new Map()

  assignments.forEach((entry) => {
    const employeeId = Number(entry?.employeeId)
    const sectionKey = normalizeRosterSectionKey(entry?.sectionKey)

    if (!employeeId || !sectionKey) {
      return
    }

    normalized.set(employeeId, { employeeId, sectionKey })
  })

  return Array.from(normalized.values())
}

const syncRosterAssignments = async (rosterId, assignments, runner = pool) => {
  await executeWith(runner, 'DELETE FROM roster_assignments WHERE roster_id = ?', [rosterId])

  if (!assignments.length) {
    return
  }

  await chunkInsert(
    `
      INSERT INTO roster_assignments (roster_id, employee_id, section_key)
      VALUES ?
    `,
    assignments.map((assignment) => [rosterId, assignment.employeeId, assignment.sectionKey]),
    500,
    runner,
  )
}

const getHomePageBlockerForRoster = async (rosterId = 0) => {
  const activeRound = await getActiveRound()

  if (activeRound) {
    throw new Error(`"${activeRound.name}" is still live on the Home page. Hide or end it before showing a roster.`)
  }

  const latestCompletedRound = await getLatestCompletedRound()
  const resultVisibility = normalizeRoundResultVisibility(
    latestCompletedRound?.result_visibility,
    latestCompletedRound?.winners_published ? 'VISIBLE' : 'WAITING',
  )

  if (latestCompletedRound && resultVisibility !== 'HIDDEN') {
    throw new Error(`"${latestCompletedRound.name}" is still visible on the Home page. Hide that winner page first.`)
  }

  const visibleRoster = await getVisibleRoster(rosterId)

  if (visibleRoster) {
    throw new Error(`"${visibleRoster.name}" is already visible on the Home page. Hide it first before showing another roster.`)
  }
}

const getHomePageBlockerForRoundResult = async () => {
  const visibleRoster = await getVisibleRoster()

  if (visibleRoster) {
    throw new Error(`"${visibleRoster.name}" is already visible on the Home page. Hide that roster first.`)
  }
}

const setRosterHomeVisibility = async (rosterId, isVisible) => {
  const roster = await getRosterById(rosterId)

  if (!roster) {
    throw new Error('Roster not found.')
  }

  if (isVisible) {
    await getHomePageBlockerForRoster(rosterId)
  }

  await execute(
    `
      UPDATE rosters
      SET home_visibility = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [isVisible ? 1 : 0, rosterId],
  )

  const updatedRoster = await getRosterById(rosterId)
  const assignments = await getRosterAssignments(rosterId)
  return formatRosterPayload(updatedRoster, assignments)
}

const getRoundCategories = async (roundId) =>
  query(
    `
      SELECT categories.id, categories.name
      FROM voting_round_categories
      INNER JOIN categories ON categories.id = voting_round_categories.category_id
      WHERE voting_round_categories.voting_round_id = ?
      ORDER BY categories.name ASC
    `,
    [roundId],
  )

const getRoundCandidates = async (roundId, voterEmployeeId) =>
  query(
    `
      SELECT
        employees.id,
        employees.badge_id,
        employees.full_name,
        employees.department_name,
        employees.role_name,
        employees.photo_data
      FROM voting_round_participants
      INNER JOIN employees ON employees.id = voting_round_participants.employee_id
      WHERE voting_round_participants.voting_round_id = ?
        AND employees.employment_status = 'ACTIVE'
        AND employees.id <> ?
      ORDER BY employees.full_name ASC
    `,
    [roundId, voterEmployeeId],
  )

const getPublicRoundCandidates = async (roundId) =>
  query(
    `
      SELECT
        employees.id,
        employees.badge_id,
        employees.full_name,
        employees.department_name,
        employees.role_name,
        employees.photo_data
      FROM voting_round_participants
      INNER JOIN employees ON employees.id = voting_round_participants.employee_id
      WHERE voting_round_participants.voting_round_id = ?
        AND employees.employment_status = 'ACTIVE'
      ORDER BY employees.full_name ASC
    `,
    [roundId],
  )

const getVoterExistingVotes = async (roundId, voterEmployeeId) =>
  query(
    `
      SELECT category_id, candidate_employee_id
      FROM votes
      WHERE voting_round_id = ? AND voter_employee_id = ?
      ORDER BY id ASC
    `,
    [roundId, voterEmployeeId],
  )

const parseBooleanInput = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true'
  }
  return false
}
const normalizeVotingRoundStatus = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return ['UPCOMING', 'ACTIVE', 'COMPLETED'].includes(normalized) ? normalized : 'UPCOMING'
}

const upsertSettingEntries = async (entries) => {
  for (const [settingKey, settingGroup, settingValue] of entries) {
    await execute(
      `
        INSERT INTO app_settings (setting_key, setting_group, setting_value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          setting_group = VALUES(setting_group),
          setting_value = VALUES(setting_value)
      `,
      [settingKey, settingGroup, settingValue],
    )
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    const connection = await pool.getConnection()
    await connection.query('SELECT 1')
    connection.release()

    res.json({
      success: true,
      message: 'Voting System API is running.',
      database: 'connected',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'API is running but database connection failed.',
      error: error.message,
    })
  }
})

app.get('/api/admin/meta', async (_req, res) => {
  try {
    const settings = await getSettingMap()
    const activeRound = await getActiveRound()
    const warningRows = await query(
      `
        SELECT COUNT(*) AS notification_count
        FROM audit_logs
        WHERE status IN ('Warning', 'Failed')
          AND created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
      `,
    )

    res.json({
      siteName: settings.site_name || DEFAULT_SITE_INFO.siteName,
      siteTagline: settings.site_tagline || DEFAULT_SITE_INFO.siteTagline,
      siteLogo: settings.site_logo || DEFAULT_SITE_INFO.siteLogo,
      brandingColors: getBrandingSettings(settings),
      notificationCount: warningRows[0]?.notification_count || 0,
      currentRoundName: activeRound?.name || '',
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load admin meta.', error: error.message })
  }
})

app.get('/api/public/branding', async (_req, res) => {
  try {
    const settings = await getSettingMap()
    return res.json(getPublicBrandingSettings(settings))
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load public branding.', error: error.message })
  }
})

app.post('/api/auth/badge', async (req, res) => {
  const badgeCode = req.body?.badgeCode?.trim()

  if (!badgeCode) {
    return res.status(400).json({
      success: false,
      message: 'Badge code is required.',
    })
  }

  try {
    const rows = await query(
      `
        SELECT id, badge_code, full_name, role
        FROM admins
        WHERE badge_code = ? AND is_active = 1
        LIMIT 1
      `,
      [badgeCode],
    )

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found or inactive.',
      })
    }

    return res.json({
      success: true,
      message: 'Badge verified successfully.',
      admin: rows[0],
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to verify badge right now.',
      error: error.message,
    })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const badgeCode = req.body?.badgeCode?.trim()
  const password = req.body?.password ?? ''

  if (!badgeCode || !password) {
    return res.status(400).json({
      success: false,
      message: 'Badge code and password are required.',
    })
  }

  try {
    const rows = await query(
      `
        SELECT id, badge_code, full_name, role, password_hash, access_level, username, email
        FROM admins
        WHERE badge_code = ? AND is_active = 1
        LIMIT 1
      `,
      [badgeCode],
    )

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials.',
      })
    }

    const admin = rows[0]
    const passwordHash = hashPassword(password)

    if (passwordHash !== admin.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials.',
      })
    }

    await execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id])

    return res.json({
      success: true,
      message: 'Login successful.',
      admin: {
        id: admin.id,
        badge_code: admin.badge_code,
        full_name: admin.full_name,
        role: admin.role,
        access_level: admin.access_level,
        username: admin.username,
        email: admin.email,
      },
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to complete login right now.',
      error: error.message,
    })
  }
})

app.get('/api/dashboard', async (_req, res) => {
  try {
    const employees = await query('SELECT COUNT(*) AS total_employees, SUM(employment_status = "ACTIVE") AS active_employees FROM employees')
    const categories = await query('SELECT COUNT(*) AS total_categories FROM categories WHERE is_active = 1')
    const recentLogs = await query(
      `
        SELECT user_name, action_title, module_name, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 5
      `,
    )
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.json({
        summaryCards: [
          {
            title: 'Total Associates',
            value: formatNumber(employees[0]?.total_employees),
            subtitle: 'Available in database',
            icon: 'group',
            iconBg: 'bg-blue-600',
            panelBg: 'bg-blue-50',
          },
          {
            title: 'Active Voting Round',
            value: 'None',
            subtitle: 'Create a round to start voting',
            icon: 'emoji_events',
            iconBg: 'bg-emerald-500',
            panelBg: 'bg-emerald-50',
          },
          {
            title: 'Total Categories',
            value: formatNumber(categories[0]?.total_categories),
            subtitle: 'Active categories',
            icon: 'inventory_2',
            iconBg: 'bg-amber-500',
            panelBg: 'bg-amber-50',
          },
          {
            title: 'Total Votes Cast',
            value: '0',
            subtitle: 'No votes available',
            icon: 'ballot',
            iconBg: 'bg-violet-500',
            panelBg: 'bg-violet-50',
          },
        ],
        currentRound: {
          name: 'No active voting round',
          dateRange: 'Create a new round to begin tracking results.',
          createdLabel: 'No active round found in the database.',
          status: 'NO DATA',
          daysRemaining: 0,
          timeElapsedPercent: 0,
          eligibleVoters: 0,
        },
        votesOverview: {
          totalVotes: 0,
          legend: [],
        },
        topCandidates: [],
        activityItems: recentLogs.map((item, index) => ({
          icon: ['calendar_month', 'group', 'sell', 'bar_chart', 'shield_person'][index] || 'info',
          title: item.action_title,
          actor: item.user_name,
          time: formatDateTime(item.created_at),
          panel:
            ['bg-emerald-100 text-emerald-600', 'bg-blue-100 text-blue-600', 'bg-amber-100 text-amber-600', 'bg-violet-100 text-violet-600', 'bg-rose-100 text-rose-600'][index] ||
            'bg-slate-100 text-slate-600',
        })),
      })
    }

    const activeVotes = await getRoundVotes(activeRound.id)
    const activeCategories = aggregateVotesByCategory(activeVotes)

    const topCandidates = activeCategories.map((entry) => ({
      category: entry.category,
      rank1: entry.candidates[0]?.name || '-',
      rank2: entry.candidates[1]?.name || '-',
      rank3: entry.candidates[2]?.name || '-',
    }))

    res.json({
      summaryCards: [
        {
          title: 'Total Associates',
          value: formatNumber(employees[0].total_employees),
          subtitle: 'Active in department',
          icon: 'group',
          iconBg: 'bg-blue-600',
          panelBg: 'bg-blue-50',
        },
        {
          title: 'Active Voting Round',
          value: activeRound.name.replace(' Voting', ''),
          subtitle: `Ends in ${Math.max(0, Math.ceil((new Date(activeRound.end_date) - new Date()) / (1000 * 60 * 60 * 24)))} days`,
          icon: 'emoji_events',
          iconBg: 'bg-emerald-500',
          panelBg: 'bg-emerald-50',
        },
        {
          title: 'Total Categories',
          value: formatNumber(categories[0].total_categories),
          subtitle: 'Active categories',
          icon: 'inventory_2',
          iconBg: 'bg-amber-500',
          panelBg: 'bg-amber-50',
        },
        {
          title: 'Total Votes Cast',
          value: formatNumber(activeRound.total_votes),
          subtitle: 'Overall votes',
          icon: 'ballot',
          iconBg: 'bg-violet-500',
          panelBg: 'bg-violet-50',
        },
      ],
      currentRound: {
        name: activeRound.name,
        dateRange: formatDurationRange(activeRound.start_date, activeRound.end_date),
        createdLabel: `Created by ${activeRound.creator_name || 'Admin'} on ${formatDate(activeRound.created_at)}`,
        status: activeRound.status,
        daysRemaining: Math.max(0, Math.ceil((new Date(activeRound.end_date) - new Date()) / (1000 * 60 * 60 * 24))),
        timeElapsedPercent: clamp(
          ((Date.now() - new Date(activeRound.start_date).getTime()) /
            (new Date(activeRound.end_date).getTime() - new Date(activeRound.start_date).getTime())) *
            100,
        ),
        eligibleVoters: activeRound.participant_count,
      },
      votesOverview: {
        totalVotes: activeRound.total_votes,
        legend: activeCategories.map((entry, index) => ({
          label: entry.category,
          value: `${entry.totalVotes} (${formatPercent(entry.totalVotes, activeRound.total_votes, 1)})`,
          percent: Number(((entry.totalVotes / Math.max(1, activeRound.total_votes)) * 100).toFixed(1)),
          color: reportColorByIndex[index] || 'bg-slate-400',
        })),
      },
      topCandidates,
      activityItems: recentLogs.map((item, index) => ({
        icon: ['calendar_month', 'group', 'sell', 'bar_chart', 'shield_person'][index] || 'info',
        title: item.action_title,
        actor: item.user_name,
        time: formatDateTime(item.created_at),
        panel:
          ['bg-emerald-100 text-emerald-600', 'bg-blue-100 text-blue-600', 'bg-amber-100 text-amber-600', 'bg-violet-100 text-violet-600', 'bg-rose-100 text-rose-600'][index] ||
          'bg-slate-100 text-slate-600',
      })),
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load dashboard data.', error: error.message })
  }
})

app.get('/api/voting-rounds', async (_req, res) => {
  try {
    const rounds = await query(
      `
        SELECT
          voting_rounds.*,
          admins.full_name AS creator_name,
          COUNT(DISTINCT voting_round_categories.id) AS category_count,
          COUNT(DISTINCT voting_round_participants.employee_id) AS participant_total
        FROM voting_rounds
        LEFT JOIN admins ON admins.id = voting_rounds.created_by_admin_id
        LEFT JOIN voting_round_categories ON voting_round_categories.voting_round_id = voting_rounds.id
        LEFT JOIN voting_round_participants ON voting_round_participants.voting_round_id = voting_rounds.id
        GROUP BY voting_rounds.id, admins.full_name
        ORDER BY voting_rounds.start_date DESC
      `,
    )
    const participants = await query(
      `
        SELECT
          voting_round_participants.voting_round_id,
          employees.id,
          employees.full_name,
          employees.badge_id,
          employees.department_name,
          employees.role_name,
          employees.photo_data
        FROM voting_round_participants
        INNER JOIN employees ON employees.id = voting_round_participants.employee_id
        ORDER BY employees.full_name ASC
      `,
    )
    const roundCategories = await query(
      `
        SELECT voting_round_categories.voting_round_id, categories.id, categories.name
        FROM voting_round_categories
        INNER JOIN categories ON categories.id = voting_round_categories.category_id
        ORDER BY categories.name ASC
      `,
    )
    const categoryOptions = await query(
      `
        SELECT id, name
        FROM categories
        WHERE is_active = 1
        ORDER BY name ASC
      `,
    )
    const employeeOptions = await query(
      `
        SELECT id, badge_id, badge_username, full_name, department_name, role_name, employment_status, photo_data
        FROM employees
        WHERE employment_status = 'ACTIVE'
        ORDER BY full_name ASC
      `,
    )
    const participantMap = participants.reduce((accumulator, row) => {
      if (!accumulator.has(row.voting_round_id)) {
        accumulator.set(row.voting_round_id, [])
      }

      accumulator.get(row.voting_round_id).push({
        id: row.id,
        fullName: row.full_name,
        badgeId: row.badge_id,
        departmentName: row.department_name,
        roleName: row.role_name,
        photoData: row.photo_data,
      })

      return accumulator
    }, new Map())
    const categoryMap = roundCategories.reduce((accumulator, row) => {
      if (!accumulator.has(row.voting_round_id)) {
        accumulator.set(row.voting_round_id, [])
      }

      accumulator.get(row.voting_round_id).push({
        id: row.id,
        name: row.name,
      })

      return accumulator
    }, new Map())

    const stats = [
      { title: 'Total Rounds', value: formatNumber(rounds.length), note: 'All time', icon: 'calendar_month', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
      { title: 'Live Rounds', value: formatNumber(rounds.filter((row) => row.status === 'ACTIVE').length), note: 'Currently running', icon: 'play_circle', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
      { title: 'Upcoming Rounds', value: formatNumber(rounds.filter((row) => row.status === 'UPCOMING').length), note: 'Scheduled', icon: 'schedule', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
      { title: 'Completed Rounds', value: formatNumber(rounds.filter((row) => row.status === 'COMPLETED').length), note: 'Finished', icon: 'task_alt', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
    ]

    const responsePayload = {
      stats,
      rounds: rounds.map((round) => {
        const percent = round.participant_count ? (round.total_votes / round.participant_count) * 100 : 0
        const remainingLabel =
          round.status === 'ACTIVE'
            ? `${Math.max(0, Math.ceil((new Date(round.end_date) - new Date()) / (1000 * 60 * 60 * 24)))} days remaining`
            : round.status === 'UPCOMING'
              ? `Starts in ${Math.max(0, Math.ceil((new Date(round.start_date) - new Date()) / (1000 * 60 * 60 * 24)))} days`
              : 'Completed'

        return {
          id: round.id,
          name: round.name,
          description: round.description || '',
          roundId: round.access_code,
          winnersPublished: Boolean(round.winners_published),
          resultVisibility: normalizeRoundResultVisibility(
            round.result_visibility,
            round.winners_published ? 'VISIBLE' : 'WAITING',
          ),
          dates: formatDurationRange(round.start_date, round.end_date),
          status: round.status,
          statusClass: statusClassMap[round.status],
          duration: [formatDateTime(round.start_date), formatDateTime(round.end_date), remainingLabel],
          durationClass: round.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : round.status === 'UPCOMING' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
          categories: round.category_count,
          categoryPreview: categoryMap.get(round.id) || [],
          employees: round.participant_total,
          votes: round.total_votes,
          percent: formatPercent(round.total_votes, round.participant_total || 1),
          percentWidth: `${clamp(percent)}%`,
          creator: round.creator_name || 'Admin',
          createdAt: formatDateTime(round.created_at),
          dot: round.status === 'ACTIVE' ? 'bg-emerald-500' : round.status === 'UPCOMING' ? 'bg-blue-500' : 'bg-slate-400',
          rawStartDate: formatDateValue(round.start_date),
          rawEndDate: formatDateValue(round.end_date),
          categoryIds: (categoryMap.get(round.id) || []).map((category) => category.id),
          participantIds: (participantMap.get(round.id) || []).map((participant) => participant.id),
          participantPreview: participantMap.get(round.id) || [],
        }
      }),
      categoryOptions: categoryOptions.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      employeeOptions: employeeOptions.map((employee) => ({
        id: employee.id,
        badgeId: employee.badge_id,
        fullName: employee.full_name,
        departmentName: employee.department_name,
        roleName: employee.role_name,
        status: employee.employment_status,
        photoData: employee.photo_data,
      })),
      pagination: {
        showing: `Showing 1 to ${rounds.length} of ${rounds.length} rounds`,
      },
    }
    res.json(responsePayload)
  } catch (error) {
    res.status(500).json({ message: 'Unable to load voting rounds.', error: error.message })
  }
})

app.get('/api/categories', async (_req, res) => {
  try {
    const rows = await query(
      `
        SELECT
          categories.*,
          admins.full_name AS created_by_name,
          COUNT(voting_round_categories.id) AS rounds_used
        FROM categories
        LEFT JOIN admins ON admins.id = categories.created_by_admin_id
        LEFT JOIN voting_round_categories ON voting_round_categories.category_id = categories.id
        GROUP BY categories.id, admins.full_name
        ORDER BY categories.id ASC
      `,
    )

    res.json({
      stats: [
        { title: 'Total Categories', value: formatNumber(rows.length), note: 'All categories', icon: 'apps', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Active Categories', value: formatNumber(rows.filter((row) => row.is_active).length), note: 'Currently active', icon: 'task_alt', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Inactive Categories', value: formatNumber(rows.filter((row) => !row.is_active).length), note: 'Currently inactive', icon: 'pause_circle', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Used in Active Rounds', value: formatNumber(rows.filter((row) => row.rounds_used > 0).length), note: 'Categories in use', icon: 'groups', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      categories: rows.map((row, index) => ({
        id: index + 1,
        rowId: row.id,
        name: row.name,
        description: row.description,
        status: row.is_active ? 'ACTIVE' : 'INACTIVE',
        rounds: row.rounds_used,
        createdBy: row.created_by_name || 'Admin',
        createdAt: formatDateTime(row.created_at),
        icon: categoryDisplayConfig[row.name]?.icon || 'label',
        iconPanel: categoryDisplayConfig[row.name]?.iconPanel || 'bg-slate-100 text-slate-600',
      })),
      pagination: {
        showing: `Showing 1 to ${rows.length} of ${rows.length} categories`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load categories.', error: error.message })
  }
})

app.post('/api/categories', async (req, res) => {
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim()
  const icon = req.body?.icon?.trim() || 'label'
  const isActive = parseBooleanInput(req.body?.isActive)

  if (!name || !description) {
    return res.status(400).json({ message: 'Category name and description are required.' })
  }

  try {
    await execute(
      `
        INSERT INTO categories (name, description, icon, is_active, created_by_admin_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [name, description, icon, isActive ? 1 : 0, 1],
    )
    await syncAllRoundCategories()

    return res.json({ success: true, message: 'Category created successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create category.', error: error.message })
  }
})

app.put('/api/categories/:id', async (req, res) => {
  const categoryId = Number(req.params.id)
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim()
  const icon = req.body?.icon?.trim() || 'label'
  const isActive = parseBooleanInput(req.body?.isActive)

  if (!categoryId || !name || !description) {
    return res.status(400).json({ message: 'Valid category data is required.' })
  }

  try {
    await execute(
      `
        UPDATE categories
        SET name = ?, description = ?, icon = ?, is_active = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [name, description, icon, isActive ? 1 : 0, categoryId],
    )
    await syncAllRoundCategories()

    return res.json({ success: true, message: 'Category updated successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update category.', error: error.message })
  }
})

app.delete('/api/categories/:id', async (req, res) => {
  const categoryId = Number(req.params.id)

  if (!categoryId) {
    return res.status(400).json({ message: 'Valid category id is required.' })
  }

  try {
    await execute('DELETE FROM votes WHERE category_id = ?', [categoryId])
    await execute('DELETE FROM voting_round_categories WHERE category_id = ?', [categoryId])
    await execute('DELETE FROM categories WHERE id = ?', [categoryId])
    await syncAllRoundCategories()

    return res.json({ success: true, message: 'Category deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete category.', error: error.message })
  }
})

app.get('/api/employees', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM employees ORDER BY id ASC')
    const activeCount = rows.filter((row) => row.employment_status === 'ACTIVE').length
    const votedRows = await query(
      `
        SELECT COUNT(DISTINCT voter_employee_id) AS voted_count
        FROM votes
      `,
    )

    res.json({
      stats: [
        { title: 'Total Associates', value: formatNumber(rows.length), note: 'All associates', icon: 'group', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Active Associates', value: formatNumber(activeCount), note: `${formatPercent(activeCount, rows.length)} of total`, icon: 'task_alt', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Inactive Associates', value: formatNumber(rows.length - activeCount), note: `${formatPercent(rows.length - activeCount, rows.length)} of total`, icon: 'pause_circle', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Associates Voted', value: formatNumber(votedRows[0]?.voted_count || 0), note: 'In current round', icon: 'work', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      employees: rows.map((row) => ({
        id: row.id,
        badgeId: row.badge_id,
        fullName: row.full_name,
        departmentName: row.department_name,
        roleName: row.role_name,
        employmentStatus: row.employment_status,
        joinDateLabel: formatDateLabel(row.join_date),
        email: row.email,
        joinDateValue: formatDateValue(row.join_date),
        photoData: row.photo_data,
      })),
      pagination: {
        showing: `Showing 1 to ${rows.length} of ${rows.length} associates`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load associates.', error: error.message })
  }
})

app.post('/api/employees', async (req, res) => {
  const badgeId = req.body?.badgeId?.trim()
  const fullName = req.body?.fullName?.trim()
  const departmentName = req.body?.departmentName?.trim()
  const roleName = req.body?.roleName?.trim()
  const email = req.body?.email?.trim()
  const employmentStatus = req.body?.employmentStatus?.trim() || 'ACTIVE'
  const joinDate = req.body?.joinDate?.trim()
  let photoData = null

  try {
    photoData = sanitizePhotoData(req.body?.photoData)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid associate photo.' })
  }

  if (!badgeId || !fullName || !departmentName || !roleName || !email || !joinDate) {
    return res.status(400).json({ message: 'All associate fields are required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    await execute(
      `
        INSERT INTO employees
        (badge_id, full_name, department_name, role_name, email, photo_data, employment_status, join_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [badgeId, fullName, departmentName, roleName, email, photoData, employmentStatus, joinDate],
    )

    return res.json({ success: true, message: 'Associate created successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create associate.', error: error.message })
  }
})

app.put('/api/employees/:id', async (req, res) => {
  const employeeId = Number(req.params.id)
  const badgeId = req.body?.badgeId?.trim()
  const fullName = req.body?.fullName?.trim()
  const departmentName = req.body?.departmentName?.trim()
  const roleName = req.body?.roleName?.trim()
  const email = req.body?.email?.trim()
  const employmentStatus = req.body?.employmentStatus?.trim() || 'ACTIVE'
  const joinDate = req.body?.joinDate?.trim()
  let photoData = null

  try {
    photoData = sanitizePhotoData(req.body?.photoData)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid associate photo.' })
  }

  if (!employeeId || !badgeId || !fullName || !departmentName || !roleName || !email || !joinDate) {
    return res.status(400).json({ message: 'All associate fields are required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    await execute(
      `
        UPDATE employees
        SET badge_id = ?, full_name = ?, department_name = ?, role_name = ?, email = ?, photo_data = ?, employment_status = ?, join_date = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [badgeId, fullName, departmentName, roleName, email, photoData, employmentStatus, joinDate, employeeId],
    )

    return res.json({ success: true, message: 'Associate updated successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update associate.', error: error.message })
  }
})

app.delete('/api/employees/:id', async (req, res) => {
  const employeeId = Number(req.params.id)

  if (!employeeId) {
    return res.status(400).json({ message: 'Valid associate id is required.' })
  }

  try {
    const affectedRounds = await query(
      `
        SELECT DISTINCT voting_round_id
        FROM voting_round_participants
        WHERE employee_id = ?
      `,
      [employeeId],
    )
    await execute('DELETE FROM votes WHERE voter_employee_id = ? OR candidate_employee_id = ?', [employeeId, employeeId])
    await execute('DELETE FROM voting_round_participants WHERE employee_id = ?', [employeeId])
    await execute('DELETE FROM roster_assignments WHERE employee_id = ?', [employeeId])
    await execute('DELETE FROM employees WHERE id = ?', [employeeId])

    for (const round of affectedRounds) {
      await recalculateRoundStats(round.voting_round_id)
    }

    return res.json({ success: true, message: 'Associate deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete associate.', error: error.message })
  }
})

app.get('/api/voting/active-round', async (_req, res) => {
  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.json({
        hasActiveRound: false,
        round: null,
      })
    }

    return res.json({
      hasActiveRound: true,
      round: {
        id: activeRound.id,
        name: activeRound.name,
        description: activeRound.description || '',
        startDate: activeRound.start_date,
        endDate: activeRound.end_date,
        status: activeRound.status,
        roundId: activeRound.access_code,
        eligibleAssociates: activeRound.participant_count,
      },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load voting round.', error: error.message })
  }
})

app.get('/api/voting/home', async (_req, res) => {
  try {
    const settings = await getSettingMap()
    const activeRound = await getActiveRound()
    const upcomingRounds = await query(
      `
        SELECT id, name, access_code, start_date, end_date, status, participant_count
        FROM voting_rounds
        WHERE status = 'UPCOMING'
        ORDER BY start_date ASC
        LIMIT 6
      `,
    )

    return res.json({
      ...getPublicBrandingSettings(settings),
      liveRound: activeRound
        ? {
            id: activeRound.id,
            name: activeRound.name,
            startDate: activeRound.start_date,
            endDate: activeRound.end_date,
            status: activeRound.status,
            roundId: activeRound.access_code,
            eligibleAssociates: activeRound.participant_count,
          }
        : null,
      upcomingRounds: upcomingRounds.map((round) => ({
        id: round.id,
        name: round.name,
        startDate: round.start_date,
        endDate: round.end_date,
        status: round.status,
        roundId: round.access_code,
        eligibleAssociates: round.participant_count,
      })),
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load the voting home page.', error: error.message })
  }
})

app.get('/api/voting/live-ballot', async (_req, res) => {
  try {
    const settings = await getSettingMap()
    const activeRound = await getActiveRound()

    if (!activeRound) {
      const visibleRoster = await getVisibleRoster()

      if (visibleRoster) {
        const rosterAssignments = await getRosterAssignments(visibleRoster.id)

        return res.json({
          hasActiveRound: false,
          ...getPublicBrandingSettings(settings),
          round: null,
          categories: [],
          finishedRound: null,
          roster: formatRosterPayload(visibleRoster, rosterAssignments),
        })
      }

      const finishedRound = await getLatestCompletedRound()
      const resultVisibility = normalizeRoundResultVisibility(
        finishedRound?.result_visibility,
        finishedRound?.winners_published ? 'VISIBLE' : 'WAITING',
      )
      const winnerPreview =
        finishedRound && resultVisibility === 'VISIBLE' ? await getRoundWinnerPreview(finishedRound.id) : null

      return res.json({
        hasActiveRound: false,
        ...getPublicBrandingSettings(settings),
        round: null,
        categories: [],
        roster: null,
        finishedRound: finishedRound && resultVisibility !== 'HIDDEN'
          ? {
              id: finishedRound.id,
              name: finishedRound.name,
              description: finishedRound.description || '',
              startDate: finishedRound.start_date,
              endDate: finishedRound.end_date,
              roundId: finishedRound.access_code,
              status: finishedRound.status,
              winnersPublished: resultVisibility === 'VISIBLE',
              resultVisibility,
              winners: winnerPreview?.winners || [],
            }
          : null,
      })
    }

    const categories = await getRoundCategories(activeRound.id)
    const candidates = await getPublicRoundCandidates(activeRound.id)
    const candidateCards = candidates.map((candidate) => ({
      id: candidate.id,
      badgeId: candidate.badge_id,
      fullName: candidate.full_name,
      departmentName: candidate.department_name,
      roleName: candidate.role_name,
      photoData: candidate.photo_data,
    }))
    const ballotCategories = categories.length
      ? categories.map((category) => ({
          id: category.id,
          name: category.name,
          candidates: candidateCards,
        }))
      : candidateCards.length
        ? [
            {
              id: 0,
              name: 'Nominees',
              candidates: candidateCards,
            },
          ]
        : []

    return res.json({
      hasActiveRound: true,
      ...getPublicBrandingSettings(settings),
      round: {
        id: activeRound.id,
        name: activeRound.name,
        description: activeRound.description || '',
        startDate: activeRound.start_date,
        endDate: activeRound.end_date,
        roundId: activeRound.access_code,
        eligibleAssociates: activeRound.participant_count,
      },
      categories: ballotCategories,
      finishedRound: null,
      roster: null,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load the live ballot.', error: error.message })
  }
})

app.post('/api/voting/ballot', async (req, res) => {
  const badgeId = req.body?.badgeId?.trim()

  if (!badgeId) {
    return res.status(400).json({ message: 'Badge ID is required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.status(400).json({ message: 'There is no live voting round right now.' })
    }

    const employees = await query(
      `
        SELECT id, badge_id, full_name, department_name, role_name, employment_status, photo_data
        FROM employees
        WHERE badge_id = ?
        LIMIT 1
      `,
      [badgeId],
    )
    const voter = employees[0]

    if (!voter || voter.employment_status !== 'ACTIVE') {
      return res.status(404).json({ message: 'Associate badge was not found or is inactive.' })
    }

    const categories = await getRoundCategories(activeRound.id)
    const candidates = await getRoundCandidates(activeRound.id, voter.id)
    const existingVotes = await getVoterExistingVotes(activeRound.id, voter.id)

    if (!candidates.length) {
      return res.status(400).json({ message: 'There are no assigned nominees available in the live voting round.' })
    }

    if (existingVotes.length) {
      return res.status(409).json({ message: 'This associate has already voted in this voting round.' })
    }

    return res.json({
      round: {
        id: activeRound.id,
        name: activeRound.name,
        startDate: activeRound.start_date,
        endDate: activeRound.end_date,
        roundId: activeRound.access_code,
        eligibleAssociates: activeRound.participant_count,
      },
      voter: {
        id: voter.id,
        badgeId: voter.badge_id,
        fullName: voter.full_name,
        departmentName: voter.department_name,
        roleName: voter.role_name,
        photoData: voter.photo_data,
      },
      settings: {
        requireVoteConfirmation: (await getSettingMap()).require_vote_confirmation === 'true',
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          badgeId: candidate.badge_id,
          fullName: candidate.full_name,
          departmentName: candidate.department_name,
          roleName: candidate.role_name,
          photoData: candidate.photo_data,
        })),
        selectedCandidateId: null,
      })),
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to build the ballot.', error: error.message })
  }
})

app.post('/api/voting/cast', async (req, res) => {
  const badgeId = req.body?.badgeId?.trim()
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : []

  if (!badgeId || !selections.length) {
    return res.status(400).json({ message: 'Badge ID and ballot selections are required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.status(400).json({ message: 'There is no live voting round right now.' })
    }

    const employeeRows = await query(
      `
        SELECT id, badge_id, full_name, employment_status
        FROM employees
        WHERE badge_id = ?
        LIMIT 1
      `,
      [badgeId],
    )
    const voter = employeeRows[0]

    if (!voter || voter.employment_status !== 'ACTIVE') {
      return res.status(404).json({ message: 'Associate badge was not found or is inactive.' })
    }

    const participantRows = await query(
      `
        SELECT employee_id
        FROM voting_round_participants
        WHERE voting_round_id = ?
      `,
      [activeRound.id],
    )
    const participantIds = new Set(participantRows.map((row) => row.employee_id))

    const categories = await getRoundCategories(activeRound.id)
    const categoryIds = new Set(categories.map((category) => category.id))
    const existingVotes = await getVoterExistingVotes(activeRound.id, voter.id)
    const normalizedSelections = []

    if (existingVotes.length) {
      return res.status(409).json({ message: 'This associate has already voted in this voting round.' })
    }

    for (const selection of selections) {
      const categoryId = Number(selection?.categoryId)
      const candidateEmployeeId = Number(selection?.candidateEmployeeId)

      if (!categoryId || !candidateEmployeeId) {
        return res.status(400).json({ message: 'Each ballot selection must include a category and associate.' })
      }

      if (!categoryIds.has(categoryId)) {
        return res.status(400).json({ message: 'One or more selected categories are not part of this voting round.' })
      }

      if (!participantIds.has(candidateEmployeeId)) {
        return res.status(400).json({ message: 'One or more selected candidates are not assigned to this voting round.' })
      }

      if (candidateEmployeeId === voter.id) {
        return res.status(400).json({ message: 'Associates cannot vote for themselves.' })
      }

      normalizedSelections.push({ categoryId, candidateEmployeeId })
    }

    const uniqueSelectionKeys = new Set(normalizedSelections.map((selection) => selection.categoryId))

    if (uniqueSelectionKeys.size !== normalizedSelections.length) {
      return res.status(400).json({ message: 'Only one vote per category can be submitted at a time.' })
    }

    if (normalizedSelections.length !== 1) {
      return res.status(400).json({ message: 'Select one nominee card and submit one vote only for this round.' })
    }

    for (const selection of normalizedSelections) {
      await execute(
        `
          INSERT INTO votes
          (voting_round_id, voter_employee_id, candidate_employee_id, category_id, vote_status, is_valid, created_at)
          VALUES (?, ?, ?, ?, 'Valid', 1, NOW())
        `,
        [activeRound.id, voter.id, selection.candidateEmployeeId, selection.categoryId],
      )
    }

    await recalculateRoundStats(activeRound.id)

    return res.json({
      success: true,
      message: `Votes submitted successfully for ${voter.full_name}.`,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to submit votes.', error: error.message })
  }
})

app.get('/api/votes', async (_req, res) => {
  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.json({
        stats: [
          { title: 'Total Votes Cast', value: '0', note: 'No active round', icon: 'ballot', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
          { title: 'Unique Voters', value: '0', note: 'No active round', icon: 'group', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
          { title: 'Valid Votes', value: '0', note: 'No active round', icon: 'task_alt', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
          { title: 'Invalid Votes', value: '0', note: 'No active round', icon: 'cancel', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
        ],
        roundName: 'No active voting round',
        categories: [],
        statuses: ['Valid', 'Invalid'],
        votes: [],
        pagination: {
          showing: 'Showing 0 to 0 of 0 votes',
        },
      })
    }

    const votes = await getRoundVotes(activeRound.id)
    const validVotes = votes.filter((vote) => vote.is_valid).length
    const uniqueVoters = new Set(votes.map((vote) => vote.voter_badge_id)).size
    const categories = [...new Set(votes.map((vote) => vote.category_name))]

    res.json({
      stats: [
        { title: 'Total Votes Cast', value: formatNumber(votes.length), note: `${formatPercent(votes.length, activeRound.participant_count)} of total votes`, icon: 'ballot', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Unique Voters', value: formatNumber(uniqueVoters), note: `${formatPercent(uniqueVoters, activeRound.participant_count)} of associates`, icon: 'group', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Valid Votes', value: formatNumber(validVotes), note: `${formatPercent(validVotes, votes.length)} of total votes`, icon: 'task_alt', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Invalid Votes', value: formatNumber(votes.length - validVotes), note: `${formatPercent(votes.length - validVotes, votes.length)} of total votes`, icon: 'cancel', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      roundName: activeRound.name,
      categories,
      statuses: ['Valid', 'Invalid'],
      votes: votes.map((vote) => [
        vote.id,
        vote.voter_name,
        vote.voter_badge_id,
        vote.candidate_name,
        vote.candidate_badge_id,
        vote.category_name,
        formatDateTime(vote.created_at),
        vote.is_valid ? 'Valid' : 'Invalid',
      ]),
      pagination: {
        showing: `Showing 1 to ${votes.length} of ${votes.length} votes`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load votes.', error: error.message })
  }
})

app.get('/api/live-results', async (_req, res) => {
  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      return res.json({
        summary: [
          { title: 'Total Associates', value: '0', note: 'No active round', icon: 'groups', panel: 'bg-violet-50 text-violet-600' },
          { title: 'Votes Cast', value: '0', note: 'No active round', icon: 'checklist', panel: 'bg-emerald-50 text-emerald-600' },
          { title: 'Valid Votes', value: '0', note: 'No active round', icon: 'pie_chart', panel: 'bg-blue-50 text-blue-600' },
          { title: 'Invalid Votes', value: '0', note: 'No active round', icon: 'cancel', panel: 'bg-rose-50 text-rose-600' },
        ],
        tabs: [],
        selectedRoundName: 'No active voting round',
        selectedCategory: '',
        categoryResults: [],
        liveActivity: [],
        footer: {
          updatedAt: formatDateTime(new Date()),
        },
      })
    }

    const votes = await getRoundVotes(activeRound.id)
    const categories = aggregateVotesByCategory(votes)
    const overallValid = votes.filter((vote) => vote.is_valid).length
    const uniqueVoters = new Set(votes.map((vote) => vote.voter_badge_id)).size

    res.json({
      summary: [
        { title: 'Total Associates', value: formatNumber(activeRound.participant_count), note: 'In this round', icon: 'groups', panel: 'bg-violet-50 text-violet-600' },
        { title: 'Votes Cast', value: formatNumber(uniqueVoters), note: `${formatPercent(uniqueVoters, activeRound.participant_count)} participation`, icon: 'checklist', panel: 'bg-emerald-50 text-emerald-600' },
        { title: 'Valid Votes', value: formatNumber(overallValid), note: `${formatPercent(overallValid, votes.length)} of total votes`, icon: 'pie_chart', panel: 'bg-blue-50 text-blue-600' },
        { title: 'Invalid Votes', value: formatNumber(votes.length - overallValid), note: `${formatPercent(votes.length - overallValid, votes.length)} of total votes`, icon: 'cancel', panel: 'bg-rose-50 text-rose-600' },
      ],
      tabs: categories.map((entry) => entry.category),
      selectedRoundName: activeRound.name,
      selectedCategory: categories[0]?.category || '',
      categoryResults: categories.map((category) => ({
        category: category.category,
        totalVotes: category.validVotes,
        podium: category.candidates.slice(0, 3).map((candidate, index) => ({
          place: index === 1 ? 2 : index === 0 ? 1 : 3,
          name: candidate.name,
          badge: candidate.badge,
          votes: candidate.votes,
          share: `${formatPercent(candidate.votes, category.validVotes)} of valid votes`,
          panel: index === 0 ? 'bg-amber-50' : index === 1 ? 'bg-slate-100' : 'bg-orange-50',
          crown: index === 0 ? '👑' : index === 1 ? '🥈' : '🥉',
        })),
        ranking: category.candidates.slice(3, 8).map((candidate, index) => [
          `${index + 4}`,
          candidate.name,
          candidate.badge,
          `${candidate.votes}`,
          formatPercent(candidate.votes, category.validVotes),
          `${clamp((candidate.votes / Math.max(1, category.candidates[0]?.votes || 1)) * 100)}%`,
        ]),
        distribution: category.candidates.slice(0, 5).map((candidate, index) => [
          candidate.name,
          `${candidate.votes} (${formatPercent(candidate.votes, category.validVotes)})`,
          reportColorByIndex[index] || 'bg-slate-400',
        ]),
      })),
      liveActivity: votes
        .slice(-5)
        .reverse()
        .map((vote, index) => [
          `${vote.voter_badge_id} voted for ${vote.candidate_name} in ${vote.category_name}`,
          `${index + 2} mins ago`,
        ]),
      footer: {
        updatedAt: formatDateTime(new Date()),
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load live results.', error: error.message })
  }
})

app.get('/api/reports', async (_req, res) => {
  try {
    const activeRound = await getActiveRound()

    if (!activeRound) {
      const settings = await getSettingMap()

      return res.json({
        stats: [
          { title: 'Total Associates', value: '0', note: 'No active round', icon: 'group', panel: 'bg-blue-50', iconBg: 'bg-blue-600', noteColor: 'text-slate-500' },
          { title: 'Votes Cast', value: '0', note: 'No active round', icon: 'task_alt', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500', noteColor: 'text-emerald-600' },
          { title: 'Valid Votes', value: '0', note: 'No active round', icon: 'check_circle', panel: 'bg-amber-50', iconBg: 'bg-amber-500', noteColor: 'text-amber-600' },
          { title: 'Invalid Votes', value: '0', note: 'No active round', icon: 'cancel', panel: 'bg-rose-50', iconBg: 'bg-rose-500', noteColor: 'text-rose-600' },
          { title: 'Categories', value: '0', note: 'No active round', icon: 'pie_chart', panel: 'bg-violet-50', iconBg: 'bg-violet-500', noteColor: 'text-slate-500' },
        ],
        filters: {
          dateRange: 'No active voting round',
          categoryLabel: 'All Categories',
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
        systemCurrency: settings.currency || 'USD - US Dollar ($)',
      })
    }

    const votes = await getRoundVotes(activeRound.id)
    const categories = aggregateVotesByCategory(votes)
    const overallTotals = aggregateCandidateTotals(votes)
    const settings = await getSettingMap()
    const validVotes = votes.filter((vote) => vote.is_valid).length
    const uniqueVoters = new Set(votes.map((vote) => vote.voter_badge_id)).size

    res.json({
      stats: [
        { title: 'Total Associates', value: formatNumber(activeRound.participant_count), note: '100% of department', icon: 'group', panel: 'bg-blue-50', iconBg: 'bg-blue-600', noteColor: 'text-slate-500' },
        { title: 'Votes Cast', value: formatNumber(votes.length), note: `${formatPercent(uniqueVoters, activeRound.participant_count)} participation`, icon: 'task_alt', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500', noteColor: 'text-emerald-600' },
        { title: 'Valid Votes', value: formatNumber(validVotes), note: `${formatPercent(validVotes, votes.length)} of total votes`, icon: 'check_circle', panel: 'bg-amber-50', iconBg: 'bg-amber-500', noteColor: 'text-amber-600' },
        { title: 'Invalid Votes', value: formatNumber(votes.length - validVotes), note: `${formatPercent(votes.length - validVotes, votes.length)} of total votes`, icon: 'cancel', panel: 'bg-rose-50', iconBg: 'bg-rose-500', noteColor: 'text-rose-600' },
        { title: 'Categories', value: formatNumber(categories.length), note: 'Active categories', icon: 'pie_chart', panel: 'bg-violet-50', iconBg: 'bg-violet-500', noteColor: 'text-slate-500' },
      ],
      filters: {
        dateRange: `${formatMonthDay(activeRound.start_date)}, ${new Date(activeRound.start_date).getFullYear()} - ${formatMonthDay(activeRound.end_date)}, ${new Date(activeRound.end_date).getFullYear()}`,
        categoryLabel: 'All Categories',
      },
      timelinePoints: buildTimelinePoints(votes),
      categoryLegend: categories.map((entry, index) => ({
        label: entry.category,
        value: `${entry.totalVotes} (${formatPercent(entry.totalVotes, votes.length)})`,
        percent: Number(((entry.totalVotes / Math.max(1, votes.length)) * 100).toFixed(2)),
        color: reportColorByIndex[index] || 'bg-slate-400',
      })),
      voteSummary: categories.map((entry) => [
        entry.category,
        `${entry.totalVotes}`,
        `${entry.validVotes} (${formatPercent(entry.validVotes, entry.totalVotes)})`,
        `${entry.invalidVotes} (${formatPercent(entry.invalidVotes, entry.totalVotes)})`,
        formatPercent(entry.distinctVoters, activeRound.participant_count),
        categoryDisplayConfig[entry.category]?.icon || 'label',
        categoryDisplayConfig[entry.category]?.iconPanel || 'bg-slate-100 text-slate-600',
      ]),
      topEmployees: overallTotals.slice(0, 5).map((entry, index) => [
        `${index + 1}`,
        entry.name,
        entry.badge,
        `${entry.votes}`,
        `${clamp((entry.votes / Math.max(1, overallTotals[0]?.votes || 1)) * 100)}%`,
        index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`,
      ]),
      totals: {
        votesCast: formatNumber(votes.length),
        validVotes: `${formatNumber(validVotes)} (${formatPercent(validVotes, votes.length)})`,
        invalidVotes: `${formatNumber(votes.length - validVotes)} (${formatPercent(votes.length - validVotes, votes.length)})`,
        participation: formatPercent(uniqueVoters, activeRound.participant_count),
      },
      systemCurrency: settings.currency || 'USD - US Dollar ($)',
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load reports.', error: error.message })
  }
})

app.get('/api/past-winners', async (_req, res) => {
  try {
    const rounds = await query(
      `
        SELECT *
        FROM voting_rounds
        WHERE status = 'COMPLETED'
        ORDER BY start_date DESC
      `,
    )

    if (!rounds.length) {
      return res.json({
        stats: [
          { title: 'Completed Rounds', value: '0', note: 'All time', icon: 'calendar_month', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
          { title: 'Winners', value: '0', note: 'Across all categories', icon: 'emoji_events', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
          { title: 'Associates Participated', value: '0', note: 'No completed rounds yet', icon: 'groups', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
          { title: 'Total Votes Cast', value: '0', note: 'All completed rounds', icon: 'bar_chart', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
        ],
        rounds: [],
        selectedRound: {
          name: 'No completed voting rounds',
          summary: 'Complete a voting round to display past winners here.',
        },
        tabs: [],
        podium: [],
        ranking: [],
        roundResults: [],
      })
    }

    const selectedRound = rounds[0]
    const votes = await getRoundVotes(selectedRound.id)
    const categories = aggregateVotesByCategory(votes)
    const roundResults = await Promise.all(
      rounds.map(async (round) => {
        const roundVotes = await getRoundVotes(round.id)
        const roundCategories = aggregateVotesByCategory(roundVotes)

        return {
          roundId: round.id,
          name: round.name,
          summary: `${formatMonthDay(round.start_date)} - ${formatMonthDay(round.end_date)}, ${new Date(round.end_date).getFullYear()} • ${round.participant_count} associates participated • ${round.total_votes} votes cast`,
          tabs: roundCategories.map((entry) => entry.category),
          categories: roundCategories.map((category) => ({
            category: category.category,
            podium: category.candidates.slice(0, 3).map((candidate, index) => ({
              place: index === 1 ? 2 : index === 0 ? 1 : 3,
              name: candidate.name,
              badge: candidate.badge,
              votes: candidate.votes,
              share: `votes (${formatPercent(candidate.votes, category.validVotes)})`,
              panel: index === 0 ? 'bg-amber-50' : index === 1 ? 'bg-slate-100' : 'bg-orange-50',
              crown: index === 0 ? '👑' : index === 1 ? '🥈' : '🥉',
            })),
            ranking: category.candidates.slice(3, 8).map((candidate, index) => [
              `${index + 4}`,
              candidate.name,
              candidate.badge,
              `${candidate.votes}`,
              formatPercent(candidate.votes, category.validVotes),
              `${clamp((candidate.votes / Math.max(1, category.candidates[0]?.votes || 1)) * 100)}%`,
            ]),
          })),
        }
      }),
    )

    res.json({
      stats: [
        { title: 'Completed Rounds', value: formatNumber(rounds.length), note: 'All time', icon: 'calendar_month', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Winners', value: formatNumber(rounds.length * categories.length), note: 'Across all categories', icon: 'emoji_events', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Associates Participated', value: formatNumber(selectedRound.participant_count), note: 'Total unique participants', icon: 'groups', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Total Votes Cast', value: formatNumber(rounds.reduce((sum, row) => sum + row.total_votes, 0)), note: 'All completed rounds', icon: 'bar_chart', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      rounds: rounds.slice(0, 8).map((round, index) => [round.name, `${formatMonthDay(round.start_date)} - ${formatMonthDay(round.end_date)}, ${new Date(round.end_date).getFullYear()}`, index === 0]),
      selectedRound: {
        name: selectedRound.name,
        summary: `${formatMonthDay(selectedRound.start_date)} - ${formatMonthDay(selectedRound.end_date)}, ${new Date(selectedRound.end_date).getFullYear()} • ${selectedRound.participant_count} associates participated • ${selectedRound.total_votes} votes cast`,
      },
      tabs: categories.map((entry) => entry.category),
      podium: roundResults[0]?.categories[0]?.podium || [],
      ranking: roundResults[0]?.categories[0]?.ranking || [],
      roundResults,
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load past winners.', error: error.message })
  }
})

app.post('/api/voting-rounds', async (req, res) => {
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const startDate = normalizeVotingRoundDateInput(req.body?.startDate, 'start')
  const endDate = normalizeVotingRoundDateInput(req.body?.endDate, 'end')
  const requestedStatus = normalizeVotingRoundStatus(req.body?.status)
  const status = requestedStatus
  const categoryIds = parseIdList(req.body?.categoryIds)
  const participantIds = parseIdList(req.body?.participantIds)

  if (!name || !startDate || !endDate || !categoryIds.length || !participantIds.length) {
    return res.status(400).json({ message: 'Round name, dates, at least one category, and at least one associate are required.' })
  }

  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ message: 'End date must be on or after the start date.' })
  }

  const connection = await pool.getConnection()

  try {
    const accessCode = await getUniqueRoundAccessCode()
    const resultVisibility = requestedStatus === 'COMPLETED' ? 'WAITING' : 'HIDDEN'
    await connection.beginTransaction()
    const result = await executeWith(
      connection,
      `
        INSERT INTO voting_rounds
        (name, description, access_code, start_date, end_date, status, participant_count, total_votes, valid_votes, invalid_votes, winners_published, result_visibility, created_by_admin_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, NOW())
      `,
      [name, description, accessCode, startDate, endDate, status, participantIds.length, resultVisibility, 1],
    )

    await syncRoundParticipants(result.insertId, participantIds, connection)
    await syncRoundCategories(result.insertId, categoryIds, connection)

    if (requestedStatus === 'ACTIVE') {
      await activateVotingRound(result.insertId, connection)
    }

    await connection.commit()

    return res.json({
      success: true,
      message: 'Voting round created successfully.',
      status: requestedStatus,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return res.status(500).json({ message: error.message || 'Unable to create voting round.', error: error.message })
  } finally {
    connection.release()
  }
})

app.put('/api/voting-rounds/:id', async (req, res) => {
  const roundId = Number(req.params.id)
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const startDate = normalizeVotingRoundDateInput(req.body?.startDate, 'start')
  const endDate = normalizeVotingRoundDateInput(req.body?.endDate, 'end')
  const requestedStatus = normalizeVotingRoundStatus(req.body?.status)
  const status = requestedStatus
  const categoryIds = parseIdList(req.body?.categoryIds)
  const participantIds = parseIdList(req.body?.participantIds)

  if (!roundId || !name || !startDate || !endDate || !categoryIds.length || !participantIds.length) {
    return res.status(400).json({ message: 'Valid round data is required.' })
  }

  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ message: 'End date must be on or after the start date.' })
  }

  const connection = await pool.getConnection()

  try {
    const existingRound = await getVotingRoundById(roundId)

    if (!existingRound) {
      return res.status(404).json({ message: 'Voting round not found.' })
    }

    const resultVisibility =
      requestedStatus === 'COMPLETED'
        ? existingRound.status === 'COMPLETED'
          ? normalizeRoundResultVisibility(
              existingRound.result_visibility,
              existingRound.winners_published ? 'VISIBLE' : 'WAITING',
            )
          : 'WAITING'
        : 'HIDDEN'
    const winnersPublished = requestedStatus === 'COMPLETED' && existingRound.status === 'COMPLETED' ? Number(existingRound.winners_published || 0) : 0

    await connection.beginTransaction()
    await executeWith(
      connection,
      `
        UPDATE voting_rounds
        SET name = ?, description = ?, start_date = ?, end_date = ?, status = ?, participant_count = ?, winners_published = ?, result_visibility = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [name, description, startDate, endDate, status, participantIds.length, winnersPublished, resultVisibility, roundId],
    )

    await syncRoundParticipants(roundId, participantIds, connection)
    await syncRoundCategories(roundId, categoryIds, connection)

    if (requestedStatus === 'ACTIVE') {
      await activateVotingRound(roundId, connection)
    }

    await connection.commit()

    return res.json({
      success: true,
      message: 'Voting round updated successfully.',
      status: requestedStatus,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return res.status(500).json({ message: error.message || 'Unable to update voting round.', error: error.message })
  } finally {
    connection.release()
  }
})

app.post('/api/voting-rounds/:id/make-live', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    await activateVotingRound(roundId)
    return res.json({ success: true, message: 'Voting round is now live.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to make the voting round live.' })
  }
})

app.post('/api/voting-rounds/:id/stop-live', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    await stopVotingRound(roundId)
    return res.json({ success: true, message: 'Voting round is no longer live.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to stop the live voting round.' })
  }
})

app.post('/api/voting-rounds/:id/extend-live', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    const result = await extendLiveVotingRound(roundId)
    return res.json({
      success: true,
      message: `Live voting extended by ${result.extensionMinutes} minutes.`,
      endDate: result.updatedEndDate,
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to extend the live voting round.' })
  }
})

app.post('/api/voting-rounds/:id/end', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    await completeVotingRound(roundId)
    return res.json({ success: true, message: 'Voting round ended successfully.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to end the voting round.' })
  }
})

app.get('/api/voting-rounds/:id/winners', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    const result = await getRoundWinnerPreview(roundId)

    return res.json({
      round: {
        id: result.round.id,
        name: result.round.name,
        description: result.round.description || '',
        status: result.round.status,
        startDate: result.round.start_date,
        endDate: result.round.end_date,
        totalVotes: result.totalVotes,
        validVotes: result.validVotes,
        winnersPublished: result.winnersPublished,
        resultVisibility: result.resultVisibility,
      },
      winners: result.winners,
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to load the winner preview.' })
  }
})

app.post('/api/voting-rounds/:id/publish-winners', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    const result = await publishRoundWinners(roundId)

    return res.json({
      round: {
        id: result.round.id,
        name: result.round.name,
        description: result.round.description || '',
        status: result.round.status,
        startDate: result.round.start_date,
        endDate: result.round.end_date,
        totalVotes: result.totalVotes,
        validVotes: result.validVotes,
        winnersPublished: result.winnersPublished,
        resultVisibility: result.resultVisibility,
      },
      winners: result.winners,
      message: 'Winner list is now live on the Home page.',
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to publish the winner list.' })
  }
})

app.post('/api/voting-rounds/:id/result-visibility', async (req, res) => {
  const roundId = Number(req.params.id)
  const visibility = normalizeRoundResultVisibility(req.body?.visibility)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    const result = await setRoundResultVisibility(roundId, visibility)
    const message =
      visibility === 'VISIBLE'
        ? 'Winner list is now live on the Home page.'
        : visibility === 'HIDDEN'
          ? 'Winner list is now hidden from the Home page.'
          : 'Home page now shows that voting is finished and waiting for the result.'

    return res.json({
      round: {
        id: result.round.id,
        name: result.round.name,
        description: result.round.description || '',
        status: result.round.status,
        startDate: result.round.start_date,
        endDate: result.round.end_date,
        totalVotes: result.totalVotes,
        validVotes: result.validVotes,
        winnersPublished: result.winnersPublished,
        resultVisibility: result.resultVisibility,
      },
      winners: result.winners,
      message,
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update the Home page result visibility.' })
  }
})

app.delete('/api/voting-rounds/:id', async (req, res) => {
  const roundId = Number(req.params.id)

  if (!roundId) {
    return res.status(400).json({ message: 'Valid round id is required.' })
  }

  try {
    await execute('DELETE FROM votes WHERE voting_round_id = ?', [roundId])
    await execute('DELETE FROM voting_round_categories WHERE voting_round_id = ?', [roundId])
    await execute('DELETE FROM voting_round_participants WHERE voting_round_id = ?', [roundId])
    await execute('DELETE FROM voting_rounds WHERE id = ?', [roundId])

    return res.json({ success: true, message: 'Voting round deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete voting round.', error: error.message })
  }
})

app.get('/api/rosters', async (_req, res) => {
  try {
    const rosterRows = await query(
      `
        SELECT rosters.*, admins.full_name AS creator_name, COUNT(roster_assignments.id) AS assigned_count
        FROM rosters
        LEFT JOIN admins ON admins.id = rosters.created_by_admin_id
        LEFT JOIN roster_assignments ON roster_assignments.roster_id = rosters.id
        GROUP BY rosters.id, admins.full_name
        ORDER BY rosters.updated_at DESC, rosters.id DESC
      `,
    )
    const assignmentRows = await getRosterAssignments(rosterRows.map((row) => row.id))
    const employeeOptions = await query(
      `
        SELECT id, badge_id, badge_username, full_name, department_name, role_name, employment_status, photo_data
        FROM employees
        WHERE employment_status = 'ACTIVE'
        ORDER BY full_name ASC
      `,
    )
    const assignmentMap = assignmentRows.reduce((accumulator, row) => {
      if (!accumulator.has(row.roster_id)) {
        accumulator.set(row.roster_id, [])
      }

      accumulator.get(row.roster_id).push(row)
      return accumulator
    }, new Map())
    const rosters = rosterRows.map((row) => {
      const payload = formatRosterPayload(row, assignmentMap.get(row.id) || [])

      return {
        ...payload,
        homeStatusLabel: payload.homeVisibility ? 'Live on Home' : 'Hidden from Home',
        homeStatusClass: payload.homeVisibility ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600',
      }
    })

    return res.json({
      stats: [
        { title: 'Total Rosters', value: formatNumber(rosters.length), note: 'All roster pages', icon: 'view_list', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Live on Home', value: formatNumber(rosters.filter((roster) => roster.homeVisibility).length), note: 'Visible roster pages', icon: 'home', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Assigned Associates', value: formatNumber(rosters.reduce((sum, roster) => sum + roster.totalAssociates, 0)), note: 'Across all rosters', icon: 'groups', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Sections Used', value: formatNumber(rosters.reduce((sum, roster) => sum + roster.sectionCount, 0)), note: 'Filled roster sections', icon: 'dashboard_customize', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      rosters,
      rosterSections: ROSTER_SECTIONS,
      employeeOptions: employeeOptions.map((employee) => ({
        id: employee.id,
        badgeId: employee.badge_id,
        badgeUsername: employee.badge_username || '',
        fullName: employee.full_name,
        departmentName: employee.department_name,
        roleName: employee.role_name,
        photoData: employee.photo_data || '',
      })),
      pagination: {
        showing: `Showing 1 to ${rosters.length} of ${rosters.length} rosters`,
      },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load rosters.', error: error.message })
  }
})

app.post('/api/rosters', async (req, res) => {
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const assignments = parseRosterAssignments(req.body?.assignments)

  if (!name || !assignments.length) {
    return res.status(400).json({ message: 'Roster name and at least one associate assignment are required.' })
  }

  try {
    const employeeIds = assignments.map((assignment) => assignment.employeeId)
    const employeeRows = await query(
      `
        SELECT id
        FROM employees
        WHERE employment_status = 'ACTIVE' AND id IN (?)
      `,
      [employeeIds],
    )

    if (employeeRows.length !== employeeIds.length) {
      return res.status(400).json({ message: 'Only active associates can be assigned to a roster.' })
    }

    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()
      const result = await executeWith(
        connection,
        `
          INSERT INTO rosters (name, description, home_visibility, created_by_admin_id, created_at)
          VALUES (?, ?, 0, ?, NOW())
        `,
        [name, description, 1],
      )
      await syncRosterAssignments(result.insertId, assignments, connection)
      await connection.commit()
      return res.json({ success: true, message: 'Roster created successfully.' })
    } catch (error) {
      await connection.rollback().catch(() => {})
      return res.status(500).json({ message: error.message || 'Unable to create roster.', error: error.message })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(500).json({ message: 'Unable to validate roster associates.', error: error.message })
  }
})

app.put('/api/rosters/:id', async (req, res) => {
  const rosterId = Number(req.params.id)
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const assignments = parseRosterAssignments(req.body?.assignments)

  if (!rosterId || !name || !assignments.length) {
    return res.status(400).json({ message: 'Valid roster details and assignments are required.' })
  }

  try {
    const existingRoster = await getRosterById(rosterId)

    if (!existingRoster) {
      return res.status(404).json({ message: 'Roster not found.' })
    }

    const employeeIds = assignments.map((assignment) => assignment.employeeId)
    const employeeRows = await query(
      `
        SELECT id
        FROM employees
        WHERE employment_status = 'ACTIVE' AND id IN (?)
      `,
      [employeeIds],
    )

    if (employeeRows.length !== employeeIds.length) {
      return res.status(400).json({ message: 'Only active associates can be assigned to a roster.' })
    }

    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()
      await executeWith(
        connection,
        `
          UPDATE rosters
          SET name = ?, description = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [name, description, rosterId],
      )
      await syncRosterAssignments(rosterId, assignments, connection)
      await connection.commit()
      return res.json({ success: true, message: 'Roster updated successfully.' })
    } catch (error) {
      await connection.rollback().catch(() => {})
      return res.status(500).json({ message: error.message || 'Unable to update roster.', error: error.message })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save roster.', error: error.message })
  }
})

app.post('/api/rosters/:id/home-visibility', async (req, res) => {
  const rosterId = Number(req.params.id)
  const visible = req.body?.visible === true

  if (!rosterId) {
    return res.status(400).json({ message: 'Valid roster id is required.' })
  }

  try {
    const roster = await setRosterHomeVisibility(rosterId, visible)
    return res.json({
      roster,
      message: visible
        ? 'Roster is now live on the Home page.'
        : 'Roster is now hidden from the Home page.',
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update roster Home page visibility.' })
  }
})

app.delete('/api/rosters/:id', async (req, res) => {
  const rosterId = Number(req.params.id)

  if (!rosterId) {
    return res.status(400).json({ message: 'Valid roster id is required.' })
  }

  try {
    await execute('DELETE FROM roster_assignments WHERE roster_id = ?', [rosterId])
    await execute('DELETE FROM rosters WHERE id = ?', [rosterId])
    return res.json({ success: true, message: 'Roster deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete roster.', error: error.message })
  }
})

app.get('/api/admins', async (_req, res) => {
  try {
    const admins = await query('SELECT * FROM admins ORDER BY id ASC')
    const activeCount = admins.filter((row) => row.is_active).length

    res.json({
      stats: [
        { title: 'Total Admins', value: formatNumber(admins.length), note: 'All system administrators', icon: 'group', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Active Admins', value: formatNumber(activeCount), note: 'Currently active accounts', icon: 'verified_user', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Inactive Admins', value: formatNumber(admins.length - activeCount), note: 'Deactivated accounts', icon: 'person_off', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Super Admins', value: formatNumber(admins.filter((row) => row.access_level === 'Super Administrator').length), note: 'Full system access', icon: 'workspace_premium', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      admins: admins.map((row, index) => [
        `${index + 1}`,
        row.full_name,
        row.username || '',
        row.email || '',
        row.access_level,
        row.is_active ? 'Active' : 'Inactive',
        row.last_login ? formatDateTime(row.last_login) : 'Never',
        getInitials(row.full_name),
        row.avatar_color || 'bg-slate-950 text-white',
        row.access_level === 'Super Administrator' ? 'Super Admin' : '',
        row.id,
        row.badge_code,
      ]),
      info: 'Super Admins have full access to all features and settings in the system.',
      pagination: {
        showing: `Showing 1 to ${admins.length} of ${admins.length} admins`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load admins.', error: error.message })
  }
})

app.post('/api/admins', async (req, res) => {
  const badgeCode = req.body?.badgeCode?.trim()
  const fullName = req.body?.fullName?.trim()
  const username = req.body?.username?.trim()
  const email = req.body?.email?.trim()
  const accessLevel = req.body?.accessLevel?.trim() || 'Administrator'
  const password = req.body?.password ?? ''
  const isActive = parseBooleanInput(req.body?.isActive ?? true)

  if (!badgeCode || !fullName || !username || !email || !password) {
    return res.status(400).json({ message: 'All admin fields are required.' })
  }

  if (!/^\d+$/.test(badgeCode)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    await execute(
      `
        INSERT INTO admins
        (badge_code, full_name, username, email, role, access_level, password_hash, avatar_color, last_login, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `,
      [
        badgeCode,
        fullName,
        username,
        email,
        accessLevel === 'Super Administrator' ? 'Administrator' : accessLevel,
        accessLevel,
        hashPassword(password),
        'bg-blue-500 text-white',
        isActive ? 1 : 0,
      ],
    )

    return res.json({ success: true, message: 'Admin created successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create admin.', error: error.message })
  }
})

app.put('/api/admins/:id', async (req, res) => {
  const adminId = Number(req.params.id)
  const badgeCode = req.body?.badgeCode?.trim()
  const fullName = req.body?.fullName?.trim()
  const username = req.body?.username?.trim()
  const email = req.body?.email?.trim()
  const accessLevel = req.body?.accessLevel?.trim() || 'Administrator'
  const password = req.body?.password ?? ''
  const isActive = parseBooleanInput(req.body?.isActive ?? true)

  if (!adminId || !badgeCode || !fullName || !username || !email) {
    return res.status(400).json({ message: 'Valid admin data is required.' })
  }

  if (!/^\d+$/.test(badgeCode)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    if (password) {
      await execute(
        `
          UPDATE admins
          SET badge_code = ?, full_name = ?, username = ?, email = ?, role = ?, access_level = ?, password_hash = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [
          badgeCode,
          fullName,
          username,
          email,
          accessLevel === 'Super Administrator' ? 'Administrator' : accessLevel,
          accessLevel,
          hashPassword(password),
          isActive ? 1 : 0,
          adminId,
        ],
      )
    } else {
      await execute(
        `
          UPDATE admins
          SET badge_code = ?, full_name = ?, username = ?, email = ?, role = ?, access_level = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [
          badgeCode,
          fullName,
          username,
          email,
          accessLevel === 'Super Administrator' ? 'Administrator' : accessLevel,
          accessLevel,
          isActive ? 1 : 0,
          adminId,
        ],
      )
    }

    return res.json({ success: true, message: 'Admin updated successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update admin.', error: error.message })
  }
})

app.delete('/api/admins/:id', async (req, res) => {
  const adminId = Number(req.params.id)

  if (!adminId) {
    return res.status(400).json({ message: 'Valid admin id is required.' })
  }

  try {
    const rows = await query('SELECT badge_code, access_level FROM admins WHERE id = ? LIMIT 1', [adminId])
    const admin = rows[0]

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found.' })
    }

    if (admin.badge_code === protectedSuperAdmin.badgeCode || admin.access_level === protectedSuperAdmin.accessLevel) {
      return res.status(400).json({ message: 'Super admin account cannot be deleted.' })
    }

    await execute('UPDATE categories SET created_by_admin_id = 1 WHERE created_by_admin_id = ?', [adminId])
    await execute('UPDATE voting_rounds SET created_by_admin_id = 1 WHERE created_by_admin_id = ?', [adminId])
    await execute('DELETE FROM admins WHERE id = ?', [adminId])

    return res.json({ success: true, message: 'Admin deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete admin.', error: error.message })
  }
})

app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await getSettingMap()
    const rounds = await query('SELECT COUNT(*) AS total_rounds, SUM(total_votes) AS total_votes FROM voting_rounds')
    const employees = await query('SELECT COUNT(*) AS total_employees FROM employees')

    res.json({
      menuItems: [
        { label: 'General', description: 'Basic system settings', active: true, icon: 'settings' },
        { label: 'Voting Settings', description: 'Configure voting rules', active: false, icon: 'how_to_vote' },
        { label: 'Round Settings', description: 'Default round configurations', active: false, icon: 'schedule' },
        { label: 'Email Settings', description: 'Email and notifications', active: false, icon: 'mail' },
        { label: 'Security', description: 'Password & access control', active: false, icon: 'shield' },
        { label: 'Appearance', description: 'System appearance', active: false, icon: 'palette' },
        { label: 'Notifications', description: 'In-app & push notifications', active: false, icon: 'notifications' },
        { label: 'Backup & Restore', description: 'Backup system data', active: false, icon: 'save' },
        { label: 'Integrations', description: 'Third-party services', active: false, icon: 'hub' },
        { label: 'Audit Settings', description: 'Logs and audit configuration', active: false, icon: 'receipt_long' },
      ],
      siteInfo: {
        siteName: settings.site_name,
        siteTagline: settings.site_tagline,
        siteLogo: settings.site_logo || '',
        timezone: settings.timezone,
        dateFormat: settings.date_format,
        timeFormat: settings.time_format,
        currency: settings.currency,
      },
      brandingColors: getBrandingSettings(settings),
      votingSettings: {
        allowDuplicateVoting: settings.allow_duplicate_voting === 'true',
        requireVoteConfirmation: settings.require_vote_confirmation === 'true',
        voteEditing: settings.vote_editing === 'true',
        votesPerUser: settings.votes_per_user,
        liveExtensionMinutes: settings.live_extension_minutes,
      },
      emailSettings: {
        fromEmail: settings.from_email,
        fromName: settings.from_name,
        smtpProvider: settings.smtp_provider,
      },
      systemInfo: [
        ['Current Version', settings.version],
        ['Last Updated', settings.last_updated],
        ['Total Associates', formatNumber(employees[0].total_employees)],
        ['Total Voting Rounds', formatNumber(rounds[0].total_rounds)],
        ['Total Votes Cast', formatNumber(rounds[0].total_votes)],
      ],
      securityInfo: [
        ['Password Policy', settings.password_policy],
        ['Two-Factor Authentication', settings.two_factor_authentication],
        ['Session Timeout', settings.session_timeout],
        ['Login Attempts Limit', settings.login_attempts_limit],
      ],
      backupInfo: [
        ['Last Backup', settings.last_backup],
        ['Backup Frequency', settings.backup_frequency],
        ['Next Backup', settings.next_backup],
      ],
      databaseStatus: 'Connected',
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load settings.', error: error.message })
  }
})

app.post('/api/settings', async (req, res) => {
  const siteInfo = req.body?.siteInfo || {}
  const brandingColors = req.body?.brandingColors || {}
  const votingSettings = req.body?.votingSettings || {}
  const emailSettings = req.body?.emailSettings || {}
  let siteLogo = null

  try {
    siteLogo = sanitizeSiteLogoData(siteInfo.siteLogo)
    await upsertSettingEntries([
      ['site_name', 'general', siteInfo.siteName || DEFAULT_SITE_INFO.siteName],
      ['site_tagline', 'general', siteInfo.siteTagline || DEFAULT_SITE_INFO.siteTagline],
      ['site_logo', 'general', siteLogo || ''],
      ['timezone', 'general', siteInfo.timezone || DEFAULT_SITE_INFO.timezone],
      ['date_format', 'general', siteInfo.dateFormat || DEFAULT_SITE_INFO.dateFormat],
      ['time_format', 'general', siteInfo.timeFormat || DEFAULT_SITE_INFO.timeFormat],
      ['currency', 'general', siteInfo.currency || DEFAULT_SITE_INFO.currency],
      ['primary_color', 'branding', normalizeBrandingColor(brandingColors.primaryColor, DEFAULT_BRANDING_COLORS.primaryColor)],
      ['secondary_color', 'branding', normalizeBrandingColor(brandingColors.secondaryColor, DEFAULT_BRANDING_COLORS.secondaryColor)],
      ['accent_color', 'branding', normalizeBrandingColor(brandingColors.accentColor, DEFAULT_BRANDING_COLORS.accentColor)],
      ['surface_color', 'branding', normalizeBrandingColor(brandingColors.surfaceColor, DEFAULT_BRANDING_COLORS.surfaceColor)],
      ['border_color', 'branding', normalizeBrandingColor(brandingColors.borderColor, DEFAULT_BRANDING_COLORS.borderColor)],
      ['allow_duplicate_voting', 'voting', `${parseBooleanInput(votingSettings.allowDuplicateVoting)}`],
      ['require_vote_confirmation', 'voting', `${parseBooleanInput(votingSettings.requireVoteConfirmation)}`],
      ['vote_editing', 'voting', `${parseBooleanInput(votingSettings.voteEditing)}`],
      ['votes_per_user', 'voting', `${votingSettings.votesPerUser || 10}`],
      ['live_extension_minutes', 'voting', `${Math.max(1, Number(votingSettings.liveExtensionMinutes || 15))}`],
      ['from_email', 'email', emailSettings.fromEmail || 'no-reply@inboundstar.com'],
      ['from_name', 'email', emailSettings.fromName || DEFAULT_SITE_INFO.siteName],
      ['smtp_provider', 'email', emailSettings.smtpProvider || 'SendGrid'],
      ['last_updated', 'system', formatDateTime(new Date())],
    ])

    return res.json({ success: true, message: 'Settings saved successfully.' })
  } catch (error) {
    const statusCode = /site logo/i.test(error.message || '') ? 400 : 500
    return res.status(statusCode).json({ message: error.message || 'Unable to save settings.', error: error.message })
  }
})

app.get('/api/audit-logs', async (_req, res) => {
  try {
    const stats = await query(
      `
        SELECT
          COUNT(*) AS total_logs,
          SUM(status = 'Success') AS success_logs,
          SUM(status = 'Warning') AS warning_logs,
          SUM(status = 'Failed') AS failed_logs
        FROM audit_logs
      `,
    )

    const rows = await query('SELECT * FROM audit_logs ORDER BY created_at DESC')
    const totalLogs = stats[0].total_logs
    const uniqueModules = [...new Set(rows.map((row) => row.module_name))]
    const uniqueActions = [...new Set(rows.map((row) => row.action_title))]
    const uniqueUsers = [...new Set(rows.map((row) => row.user_name))]

    res.json({
      stats: [
        { title: 'Total Activities', value: formatNumber(totalLogs), note: 'All time', icon: 'list_alt', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Successful', value: formatNumber(stats[0].success_logs), note: formatPercent(stats[0].success_logs, totalLogs), icon: 'check_circle', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Warnings', value: formatNumber(stats[0].warning_logs), note: formatPercent(stats[0].warning_logs, totalLogs), icon: 'warning', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Failed', value: formatNumber(stats[0].failed_logs), note: formatPercent(stats[0].failed_logs, totalLogs), icon: 'shield', panel: 'bg-rose-50', iconBg: 'bg-rose-500' },
      ],
      logs: rows.map((row, index) => [
        `${index + 1}`,
        formatDateTime(row.created_at),
        row.user_name,
        row.user_role,
        row.action_title,
        row.action_subject,
        row.module_name,
        row.details,
        row.ip_address,
        row.status,
        {
          initials: getInitials(row.user_name),
          avatarColor:
            row.user_name === 'Admin'
              ? 'bg-slate-950 text-white'
              : row.user_name === 'James Miller'
                ? 'bg-violet-500 text-white'
                : row.user_name === 'Sarah Roberts'
                  ? 'bg-emerald-500 text-white'
                  : row.user_name === 'David Wilson'
                    ? 'bg-orange-500 text-white'
                    : row.user_name === 'Lisa Parker'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-400 text-white',
          moduleClass: getModuleClass(row.module_name),
          statusClass: statusClassMap[row.status.toUpperCase()] || 'bg-slate-100 text-slate-500',
          icon: row.icon,
        },
      ]),
      filters: {
        actions: uniqueActions,
        users: uniqueUsers,
        modules: uniqueModules,
        statuses: ['Success', 'Warning', 'Failed'],
      },
      retention: 'Audit logs are retained for 12 months.',
      pagination: {
        showing: `Showing 1 to ${formatNumber(totalLogs)} of ${formatNumber(totalLogs)} activities`,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Unable to load audit logs.', error: error.message })
  }
})

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath))
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
}

const startServer = async () => {
  await initializeDatabase()

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start Voting System API:', error)
  process.exit(1)
})


const normalizeEmployeeV2JoinDateInput = (value) => {
  const trimmed = `${value || ''}`.trim()

  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const normalizedValue = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  return formatDateValue(parsedDate)
}

const normalizeEmployeeV2Status = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return ['ACTIVE', 'INACTIVE'].includes(normalized) ? normalized : 'ACTIVE'
}

const mapEmployeeV2Payload = (row) => ({
  id: row.id,
  badgeId: row.badge_id,
  badgeUsername: row.badge_username || '',
  fullName: row.full_name,
  departmentName: row.department_name,
  roleName: row.role_name,
  employmentStatus: row.employment_status,
  joinDateLabel: formatDateLabel(row.join_date),
  email: row.email,
  joinDateValue: formatDateValue(row.join_date),
  photoData: row.photo_data,
})

const ensureEmployeeV2Schema = async () => {
  await ensureColumn('employees', 'badge_username VARCHAR(120) NULL AFTER badge_id')
}

void ensureEmployeeV2Schema().catch((error) => {
  console.error('Unable to prepare employee v2 schema:', error)
})

app.get('/api/employees-v2', async (_req, res) => {
  try {
    await ensureEmployeeV2Schema()
    const rows = await query('SELECT * FROM employees ORDER BY id ASC')
    const activeCount = rows.filter((row) => row.employment_status === 'ACTIVE').length
    const votedRows = await query(
      `
        SELECT COUNT(DISTINCT voter_employee_id) AS voted_count
        FROM votes
      `,
    )

    return res.json({
      stats: [
        { title: 'Total Associates', value: formatNumber(rows.length), note: 'All associates', icon: 'group', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Active Associates', value: formatNumber(activeCount), note: `${formatPercent(activeCount, rows.length)} of total`, icon: 'task_alt', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Inactive Associates', value: formatNumber(rows.length - activeCount), note: `${formatPercent(rows.length - activeCount, rows.length)} of total`, icon: 'pause_circle', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Associates Voted', value: formatNumber(votedRows[0]?.voted_count || 0), note: 'In current round', icon: 'work', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      employees: rows.map(mapEmployeeV2Payload),
      pagination: {
        showing: `Showing 1 to ${rows.length} of ${rows.length} associates`,
      },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load associates.', error: error.message })
  }
})

app.post('/api/employees-v2', async (req, res) => {
  const badgeId = req.body?.badgeId?.trim()
  const badgeUsername = req.body?.badgeUsername?.trim() || ''
  const fullName = req.body?.fullName?.trim()
  const departmentName = req.body?.departmentName?.trim()
  const roleName = req.body?.roleName?.trim()
  const email = req.body?.email?.trim()
  const employmentStatus = normalizeEmployeeV2Status(req.body?.employmentStatus)
  const joinDate = normalizeEmployeeV2JoinDateInput(req.body?.joinDate)
  let photoData = null

  try {
    await ensureEmployeeV2Schema()
    photoData = sanitizePhotoData(req.body?.photoData)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid associate photo.' })
  }

  if (!badgeId || !fullName || !departmentName || !roleName || !email || !joinDate) {
    return res.status(400).json({ message: 'All associate fields are required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    await execute(
      `
        INSERT INTO employees
        (badge_id, badge_username, full_name, department_name, role_name, email, photo_data, employment_status, join_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [badgeId, badgeUsername, fullName, departmentName, roleName, email, photoData, employmentStatus, joinDate],
    )

    return res.json({ success: true, message: 'Associate created successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create associate.', error: error.message })
  }
})

app.put('/api/employees-v2/:id', async (req, res) => {
  const employeeId = Number(req.params.id)
  const badgeId = req.body?.badgeId?.trim()
  const badgeUsername = req.body?.badgeUsername?.trim() || ''
  const fullName = req.body?.fullName?.trim()
  const departmentName = req.body?.departmentName?.trim()
  const roleName = req.body?.roleName?.trim()
  const email = req.body?.email?.trim()
  const employmentStatus = normalizeEmployeeV2Status(req.body?.employmentStatus)
  const joinDate = normalizeEmployeeV2JoinDateInput(req.body?.joinDate)
  let photoData = null

  try {
    await ensureEmployeeV2Schema()
    photoData = sanitizePhotoData(req.body?.photoData)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid associate photo.' })
  }

  if (!employeeId || !badgeId || !fullName || !departmentName || !roleName || !email || !joinDate) {
    return res.status(400).json({ message: 'All associate fields are required.' })
  }

  if (!/^\d+$/.test(badgeId)) {
    return res.status(400).json({ message: 'Badge ID must contain digits only.' })
  }

  try {
    await execute(
      `
        UPDATE employees
        SET badge_id = ?, badge_username = ?, full_name = ?, department_name = ?, role_name = ?, email = ?, photo_data = ?, employment_status = ?, join_date = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [badgeId, badgeUsername, fullName, departmentName, roleName, email, photoData, employmentStatus, joinDate, employeeId],
    )

    return res.json({ success: true, message: 'Associate updated successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update associate.', error: error.message })
  }
})

app.delete('/api/employees-v2/:id', async (req, res) => {
  const employeeId = Number(req.params.id)

  if (!employeeId) {
    return res.status(400).json({ message: 'Valid associate id is required.' })
  }

  try {
    const affectedRounds = await query(
      `
        SELECT DISTINCT voting_round_id
        FROM voting_round_participants
        WHERE employee_id = ?
      `,
      [employeeId],
    )
    await execute('DELETE FROM votes WHERE voter_employee_id = ? OR candidate_employee_id = ?', [employeeId, employeeId])
    await execute('DELETE FROM voting_round_participants WHERE employee_id = ?', [employeeId])
    await execute('DELETE FROM roster_assignments WHERE employee_id = ?', [employeeId])
    await execute('DELETE FROM employees WHERE id = ?', [employeeId])

    for (const round of affectedRounds) {
      await recalculateRoundStats(round.voting_round_id)
    }

    return res.json({ success: true, message: 'Associate deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete associate.', error: error.message })
  }
})

app.post('/api/employees-v2/import', async (req, res) => {
  const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : []

  if (!incomingRows.length) {
    return res.status(400).json({ message: 'Add at least one associate row to import.' })
  }

  try {
    await ensureEmployeeV2Schema()
  } catch (error) {
    return res.status(500).json({ message: 'Unable to prepare associates import.', error: error.message })
  }

  const rows = incomingRows
    .map((entry, index) => ({
      rowNumber: index + 2,
      badgeId: `${entry?.badgeId || ''}`.trim(),
      badgeUsername: `${entry?.badgeUsername || ''}`.trim(),
      fullName: `${entry?.fullName || ''}`.trim(),
      departmentName: `${entry?.departmentName || ''}`.trim(),
      roleName: `${entry?.roleName || ''}`.trim(),
      email: `${entry?.email || ''}`.trim(),
      employmentStatus: normalizeEmployeeV2Status(entry?.employmentStatus),
      joinDate: normalizeEmployeeV2JoinDateInput(entry?.joinDate),
    }))
    .filter((entry) =>
      [
        entry.badgeId,
        entry.badgeUsername,
        entry.fullName,
        entry.departmentName,
        entry.roleName,
        entry.email,
        entry.joinDate,
      ].some(Boolean),
    )

  if (!rows.length) {
    return res.status(400).json({ message: 'The Excel file does not contain any associate rows to import.' })
  }

  if (rows.length > 2000) {
    return res.status(400).json({ message: 'Import up to 2000 associates per file.' })
  }

  const duplicateBadgeIds = rows.reduce((accumulator, row) => {
    accumulator.set(row.badgeId, (accumulator.get(row.badgeId) || 0) + 1)
    return accumulator
  }, new Map())
  const repeatedBadgeIds = Array.from(duplicateBadgeIds.entries())
    .filter(([badgeId, count]) => badgeId && count > 1)
    .map(([badgeId]) => badgeId)

  if (repeatedBadgeIds.length) {
    return res.status(400).json({
      message: `Duplicate Badge ID values found in the Excel file: ${repeatedBadgeIds.slice(0, 10).join(', ')}`,
    })
  }

  const invalidRow = rows.find(
    (row) =>
      !row.badgeId ||
      !row.fullName ||
      !row.departmentName ||
      !row.roleName ||
      !row.email ||
      !row.joinDate ||
      !/^\d+$/.test(row.badgeId),
  )

  if (invalidRow) {
    return res.status(400).json({
      message: `Row ${invalidRow.rowNumber} is invalid. Badge ID, Full Name, Department, Role, Email, and Join Date are required, and Badge ID must contain digits only.`,
    })
  }

  try {
    const badgeIds = rows.map((row) => row.badgeId)
    const existingRows = await query(
      `
        SELECT id, badge_id
        FROM employees
        WHERE badge_id IN (?)
      `,
      [badgeIds],
    )
    const existingBadgeMap = new Map(existingRows.map((row) => [row.badge_id, row.id]))
    let createdCount = 0
    let updatedCount = 0
    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()

      for (const row of rows) {
        const existingEmployeeId = existingBadgeMap.get(row.badgeId)

        if (existingEmployeeId) {
          await executeWith(
            connection,
            `
              UPDATE employees
              SET badge_username = ?, full_name = ?, department_name = ?, role_name = ?, email = ?, employment_status = ?, join_date = ?, updated_at = NOW()
              WHERE id = ?
            `,
            [
              row.badgeUsername,
              row.fullName,
              row.departmentName,
              row.roleName,
              row.email,
              row.employmentStatus,
              row.joinDate,
              existingEmployeeId,
            ],
          )
          updatedCount += 1
          continue
        }

        await executeWith(
          connection,
          `
            INSERT INTO employees
            (badge_id, badge_username, full_name, department_name, role_name, email, photo_data, employment_status, join_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW())
          `,
          [
            row.badgeId,
            row.badgeUsername,
            row.fullName,
            row.departmentName,
            row.roleName,
            row.email,
            row.employmentStatus,
            row.joinDate,
          ],
        )
        createdCount += 1
      }

      await connection.commit()
      return res.json({
        success: true,
        createdCount,
        updatedCount,
        totalCount: rows.length,
        message: `Excel import finished successfully. ${createdCount} associates created and ${updatedCount} associates updated.`,
      })
    } catch (error) {
      await connection.rollback().catch(() => {})
      return res.status(500).json({ message: 'Unable to import associates.', error: error.message })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(500).json({ message: 'Unable to import associates.', error: error.message })
  }
})


const ROSTER_V2_SECTIONS = Object.freeze([
  { key: 'STOW', label: 'Stow' },
  { key: 'QUANTITY_STOW', label: 'Quantity Stow' },
  { key: 'CUBISCAN', label: 'Cubiscan' },
  { key: 'STOW_PG', label: 'Stow PG' },
  { key: 'ISS', label: 'ISS' },
  { key: 'WATER_SPIDER', label: 'Water Spider' },
])
const rosterV2SectionLabelMap = new Map(ROSTER_V2_SECTIONS.map((section) => [section.key, section.label]))
const STATION_V2_FLOORS = Object.freeze(['P2', 'P3', 'P4'])
const STATION_V2_TYPES = Object.freeze(['AR', 'UNIVERSAL', 'QUANTITY_STOW'])
const ROSTER_V2_STATION_SECTIONS = new Set(['STOW', 'CUBISCAN', 'QUANTITY_STOW'])
const ROSTER_V2_DETAIL_OPTIONS = Object.freeze({
  ISS: [
    { key: 'RECEIVE_ANDON', label: 'Receive Andon' },
    { key: 'IOL_FUD', label: 'IOL/FUD' },
    { key: 'STOW_ANDON_P2', label: 'Stow Andon P2' },
    { key: 'STOW_ANDON_P3', label: 'Stow Andon P3' },
    { key: 'STOW_ANDON_P4', label: 'Stow Andon P4' },
    { key: 'TICKETLAND', label: 'TicketLand' },
    { key: 'TICKETS', label: 'Tickets' },
    { key: 'ILACS', label: 'ILACS' },
  ],
  WATER_SPIDER: [
    { key: 'P2_WATER_SPIDER', label: 'P2 Water Spider' },
    { key: 'P2_SOUTH_CART_RUNNER', label: 'P2 South Cart Runner' },
    { key: 'P2_NORTH_DOWNSTACK', label: 'P2 North Downstack' },
    { key: 'P3_WATER_SPIDER', label: 'P3 Water Spider' },
    { key: 'P3_SOUTH_CART_RUNNER', label: 'P3 South Cart Runner' },
    { key: 'P3_NORTH_DOWNSTACK', label: 'P3 North Downstack' },
    { key: 'P4_WATER_SPIDER', label: 'P4 Water Spider' },
    { key: 'P4_SOUTH_CART_RUNNER', label: 'P4 South Cart Runner' },
    { key: 'P4_NORTH_DOWNSTACK', label: 'P4 North Downstack' },
  ],
})
const rosterV2DetailLabelMap = new Map(
  Object.values(ROSTER_V2_DETAIL_OPTIONS)
    .flat()
    .map((option) => [option.key, option.label]),
)
const normalizeRosterV2SectionKey = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return rosterV2SectionLabelMap.has(normalized) ? normalized : ''
}
const normalizeRosterV2Floor = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return STATION_V2_FLOORS.includes(normalized) ? normalized : ''
}
const normalizeRosterV2DetailKey = (sectionKey, value) => {
  const normalizedSectionKey = normalizeRosterV2SectionKey(sectionKey)
  const normalizedValue = `${value || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const supportedOptions = ROSTER_V2_DETAIL_OPTIONS[normalizedSectionKey] || []
  return supportedOptions.some((option) => option.key === normalizedValue) ? normalizedValue : ''
}
const getRosterV2DetailLabel = (value) => rosterV2DetailLabelMap.get(`${value || ''}`.trim().toUpperCase()) || ''
const normalizeStationV2Floor = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase()
  return STATION_V2_FLOORS.includes(normalized) ? normalized : ''
}
const normalizeStationV2Type = (value) => {
  const normalized = `${value || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  if (normalized === 'AR' || normalized === 'AR_STATION') {
    return 'AR'
  }

  if (normalized === 'UNIVERSAL' || normalized === 'UNIVERSAL_STATION') {
    return 'UNIVERSAL'
  }

  if (
    normalized === 'QUANTITY_STOW' ||
    normalized === 'QUANTITY_STOW_STATION' ||
    normalized === 'QUANTITY' ||
    normalized === 'QUANTITY_STATION'
  ) {
    return 'QUANTITY_STOW'
  }

  return ''
}
const formatStationV2Payload = (row) => ({
  id: row.id,
  floorCode: row.floor_code,
  stationCode: row.station_code,
  stationType: row.station_type,
  isFarAway: Boolean(row.is_far_away),
  label: `${row.floor_code} - ${row.station_code}`,
  displayLabel: `${row.floor_code} - ${row.station_code} | ${row.station_type}${row.is_far_away ? ' | Far Away' : ''}`,
})

const ensureRosterStationV2Schema = async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS stations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      floor_code VARCHAR(10) NOT NULL,
      station_code VARCHAR(60) NOT NULL,
      station_type VARCHAR(20) NOT NULL DEFAULT 'UNIVERSAL',
      is_far_away TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_station_floor_code (floor_code, station_code)
    )
  `)
  await ensureColumn('roster_assignments', 'station_id INT NULL AFTER section_key')
  await ensureColumn('roster_assignments', 'floor_code VARCHAR(10) NULL AFTER station_id')
  await ensureColumn('roster_assignments', 'detail_key VARCHAR(80) NULL AFTER floor_code')
}

const getStationsV2 = async () => {
  await ensureRosterStationV2Schema()

  return query(
    `
      SELECT *
      FROM stations
      ORDER BY
        is_far_away ASC,
        CASE floor_code
          WHEN 'P2' THEN 1
          WHEN 'P3' THEN 2
          WHEN 'P4' THEN 3
          ELSE 99
        END ASC,
        station_code ASC
    `,
  )
}

const getRosterAssignmentsV2 = async (rosterIds) => {
  await ensureRosterStationV2Schema()
  const normalizedRosterIds = Array.isArray(rosterIds) ? rosterIds.filter(Boolean) : [rosterIds].filter(Boolean)

  if (!normalizedRosterIds.length) {
    return []
  }

  return query(
    `
      SELECT
        roster_assignments.roster_id,
        roster_assignments.section_key,
        roster_assignments.station_id,
        roster_assignments.floor_code AS assignment_floor_code,
        roster_assignments.detail_key,
        employees.id,
        employees.badge_id,
        employees.full_name,
        employees.department_name,
        employees.role_name,
        employees.photo_data,
        stations.floor_code,
        stations.station_code,
        stations.station_type,
        stations.is_far_away
      FROM roster_assignments
      INNER JOIN employees ON employees.id = roster_assignments.employee_id
      LEFT JOIN stations ON stations.id = roster_assignments.station_id
      WHERE roster_assignments.roster_id IN (?)
      ORDER BY employees.full_name ASC
    `,
    [normalizedRosterIds],
  )
}

const buildRosterV2Sections = (assignmentRows = []) =>
  ROSTER_V2_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    associates: assignmentRows
      .filter((row) => normalizeRosterV2SectionKey(row.section_key) === section.key)
      .map((row) => ({
        id: row.id,
        badgeId: row.badge_id,
        fullName: row.full_name,
        departmentName: row.department_name,
        roleName: row.role_name,
        photoData: row.photo_data || '',
        floorCode: normalizeRosterV2Floor(row.assignment_floor_code || row.floor_code || '') || '',
        detailKey: row.detail_key || '',
        detailLabel: getRosterV2DetailLabel(row.detail_key),
        stationId: row.station_id || null,
        stationFloorCode: row.floor_code || '',
        stationCode: row.station_code || '',
        stationType: row.station_type || '',
        isFarAwayStation: Boolean(row.is_far_away),
        stationLabel: row.station_id ? `${row.floor_code} - ${row.station_code}` : '',
        stationDisplayLabel: row.station_id
          ? `${row.floor_code} - ${row.station_code} | ${row.station_type}${row.is_far_away ? ' | Far Away' : ''}`
          : '',
      })),
  }))

const formatRosterV2Payload = (roster, assignmentRows = []) => {
  const sections = buildRosterV2Sections(assignmentRows)
  const totalAssociates = sections.reduce((sum, section) => sum + section.associates.length, 0)
  const assignedStationCount = assignmentRows.filter((row) => Number(row.station_id)).length
  const farAwayAssignedCount = assignmentRows.filter((row) => Number(row.station_id) && Boolean(row.is_far_away)).length

  return {
    id: roster.id,
    name: roster.name,
    description: roster.description || '',
    homeVisibility: Boolean(roster.home_visibility),
    creator: roster.creator_name || 'Admin',
    createdAt: formatDateTime(roster.created_at),
    updatedAt: formatDateTime(roster.updated_at || roster.created_at),
    totalAssociates,
    sectionCount: sections.filter((section) => section.associates.length).length,
    assignedStationCount,
    farAwayAssignedCount,
    unassignedStationCount: Math.max(0, totalAssociates - assignedStationCount),
    sections,
  }
}

const getLatestRosterV2 = async () => {
  await ensureRosterStationV2Schema()
  const rows = await query(
    `
      SELECT rosters.*, admins.full_name AS creator_name
      FROM rosters
      LEFT JOIN admins ON admins.id = rosters.created_by_admin_id
      ORDER BY rosters.updated_at DESC, rosters.id DESC
      LIMIT 1
    `,
  )

  return rows[0]
}

const getRosterLookupAssignmentLabel = (row) => {
  if (!row) {
    return 'Now Assigned'
  }

  const sectionLabel = rosterV2SectionLabelMap.get(normalizeRosterV2SectionKey(row.section_key)) || row.section_key
  const stationCode = `${row.station_code || ''}`.trim()

  return stationCode ? `${sectionLabel} - ${stationCode}` : `${sectionLabel} - No Station`
}

const parseRosterAssignmentsV2 = (assignments) => {
  if (!Array.isArray(assignments)) {
    return []
  }

  const normalized = new Map()

  assignments.forEach((entry) => {
    const employeeId = Number(entry?.employeeId)
    const sectionKey = normalizeRosterV2SectionKey(entry?.sectionKey)
    const stationId = Number(entry?.stationId) || null
    const floorCode = normalizeRosterV2Floor(entry?.floorCode)
    const detailKey = normalizeRosterV2DetailKey(sectionKey, entry?.detailKey)

    if (!employeeId || !sectionKey) {
      return
    }

    normalized.set(employeeId, {
      employeeId,
      sectionKey,
      stationId,
      floorCode,
      detailKey,
    })
  })

  return Array.from(normalized.values())
}

const validateRosterAssignmentsV2 = async (assignments) => {
  if (!assignments.length) {
    throw new Error('Roster name and at least one associate assignment are required.')
  }

  const employeeIds = assignments.map((assignment) => assignment.employeeId)
  const employeeRows = await query(
    `
      SELECT id
      FROM employees
      WHERE employment_status = 'ACTIVE' AND id IN (?)
    `,
    [employeeIds],
  )

  if (employeeRows.length !== employeeIds.length) {
    throw new Error('Only active associates can be assigned to a roster.')
  }

  const invalidFloorAssignment = assignments.find((assignment) => !normalizeRosterV2Floor(assignment.floorCode))

  if (invalidFloorAssignment) {
    throw new Error('Each associate must be assigned to a valid floor.')
  }

  const stationIds = assignments.map((assignment) => assignment.stationId).filter(Boolean)
  const uniqueStationIds = Array.from(new Set(stationIds))

  if (uniqueStationIds.length !== stationIds.length) {
    throw new Error('Each station can only be assigned to one associate at a time.')
  }

  const stationRows = uniqueStationIds.length
    ? await query(
        `
          SELECT id, floor_code, station_type, is_far_away
          FROM stations
          WHERE id IN (?)
        `,
        [uniqueStationIds],
      )
    : []

  if (stationRows.length !== uniqueStationIds.length) {
    throw new Error('One or more selected stations no longer exist.')
  }

  const stationMap = new Map(stationRows.map((row) => [row.id, row]))

  assignments.forEach((assignment) => {
    const sectionKey = normalizeRosterV2SectionKey(assignment.sectionKey)
    const stationRow = assignment.stationId ? stationMap.get(assignment.stationId) : null
    const needsDetail = Array.isArray(ROSTER_V2_DETAIL_OPTIONS[sectionKey])
    const supportsStation = ROSTER_V2_STATION_SECTIONS.has(sectionKey)

    if (needsDetail && !normalizeRosterV2DetailKey(sectionKey, assignment.detailKey)) {
      throw new Error(`${rosterV2SectionLabelMap.get(sectionKey)} requires a valid role selection.`)
    }

    if (!needsDetail && assignment.detailKey) {
      throw new Error(`${rosterV2SectionLabelMap.get(sectionKey)} cannot keep a role assignment.`)
    }

    if (!supportsStation && assignment.stationId) {
      throw new Error(`${rosterV2SectionLabelMap.get(sectionKey)} does not use station assignments.`)
    }

    if (sectionKey === 'QUANTITY_STOW' && !assignment.stationId) {
      throw new Error('Quantity Stow requires a quantity station for every associate.')
    }

    if (!stationRow) {
      return
    }

    if (normalizeRosterV2Floor(assignment.floorCode) !== normalizeStationV2Floor(stationRow.floor_code)) {
      throw new Error('An associate can only use a station from the same floor assignment.')
    }

    const normalizedStationType = normalizeStationV2Type(stationRow.station_type)

    if (sectionKey === 'QUANTITY_STOW' && normalizedStationType !== 'QUANTITY_STOW') {
      throw new Error('Quantity Stow associates can only use Quantity Stow stations.')
    }

    if (sectionKey !== 'QUANTITY_STOW' && normalizedStationType === 'QUANTITY_STOW') {
      throw new Error('Quantity Stow stations are reserved for Quantity Stow associates only.')
    }
  })
}

const syncRosterAssignmentsV2 = async (rosterId, assignments, runner = pool) => {
  await ensureRosterStationV2Schema()
  await executeWith(runner, 'DELETE FROM roster_assignments WHERE roster_id = ?', [rosterId])

  if (!assignments.length) {
    return
  }

  await chunkInsert(
    `
      INSERT INTO roster_assignments (roster_id, employee_id, section_key, station_id, floor_code, detail_key)
      VALUES ?
    `,
    assignments.map((assignment) => [
      rosterId,
      assignment.employeeId,
      assignment.sectionKey,
      assignment.stationId,
      assignment.floorCode,
      assignment.detailKey || null,
    ]),
    500,
    runner,
  )
}

const setRosterHomeVisibilityV2 = async (rosterId, isVisible) => {
  await ensureRosterStationV2Schema()
  const roster = await getRosterById(rosterId)

  if (!roster) {
    throw new Error('Roster not found.')
  }

  if (isVisible) {
    await getHomePageBlockerForRoster(rosterId)
  }

  await execute(
    `
      UPDATE rosters
      SET home_visibility = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [isVisible ? 1 : 0, rosterId],
  )

  const updatedRoster = await getRosterById(rosterId)
  const assignments = await getRosterAssignmentsV2(rosterId)
  return formatRosterV2Payload(updatedRoster, assignments)
}

app.get('/api/stations-v2', async (_req, res) => {
  try {
    const stationRows = await getStationsV2()
    return res.json({
      floors: STATION_V2_FLOORS,
      stationTypes: STATION_V2_TYPES,
      stations: stationRows.map(formatStationV2Payload),
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load stations.', error: error.message })
  }
})

app.post('/api/stations-v2', async (req, res) => {
  const floorCode = normalizeStationV2Floor(req.body?.floorCode)
  const stationCode = `${req.body?.stationCode || ''}`.trim()
  const stationType = normalizeStationV2Type(req.body?.stationType)
  const isFarAway = req.body?.isFarAway === true

  if (!floorCode || !stationCode || !stationType) {
    return res.status(400).json({ message: 'Floor, station ID, and station type are required.' })
  }

  try {
    await ensureRosterStationV2Schema()
    const result = await execute(
      `
        INSERT INTO stations (floor_code, station_code, station_type, is_far_away, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `,
      [floorCode, stationCode, stationType, isFarAway ? 1 : 0],
    )
    const rows = await query('SELECT * FROM stations WHERE id = ? LIMIT 1', [result.insertId])
    return res.json({
      success: true,
      station: formatStationV2Payload(rows[0]),
      message: 'Station added successfully.',
    })
  } catch (error) {
    const message =
      error.code === 'ER_DUP_ENTRY'
        ? 'That station ID already exists on the selected floor.'
        : 'Unable to save station.'
    return res.status(400).json({ message, error: error.message })
  }
})

app.delete('/api/stations-v2/:id', async (req, res) => {
  const stationId = Number(req.params.id)

  if (!stationId) {
    return res.status(400).json({ message: 'Valid station id is required.' })
  }

  try {
    await ensureRosterStationV2Schema()
    await execute('UPDATE roster_assignments SET station_id = NULL WHERE station_id = ?', [stationId])
    await execute('DELETE FROM stations WHERE id = ?', [stationId])
    return res.json({ success: true, message: 'Station deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete station.', error: error.message })
  }
})

app.get('/api/rosters-v2', async (_req, res) => {
  try {
    await ensureRosterStationV2Schema()
    const rosterRows = await query(
      `
        SELECT rosters.*, admins.full_name AS creator_name, COUNT(roster_assignments.id) AS assigned_count
        FROM rosters
        LEFT JOIN admins ON admins.id = rosters.created_by_admin_id
        LEFT JOIN roster_assignments ON roster_assignments.roster_id = rosters.id
        GROUP BY rosters.id, admins.full_name
        ORDER BY rosters.updated_at DESC, rosters.id DESC
      `,
    )
    const assignmentRows = await getRosterAssignmentsV2(rosterRows.map((row) => row.id))
    const stationRows = await getStationsV2()
    const employeeOptions = await query(
      `
        SELECT id, badge_id, badge_username, full_name, department_name, role_name, employment_status, photo_data
        FROM employees
        WHERE employment_status = 'ACTIVE'
        ORDER BY full_name ASC
      `,
    )
    const assignmentMap = assignmentRows.reduce((accumulator, row) => {
      if (!accumulator.has(row.roster_id)) {
        accumulator.set(row.roster_id, [])
      }

      accumulator.get(row.roster_id).push(row)
      return accumulator
    }, new Map())
    const rosters = rosterRows.map((row) => {
      const payload = formatRosterV2Payload(row, assignmentMap.get(row.id) || [])

      return {
        ...payload,
        homeStatusLabel: payload.homeVisibility ? 'Live on Home' : 'Hidden from Home',
        homeStatusClass: payload.homeVisibility
          ? 'bg-emerald-100 text-emerald-600'
          : 'bg-slate-100 text-slate-600',
      }
    })

    return res.json({
      stats: [
        { title: 'Total Rosters', value: formatNumber(rosters.length), note: 'All roster pages', icon: 'view_list', panel: 'bg-blue-50', iconBg: 'bg-blue-600' },
        { title: 'Live on Home', value: formatNumber(rosters.filter((roster) => roster.homeVisibility).length), note: 'Visible roster pages', icon: 'home', panel: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
        { title: 'Assigned Associates', value: formatNumber(rosters.reduce((sum, roster) => sum + roster.totalAssociates, 0)), note: 'Across all rosters', icon: 'groups', panel: 'bg-amber-50', iconBg: 'bg-amber-500' },
        { title: 'Total Stations', value: formatNumber(stationRows.length), note: 'Shared P2 / P3 / P4 pool', icon: 'pin_drop', panel: 'bg-violet-50', iconBg: 'bg-violet-500' },
      ],
      rosters,
      rosterSections: ROSTER_V2_SECTIONS,
      sectionDetailOptions: ROSTER_V2_DETAIL_OPTIONS,
      floors: STATION_V2_FLOORS,
      stationTypes: STATION_V2_TYPES,
      stations: stationRows.map(formatStationV2Payload),
      employeeOptions: employeeOptions.map((employee) => ({
        id: employee.id,
        badgeId: employee.badge_id,
        badgeUsername: employee.badge_username || '',
        fullName: employee.full_name,
        departmentName: employee.department_name,
        roleName: employee.role_name,
        photoData: employee.photo_data || '',
      })),
      pagination: {
        showing: `Showing 1 to ${rosters.length} of ${rosters.length} rosters`,
      },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load rosters.', error: error.message })
  }
})

app.post('/api/rosters-v2', async (req, res) => {
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const assignments = parseRosterAssignmentsV2(req.body?.assignments)

  if (!name || !assignments.length) {
    return res.status(400).json({ message: 'Roster name and at least one associate assignment are required.' })
  }

  try {
    await ensureRosterStationV2Schema()
    await validateRosterAssignmentsV2(assignments)
    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()
      const result = await executeWith(
        connection,
        `
          INSERT INTO rosters (name, description, home_visibility, created_by_admin_id, created_at)
          VALUES (?, ?, 0, ?, NOW())
        `,
        [name, description, 1],
      )
      await syncRosterAssignmentsV2(result.insertId, assignments, connection)
      await connection.commit()
      return res.json({ success: true, message: 'Roster created successfully.' })
    } catch (error) {
      await connection.rollback().catch(() => {})
      return res.status(500).json({ message: error.message || 'Unable to create roster.', error: error.message })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to validate roster associates.', error: error.message })
  }
})

app.put('/api/rosters-v2/:id', async (req, res) => {
  const rosterId = Number(req.params.id)
  const name = req.body?.name?.trim()
  const description = req.body?.description?.trim() || ''
  const assignments = parseRosterAssignmentsV2(req.body?.assignments)

  if (!rosterId || !name || !assignments.length) {
    return res.status(400).json({ message: 'Valid roster details and assignments are required.' })
  }

  try {
    await ensureRosterStationV2Schema()
    const existingRoster = await getRosterById(rosterId)

    if (!existingRoster) {
      return res.status(404).json({ message: 'Roster not found.' })
    }

    await validateRosterAssignmentsV2(assignments)
    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()
      await executeWith(
        connection,
        `
          UPDATE rosters
          SET name = ?, description = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [name, description, rosterId],
      )
      await syncRosterAssignmentsV2(rosterId, assignments, connection)
      await connection.commit()
      return res.json({ success: true, message: 'Roster updated successfully.' })
    } catch (error) {
      await connection.rollback().catch(() => {})
      return res.status(500).json({ message: error.message || 'Unable to update roster.', error: error.message })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to save roster.', error: error.message })
  }
})

app.post('/api/rosters-v2/:id/home-visibility', async (req, res) => {
  const rosterId = Number(req.params.id)
  const visible = req.body?.visible === true

  if (!rosterId) {
    return res.status(400).json({ message: 'Valid roster id is required.' })
  }

  try {
    const roster = await setRosterHomeVisibilityV2(rosterId, visible)
    return res.json({
      roster,
      message: visible
        ? 'Roster is now live on the Home page.'
        : 'Roster is now hidden from the Home page.',
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update roster Home page visibility.' })
  }
})

app.delete('/api/rosters-v2/:id', async (req, res) => {
  const rosterId = Number(req.params.id)

  if (!rosterId) {
    return res.status(400).json({ message: 'Valid roster id is required.' })
  }

  try {
    await ensureRosterStationV2Schema()
    await execute('DELETE FROM roster_assignments WHERE roster_id = ?', [rosterId])
    await execute('DELETE FROM rosters WHERE id = ?', [rosterId])
    return res.json({ success: true, message: 'Roster deleted successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete roster.', error: error.message })
  }
})

app.post('/api/public/roster-check', async (req, res) => {
  const badgeId = `${req.body?.badgeId || ''}`.trim()
  const badgeUsername = `${req.body?.badgeUsername || ''}`.trim()

  if (!badgeId && !badgeUsername) {
    return res.status(400).json({ message: 'Badge ID or Badge User Name is required.' })
  }

  try {
    await ensureRosterStationV2Schema()

    const employeeRows = await query(
      `
        SELECT id, badge_id, badge_username, full_name
        FROM employees
        WHERE employment_status = 'ACTIVE'
          AND (
            (? <> '' AND badge_id = ?)
            OR (? <> '' AND LOWER(COALESCE(badge_username, '')) = LOWER(?))
          )
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [badgeId, badgeId, badgeUsername, badgeUsername],
    )

    const employee = employeeRows[0] || null
    const targetRoster = (await getVisibleRoster()) || (await getLatestRosterV2())

    if (!targetRoster || !employee) {
      return res.json({
        success: true,
        assigned: false,
        assignmentLabel: 'Now Assigned',
        rosterName: targetRoster?.name || '',
        associate: employee
          ? {
              badgeId: employee.badge_id,
              badgeUsername: employee.badge_username || '',
              fullName: employee.full_name,
            }
          : null,
      })
    }

    const assignmentRows = await query(
      `
        SELECT
          roster_assignments.section_key,
          roster_assignments.detail_key,
          roster_assignments.floor_code,
          stations.station_code,
          stations.floor_code AS station_floor_code,
          stations.station_type,
          stations.is_far_away
        FROM roster_assignments
        LEFT JOIN stations ON stations.id = roster_assignments.station_id
        WHERE roster_assignments.roster_id = ?
          AND roster_assignments.employee_id = ?
        LIMIT 1
      `,
      [targetRoster.id, employee.id],
    )

    const assignment = assignmentRows[0] || null

    return res.json({
      success: true,
      assigned: Boolean(assignment),
      assignmentLabel: getRosterLookupAssignmentLabel(assignment),
      rosterName: targetRoster.name,
      associate: {
        badgeId: employee.badge_id,
        badgeUsername: employee.badge_username || '',
        fullName: employee.full_name,
      },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to check the roster right now.', error: error.message })
  }
})

app.get('/api/voting/live-ballot-v2', async (_req, res) => {
  try {
    await ensureRosterStationV2Schema()
    const settings = await getSettingMap()
    const activeRound = await getActiveRound()

    if (!activeRound) {
      const visibleRoster = await getVisibleRoster()

      if (visibleRoster) {
        const rosterAssignments = await getRosterAssignmentsV2(visibleRoster.id)

        return res.json({
          hasActiveRound: false,
          ...getPublicBrandingSettings(settings),
          round: null,
          categories: [],
          finishedRound: null,
          roster: formatRosterV2Payload(visibleRoster, rosterAssignments),
        })
      }

      const finishedRound = await getLatestCompletedRound()
      const resultVisibility = normalizeRoundResultVisibility(
        finishedRound?.result_visibility,
        finishedRound?.winners_published ? 'VISIBLE' : 'WAITING',
      )
      const winnerPreview =
        finishedRound && resultVisibility === 'VISIBLE' ? await getRoundWinnerPreview(finishedRound.id) : null

      return res.json({
        hasActiveRound: false,
        ...getPublicBrandingSettings(settings),
        round: null,
        categories: [],
        roster: null,
        finishedRound:
          finishedRound && resultVisibility !== 'HIDDEN'
            ? {
                id: finishedRound.id,
                name: finishedRound.name,
                description: finishedRound.description || '',
                startDate: finishedRound.start_date,
                endDate: finishedRound.end_date,
                roundId: finishedRound.access_code,
                status: finishedRound.status,
                winnersPublished: resultVisibility === 'VISIBLE',
                resultVisibility,
                winners: winnerPreview?.winners || [],
              }
            : null,
      })
    }

    const categories = await getRoundCategories(activeRound.id)
    const candidates = await getPublicRoundCandidates(activeRound.id)
    const candidateCards = candidates.map((candidate) => ({
      id: candidate.id,
      badgeId: candidate.badge_id,
      fullName: candidate.full_name,
      departmentName: candidate.department_name,
      roleName: candidate.role_name,
      photoData: candidate.photo_data,
    }))
    const ballotCategories = categories.length
      ? categories.map((category) => ({
          id: category.id,
          name: category.name,
          candidates: candidateCards,
        }))
      : candidateCards.length
        ? [
            {
              id: 0,
              name: 'Nominees',
              candidates: candidateCards,
            },
          ]
        : []

    return res.json({
      hasActiveRound: true,
      ...getPublicBrandingSettings(settings),
      round: {
        id: activeRound.id,
        name: activeRound.name,
        description: activeRound.description || '',
        startDate: activeRound.start_date,
        endDate: activeRound.end_date,
        roundId: activeRound.access_code,
        participantCount: activeRound.participant_count,
        status: activeRound.status,
      },
      categories: ballotCategories,
      finishedRound: null,
      roster: null,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load the live ballot.', error: error.message })
  }
})

