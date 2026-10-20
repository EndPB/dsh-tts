/**
 * Edge TTS provider: Microsoft Edge online voices through the maintained
 * `edge-tts` CLI (the Edge service requires a v2 Sec-MS-GEC token, which the
 * package owns). The CLI is an external prerequisite, reported by `status()`
 * and by the Settings page; nothing else in the plugin depends on Python.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import { chunkText } from '../text.js'
import { abortError, outputFormatExtension, tail } from './util.js'

const run = promisify(execFile)
const VOICE_CACHE_MS = 10 * 60 * 1000
const STATUS_CACHE_MS = 5 * 60 * 1000

function failure(error, python) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return abortError()
  if (error?.code === 'ENOENT') {
    return new Error(`Edge TTS: Python command ${JSON.stringify(python)} was not found; set providers.edge.python in Settings`)
  }
  const detail = tail(error?.stderr) || tail(error?.stdout)
  if (/no module named ['"]?edge[_-]tts/i.test(detail)) {
    return new Error('Edge TTS: the edge-tts Python package is not installed. Run `python -m pip install --user edge-tts`, then retry.')
  }
  return new Error(`Edge TTS failed${detail ? `\n${detail}` : `\n${error?.message ?? String(error)}`}`)
}

function parseVoices(stdout) {
  const voices = []
  for (const line of String(stdout).split(/\r?\n/)) {
    const parts = line.trim().split(/\s{2,}/)
    const id = parts[0]?.trim()
    if (id === undefined || !/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(id)) continue
    const gender = parts[1]?.trim() ?? ''
    const lang = id.split('-').slice(0, 2).join('-')
    voices.push({ id, label: gender === '' ? id : `${id} · ${gender}`, lang, ...(gender === '' ? {} : { gender }) })
  }
  const rank = (lang) => (lang === 'zh-CN' ? 0 : lang?.startsWith('zh') ? 1 : lang === 'en-US' ? 2 : lang?.startsWith('en') ? 3 : 4)
  voices.sort((left, right) => rank(left.lang) - rank(right.lang) || left.id.localeCompare(right.id))
  return voices
}

export function createEdgeProvider({ settings, ctx }) {
  let voiceCache
  let statusCache

  return {
    id: 'edge',
    label: 'Edge TTS',
    capabilities: { streaming: false, voices: true, instruction: false },

    async status(options) {
      const python = options.python
      if (statusCache !== undefined && statusCache.python === python && Date.now() - statusCache.at < STATUS_CACHE_MS) {
        return statusCache.value
      }
      let value
      try {
        const result = await run(python, ['-m', 'edge_tts', '--version'], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true })
        value = { ok: true, detail: String(result.stdout).trim().split(/\r?\n/).at(-1) ?? '' }
      } catch (error) {
        value = { ok: false, reason: failure(error, python).message }
      }
      statusCache = { python, at: Date.now(), value }
      return value
    },

    async voices(options) {
      if (voiceCache !== undefined && voiceCache.python === options.python && Date.now() - voiceCache.at < VOICE_CACHE_MS) {
        return voiceCache.value
      }
      try {
        const result = await run(options.python, ['-m', 'edge_tts', '--list-voices'], {
          timeout: 45000,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
        })
        const value = parseVoices(result.stdout)
        voiceCache = { python: options.python, at: Date.now(), value }
        return value
      } catch (error) {
        throw failure(error, options.python)
      }
    },

    async synthesize(text, options, signal) {
      const format = outputFormatExtension(options.format)
      const { chunks } = chunkText(text, 1500, 6000)
      if (chunks.length === 0) throw new Error('Edge TTS: nothing to speak')
      const pieces = []
      for (const chunk of chunks) {
        signal?.throwIfAborted()
        pieces.push(await speakChunk(chunk, options, format, signal))
      }
      return { bytes: Buffer.concat(pieces), format, chunks: chunks.length }
    },
  }

  async function speakChunk(text, options, format, signal) {
    await mkdir(settings.get().outputDir, { recursive: true })
    const outputPath = join(settings.get().outputDir, `.dsh-tts-${randomBytes(8).toString('hex')}.${format}`)
    const args = [
      '-m', 'edge_tts',
      '--text', text,
      '--voice', options.voice,
      '--write-media', outputPath,
      '--no-progress',
      '--rate', options.rate,
      '--pitch', options.pitch,
    ]
    if (typeof options.volume === 'string' && options.volume !== '') args.push('--volume', options.volume)
    try {
      await run(options.python, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, signal })
    } catch (error) {
      throw failure(error, options.python)
    }
    let bytes
    try {
      bytes = await readFile(outputPath)
    } catch {
      throw new Error(`Edge TTS reported success but wrote no audio to ${outputPath}`)
    }
    await rm(outputPath, { force: true })
    if (bytes.length === 0) throw new Error('Edge TTS produced an empty audio file')
    return bytes
  }
}