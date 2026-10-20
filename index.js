/**
 * dsh-tts — provider-based text-to-speech for DeepSeek Harness.
 *
 * Host responsibilities:
 *  - a provider registry with CosyVoice (duplex WebSocket + word timings) and Edge TTS;
 *  - a `tts_speak` tool and a persistent, content-addressed speech cache;
 *  - a Settings/voice RPC surface (settings, credentials, speech resolution, cache);
 *  - progressive streams and cached files on the DSH origin.
 *
 * Spoken text is resolved from the durable Session log: the last `tts_speak`
 * call in the reply's turn wins; otherwise the finalized reply is used. The
 * cache only owns audio, so clearing it never loses that text.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  COSYVOICE_FORMATS,
  COSYVOICE_MODELS,
  COSYVOICE_PRESET_VOICES,
  COSYVOICE_SAMPLE_RATES,
  deepMerge,
  defaultSettingsPath,
  normalizeConfig,
  normalizeSettings,
  providerCatalog,
  publicSettings,
} from './lib/config.js'
import { createSettingsStore } from './lib/settings-store.js'
import { createProviderRegistry } from './lib/providers/index.js'
import { createStore, newAudioId } from './lib/store.js'
import { chunkText, sanitizeText } from './lib/text.js'
import { createStreamHub, STREAM_PREFIX } from './lib/streams.js'
import { AUDIO_PREFIX, serveAudioFile, serveStream } from './lib/routes.js'
import { speechSourceFor } from './lib/session-text.js'
import { definedOverrides } from './lib/providers/util.js'
import { createCache, speechCacheKey } from './lib/cache.js'
import { mp3DurationMs } from './lib/mp3-duration.js'

export const name = 'dsh-tts'
export const inject = ['tools']

const RPC_CHANNEL = '/dsh-tts'
const VERSION = '0.4.0'

const TOOL_DESCRIPTION = [
  'Synthesize speech with the configured TTS provider (CosyVoice or Edge TTS) and add a speech card to the conversation.',
  'Synthesis is asynchronous by default: the call returns as soon as the background job starts, so continue without waiting for the audio.',
  'The user starts playback by clicking 语音 on the speech card or the assistant message; never assume it plays automatically.',
  'Use it when the user asks you to speak, read a reply aloud, or explicitly wants a voice answer; never call it for ordinary replies.',
  'Pass the words to speak, not instructions. Write plain text: markdown, code fences, URLs, and the [[tts]] tag are stripped before synthesis.',
  'For CosyVoice, `instruction` can steer emotion, dialect, or character (for example "用开心的语气，稍快一点").',
  'Long input is split into provider-sized chunks and capped, so summarize very long content instead of reading it verbatim.',
  'Settings → 语音合成 can switch between async and blocking synthesis.',
].join(' ')

const PROMPT_TAGGED = [
  '## Voice output',
  '',
  '`tts_speak` synthesizes speech from plain text and shows a speech card in the conversation.',
  'Call it when the user asks you to speak, read aloud, or say something, or when you deliberately choose a spoken answer.',
  'By default synthesis runs in the background: the call returns immediately, so continue the reply without waiting. The user starts playback by clicking 语音.',
  'Do not call it for ordinary replies, and do not call it twice for the same content.',
  'Pass the words to speak as plain text (no markdown or code); any [[tts]] tag is stripped automatically.',
].join('\n')

const PROMPT_ALWAYS = [
  '## Voice output',
  '',
  'Voice output is enabled: the conversation reads each completed assistant reply aloud automatically.',
  'Do not call `tts_speak` for the reply itself. Use it only when the user asks to hear something else',
  '(a quote, a summary, a specific passage), and keep that spoken text concise.',
].join('\n')

function ok(value) {
  return { ok: true, value }
}

function fail(error) {
  return {
    ok: false,
    error: {
      code: 'tts/failed',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

function credentialRefPattern(ref) {
  return typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)
}

function audioUrl(id) {
  return `${AUDIO_PREFIX}/${id}`
}

function charCount(text) {
  return Array.from(String(text ?? '')).length
}

// `tools` validates the successful body against output.schema with additionalProperties: false.
// Keep the tool value to the fields the model may consume and the tool card projects;
// timing/speech-record data stays internal so the schema never rejects it.
const TOOL_OUTPUT_KEYS = [
  'id', 'url', 'provider', 'voice', 'format', 'bytes', 'characters', 'chunks',
  'truncated', 'text', 'streaming', 'cached', 'complete',
]

function toolOutput(value) {
  const output = {}
  for (const key of TOOL_OUTPUT_KEYS) {
    if (value[key] !== undefined) output[key] = value[key]
  }
  // Required fields stay present even for older cache entries that predate
  // the chunk/truncation metadata.
  if (output.chunks === undefined) output.chunks = 1
  if (output.truncated === undefined) output.truncated = false
  if (output.complete === undefined) output.complete = true
  return output
}

function durationFromTimings(timings) {
  if (!Array.isArray(timings) || timings.length === 0) return 0
  let end = 0
  for (const word of timings) {
    if (Number.isFinite(word?.end_time)) end = Math.max(end, word.end_time)
  }
  return end > 0 ? end / 1000 : 0
}

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const settings = createSettingsStore({ base: config, file: defaultSettingsPath(), logger: ctx.logger })
  const initial = settings.get()
  const store = createStore(initial.outputDir)
  let cache = createCache({ dir: initial.cache.dir, logger: ctx.logger })
  const providers = createProviderRegistry({ settings, ctx })
  const hub = createStreamHub({ dir: store.dir, store })
  const speechRecords = new Map()
  const pendingJobs = new Map()

  const providerIdOf = (snapshot, requested) => {
    const explicit = requested !== undefined && requested !== ''
    const id = explicit ? requested : snapshot.provider
    if (id !== 'cosyvoice' && id !== 'edge') {
      throw new Error(`dsh-tts: unknown provider ${JSON.stringify(id)}; available: cosyvoice, edge`)
    }
    if (!explicit && snapshot.providers[id]?.enabled === false) {
      throw new Error(`dsh-tts: the default provider ${JSON.stringify(id)} is disabled in Settings → 语音合成`)
    }
    return id
  }

  const optionsFor = (snapshot, id, overrides) => ({
    ...snapshot.providers[id],
    ...definedOverrides(overrides),
  })

  const cleanText = (text, snapshot) => {
    const clean = sanitizeText(text, snapshot.tag)
    if (clean === '') throw new Error('dsh-tts: nothing to speak after removing markdown and tags')
    const { chunks, truncated } = chunkText(clean, snapshot.chunkChars, snapshot.maxChars)
    return { clean, capped: chunks.join(''), truncated, chunkCount: chunks.length }
  }

  const cacheKeyOf = (providerId, options, text) => speechCacheKey({
    v: 3,
    provider: providerId,
    model: options.model ?? '',
    voice: options.voice ?? '',
    rate: options.rate,
    pitch: options.pitch,
    volume: options.volume,
    instruction: options.instruction ?? '',
    format: options.format ?? 'mp3',
    sampleRate: options.sampleRate,
    bitRate: options.bitRate,
    text,
  })

  const publishFile = (file, format, bytes) => {
    const id = newAudioId()
    store.add({ id, file, format, bytes })
    return { id, url: audioUrl(id) }
  }

  const recordSpeech = (id, data) => {
    const record = { id, ...data }
    speechRecords.set(id, record)
    return record
  }

  const publicResolved = (resolved) => ({
    text: resolved.text,
    rawText: resolved.rawText,
    source: resolved.source,
    characters: resolved.characters,
    threshold: resolved.threshold,
    needsConfirm: resolved.needsConfirm,
    provider: resolved.provider,
    voice: resolved.voice,
    instruction: resolved.instruction,
    turn: resolved.turn,
    seq: resolved.seq,
    messageId: resolved.messageId,
    truncated: resolved.truncated,
  })

  /** Turn one cache entry into a playable URL plus its speech record. */
  async function cacheResult(entry, extra = {}) {
    const timings = Array.isArray(entry.meta?.timings) ? entry.meta.timings : []
    const fileBytes = await readFile(entry.file).catch(() => undefined)
    const parsedMs = fileBytes === undefined ? 0 : mp3DurationMs(fileBytes)
    const duration = parsedMs > 0
      ? parsedMs / 1000
      : Number.isFinite(entry.meta?.durationMs) && entry.meta.durationMs > 0
        ? entry.meta.durationMs / 1000
        : durationFromTimings(timings)
    const text = typeof entry.meta?.text === 'string' ? entry.meta.text : (extra.speechText ?? '')
    const published = publishFile(entry.file, entry.format, entry.bytes)
    recordSpeech(published.id, {
      ...extra,
      text,
      timings,
      duration,
      complete: true,
      provider: entry.meta?.provider ?? extra.provider,
      voice: entry.meta?.voice ?? extra.voice,
      format: entry.format,
      bytes: entry.bytes,
    })
    return {
      id: published.id,
      url: published.url,
      cached: true,
      streaming: false,
      text: text.slice(0, 200),
      speechText: text,
      timings,
      duration,
      complete: true,
      format: entry.format,
      bytes: entry.bytes,
      characters: charCount(text),
      provider: entry.meta?.provider ?? extra.provider,
      voice: entry.meta?.voice ?? extra.voice,
      ...extra,
      chunks: Number.isInteger(extra.chunks) && extra.chunks > 0 ? extra.chunks : 1,
      truncated: extra.truncated === true,
    }
  }

  /**
   * Resolve the words the user hears from the Session log.
   * @returns text, source, provider/voice options, confirm decision and cache key.
   */
  async function resolveSpeech(payload) {
    const source = await speechSourceFor(ctx, payload.sessionId, {
      messageId: payload.messageId,
      beforeSeq: payload.beforeSeq,
    })
    const snapshot = settings.get()
    const args = source.arguments ?? {}
    const providerId = providerIdOf(snapshot, args.provider ?? payload.provider)
    const overrides = { ...definedOverrides(payload.overrides) }
    if (typeof args.voice === 'string' && args.voice !== '') overrides.voice = args.voice
    if (typeof args.instruction === 'string') overrides.instruction = args.instruction
    if (typeof payload.voice === 'string' && payload.voice !== '') overrides.voice = payload.voice
    if (typeof payload.instruction === 'string') overrides.instruction = payload.instruction
    const options = optionsFor(snapshot, providerId, overrides)
    const { clean, capped, truncated } = cleanText(source.rawText, snapshot)
    const characters = charCount(capped)
    const threshold = snapshot.speech.confirmThreshold
    const needsConfirm = source.source === 'reply' && characters > threshold
    return {
      text: capped,
      rawText: source.rawText,
      clean,
      source: source.source,
      characters,
      threshold,
      needsConfirm,
      provider: providerId,
      voice: options.voice,
      instruction: options.instruction ?? '',
      turn: source.turn,
      seq: source.seq,
      messageId: source.messageId,
      truncated,
      overrides,
      key: cacheKeyOf(providerId, options, capped),
    }
  }

  /** A pending background job projected into the same shape as a finished result. */
  function pendingPayload(job, extra = {}) {
    return {
      id: job.id,
      url: job.url,
      cached: false,
      streaming: true,
      text: job.text.slice(0, 200),
      speechText: job.text,
      timings: Array.isArray(job.record.timings) ? job.record.timings : [],
      duration: Number(job.record.duration) || 0,
      complete: job.record.complete === true,
      provider: job.providerId,
      voice: job.voice,
      format: job.format,
      bytes: Number(job.record.bytes) || 0,
      characters: job.characters,
      chunks: job.chunks,
      truncated: job.truncated,
      ...extra,
    }
  }

  /** Wait for a shared background job, then prefer its cache entry. */
  async function waitForJob(job, extra = {}) {
    const outcome = await job.done
    if (outcome?.ok !== true) {
      throw outcome?.error instanceof Error ? outcome.error : new Error('dsh-tts: background synthesis failed')
    }
    const active = settings.get()
    const cached = active.cache.enabled !== false ? await cache.get(job.key) : undefined
    if (cached !== undefined) return await cacheResult(cached, extra)
    return { ...pendingPayload(job, extra), streaming: false, complete: true }
  }

  /**
   * Start one synthesis job. `mode` is `stream` for the provider's progressive
   * protocol, or `deferred` for a provider that only exposes a full result.
   * Async callers use `attachTimeoutMs: 0` so generation completes and fills
   * the cache even if the user has not clicked 语音 yet.
   */
  function startSpeechJob({ key, text, providerId, options, speechInfo, mode, background, chunks, truncated }) {
    const provider = providers.get(providerId)
    const format = options.format ?? 'mp3'
    const live = hub.begin({
      format,
      ...(background === true ? { attachTimeoutMs: 0 } : {}),
    })
    const record = recordSpeech(live.id, {
      text,
      timings: [],
      duration: 0,
      bytes: 0,
      complete: false,
      provider: providerId,
      voice: options.voice,
      format,
      ...speechInfo,
    })
    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    const job = {
      key,
      id: live.id,
      url: live.url,
      text,
      providerId,
      voice: options.voice,
      format,
      characters: charCount(text),
      chunks,
      truncated,
      record,
      done,
      resolveDone,
    }
    pendingJobs.set(key, job)

    void (async () => {
      const audioChunks = []
      let timings = []
      try {
        if (mode === 'stream') {
          for await (const item of provider.stream(text, options, live.signal)) {
            if (item.type === 'audio') {
              audioChunks.push(item.data)
              record.bytes = (Number(record.bytes) || 0) + item.data.length
              live.push(item.data)
            } else if (item.type === 'timings') {
              timings = item.words
              record.timings = timings
              record.duration = durationFromTimings(timings)
            }
          }
        } else {
          const result = await provider.synthesize(text, options, live.signal)
          timings = Array.isArray(result.timings) ? result.timings : []
          if (result.bytes.length > 0) {
            audioChunks.push(result.bytes)
            record.bytes = result.bytes.length
            live.push(result.bytes)
          }
        }
        const bytes = Buffer.concat(audioChunks)
        if (bytes.length === 0) throw new Error(`${providerId} produced no audio`)
        const actualMs = mp3DurationMs(bytes) || Math.round(durationFromTimings(timings) * 1000)
        record.timings = timings
        record.duration = actualMs / 1000
        record.bytes = bytes.length
        const ended = live.end()
        const active = settings.get()
        if (active.cache.enabled !== false && bytes.length > 0) {
          try {
            await cache.put(key, {
              bytes,
              format,
              text,
              timings,
              durationMs: actualMs,
              provider: providerId,
              voice: options.voice,
              model: options.model,
            })
            void cache.prune(active.cache).catch(() => {})
          } catch (error) {
            ctx.logger?.warn?.(`dsh-tts: cache write failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        await ended
        record.complete = true
        resolveDone({ ok: true })
      } catch (error) {
        record.complete = true
        record.error = error instanceof Error ? error.message : String(error)
        live.fail(error)
        await live.done
        resolveDone({
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      } finally {
        if (pendingJobs.get(key) === job) pendingJobs.delete(key)
      }
    })()

    return job
  }

  async function synthesize(text, { providerId, overrides, snapshot, signal, speechInfo } = {}) {
    const active = snapshot ?? settings.get()
    const id = providerIdOf(active, providerId)
    const provider = providers.get(id)
    const { capped, truncated, chunkCount } = cleanText(text, active)
    const options = optionsFor(active, id, overrides)
    const key = cacheKeyOf(id, options, capped)
    const cached = active.cache.enabled !== false ? await cache.get(key) : undefined
    const extra = {
      ...speechInfo,
      text: capped.slice(0, 200),
      speechText: capped,
      provider: id,
      voice: options.voice,
      chunks: chunkCount,
      truncated,
    }
    if (cached !== undefined) return await cacheResult(cached, extra)

    const pending = pendingJobs.get(key)
    if (pending !== undefined) return await waitForJob(pending, extra)

    const result = await provider.synthesize(capped, options, signal)
    const timings = Array.isArray(result.timings) ? result.timings : []
    const actualMs = mp3DurationMs(result.bytes) || Math.round(durationFromTimings(timings) * 1000)
    const duration = actualMs / 1000
    let published
    if (active.cache.enabled !== false) {
      await cache.put(key, {
        bytes: result.bytes,
        format: result.format,
        text: capped,
        timings,
        durationMs: actualMs,
        provider: id,
        voice: options.voice,
        model: options.model,
      })
      void cache.prune(active.cache).catch(() => {})
      published = publishFile(join(cache.dir, `${key}.${result.format}`), result.format, result.bytes.length)
    } else {
      const audioId = newAudioId()
      const file = join(store.dir, `${audioId}.${result.format}`)
      await writeFile(file, result.bytes)
      store.add({ id: audioId, file, format: result.format, bytes: result.bytes.length })
      published = { id: audioId, url: audioUrl(audioId) }
    }
    recordSpeech(published.id, {
      text: capped,
      timings,
      duration,
      bytes: result.bytes.length,
      complete: true,
      provider: id,
      voice: options.voice,
      format: result.format,
      ...speechInfo,
    })
    return {
      id: published.id,
      url: published.url,
      cached: false,
      streaming: false,
      text: capped.slice(0, 200),
      speechText: capped,
      timings,
      duration,
      complete: true,
      provider: id,
      voice: options.voice,
      format: result.format,
      bytes: result.bytes.length,
      characters: charCount(capped),
      chunks: result.chunks ?? chunkCount,
      truncated,
      ...speechInfo,
    }
  }

  async function prepare(text, { providerId, overrides, snapshot, signal, stream = true, background = false, speechInfo } = {}) {
    const active = snapshot ?? settings.get()
    const id = providerIdOf(active, providerId)
    const provider = providers.get(id)
    const { capped, truncated, chunkCount } = cleanText(text, active)
    const options = optionsFor(active, id, overrides)
    const key = cacheKeyOf(id, options, capped)
    const cached = active.cache.enabled !== false ? await cache.get(key) : undefined
    const extra = {
      ...speechInfo,
      text: capped.slice(0, 200),
      speechText: capped,
      provider: id,
      voice: options.voice,
      chunks: chunkCount,
      truncated,
    }
    if (cached !== undefined) return await cacheResult(cached, extra)

    // A tool call may already be streaming the same text. Never start a second
    // CosyVoice task for it: play the existing stream, or wait for its cache.
    const pending = pendingJobs.get(key)
    if (pending !== undefined) {
      if (background === true || stream !== false) return pendingPayload(pending, extra)
      return await waitForJob(pending, extra)
    }

    const format = options.format ?? 'mp3'
    const canStream = stream !== false
      && provider.capabilities.streaming === true
      && options.streaming !== false
      && format === 'mp3'

    if (background === true) {
      const job = startSpeechJob({
        key,
        text: capped,
        providerId: id,
        options,
        speechInfo,
        mode: canStream ? 'stream' : 'deferred',
        background: true,
        chunks: chunkCount,
        truncated,
      })
      return pendingPayload(job, extra)
    }

    if (!canStream) {
      const result = await synthesize(text, { providerId: id, overrides, snapshot: active, signal, speechInfo })
      return { ...result, streaming: false }
    }

    const job = startSpeechJob({
      key,
      text: capped,
      providerId: id,
      options,
      speechInfo,
      mode: 'stream',
      background: false,
      chunks: chunkCount,
      truncated,
    })
    return pendingPayload(job, extra)
  }

  async function credentialStatus(ref) {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const info = await credentials.describe(ref)
        return {
          configured: info?.configured === true,
          ...(typeof info?.source === 'string' ? { source: info.source } : {}),
          writable: info?.writable === true,
        }
      } catch {
        // Fall back to the environment below.
      }
    }
    const configured = typeof process.env[ref] === 'string' && process.env[ref] !== ''
    return { configured, ...(configured ? { source: 'environment' } : {}), writable: false }
  }

  async function settingsPayload() {
    const snapshot = settings.get()
    const refs = new Set([snapshot.providers.cosyvoice.apiKeyRef])
    const credentials = {}
    for (const ref of refs) credentials[ref] = await credentialStatus(ref)
    return {
      version: VERSION,
      settings: publicSettings(snapshot),
      defaults: publicSettings(settings.defaults()),
      providers: providerCatalog(),
      constants: {
        cosyvoice: {
          models: COSYVOICE_MODELS,
          formats: COSYVOICE_FORMATS,
          sampleRates: COSYVOICE_SAMPLE_RATES,
          presetVoices: COSYVOICE_PRESET_VOICES,
        },
      },
      credentials,
      cacheStats: await cache.stats(),
      settingsFile: settings.file,
    }
  }

  function infoPayload() {
    const snapshot = settings.get()
    return {
      version: VERSION,
      auto: snapshot.auto,
      provider: snapshot.provider,
      speechMode: snapshot.speech.mode,
      tag: snapshot.tag,
      maxChars: snapshot.maxChars,
      providers: providerCatalog().map((provider) => ({
        ...provider,
        enabled: snapshot.providers[provider.id]?.enabled !== false,
      })),
    }
  }

  // ---------------------------------------------------------------- tool
  const tool = {
    name: 'tts_speak',
    description: TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
          description: 'Words to speak, as plain text. Markdown, code fences, URLs and the speech tag are removed before synthesis.',
        },
        provider: {
          type: 'string',
          description: 'Optional provider id: cosyvoice or edge. Omit to use the default provider selected in Settings.',
        },
        voice: {
          type: 'string',
          description: 'Optional provider voice id. Omit to use the voice configured in Settings.',
        },
        instruction: {
          type: 'string',
          description: 'CosyVoice only: steer emotion, dialect, or character, for example "用开心的语气，语速稍快".',
        },

      },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          provider: { type: 'string' },
          voice: { type: 'string' },
          format: { type: 'string' },
          bytes: { type: 'integer' },
          characters: { type: 'integer' },
          chunks: { type: 'integer' },
          truncated: { type: 'boolean' },
          text: { type: 'string' },
          streaming: { type: 'boolean' },
          cached: { type: 'boolean' },
          complete: { type: 'boolean' },
        },
        required: ['id', 'url', 'provider', 'voice', 'format', 'bytes', 'characters', 'chunks', 'truncated', 'complete'],
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: value.complete === false
            ? `Started background speech synthesis for ${String(value.characters)} characters with ${value.provider}${value.voice === '' ? '' : ` (${value.voice})`}${value.truncated ? ', truncated to the configured limit' : ''}. The speech card is in the conversation; the user starts playback by clicking 语音.`
            : `Spoke ${String(value.characters)} characters with ${value.provider}${value.voice === '' ? '' : ` (${value.voice})`}${value.truncated ? ', truncated to the configured limit' : ''}${value.cached === true ? ' from cache' : ''}. The user starts playback by clicking 语音.`,
        },
      ],
      presentationMeta: (args, value) => ({
        kind: 'dsh-tts',
        id: value.id,
        url: value.url,
        provider: value.provider,
        voice: value.voice,
        format: value.format,
        bytes: value.bytes,
        characters: value.characters,
        chunks: value.chunks,
        truncated: value.truncated,
        text: value.text,
        cached: value.cached === true,
        complete: value.complete !== false,
        streaming: value.streaming === true,
        instruction: typeof args.instruction === 'string' ? args.instruction : '',
      }),
    },
    async execute(args, exec) {
      if (args === null || typeof args !== 'object' || typeof args.text !== 'string' || args.text.trim() === '') {
        throw new Error('tts_speak: text is required')
      }
      const overrides = { voice: args.voice, instruction: args.instruction }
      if (settings.get().speech.mode === 'blocking') {
        const result = await synthesize(args.text, {
          providerId: args.provider,
          overrides,
          signal: exec?.signal,
        })
        return toolOutput({ ...result, complete: true })
      }
      const result = await prepare(args.text, {
        providerId: args.provider,
        overrides,
        stream: true,
        background: true,
      })
      return toolOutput(result)
    },
  }

  ctx.effect(() => ctx.tools.register(tool), 'dsh-tts: tts_speak tool')

  // ------------------------------------------------------------- prompt
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    ctx.effect(
      () => systemPrompt.section({
        name: 'tts',
        order: 780,
        text: () => {
          const snapshot = settings.get()
          if (snapshot.systemPrompt === false || snapshot.auto === 'off') return ''
          return snapshot.auto === 'always' ? PROMPT_ALWAYS : PROMPT_TAGGED
        },
      }),
      'dsh-tts: voice-output prompt section',
    )
  }

  // ---------------------------------------------------------------- RPC
  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    const ownerCtx = typeof connectionCtx.extend === 'function'
      ? connectionCtx.extend({ webServer: connectionCtx.get('webServer') })
      : connectionCtx
    connectionCtx.effect(
      () => ownerCtx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, signal) => {
        const input = payload !== null && typeof payload === 'object' ? payload : {}
        try {
          switch (endpoint) {
            case 'info':
              return ok(infoPayload())
            case 'getSettings':
              return ok(await settingsPayload())
            case 'saveSettings': {
              const candidate = normalizeSettings(input.settings ?? {}, settings.defaults())
              if (candidate.providers.cosyvoice.enabled === false && candidate.providers.edge.enabled === false) {
                throw new Error('at least one speech provider must stay enabled')
              }
              if (candidate.providers[candidate.provider]?.enabled === false) {
                throw new Error('the default speech provider cannot be disabled; choose another default first')
              }
              const next = settings.save(candidate)
              if (next.cache.dir !== cache.dir) cache = createCache({ dir: next.cache.dir, logger: ctx.logger })
              return ok(await settingsPayload())
            }
            case 'resetSettings': {
              const next = settings.reset()
              if (next.cache.dir !== cache.dir) cache = createCache({ dir: next.cache.dir, logger: ctx.logger })
              return ok(await settingsPayload())
            }
            case 'credentialStatus': {
              if (!credentialRefPattern(input.ref)) throw new Error('ref must be an environment-style name')
              return ok(await credentialStatus(input.ref))
            }
            case 'setCredential': {
              if (!credentialRefPattern(input.ref)) throw new Error('ref must be an environment-style name')
              if (typeof input.value !== 'string' || input.value === '') throw new Error('value must be a non-empty string')
              const credentials = ctx.get('credentials')
              if (credentials === undefined) throw new Error('the DSH credentials service is not available')
              await credentials.set(input.ref, input.value)
              return ok(await credentialStatus(input.ref))
            }
            case 'clearCredential': {
              if (!credentialRefPattern(input.ref)) throw new Error('ref must be an environment-style name')
              const credentials = ctx.get('credentials')
              if (credentials === undefined) throw new Error('the DSH credentials service is not available')
              await credentials.unset(input.ref)
              return ok(await credentialStatus(input.ref))
            }
            case 'voices': {
              const id = providerIdOf(settings.get(), input.provider)
              const provider = providers.get(id)
              const options = optionsFor(settings.get(), id, input.overrides)
              return ok(await provider.voices(options))
            }
            case 'status': {
              const id = providerIdOf(settings.get(), input.provider)
              const provider = providers.get(id)
              const options = optionsFor(settings.get(), id, input.overrides)
              return ok(await provider.status(options))
            }
            case 'speak': {
              if (typeof input.text !== 'string' || input.text.trim() === '') throw new Error('text is required')
              return ok(await synthesize(input.text, {
                providerId: input.provider,
                overrides: { voice: input.voice, instruction: input.instruction },
                signal,
              }))
            }
            case 'speech': {
              if (typeof input.id === 'string' && input.id !== '') {
                return ok(speechRecords.get(input.id) ?? null)
              }
              const resolved = await resolveSpeech(input)
              const cached = settings.get().cache.enabled !== false ? await cache.get(resolved.key) : undefined
              if (cached !== undefined) {
                const result = await cacheResult(cached, {
                  source: resolved.source,
                  turn: resolved.turn,
                  seq: resolved.seq,
                  messageId: resolved.messageId,
                  sessionId: input.sessionId,
                })
                return ok({
                  ...publicResolved(resolved),
                  needsConfirm: false,
                  cacheHit: true,
                  id: result.id,
                  url: result.url,
                  timings: result.timings,
                  duration: result.duration,
                  complete: true,
                })
              }
              return ok({ ...publicResolved(resolved), cacheHit: false })
            }
            case 'prepare': {
              const hasSession = typeof input.sessionId === 'string' && input.sessionId !== ''
              const hasSource = hasSession && (input.messageId !== undefined || input.beforeSeq !== undefined)
              if (!hasSource) {
                if (typeof input.text !== 'string' || input.text.trim() === '') throw new Error('text is required')
                const providerId = input.provider
                const overrides = { ...definedOverrides(input.overrides) }
                if (input.voice !== undefined) overrides.voice = input.voice
                if (input.instruction !== undefined) overrides.instruction = input.instruction
                const snapshot = Object.keys(overrides).length > 0 && providerId !== undefined
                  ? normalizeSettings(deepMerge(settings.get(), { providers: { [providerId]: overrides } }), settings.defaults())
                  : undefined
                return ok(await prepare(input.text, {
                  providerId,
                  overrides,
                  snapshot,
                  signal,
                  stream: input.stream !== false,
                }))
              }
              const resolved = await resolveSpeech(input)
              const cached = settings.get().cache.enabled !== false ? await cache.get(resolved.key) : undefined
              if (cached !== undefined) {
                const result = await cacheResult(cached, {
                  source: resolved.source,
                  turn: resolved.turn,
                  seq: resolved.seq,
                  messageId: resolved.messageId,
                  sessionId: input.sessionId,
                })
                return ok({
                  ...result,
                  needsConfirm: false,
                  text: resolved.text,
                  speechText: resolved.text,
                  characters: resolved.characters,
                  threshold: resolved.threshold,
                })
              }
              if (resolved.needsConfirm && input.confirmed !== true) {
                return ok({
                  ...publicResolved(resolved),
                  cacheHit: false,
                  confirmed: false,
                })
              }
              return ok(await prepare(resolved.text, {
                providerId: resolved.provider,
                overrides: { voice: resolved.voice, instruction: resolved.instruction },
                signal,
                stream: input.stream !== false,
                speechInfo: {
                  source: resolved.source,
                  turn: resolved.turn,
                  seq: resolved.seq,
                  messageId: resolved.messageId,
                  sessionId: input.sessionId,
                },
              }))
            }
            case 'preview': {
              const providerId = providerIdOf(settings.get(), input.provider)
              const overrides = definedOverrides(input.overrides)
              const snapshot = normalizeSettings(deepMerge(settings.get(), { providers: { [providerId]: overrides } }), settings.defaults())
              const text = typeof input.text === 'string' && input.text.trim() !== ''
                ? input.text
                : '你好，这是语音合成试听。声音、语速和音色都可以在设置里调整。'
              return ok(await prepare(text, { providerId, overrides, snapshot, signal, stream: input.stream !== false }))
            }
            case 'cacheStats':
              return ok(await cache.stats())
            case 'clearCache':
              return ok(await cache.clear())
            case 'cancel':
              return ok({ cancelled: hub.cancel(String(input.id ?? '')) })
            default:
              throw new Error(`unknown endpoint ${JSON.stringify(endpoint)}`)
          }
        } catch (error) {
          return fail(error)
        }
      }),
      'dsh-tts: rpc channel',
    )
  })

  // ------------------------------------------------------------- routes
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: AUDIO_PREFIX,
        handler: (req, res) => serveAudioFile(ctx, store, req, res),
      }),
      'dsh-tts: audio route',
    )
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: STREAM_PREFIX,
        handler: (req, res) => serveStream(ctx, hub, store, req, res),
      }),
      'dsh-tts: stream route',
    )
  })

  ctx.effect(() => {
    void store.ensure().catch(() => {})
    return () => {
      hub.dispose()
      store.dispose()
      speechRecords.clear()
      pendingJobs.clear()
      settings.dispose()
    }
  }, 'dsh-tts: lifecycle')
}