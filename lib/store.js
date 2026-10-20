/**
 * Synthesized-audio cache.
 *
 * Files live under the configured output directory and are served back
 * through an opaque random id. The in-memory map is the only resolver, so a
 * request can never name a path outside the cache.
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const MIME_BY_FORMAT = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
  flac: 'audio/flac',
}

/** MIME type for one output format, falling back to a generic stream. */
export function mimeOf(format) {
  return MIME_BY_FORMAT[String(format).toLowerCase()] ?? 'application/octet-stream'
}

/** A fresh unguessable audio id. */
export function newAudioId() {
  return `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`
}

/** Create the cache and its id table. */
export function createStore(directory) {
  const entries = new Map()
  let ensured

  const ensure = () => {
    ensured ??= mkdir(directory, { recursive: true })
    return ensured
  }

  return {
    dir: directory,
    mimeOf,

    /** Record one completed audio file. */
    add(entry) {
      entries.set(entry.id, { ...entry, createdAt: Date.now() })
    },

    /** Resolve an id to its file, or undefined when unknown. */
    get(id) {
      return entries.get(id)
    },

    /** Ensure the directory exists before a write. */
    ensure,

    /**
     * Keep only the newest `keep` audio files. Map entries are dropped with
     * their files so a stale id stops resolving.
     */
    async prune(keep) {
      await ensure()
      const names = await readdir(directory)
      const files = []
      for (const name of names) {
        if (name.startsWith('.')) continue
        const path = join(directory, name)
        try {
          const info = await stat(path)
          if (info.isFile()) files.push({ path, name, mtimeMs: info.mtimeMs })
        } catch {
          // A concurrent prune removed it already.
        }
      }
      if (files.length <= keep) return
      files.sort((left, right) => right.mtimeMs - left.mtimeMs)
      const retired = files.slice(keep)
      const retiredPaths = new Set(retired.map((file) => file.path))
      for (const [id, entry] of entries) {
        if (retiredPaths.has(entry.file)) entries.delete(id)
      }
      await Promise.allSettled(retired.map((file) => unlink(file.path)))
    },

    /** Remove the in-memory table (files are left for the next sweep). */
    dispose() {
      entries.clear()
    },
  }
}