/**
 * CosyVoice provider — DashScope duplex WebSocket synthesis.
 *
 * Protocol: `run-task` opens a duplex task, `continue-task` streams text
 * segments, `finish-task` closes the turn. The server answers with
 * `result-generated` sentence events and one binary audio frame immediately
 * after each `sentence-synthesis` event; `task-finished` ends the stream.
 * Audio frames are yielded as they arrive, so the HTTP stream route and the
 * browser can start playing after the first sentence.
 */
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'

import { COSYVOICE_PRESET_VOICES } from '../config.js'
import { abortError } from './util.js'

const OVERALL_TIMEOUT_MS = 180000

/** A minimal async queue bridging WebSocket events to an async generator. */
class Channel {
  constructor() {
    this.items = []
    this.waiters = []
    this.ended = false
    this.error = undefined
  }

  push(item) {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter !== undefined) waiter.resolve({ value: item, done: false })
    else this.items.push(item)
  }

  end() {
    if (this.ended) return
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter.resolve({ value: undefined, done: true })
  }

  fail(error) {
    if (this.ended) return
    this.error = error
    for (const waiter of this.waiters.splice(0)) waiter.reject(error)
    this.ended = true
  }

  next() {
    if (this.items.length > 0) return Promise.resolve({ value: this.items.shift(), done: false })
    if (this.error !== undefined) return Promise.reject(this.error)
    if (this.ended) return Promise.resolve({ value: undefined, done: true })
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.next() }
  }
}

/** Split text into sentence-ish pieces for `continue-task`. */
function speechPieces(text, max = 120) {
  const pieces = []
  for (const sentence of String(text).split(/(?<=[。！？!?；;，,])/u)) {
    if (sentence.length === 0) continue
    if (sentence.length <= max) {
      if (sentence.trim() !== '') pieces.push(sentence)
      continue
    }
    for (let index = 0; index < sentence.length; index += max) {
      const piece = sentence.slice(index, index + max)
      if (piece.trim() !== '') pieces.push(piece)
    }
  }
  return pieces
}

function readText(data) {
  try {
    return JSON.parse(data.toString())
  } catch {
    return undefined
  }
}

function taskFailure(message) {
  const code = message?.header?.error_code ?? 'task-failed'
  const detail = message?.header?.error_message ?? 'unknown server error'
  const hint = /invalid.*(api|key)|unauthorized|401|403/i.test(`${code} ${detail}`)
    ? ' Check the DashScope API key in Settings → 语音合成.'
    : ''
  return new Error(`CosyVoice ${String(code)}: ${detail}${hint}`)
}

