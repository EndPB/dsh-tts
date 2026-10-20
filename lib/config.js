/**
 * Settings model for dsh-tts.
 *
 * The Loader row (`cordis.patch.yml`) supplies deployment defaults; the user's
 * Settings page writes `%DSH_HOME%/tts/settings.json`, which is merged over
 * those defaults. Secrets never live here: providers resolve an apiKeyRef
 * through the DSH credentials service at request time.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const AUTO_MODES = ['off', 'tagged', 'always']
/** Tool synthesis can return before the audio is ready, or wait for the file. */
export const SPEECH_MODES = ['async', 'blocking']
export const COSYVOICE_MODELS = ['cosyvoice-v3.5-plus', 'cosyvoice-v3.5-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3-flash', 'cosyvoice-v2']
export const COSYVOICE_FORMATS = ['mp3', 'wav', 'pcm', 'opus']
export const COSYVOICE_SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000]

/** A small curated list; any cloned/voice-design id can be typed instead. */
export const COSYVOICE_PRESET_VOICES = [
  { id: 'longanyang', label: '龙安洋 · 男声' },
  { id: 'longxiaochun_v2', label: '龙小淳 · 女声' },
  { id: 'longwan', label: '龙婉 · 女声' },
  { id: 'longcheng', label: '龙橙 · 男声' },
  { id: 'longhua', label: '龙华 · 女声' },
  { id: 'longshu', label: '龙书 · 男声' },
]

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Merge plain objects recursively; arrays and scalars replace. */
export function deepMerge(base, patch) {
  if (!isRecord(base) || !isRecord(patch)) return patch === undefined ? clone(base) : clone(patch)
  const out = clone(base)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isRecord(value) && isRecord(out[key]) ? deepMerge(out[key], value) : clone(value)
  }
  return out
}

/** `%DSH_HOME%` (or `~/.dsh`) below which audio and settings live. */
export function ttsRoot() {
  const home = process.env.DSH_HOME?.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  return join(home, 'tts')
}

export function defaultOutputDir() {
  return join(ttsRoot(), 'audio')
}

export function defaultSettingsPath() {
  return join(ttsRoot(), 'settings.json')
}

export const DEFAULTS = {
  auto: 'tagged',
  provider: 'cosyvoice',
  systemPrompt: true,
  tag: '[[tts]]',
  chunkChars: 600,
  maxChars: 6000,
  outputDir: undefined,
  speech: {
    confirmThreshold: 100,
    mode: 'async',
  },
  cache: {
    enabled: true,
    maxEntries: 0,
    maxSizeMB: 0,
    dir: '',
  },
  providers: {
    cosyvoice: {
      enabled: true,
      model: 'cosyvoice-v3.5-plus',
      voice: 'longanyang',
      format: 'mp3',
      sampleRate: 24000,
      bitRate: 64,
      volume: 50,
      rate: 1,
      pitch: 1,
      instruction: '',
      languageHint: 'zh',
      apiKeyRef: 'DASHSCOPE_API_KEY',
      baseUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
      streaming: true,
    },
    edge: {
      enabled: true,
      python: process.platform === 'win32' ? 'python' : 'python3',
      voice: 'zh-CN-XiaoyiNeural',
      rate: '+10%',
      pitch: '+0Hz',
      volume: '+0%',
      format: 'audio-24khz-48kbitrate-mono-mp3',
    },
  },
}

function fail(field, message) {
  throw new Error(`dsh-tts: ${field} ${message}`)
}

function stringValue(value, fallback, field, { allowEmpty = false } = {}) {
  if (value === undefined) return fallback
  if (typeof value !== 'string') fail(field, 'must be a string')
  if (!allowEmpty && value.trim() === '') fail(field, 'must not be empty')
  return allowEmpty ? value : value.trim()
}

function booleanValue(value, fallback, field) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(field, 'must be a boolean')
  return value
}

function integerValue(value, fallback, field, min, max) {
  if (value === undefined || value === null || value === '') return fallback
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number)) fail(field, 'must be an integer')
  if (number < min || number > max) fail(field, `must be between ${min} and ${max}`)
  return number
}

function numberValue(value, fallback, field, min, max) {
  if (value === undefined || value === null || value === '') return fallback
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) fail(field, 'must be a number')
  if (number < min || number > max) fail(field, `must be between ${min} and ${max}`)
  return number
}

function enumValue(value, fallback, values, field) {
  if (value === undefined) return fallback
  if (!values.includes(value)) fail(field, `must be one of ${values.join(', ')}`)
  return value
}

function refValue(value, fallback, field) {
  const ref = stringValue(value, fallback, field)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) fail(field, 'must be an environment-style name such as DASHSCOPE_API_KEY')
  return ref
}

