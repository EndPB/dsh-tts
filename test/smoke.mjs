/**
 * Pure-unit smoke test for the v2 settings model, text preparation and the
 * settings store. No network and no DSH runtime are required.
 *
 *   node test/smoke.mjs
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { normalizeConfig, normalizeSettings, publicSettings } from '../lib/config.js'
import { sanitizeText, chunkText } from '../lib/text.js'
import { createSettingsStore } from '../lib/settings-store.js'
import { createCache } from '../lib/cache.js'
import { mp3DurationMs } from '../lib/mp3-duration.js'

const results = []
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const markdown = [
  '# 标题',
  '',
  '你好，**世界**！这是一段 `inline code` 和 [链接](https://example.com)。',
  '',
  '```js',
  'console.log("do not read")',
  '```',
  '',
  '- 第一项',
  '- 第二项 [[tts]]',
].join('\n')
const clean = sanitizeText(markdown, '[[tts]]')
check('sanitize removes fences', !clean.includes('console.log'), clean)
check('sanitize removes the tag', !clean.includes('[[tts]]'), clean)
check('sanitize keeps the link label', clean.includes('链接'), clean)
const directed = sanitizeText('你好[excited]！[instruct:温柔]今天好吗？', '')
check('sanitize strips direction tags', !directed.includes('excited'), directed)
check('sanitize keeps instruct control', directed.includes('[instruct:温柔]'), directed)

const longText = '这是一个用于测试分段的句子。'.repeat(220)
const chunked = chunkText(longText, 600, 2000)
check('chunk caps total characters', chunked.truncated === true, `chunks=${chunked.chunks.length}`)
check('chunk size respected', chunked.chunks.every((chunk) => chunk.length <= 600), `max=${Math.max(...chunked.chunks.map((chunk) => chunk.length))}`)

const config = normalizeConfig({
  auto: 'tagged',
  provider: 'cosyvoice',
  providers: {
    cosyvoice: { model: 'cosyvoice-v3.5-plus', voice: 'custom-voice', apiKeyRef: 'DASHSCOPE_API_KEY' },
    microsoft: { voice: 'zh-CN-YunxiNeural' },
  },
})
check('defaults fill both providers', config.providers.edge !== undefined && config.providers.cosyvoice !== undefined)
check('legacy microsoft maps to edge', config.providers.edge.voice === 'zh-CN-YunxiNeural')
check('output directory defaults below DSH_HOME', config.outputDir.endsWith(join('tts', 'audio')), config.outputDir)
check('public settings carry no secret', !JSON.stringify(publicSettings(config)).includes('sk-'))
check('speech confirmation defaults to 100', config.speech.confirmThreshold === 100)
check('speech generation defaults to async', config.speech.mode === 'async')
check('cache defaults to unlimited', config.cache.maxEntries === 0 && config.cache.maxSizeMB === 0 && config.cache.enabled === true)

let rejected = false
try { normalizeConfig({ auto: 'sometimes' }) } catch { rejected = true }
check('invalid auto is rejected', rejected)
rejected = false
try { normalizeConfig({ providers: { cosyvoice: { rate: 9 } } }) } catch { rejected = true }
check('out-of-range rate is rejected', rejected)
rejected = false
try { normalizeConfig({ speech: { mode: 'sometimes' } }) } catch { rejected = true }
check('invalid speech mode is rejected', rejected)
const blocking = normalizeConfig({ speech: { mode: 'blocking' } })
check('blocking speech mode is accepted', blocking.speech.mode === 'blocking')

const merged = normalizeSettings({ auto: 'always', providers: { edge: { rate: '+20%' } } }, config)
check('settings merge over defaults', merged.auto === 'always' && merged.providers.edge.rate === '+20%' && merged.providers.edge.voice === 'zh-CN-YunxiNeural')

const dir = await mkdtemp(join(tmpdir(), 'dsh-tts-settings-'))
const file = join(dir, 'settings.json')
const store = createSettingsStore({ base: normalizeConfig({ outputDir: join(dir, 'audio') }), file })
check('store starts from defaults', store.get().auto === 'tagged')
const saved = store.save({ auto: 'always', speech: { mode: 'blocking' }, providers: { edge: { voice: 'zh-CN-YunxiNeural' } } })
check('store save returns effective settings', saved.auto === 'always' && saved.speech.mode === 'blocking' && saved.providers.edge.voice === 'zh-CN-YunxiNeural')
const onDisk = JSON.parse(await readFile(file, 'utf8'))
check('store writes the file', onDisk.auto === 'always' && onDisk.providers.edge.voice === 'zh-CN-YunxiNeural')
const reloaded = createSettingsStore({ base: normalizeConfig({ outputDir: join(dir, 'audio') }), file })
check('store reloads the file', reloaded.get().auto === 'always' && reloaded.get().speech.mode === 'blocking')
reloaded.reset()
check('store reset restores defaults', reloaded.get().auto === 'tagged')
await rm(dir, { recursive: true, force: true })

const cacheDir = await mkdtemp(join(tmpdir(), 'dsh-tts-cache-'))
const cache = createCache({ dir: cacheDir })
const cacheKey = 'a'.repeat(40)
const cacheBytes = Buffer.from('fake-mp3-bytes')
await cache.put(cacheKey, {
  bytes: cacheBytes,
  format: 'mp3',
  text: '模型调用时说的话。',
  timings: [{ text: '模型', begin_index: 0, end_index: 2, begin_time: 0, end_time: 400 }],
  durationMs: 400,
  provider: 'cosyvoice',
  voice: 'test-voice',
  model: 'test-model',
})
const restartedCache = createCache({ dir: cacheDir })
const cacheHit = await restartedCache.get(cacheKey)
check('cache survives a new instance', cacheHit !== undefined && cacheHit.bytes === cacheBytes.length && cacheHit.meta.text === '模型调用时说的话。')
check('cache keeps word timings', cacheHit.meta.timings.length === 1)
const cacheStats = await restartedCache.stats()
check('cacheStats counts the entry', cacheStats.entries === 1 && cacheStats.bytes === cacheBytes.length)
const noSweep = await restartedCache.prune({ maxEntries: 0, maxSizeMB: 0 })
check('unlimited cache never sweeps', noSweep.removed === 0 && (await restartedCache.stats()).entries === 1)
const cleared = await restartedCache.clear()
check('cache clear removes the audio', cleared.removed === 1 && (await restartedCache.stats()).entries === 0)

const frame = Buffer.alloc(192)
frame.writeUInt32BE(0xfff384c4, 0)
const tenFrames = Buffer.concat(Array.from({ length: 10 }, () => frame))
check('MP3 duration counts frames', mp3DurationMs(tenFrames) === 240, `${mp3DurationMs(tenFrames)} ms`)
const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
check('MP3 duration skips ID3v2', mp3DurationMs(Buffer.concat([id3, tenFrames])) === 240)
await rm(cacheDir, { recursive: true, force: true })

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1