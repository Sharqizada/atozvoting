const normalizeNfcValue = (value) =>
  `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const decodeNfcRecord = (record) => {
  if (!record?.data) {
    return ''
  }

  const binaryData = record.data instanceof DataView ? new Uint8Array(record.data.buffer) : new Uint8Array(record.data)

  try {
    return normalizeNfcValue(new TextDecoder(record.encoding || 'utf-8').decode(binaryData))
  } catch {
    try {
      return normalizeNfcValue(new TextDecoder().decode(binaryData))
    } catch {
      return ''
    }
  }
}

const bufferToHex = (value) =>
  Array.from(value || [])
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('')

const expandNfcCandidate = (candidate, bucket) => {
  const normalizedCandidate = normalizeNfcValue(candidate)

  if (!normalizedCandidate) {
    return
  }

  bucket.push(normalizedCandidate)

  const digitsOnly = normalizedCandidate.replace(/[^0-9]/g, '')

  if (digitsOnly && digitsOnly !== normalizedCandidate) {
    bucket.push(digitsOnly)
  }
}

const extractBadgeIdFromEvent = (event) => {
  const candidates = []

  for (const record of event.message?.records || []) {
    const decodedValue = decodeNfcRecord(record)

    expandNfcCandidate(decodedValue, candidates)

    if (record?.data) {
      const binaryData =
        record.data instanceof DataView ? new Uint8Array(record.data.buffer) : new Uint8Array(record.data)
      const hexValue = bufferToHex(binaryData)

      expandNfcCandidate(hexValue, candidates)
    }
  }

  expandNfcCandidate(event.serialNumber, candidates)
  expandNfcCandidate(event.message?.serialNumber, candidates)

  return (
    candidates.find((candidate) => /^\d+$/.test(candidate)) ||
    candidates.find((candidate) => /^[a-f0-9]+$/i.test(candidate)) ||
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