export function createCosyVoiceProvider({ settings, ctx }) {
  async function resolveKey(options) {
    const ref = options.apiKeyRef
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(ref)
        if (hit !== undefined && typeof hit.value === 'string' && hit.value !== '') return hit.value
      } catch {
        // Fall through to the environment.
      }
    }
    const env = process.env[ref]
    if (typeof env === 'string' && env.trim() !== '') return env.trim()
    throw new Error(`CosyVoice: API key ${ref} is not configured. Add it in Settings → 语音合成, or export ${ref}.`)
  }

  async function *stream(text, options, signal) {
    const key = await resolveKey(options)
    const taskId = randomUUID()
    const channel = new Channel()
    const ws = new WebSocket(options.baseUrl, {
      headers: { Authorization: `Bearer ${key}` },
      handshakeTimeout: 20000,
    })

    let started = false
    let finished = false
    let lastSend = Date.now()
    let lastWordsLength = 0

    const send = (action, payload) => {
      if (ws.readyState !== WebSocket.OPEN) return
      lastSend = Date.now()
      ws.send(JSON.stringify({ header: { action, task_id: taskId, streaming: 'duplex' }, payload }))
    }

    const cancel = () => {
      try {
        if (started && !finished) send('finish-task', { input: { directive: 'cancel' } })
      } catch {
        // The socket may already be gone.
      }
      channel.fail(abortError())
      try {
        ws.close()
      } catch {
        // Ignore close failures during cancellation.
      }
    }

    const onAbort = () => cancel()
    if (signal !== undefined) {
      if (signal.aborted) cancel()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    const timeout = setTimeout(() => {
      channel.fail(new Error('CosyVoice: synthesis timed out'))
      try {
        ws.close()
      } catch {
        // Ignore.
      }
    }, OVERALL_TIMEOUT_MS)

    ws.on('open', () => {
      send('run-task', {
        task_group: 'audio',
        task: 'tts',
        function: 'SpeechSynthesizer',
        model: options.model,
        input: {},
        parameters: {
          text_type: 'PlainText',
          voice: options.voice,
          format: options.format,
          sample_rate: Number(options.sampleRate),
          volume: Number(options.volume),
          rate: Number(options.rate),
          pitch: Number(options.pitch),
          ...(options.format === 'mp3' || options.format === 'opus' ? { bit_rate: Number(options.bitRate) } : {}),
          ...(options.instruction === '' || options.instruction === undefined ? {} : { instruction: options.instruction }),
          ...(options.languageHint === '' || options.languageHint === undefined ? {} : { language_hints: [options.languageHint] }),
          word_timestamp_enabled: true,
        },
      })
    })

    ws.on('message', (data, isBinary) => {
      if (isBinary === true) {
        if (!finished) channel.push({ type: 'audio', data: Buffer.from(data) })
        return
      }
      const message = readText(data)
      if (message === undefined) return
      const event = message.header?.event
      const words = message.payload?.output?.sentence?.words
      if (Array.isArray(words) && words.length > lastWordsLength) {
        lastWordsLength = words.length
        channel.push({ type: 'timings', words: words.map((word) => ({
          text: word.text,
          begin_index: word.begin_index,
          end_index: word.end_index,
          begin_time: word.begin_time,
          end_time: word.end_time,
        })) })
      }
      if (event === 'task-started') {
        if (started) return
        started = true
        for (const piece of speechPieces(text)) send('continue-task', { input: { text: piece } })
        send('finish-task', { input: {} })
        return
      }
      if (event === 'task-failed') {
        finished = true
        channel.fail(taskFailure(message))
        return
      }
      if (event === 'task-finished') {
        finished = true
        channel.end()
      }
    })

    ws.on('error', (error) => {
      if (!finished) channel.fail(new Error(`CosyVoice connection failed: ${error?.message ?? String(error)}`))
    })

    ws.on('close', (code, reason) => {
      if (finished) return
      const detail = reason === undefined || reason.length === 0 ? '' : ` ${reason.toString()}`
      channel.fail(new Error(`CosyVoice connection closed (${String(code)})${detail}; last send ${String(Date.now() - lastSend)} ms ago`))
    })

    try {
      for await (const item of channel) {
        yield item
      }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener?.('abort', onAbort)
      try {
        ws.close()
      } catch {
        // Already closed.
      }
    }
  }

  async function synthesize(text, options, signal) {
    const chunks = []
    let timings = []
    for await (const item of stream(text, options, signal)) {
      if (item.type === 'audio') chunks.push(item.data)
      else if (item.type === 'timings') timings = item.words
    }
    if (chunks.length === 0) throw new Error('CosyVoice produced no audio')
    return { bytes: Buffer.concat(chunks), format: options.format, chunks: 1, timings }
  }

  return {
    id: 'cosyvoice',
    label: 'CosyVoice',
    capabilities: { streaming: true, voices: true, instruction: true },

    async status(options) {
      try {
        await resolveKey(options)
        return { ok: true, detail: `model ${options.model}` }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) }
      }
    },

    async voices(options) {
      const voices = COSYVOICE_PRESET_VOICES.map((voice) => ({ ...voice, lang: 'zh-CN' }))
      if (typeof options.voice === 'string' && options.voice !== '' && !voices.some((voice) => voice.id === options.voice)) {
        voices.unshift({ id: options.voice, label: `${options.voice} · 克隆/定制音色`, lang: 'zh-CN' })
      }
      return voices
    },

    synthesize,
    stream,
  }
}