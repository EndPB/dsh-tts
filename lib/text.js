/**
 * Text preparation for speech.
 *
 * Models write markdown; TTS engines read punctuation, not backticks. This
 * module strips markup, removes the OpenClaw-style speech tag and a few
 * structural artifacts, then splits long input on sentence boundaries so one
 * provider call stays small. It never invents text: every character spoken
 * comes from the input.
 */

const SPEECH_TAG = /\[\[\s*tts\s*\]\]/gi

/**
 * Convert markdown-ish model output into plain spoken text.
 * @param input - raw text.
 * @param tag - additional tag to remove (e.g. `[[tts]]`).
 * @returns a single normalized text, or an empty string when nothing remains.
 */
export function sanitizeText(input, tag) {
  let text = String(input ?? '')
  if (typeof tag === 'string' && tag.length > 0) text = text.split(tag).join(' ')
  text = text.replace(SPEECH_TAG, ' ')

  // Code is not speech. Keep inline code content, drop fenced blocks wholesale.
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ')
  text = text.replace(/`([^`]*)`/g, '$1')

  // Images -> alt text, links -> label.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

  // HTML-ish tags (including <br>) and raw URLs.
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/\bhttps?:\/\/\S+/gi, ' ')

  // Block markers: headings, quotes, lists, tables.
  text = text.replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
  text = text.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, ' ')
  text = text.replace(/\|/g, ' ')

  // Direction tags such as [excited] are stage notes, not words. Keep
  // CosyVoice's [instruct:...] control because the local-cli contract uses it.
  text = text.replace(/\[(?!instruct:)[a-zA-Z][a-zA-Z\s-]*\]/gi, ' ')

  // Emphasis and strike markers.
  text = text.replace(/[*_~]{1,3}/g, '')

  // Collapse whitespace; a newline is a natural pause for every engine, but
  // do not double the punctuation that already ended the line.
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/([^。！？!?；;：:,，])\s*\n\s*/g, '$1。')
  text = text.replace(/\s*\n\s*/g, '')
  text = text.replace(/。{2,}/g, '。')
  text = text.replace(/\s+([，。！？；：,.!?;:])/g, '$1')
  return text.trim()
}

/** Split one over-long sentence without cutting surrogate pairs. */
function hardSplit(sentence, limit) {
  const parts = []
  let rest = sentence
  while (rest.length > limit) {
    let cut = limit
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length > 0) parts.push(rest)
  return parts
}

/**
 * Split text into provider-sized chunks.
 * @param text - plain text from {@link sanitizeText}.
 * @param chunkChars - target maximum characters per request.
 * @param maxChars - total characters admitted; the tail is truncated.
 * @returns the chunks to synthesize and whether truncation occurred.
 */
export function chunkText(text, chunkChars, maxChars) {
  const admitted = text.length > maxChars ? text.slice(0, maxChars) : text
  const truncated = text.length > maxChars
  const sentences = admitted.split(/(?<=[。！？!?；;])/u)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const pieces = sentence.length > chunkChars ? hardSplit(sentence, chunkChars) : [sentence]
    for (const piece of pieces) {
      if (piece.trim() === '') continue
      if (current.length > 0 && current.length + piece.length > chunkChars) {
        chunks.push(current)
        current = ''
      }
      current += piece
    }
  }
  if (current.trim() !== '') chunks.push(current)
  if (chunks.length === 0 && admitted.trim() !== '') chunks.push(admitted.trim())
  return { chunks, truncated }
}