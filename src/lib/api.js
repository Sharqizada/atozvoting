const normalizeBaseUrl = (value = '') => value.replace(/\/+$/, '')

const isLocalHostName = (hostName = '') =>
  hostName === 'localhost' ||
  hostName === '127.0.0.1' ||
  hostName === '0.0.0.0' ||
  /^10\./.test(hostName) ||
  /^192\.168\./.test(hostName) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostName)

const resolveApiBaseUrl = () => {
  const envBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_URL || '')

  if (envBaseUrl) {
    return envBaseUrl
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location

    if (port && port !== '5000' && isLocalHostName(hostname)) {
      return `${protocol}//${hostname}:5000`
    }
  }

  return import.meta.env.DEV ? 'http://localhost:5000' : ''
}

export const API_BASE_URL = resolveApiBaseUrl()

export const requestJson = async (path, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.message || `Request failed with status ${response.status}`)
    }

    return response.json()
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the API server. Check that the backend is running and the API URL is correct.')
    }

    throw error
  }
}

export const fetchJson = (path) => requestJson(path)

export const postJson = (path, body) =>
  requestJson(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const putJson = (path, body) =>
  requestJson(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteJson = (path) =>
  requestJson(path, {
    method: 'DELETE',
  })
