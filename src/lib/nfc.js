const normalizeNfcValue = (value) =>
  `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const decodeNfcRecord = (record) => {
  if (!record?.data) {
    return ''
  }

  try {
    return normalizeNfcValue(new TextDecoder(record.encoding || 'utf-8').decode(record.data))
  } catch {
    try {
      return normalizeNfcValue(new TextDecoder().decode(record.data))
    } catch {
      return ''
    }
  }
}

const extractBadgeIdFromEvent = (event) => {
  const candidates = []

  for (const record of event.message?.records || []) {
    const decodedValue = decodeNfcRecord(record)

    if (decodedValue) {
      candidates.push(decodedValue)
    }
  }

  if (event.serialNumber) {
    candidates.push(normalizeNfcValue(event.serialNumber))
  }

  return (
    candidates.find((candidate) => /^\d+$/.test(candidate.replace(/\s+/g, ''))) ||
    candidates.find(Boolean) ||
    ''
  )
}

export const isWebNfcSupported = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'NDEFReader' in window

export const getWebNfcSupportError = () => {
  if (typeof window === 'undefined') {
    return 'NFC is only available in the browser.'
  }

  if (!window.isSecureContext) {
    return 'NFC requires HTTPS or localhost to work.'
  }

  if (!('NDEFReader' in window)) {
    return 'This browser or device does not support Web NFC.'
  }

  return ''
}

export const scanSingleNfcBadge = async ({ signal, onStatus } = {}) => {
  const supportError = getWebNfcSupportError()

  if (supportError) {
    throw new Error(supportError)
  }

  const reader = new window.NDEFReader()
  onStatus?.('NFC is ready. Hold the badge near the back of your device.')
  await reader.scan({ signal })

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      if (signal && handleAbort) {
        signal.removeEventListener('abort', handleAbort)
      }

      reader.removeEventListener('reading', handleReading)
      reader.removeEventListener('readingerror', handleReadingError)
    }

    const finish = (callback) => (value) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback(value)
    }

    const handleReading = finish((event) => {
      const badgeId = extractBadgeIdFromEvent(event)

      if (!badgeId) {
        reject(new Error('NFC tag detected but no readable badge ID was found.'))
        return
      }

      resolve(badgeId)
    })

    const handleReadingError = finish(() => {
      reject(new Error('NFC tag detected but could not be read. Hold the badge steady and try again.'))
    })

    const handleAbort = finish((reason) => {
      reject(reason instanceof Error ? reason : new DOMException('NFC scan canceled.', 'AbortError'))
    })

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true })
    }

    reader.addEventListener('reading', handleReading, { once: true })
    reader.addEventListener('readingerror', handleReadingError, { once: true })
  })
}
