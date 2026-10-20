/**
 * The Settings page's durable store.
 *
 * Deployment defaults come from the Loader row; the user's edits live in
 * `%DSH_HOME%/tts/settings.json`. Loading is synchronous because every
 * provider call and the prompt section need one current snapshot immediately
 * at activation; saving is atomic (temp sibling + rename).
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { normalizeConfig, normalizeSettings, publicSettings } from './config.js'

export function createSettingsStore({ base, file, logger }) {
  const defaults = normalizeConfig(base)
  let current = publicSettings(defaults)
  let lastLoadError
  const listeners = new Set()

  const exportCurrent = () => publicSettings(current)

  function load() {
    let raw
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        lastLoadError = error instanceof Error ? error.message : String(error)
        logger?.warn?.(`dsh-tts: ignored unreadable settings file ${file}: ${lastLoadError}`)
      }
      current = publicSettings(defaults)
      return exportCurrent()
    }
    try {
      current = normalizeSettings(raw, defaults)
      lastLoadError = undefined
    } catch (error) {
      lastLoadError = error instanceof Error ? error.message : String(error)
      logger?.warn?.(`dsh-tts: ignored invalid settings file ${file}: ${lastLoadError}`)
      current = publicSettings(defaults)
    }
    return exportCurrent()
  }

  function notify() {
    const snapshot = exportCurrent()
    for (const listener of [...listeners]) listener(snapshot)
  }

  function save(draft) {
    const next = normalizeSettings(draft, defaults)
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.${String(process.pid)}.${String(Date.now())}.tmp`
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(temp, file)
    current = next
    lastLoadError = undefined
    notify()
    return exportCurrent()
  }

  function reset() {
    try {
      rmSync(file, { force: true })
    } catch {
      // A locked file still leaves the in-memory defaults active.
    }
    current = publicSettings(defaults)
    lastLoadError = undefined
    notify()
    return exportCurrent()
  }

  load()

  return {
    file,
    get: exportCurrent,
    defaults: () => publicSettings(defaults),
    save,
    reset,
    reload: load,
    lastError: () => lastLoadError,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      listeners.clear()
    },
  }
}