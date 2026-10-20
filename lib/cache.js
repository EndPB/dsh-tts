/**
 * Persistent speech cache.
 *
 * Entries are content-addressed by a hash of the sanitized text plus every
 * synthesis parameter, so a cache hit is exactly the audio that was produced
 * for that text. Files live under `%DSH_HOME%/tts/cache` and are never swept on
 * startup: only an explicit clear, or the user's optional size/count limits,
 * remove them. The spoken text itself is not owned by this cache; the "语音"
 * button re-reads it from the Session log, so clearing audio keeps the text.
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const META_VERSION = 1
const AUDIO_PATTERN = /^[a-f0-9]{40}\.(mp3|wav|ogg|opus|m4a|aac|webm|flac)$/
const META_PATTERN = /^[a-f0-9]{40}\.json$/

/** Stable content key for one synthesis request. */
export function speechCacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40)
}

export function createCache({ dir, logger }) {
  let ensured
  const ensure = () => {
    ensured ??= mkdir(dir, { recursive: true })
    return ensured
  }
  const audioPath = (key, format) => join(dir, `${key}.${format}`)
  const metaPath = (key) => join(dir, `${key}.json`)

  return {
    dir,
    key: speechCacheKey,

    /** Return a valid cached entry, or undefined. */
    async get(key) {
      let meta
      try {
        meta = JSON.parse(await readFile(metaPath(key), 'utf8'))
      } catch {
        return undefined
      }
      if (meta === null || typeof meta !== 'object' || meta.version !== META_VERSION || meta.key !== key) return undefined
      const format = typeof meta.format === 'string' ? meta.format : 'mp3'
      const file = audioPath(key, format)
      try {
        const info = await stat(file)
        if (!info.isFile() || info.size === 0) return undefined
        return { key, file, format, bytes: info.size, meta: { ...meta, bytes: info.size } }
      } catch {
        return undefined
      }
    },

    /** Persist one completed synthesis. */
    async put(key, { bytes, format, text, timings, durationMs, provider, voice, model }) {
      await ensure()
      const file = audioPath(key, format)
      const stamp = `${String(process.pid)}.${String(Date.now())}.${Math.random().toString(36).slice(2, 8)}`
      const tempAudio = `${file}.${stamp}.tmp`
      const tempMeta = `${metaPath(key)}.${stamp}.tmp`
      const meta = {
        version: META_VERSION,
        key,
        format,
        text,
        timings: Array.isArray(timings) ? timings : [],
        durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
        provider,
        voice,
        model,
        bytes: bytes.length,
        createdAt: new Date().toISOString(),
      }
      await writeFile(tempAudio, bytes)
      await writeFile(tempMeta, JSON.stringify(meta), 'utf8')
      await rename(tempAudio, file)
      await rename(tempMeta, metaPath(key))
      return { file, format, meta }
    },

    /** Count and size one cache generation. */
    async stats() {
      await ensure()
      let entries = 0
      let bytes = 0
      let newest = 0
      for (const name of await readdir(dir)) {
        if (!AUDIO_PATTERN.test(name)) continue
        try {
          const info = await stat(join(dir, name))
          if (!info.isFile()) continue
          entries += 1
          bytes += info.size
          newest = Math.max(newest, info.mtimeMs)
        } catch {
          // A concurrent clear removed it.
        }
      }
      return { entries, bytes, newest, dir }
    },

    /** Delete every cached audio and metadata file; text stays in the Session log. */
    async clear() {
      await ensure()
      let removed = 0
      let bytes = 0
      for (const name of await readdir(dir)) {
        if (!AUDIO_PATTERN.test(name) && !META_PATTERN.test(name)) continue
        const file = join(dir, name)
        try {
          const info = await stat(file)
          if (!info.isFile()) continue
          if (AUDIO_PATTERN.test(name)) {
            bytes += info.size
            removed += 1
          }
          await unlink(file)
        } catch {
          // Already gone.
        }
      }
      return { removed, bytes }
    },

    /** Apply user-configured limits; 0 means unlimited and never sweeps. */
    async prune({ maxEntries = 0, maxSizeMB = 0 }) {
      if (maxEntries <= 0 && maxSizeMB <= 0) return { removed: 0, bytes: 0 }
      const maxBytes = maxSizeMB > 0 ? maxSizeMB * 1024 * 1024 : Number.POSITIVE_INFINITY
      const files = []
      for (const name of await readdir(dir)) {
        if (!META_PATTERN.test(name)) continue
        const key = name.slice(0, -5)
        const meta = await readFile(join(dir, name), 'utf8').then(JSON.parse).catch(() => undefined)
        const format = typeof meta?.format === 'string' ? meta.format : 'mp3'
        const audio = audioPath(key, format)
        try {
          const info = await stat(audio)
          if (!info.isFile()) continue
          files.push({ key, audio, meta: join(dir, name), mtimeMs: info.mtimeMs, bytes: info.size, format })
        } catch {
          // The metadata is orphaned; remove it below.
          await unlink(join(dir, name)).catch(() => {})
        }
      }
      files.sort((left, right) => left.mtimeMs - right.mtimeMs)
      let total = files.reduce((sum, file) => sum + file.bytes, 0)
      let count = files.length
      let removed = 0
      let removedBytes = 0
      for (const file of files) {
        if ((maxEntries <= 0 || count <= maxEntries) && total <= maxBytes) break
        try {
          await unlink(file.audio)
          await unlink(file.meta)
          count -= 1
          total -= file.bytes
          removed += 1
          removedBytes += file.bytes
        } catch {
          // Best effort.
        }
      }
      if (removed > 0) logger?.warn?.(`dsh-tts: cache pruned ${String(removed)} entries (${String(removedBytes)} bytes)`)
      return { removed, bytes: removedBytes }
    },
  }
}