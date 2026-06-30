export const DEFAULT_BRANDING_COLORS = Object.freeze({
  primaryColor: '#059669',
  secondaryColor: '#0EA5E9',
  accentColor: '#10B981',
  surfaceColor: '#ECFDF5',
  borderColor: '#A7F3D0',
})

const SITE_BRANDING_CACHE_KEY = 'siteBrandingCacheV1'

const HEX_COLOR_PATTERN = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const normalizeBrandingColor = (value, fallback) => {
  const normalized = `${value || ''}`.trim()

  if (!normalized) {
    return fallback
  }

  const candidate = normalized.startsWith('#') ? normalized : `#${normalized}`

  if (!HEX_COLOR_PATTERN.test(candidate)) {
    return fallback
  }

  if (candidate.length === 4) {
    return `#${candidate[1]}${candidate[1]}${candidate[2]}${candidate[2]}${candidate[3]}${candidate[3]}`.toUpperCase()
  }

  return candidate.toUpperCase()
}

export const resolveBrandingColors = (source = {}) => ({
  primaryColor: normalizeBrandingColor(source.primaryColor, DEFAULT_BRANDING_COLORS.primaryColor),
  secondaryColor: normalizeBrandingColor(source.secondaryColor, DEFAULT_BRANDING_COLORS.secondaryColor),
  accentColor: normalizeBrandingColor(source.accentColor, DEFAULT_BRANDING_COLORS.accentColor),
  surfaceColor: normalizeBrandingColor(source.surfaceColor, DEFAULT_BRANDING_COLORS.surfaceColor),
  borderColor: normalizeBrandingColor(source.borderColor, DEFAULT_BRANDING_COLORS.borderColor),
})

export const normalizeSiteBranding = (source = {}) => ({
  siteName: `${source.siteName || ''}`.trim(),
  siteTagline: `${source.siteTagline || ''}`.trim(),
  siteLogo: `${source.siteLogo || ''}`.trim(),
  siteFavicon: `${source.siteFavicon || source.favicon || ''}`.trim(),
  brandingColors: resolveBrandingColors(source.brandingColors || source),
})

export const getCachedSiteBranding = () => {
  if (typeof window === 'undefined') {
    return normalizeSiteBranding()
  }

  try {
    const cachedValue = window.localStorage.getItem(SITE_BRANDING_CACHE_KEY)
    return cachedValue ? normalizeSiteBranding(JSON.parse(cachedValue)) : normalizeSiteBranding()
  } catch {
    return normalizeSiteBranding()
  }
}

const ensureFaviconLinkElement = () => {
  if (typeof document === 'undefined') {
    return null
  }

  let link = document.querySelector('link[rel="icon"]')

  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'icon')
    document.head.appendChild(link)
  }

  return link
}

export const applySiteFavicon = (favicon = '') => {
  const faviconLink = ensureFaviconLinkElement()

  if (!faviconLink) {
    return
  }

  faviconLink.setAttribute('href', `${favicon || '/favicon.ico'}`)
}

export const syncSiteBrandingCache = (source = {}) => {
  const normalized = normalizeSiteBranding(source)

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SITE_BRANDING_CACHE_KEY, JSON.stringify(normalized))
    } catch {
      // Ignore storage failures and still apply favicon in-memory.
    }
  }

  applySiteFavicon(normalized.siteFavicon)
  return normalized
}

export const hexToRgba = (hexColor, alpha = 1) => {
  const normalized = normalizeBrandingColor(hexColor, '#000000').slice(1)
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
