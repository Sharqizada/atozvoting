export const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')

export const requestJson = async (path, options = {}) => {
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