function urlValue(value, fallback, field) {
  const url = stringValue(value, fallback, field)
  if (!/^wss?:\/\//i.test(url)) fail(field, 'must start with ws:// or wss://')
  return url
}

function normalizeProviders(raw, base) {
  const input = isRecord(raw) ? raw : {}
  // `microsoft` was the v1 name; keep an old patch working.
  const edgeInput = input.edge ?? input.microsoft ?? {}
  const cosyInput = input.cosyvoice ?? {}

  const cosy = { ...base.providers.cosyvoice, ...(isRecord(cosyInput) ? cosyInput : {}) }
  cosy.enabled = booleanValue(cosy.enabled, true, 'providers.cosyvoice.enabled')
  cosy.model = enumValue(cosy.model, base.providers.cosyvoice.model, COSYVOICE_MODELS, 'providers.cosyvoice.model')
  cosy.voice = stringValue(cosy.voice, base.providers.cosyvoice.voice, 'providers.cosyvoice.voice')
  cosy.format = enumValue(cosy.format, base.providers.cosyvoice.format, COSYVOICE_FORMATS, 'providers.cosyvoice.format')
  cosy.sampleRate = enumValue(Number(cosy.sampleRate), base.providers.cosyvoice.sampleRate, COSYVOICE_SAMPLE_RATES, 'providers.cosyvoice.sampleRate')
  cosy.bitRate = integerValue(cosy.bitRate, base.providers.cosyvoice.bitRate, 'providers.cosyvoice.bitRate', 6, 510)
  cosy.volume = integerValue(cosy.volume, base.providers.cosyvoice.volume, 'providers.cosyvoice.volume', 0, 100)
  cosy.rate = numberValue(cosy.rate, base.providers.cosyvoice.rate, 'providers.cosyvoice.rate', 0.5, 2)
  cosy.pitch = numberValue(cosy.pitch, base.providers.cosyvoice.pitch, 'providers.cosyvoice.pitch', 0.5, 2)
  cosy.instruction = stringValue(cosy.instruction, base.providers.cosyvoice.instruction, 'providers.cosyvoice.instruction', { allowEmpty: true })
  cosy.languageHint = stringValue(cosy.languageHint, base.providers.cosyvoice.languageHint, 'providers.cosyvoice.languageHint', { allowEmpty: true })
  cosy.apiKeyRef = refValue(cosy.apiKeyRef, base.providers.cosyvoice.apiKeyRef, 'providers.cosyvoice.apiKeyRef')
  cosy.baseUrl = urlValue(cosy.baseUrl, base.providers.cosyvoice.baseUrl, 'providers.cosyvoice.baseUrl')
  cosy.streaming = booleanValue(cosy.streaming, base.providers.cosyvoice.streaming, 'providers.cosyvoice.streaming')

  const edge = { ...base.providers.edge, ...(isRecord(edgeInput) ? edgeInput : {}) }
  edge.enabled = booleanValue(edge.enabled, true, 'providers.edge.enabled')
  edge.python = stringValue(edge.python, base.providers.edge.python, 'providers.edge.python')
  edge.voice = stringValue(edge.voice, base.providers.edge.voice, 'providers.edge.voice')
  edge.rate = stringValue(edge.rate, base.providers.edge.rate, 'providers.edge.rate')
  edge.pitch = stringValue(edge.pitch, base.providers.edge.pitch, 'providers.edge.pitch')
  edge.volume = stringValue(edge.volume, base.providers.edge.volume, 'providers.edge.volume')
  edge.format = stringValue(edge.format, base.providers.edge.format, 'providers.edge.format')

  return { cosyvoice: cosy, edge }
}

/**
 * Validate one complete configuration snapshot.
 * @param raw - Loader patch or a settings file.
 * @returns every field with defaults applied.
 */
export function normalizeConfig(raw) {
  if (raw !== undefined && !isRecord(raw)) fail('config', 'must be an object')
  const input = raw ?? {}
  const base = clone(DEFAULTS)
  base.outputDir = defaultOutputDir()

  const provider = input.provider ?? base.provider
  const mappedProvider = provider === 'local-cli' ? 'cosyvoice' : provider === 'microsoft' ? 'edge' : provider
  if (!['cosyvoice', 'edge'].includes(mappedProvider)) fail('provider', 'must be cosyvoice or edge')

  return {
    auto: enumValue(input.auto, base.auto, AUTO_MODES, 'auto'),
    provider: mappedProvider,
    systemPrompt: booleanValue(input.systemPrompt, base.systemPrompt, 'systemPrompt'),
    tag: stringValue(input.tag, base.tag, 'tag', { allowEmpty: true }),
    chunkChars: integerValue(input.chunkChars, base.chunkChars, 'chunkChars', 1, 100000),
    maxChars: integerValue(input.maxChars, base.maxChars, 'maxChars', 1, 1000000),
    outputDir: stringValue(input.outputDir, base.outputDir, 'outputDir'),
    speech: {
      confirmThreshold: integerValue(input.speech?.confirmThreshold, base.speech.confirmThreshold, 'speech.confirmThreshold', 0, 1000000),
      mode: enumValue(input.speech?.mode, base.speech.mode, SPEECH_MODES, 'speech.mode'),
    },
    cache: {
      enabled: booleanValue(input.cache?.enabled, base.cache.enabled, 'cache.enabled'),
      maxEntries: integerValue(input.cache?.maxEntries, base.cache.maxEntries, 'cache.maxEntries', 0, 10000000),
      maxSizeMB: integerValue(input.cache?.maxSizeMB, base.cache.maxSizeMB, 'cache.maxSizeMB', 0, 10000000),
      dir: stringValue(input.cache?.dir, '', 'cache.dir', { allowEmpty: true }) || join(ttsRoot(), 'cache'),
    },
    providers: normalizeProviders(input.providers, base),
  }
}

/** Merge a user settings snapshot over deployment defaults and validate it. */
export function normalizeSettings(candidate, defaults) {
  return normalizeConfig(deepMerge(defaults, candidate))
}

/** Client-safe settings (there are no secret values in this shape). */
export function publicSettings(settings) {
  return clone(settings)
}

/** Provider descriptors consumed by the Settings page. */
export function providerCatalog() {
  return [
    {
      id: 'cosyvoice',
      label: 'CosyVoice',
      description: 'Alibaba Cloud Model Studio (DashScope) duplex WebSocket synthesis with cloned or designed voices.',
      capabilities: { streaming: true, voices: true, instruction: true },
    },
    {
      id: 'edge',
      label: 'Edge TTS',
      description: 'Microsoft Edge online voices through the local edge-tts CLI.',
      capabilities: { streaming: false, voices: true, instruction: false },
    },
  ]
}