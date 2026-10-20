/** Shared provider helpers. */

/** Reduce an output-format string to a file extension. */
export function outputFormatExtension(value) {
  const text = String(value ?? 'mp3').toLowerCase()
  const match = /(mp3|wav|ogg|opus|m4a|aac|webm|flac)$/.exec(text)
  return match === null ? 'mp3' : match[1]
}

/** Keep the tail of a provider diagnostic inside a useful bound. */
export function tail(value, limit = 1200) {
  const text = String(value ?? '').trim()
  return text.length > limit ? `…${text.slice(-limit)}` : text
}

export function abortError(message = 'synthesis was cancelled') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/** Strip undefined overrides so spread-merge never erases a default. */
export function definedOverrides(value) {
  if (value === undefined || value === null || typeof value !== 'object') return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item
  }
  return out
}