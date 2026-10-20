/**
 * Progressive playback for streaming providers.
 *
 * `begin()` creates an opaque stream id; the producer pushes audio buffers as
 * the provider yields them while an HTTP GET may attach at any moment. The
 * first attached response receives every buffered chunk and then each live
 * chunk, so a native `<audio>` element starts playing after the first
 * sentence instead of after the whole reply. Completed streams are written to
 * the normal audio cache for replay and Range requests.
 */
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { mimeOf } from './store.js'

export const STREAM_PREFIX = '/_dsh/dsh-tts/stream'
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

function settle(session) {
  if (session.settled === true) return
  session.settled = true
  session.resolveDone?.()
}

function failSession(session, error) {
  if (session.state !== 'live') return
  session.state = 'error'
  session.error = error
  clearTimeout(session.attachTimer)
  for (const subscriber of session.subscribers) subscriber.fail(error)
  session.subscribers.clear()
  settle(session)
}

export function createStreamHub({ dir, store, attachTimeoutMs = 90000, retainMs = 5 * 60 * 1000 }) {
  const sessions = new Map()

  function scheduleRetain(session, delay) {
    session.retainTimer = setTimeout(() => {
      sessions.delete(session.id)
    }, delay)
    session.retainTimer.unref?.()
  }

  function begin({ format, attachTimeoutMs: attachMs = attachTimeoutMs }) {
    const id = `${Date.now().toString(36)}-${randomUUID().replaceAll('-', '').slice(0, 16)}`
    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    const session = {
      id,
      format,
      mime: mimeOf(format),
      chunks: [],
      bytes: 0,
      state: 'live',
      error: undefined,
      subscribers: new Set(),
      controller: new AbortController(),
      attachTimer: undefined,
      retainTimer: undefined,
      done,
      resolveDone,
      settled: false,
    }
    sessions.set(id, session)
    if (Number.isFinite(attachMs) && attachMs > 0) {
      session.attachTimer = setTimeout(() => {
        if (session.state === 'live' && session.subscribers.size === 0) {
          try {
            session.controller.abort()
          } catch {
            // Ignore.
          }
          failSession(session, new Error('no audio listener attached'))
          scheduleRetain(session, 30000)
        }
      }, attachMs)
      session.attachTimer.unref?.()
    }

    return {
      id,
      url: `${STREAM_PREFIX}/${id}`,
      format,
      signal: session.controller.signal,
      done,

      push(chunk) {
        if (session.state !== 'live') return
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (buffer.length === 0) return
        if (session.bytes + buffer.length > MAX_BUFFER_BYTES) {
          failSession(session, new Error('stream buffer limit exceeded'))
          return
        }
        session.chunks.push(buffer)
        session.bytes += buffer.length
        for (const subscriber of session.subscribers) subscriber.write(buffer)
      },

      end() {
        if (session.state !== 'live') return session.done
        session.state = 'done'
        clearTimeout(session.attachTimer)
        for (const subscriber of session.subscribers) subscriber.end()
        session.subscribers.clear()
        const bytes = Buffer.concat(session.chunks)
        const file = join(dir, `${id}.${format}`)
        const ended = writeFile(file, bytes)
          .then(() => store.add({ id, file, format, bytes: bytes.length }))
          .catch(() => {})
          .finally(() => settle(session))
        scheduleRetain(session, retainMs)
        return ended
      },

      fail(error) {
        failSession(session, error instanceof Error ? error : new Error(String(error)))
        scheduleRetain(session, 30000)
        return session.done
      },
    }
  }

  /**
   * Attach one HTTP response.
   * @returns {{mode:'missing'}|{mode:'error', error:Error, bytes:number}|{mode:'file', entry:object}|{mode:'buffer', chunks:Buffer[], format:string}|{mode:'live'}}
   */
  function attach(id, req, res) {
    const session = sessions.get(id)
    if (session === undefined) return { mode: 'missing' }
    if (session.state === 'error') return { mode: 'error', error: session.error ?? new Error('stream failed'), bytes: session.bytes }
    if (session.state === 'done') {
      const entry = store.get(id)
      if (entry !== undefined) return { mode: 'file', entry }
      return { mode: 'buffer', chunks: session.chunks, format: session.format }
    }

    res.writeHead(200, {
      'content-type': session.mime,
      'cache-control': 'no-store',
      'accept-ranges': 'none',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
    })
    for (const chunk of session.chunks) res.write(chunk)

    const subscriber = {
      write(chunk) {
        if (!res.writableEnded) res.write(chunk)
      },
      end() {
        if (!res.writableEnded) res.end()
      },
      fail(error) {
        res.destroy(error)
      },
    }
    session.subscribers.add(subscriber)
    const remove = () => session.subscribers.delete(subscriber)
    req.on('close', remove)
    req.on('aborted', remove)
    return { mode: 'live' }
  }

  function cancel(id) {
    const session = sessions.get(id)
    if (session === undefined) return false
    try {
      session.controller.abort()
    } catch {
      // Ignore.
    }
    failSession(session, new Error('stream cancelled'))
    scheduleRetain(session, 10000)
    return true
  }

  function dispose() {
    for (const session of sessions.values()) {
      clearTimeout(session.attachTimer)
      clearTimeout(session.retainTimer)
      try {
        session.controller.abort()
      } catch {
        // Ignore.
      }
      failSession(session, new Error('stream hub disposed'))
    }
    sessions.clear()
  }

  return { begin, attach, cancel, dispose, count: () => sessions.size }
}