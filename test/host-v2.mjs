/**
 * Host v2 integration test with a mocked Cordis context.
 *
 *   node test/host-v2.mjs
 *
 * Exercises the provider registry, Settings RPC, credentials seam, the
 * `tts_speak` tool, CosyVoice duplex streaming, the progressive stream route,
 * and Range delivery of the finished file.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-tts-v2-'))
process.env.DSH_HOME = home
process.env.DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''

const { apply } = await import('../index.js')
const { AUDIO_PREFIX } = await import('../lib/routes.js')
const { STREAM_PREFIX } = await import('../lib/streams.js')

const results = []
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sessionId = 'session-v2'
const events = [
  { type: 'tool/call', seq: 1, data: { turn: 1, step: 1, callId: 'c1', name: 'tts_speak', arguments: { text: '模型调用时说的话。', instruction: '平静' } } },
  { type: 'assistant/message', seq: 2, data: { turn: 1, step: 1, message: { id: 'm1', content: [{ type: 'text', text: '第一段。' }, { type: 'text', text: '第二段。' }] } } },
  { type: 'assistant/message', seq: 3, data: { turn: 2, step: 2, message: { id: 'm2', content: [{ type: 'text', text: '最终回复。' }] } } },
]
const secrets = new Map()
const credentials = {
  async resolve(ref) {
    if (secrets.has(ref)) return { value: secrets.get(ref), source: 'stored' }
    const env = process.env[ref]
    return env ? { value: env, source: 'environment' } : undefined
  },
  async describe(ref) {
    const configured = secrets.has(ref) || Boolean(process.env[ref])
    return { configured, source: secrets.has(ref) ? 'stored' : 'environment', writable: true }
  },
  async set(ref, value) { secrets.set(ref, value) },
  async unset(ref) { secrets.delete(ref) },
}

let tool
let rpcHandler
const routes = new Map()
let promptSection

const mockCtx = {
  logger: { warn() {} },
  get(name) {
    if (name === 'systemPrompt') return { section: (section) => { promptSection = section; return () => {} } }
    if (name === 'sessionQuery') return { readSession: async () => ({ events }) }
    if (name === 'credentials') return credentials
    if (name === 'connection') return { requestRejection: () => undefined }
    return undefined
  },
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  inject(_deps, callback) { callback(mockCtx) },
  tools: { register(definition) { tool = definition; return () => {} } },
  connection: {
    rpc: { handle(channel, handler) { check('rpc channel', channel === '/dsh-tts', channel); rpcHandler = handler; return () => {} } },
  },
  webServer: {
    register(route) { routes.set(route.path, route); return () => {} },
  },
}

apply(mockCtx, {
  auto: 'tagged',
  provider: 'cosyvoice',
  providers: {
    cosyvoice: {
      enabled: true,
      model: 'cosyvoice-v3.5-plus',
      voice: process.env.COSYVOICE_VOICE_ID,
      apiKeyRef: 'DASHSCOPE_API_KEY',
      streaming: true,
    },
    edge: { enabled: true, python: 'python', voice: 'zh-CN-XiaoyiNeural' },
  },
})

check('tool registered', tool?.name === 'tts_speak', tool?.name)
check('tool no longer exposes autoplay', tool?.parameters?.properties?.autoplay === undefined)
check('audio route registered', routes.has(AUDIO_PREFIX), AUDIO_PREFIX)
check('stream route registered', routes.has(STREAM_PREFIX), STREAM_PREFIX)
check('prompt section registered', typeof promptSection?.text === 'function')

const call = async (endpoint, payload, signal = new AbortController().signal) => {
  const response = await rpcHandler(endpoint, payload, signal)
  if (response.ok !== true) throw new Error(`${endpoint}: ${response.error?.message}`)
  return response.value
}

const waitSpeech = async (id, timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs
  let record
  while (Date.now() < deadline) {
    record = await call('speech', { id })
    if (record !== null && typeof record === 'object' && record.complete === true) return record
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`speech ${id} did not complete`)
}

const info = await call('info', null)
check('info reports two providers', info.providers.length === 2 && info.auto === 'tagged', JSON.stringify(info.providers.map((p) => p.id)))
check('info keeps the custom voice out of the summary', !JSON.stringify(info).includes('sk-'))

const loaded = await call('getSettings', null)
check('getSettings returns settings + defaults', loaded.settings.providers.cosyvoice.voice === process.env.COSYVOICE_VOICE_ID)
check('getSettings reports the credential', loaded.credentials.DASHSCOPE_API_KEY?.configured === true, JSON.stringify(loaded.credentials))
check('getSettings reports the settings file', typeof loaded.settingsFile === 'string' && loaded.settingsFile.startsWith(home), loaded.settingsFile)

const draft = structuredClone(loaded.settings)
draft.auto = 'always'
draft.providers.edge.voice = 'zh-CN-YunxiNeural'
const saved = await call('saveSettings', { settings: draft })
check('saveSettings persists', saved.settings.auto === 'always' && saved.settings.providers.edge.voice === 'zh-CN-YunxiNeural')
const settingsFileStat = await stat(join(home, 'tts', 'settings.json'))
check('settings file written', settingsFileStat.isFile())
const reset = await call('resetSettings', null)
check('resetSettings restores defaults', reset.settings.auto === 'tagged' && reset.settings.providers.edge.voice === 'zh-CN-XiaoyiNeural')

const set = await call('setCredential', { ref: 'DASHSCOPE_API_KEY', value: 'sk-test' })
check('setCredential writes', set.configured === true && secrets.get('DASHSCOPE_API_KEY') === 'sk-test')
const cleared = await call('clearCredential', { ref: 'DASHSCOPE_API_KEY' })
check('clearCredential reports environment fallback', cleared.configured === true && cleared.source === 'environment', JSON.stringify(cleared))

const cosyVoices = await call('voices', { provider: 'cosyvoice' })
check('cosyvoice voices include the configured voice', cosyVoices.some((voice) => voice.id === process.env.COSYVOICE_VOICE_ID), `${cosyVoices.length} voices`)
const edgeVoices = await call('voices', { provider: 'edge' })
check('edge voices load from the CLI', edgeVoices.length > 100 && edgeVoices.some((voice) => voice.id === 'zh-CN-XiaoyiNeural'), `${edgeVoices.length} voices`)
const cosyStatus = await call('status', { provider: 'cosyvoice' })
check('cosyvoice status is ready', cosyStatus.ok === true, JSON.stringify(cosyStatus))
const edgeStatus = await call('status', { provider: 'edge' })
check('edge status is ready', edgeStatus.ok === true, JSON.stringify(edgeStatus))

const toolStartedAt = Date.now()
const spoken = await tool.execute({ text: '你好，这是工具调用测试。', instruction: '用平静的语气' }, {})
const elapsed = Date.now() - toolStartedAt
const declaredKeys = new Set(Object.keys(tool.output.schema.properties))
const extraKeys = Object.keys(spoken).filter((key) => !declaredKeys.has(key))
const missingKeys = (tool.output.schema.required ?? []).filter((key) => spoken[key] === undefined)
check('tool output uses only declared schema properties', extraKeys.length === 0, extraKeys.join(','))
check('tool output satisfies the declared required fields', missingKeys.length === 0, missingKeys.join(','))
check('async tool returns a live stream before audio is ready', spoken.complete === false && spoken.streaming === true && spoken.bytes === 0, JSON.stringify({ complete: spoken.complete, bytes: spoken.bytes }))
check('async tool returns immediately', elapsed < 5000, `${elapsed} ms`)
const spokenRecord = await waitSpeech(spoken.id)
check('background synthesis completes with CosyVoice', spokenRecord.complete === true && spokenRecord.bytes > 1000 && spokenRecord.provider === 'cosyvoice', `${spokenRecord.bytes} bytes`)
const edgeTool = await tool.execute({ text: '你好，这是 Edge 异步测试。', provider: 'edge' }, {})
check('async Edge also returns a pending stream', edgeTool.complete === false && edgeTool.streaming === true, JSON.stringify({ complete: edgeTool.complete }))
const edgeRecord = await waitSpeech(edgeTool.id)
check('deferred Edge synthesis completes in the background', edgeRecord.complete === true && edgeRecord.bytes > 1000 && edgeRecord.provider === 'edge', `${edgeRecord.bytes} bytes`)
const cachedOnce = await tool.execute({ text: '缓存复用测试', instruction: '' }, {})
const cachedOnceRecord = await waitSpeech(cachedOnce.id)
const cachedTwice = await tool.execute({ text: '缓存复用测试', instruction: '' }, {})
check('identical calls reuse the cache', cachedTwice.cached === true && cachedTwice.bytes === cachedOnceRecord.bytes && cachedTwice.bytes > 1000, `${cachedTwice.bytes} bytes`)
const cachedExtraKeys = Object.keys(cachedTwice).filter((key) => !declaredKeys.has(key))
const cachedMissingKeys = (tool.output.schema.required ?? []).filter((key) => cachedTwice[key] === undefined)
check('cached tool output uses only declared schema properties', cachedExtraKeys.length === 0, cachedExtraKeys.join(','))
check('cached tool output satisfies the declared required fields', cachedMissingKeys.length === 0, cachedMissingKeys.join(','))
const cacheStats = await call('cacheStats', null)
check('cacheStats reports entries', cacheStats.entries >= 2, JSON.stringify(cacheStats))
const toolSpeech = await call('speech', { sessionId, messageId: 'm1' })
check('speech prefers the tts_speak text', toolSpeech.source === 'tool' && toolSpeech.text.includes('模型调用'), JSON.stringify(toolSpeech.text))
check('tool speech never asks for confirmation', toolSpeech.needsConfirm === false)
check('tool speech is a cache miss before synthesis', toolSpeech.cacheHit === false)
const preparedTool = await call('prepare', { source: 'message', sessionId, messageId: 'm1', stream: false })
check('prepare returns the full speech text for the progress bar', typeof preparedTool.speechText === 'string' && preparedTool.speechText.includes('模型调用'), preparedTool.speechText)
check('CosyVoice word timings are captured', Array.isArray(preparedTool.timings) && preparedTool.timings.length > 0, `${preparedTool.timings?.length ?? 0} words`)
const preparedRecord = await call('speech', { id: preparedTool.id })
check('speech record is complete with timings', preparedRecord.complete === true && preparedRecord.timings.length > 0 && preparedRecord.text === preparedTool.speechText)
check('duration is frame-accurate', preparedTool.duration > 0 && Math.abs(preparedTool.duration - preparedRecord.duration) < 0.001, `${preparedTool.duration}s`)
const toolSpeechCached = await call('speech', { sessionId, messageId: 'm1' })
check('the next speech lookup hits the cache', toolSpeechCached.cacheHit === true && typeof toolSpeechCached.url === 'string')
check('cached speech keeps the timings', Array.isArray(toolSpeechCached.timings) && toolSpeechCached.timings.length > 0)

const thresholdDraft = structuredClone(loaded.settings)
thresholdDraft.speech.confirmThreshold = 2
await call('saveSettings', { settings: thresholdDraft })
const longReply = await call('speech', { sessionId, messageId: 'm2' })
check('a reply above the threshold asks for confirmation', longReply.source === 'reply' && longReply.needsConfirm === true, JSON.stringify({ chars: longReply.characters, threshold: longReply.threshold }))
const blocked = await call('prepare', { source: 'message', sessionId, messageId: 'm2' })
check('prepare refuses an unconfirmed long reply', blocked.needsConfirm === true && typeof blocked.url !== 'string')
const confirmedReply = await call('prepare', { source: 'message', sessionId, messageId: 'm2', confirmed: true, stream: false })
check('a confirmed long reply synthesizes', confirmedReply.bytes > 1000 && confirmedReply.source === 'reply')
await call('resetSettings', null)

const blockingDraft = structuredClone(loaded.settings)
blockingDraft.speech.mode = 'blocking'
await call('saveSettings', { settings: blockingDraft })
const blockingStarted = Date.now()
const blockingTool = await tool.execute({ text: '阻塞模式工具调用测试。' }, {})
check('blocking mode waits for the complete file', blockingTool.complete === true && blockingTool.bytes > 1000 && blockingTool.streaming === false, `${Date.now() - blockingStarted} ms`)
await call('resetSettings', null)
const clearedCache = await call('clearCache', null)
check('clearCache removes cached audio', clearedCache.removed > 0, JSON.stringify(clearedCache))
const afterClear = await call('speech', { sessionId, messageId: 'm1' })
check('tool text survives clearing the audio cache', afterClear.cacheHit === false && afterClear.source === 'tool' && afterClear.text.includes('模型调用'))
const resynthesized = await call('prepare', { source: 'message', sessionId, messageId: 'm1', stream: false })
check('the same tool text synthesizes again after a clear', resynthesized.speechText.includes('模型调用') && resynthesized.bytes > 1000)
const meta = tool.output.presentationMeta({ text: 'x', instruction: '用平静的语气' }, spoken)
check('presentationMeta carries instruction and pending state', meta.kind === 'dsh-tts' && meta.instruction === '用平静的语气' && meta.complete === false)
check('presentationMeta never enables autoplay', meta.autoplay === undefined)

function makeResponse() {
  const chunks = []
  let finish
  const finished = new Promise((resolve) => { finish = resolve })
  return {
    status: 0,
    headers: {},
    chunks,
    writableEnded: false,
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    write(chunk) { if (chunk !== undefined) chunks.push(Buffer.from(chunk)) },
    end(chunk) { if (chunk !== undefined) chunks.push(Buffer.from(chunk)); this.writableEnded = true; finish() },
    destroy() { this.writableEnded = true; finish() },
    setHeader() {},
    get body() { return Buffer.concat(chunks) },
    finished,
  }
}

function request(url, range) {
  return {
    method: 'GET',
    url: `http://127.0.0.1:56290${url}`,
    headers: { host: '127.0.0.1:56290', ...(range === undefined ? {} : { range }) },
    socket: { remoteAddress: '127.0.0.1' },
    on() {}, once() {}, emit() {},
  }
}

const startedAt = Date.now()
const streamed = await call('prepare', { source: 'text', text: '你好，这是双向流式播放测试。第一句会尽快开始播放。' })
check('prepare returns a stream URL', streamed.streaming === true && streamed.url.startsWith(STREAM_PREFIX), streamed.url)
const streamResponse = makeResponse()
await routes.get(STREAM_PREFIX).handler(request(streamed.url), streamResponse)
check('stream route starts before synthesis ends', streamResponse.status === 200 && streamResponse.headers['content-type'] === 'audio/mpeg', JSON.stringify(streamResponse.headers))
await streamResponse.finished
const firstByteMs = Date.now() - startedAt
check('stream produces audio', streamResponse.body.length > 1000, `${streamResponse.body.length} bytes in ${firstByteMs} ms`)

let stored
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const cached = await readFile(join(home, 'tts', 'audio', `${streamed.id}.mp3`))
    if (cached.length > 1000) { stored = cached; break }
  } catch {
    // The file is written when the stream ends; wait briefly.
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
}
check('stream writes the audio cache', stored !== undefined && stored.length === streamResponse.body.length, `${stored?.length ?? 0} bytes`)

const rangeResponse = makeResponse()
await routes.get(AUDIO_PREFIX).handler(request(`${AUDIO_PREFIX}/${streamed.id}`, 'bytes=0-99'), rangeResponse)
check('finished file supports Range', rangeResponse.status === 206 && rangeResponse.headers['content-range'] === `bytes 0-99/${streamResponse.body.length}`, JSON.stringify(rangeResponse.headers))

const preview = await call('preview', { provider: 'edge', overrides: { voice: 'zh-CN-YunxiNeural' }, text: '你好，这是 Edge 试听。', stream: false })
check('Edge preview returns a file', preview.provider === 'edge' && preview.streaming === false && preview.bytes > 1000, `${preview.bytes} bytes`)

const fromMessage = await call('prepare', { source: 'message', sessionId, messageId: 'm2', stream: false })
check('prepare reads a message from the session', fromMessage.characters === 5 || fromMessage.text.includes('最终回复'), JSON.stringify(fromMessage.text))

const cancelled = await call('prepare', { source: 'text', text: '这一条会被取消。' })
await call('cancel', { id: cancelled.id })
check('cancel accepts a live stream id', cancelled.streaming === true)

await rm(home, { recursive: true, force: true })
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1