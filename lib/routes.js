/**
 * HTTP delivery for synthesized audio and progressive streams.
 *
 * Ids are opaque and resolve only through an in-memory table; request
 * strings never reach the filesystem. Loopback requests are admitted
 * directly; every other request must pass Connection's Host/Origin/cookie
 * fence, so a LAN or tunnel deployment cannot read another user's audio.
 */
import { readFile } from 'node:fs/promises'

import { mimeOf } from './store.js'
import { STREAM_PREFIX } from './streams.js'

export const AUDIO_PREFIX = '/_dsh/dsh-tts/audio'
const ID_PATTERN = /^[A-Za-z0-9-]{6,64}$/

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || /^127\./.test(address)
}

function hostName(req) {
  const host = String(req.headers?.host ?? '').toLowerCase()
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    return end > 0 ? host.slice(1, end) : ''
  }
  return host.split(':')[0]
}

function isLoopback(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress ?? '')) return false
  const name = hostName(req)
  return name === '127.0.0.1' || name === '::1' || name === 'localhost' || /^127\./.test(name)
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

/** Apply the transport fence; returns false when the response was owned. */
function admit(ctx, req, res) {
  if (isLoopback(req)) return true
  const connection = ctx.get('connection')
  if (connection === undefined) {
    sendText(res, 403, 'forbidden')
    return false
  }
  const rejection = connection.requestRejection(req)
  if (rejection !== undefined) {
    sendText(res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
    return false
  }
  return true
}

/** Method gate shared by both routes. */
function allowGet(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  res.setHeader('allow', 'GET, HEAD')
  sendText(res, 405, 'method not allowed')
  return false
}

function parseId(req, prefix) {
  const pathname = new URL(req.url ?? '/', 'http://dsh.invalid').pathname
  const id = pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length + 1) : ''
  return ID_PATTERN.test(id) ? id : undefined
}

/** Serve one cached audio file with Range support. */
export async function serveAudioFile(ctx, store, req, res) {
  if (!allowGet(req, res)) return
  const id = parseId(req, AUDIO_PREFIX)
  if (id === undefined) {
    sendText(res, 400, 'invalid audio id')
    return
  }
  if (!admit(ctx, req, res)) return
  const entry = store.get(id)
  if (entry === undefined) {
    sendText(res, 404, 'audio not found')
    return
  }
  await serveEntry(entry, req, res)
}

async function serveEntry(entry, req, res) {
  let bytes
  try {
    bytes = await readFile(entry.file)
  } catch {
    sendText(res, 404, 'audio not found')
    return
  }
  const total = bytes.length
  let start = 0
  let end = total - 1
  let status = 200
  const range = req.headers.range
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match !== null) {
      if (match[1] === '' && match[2] !== '') {
        start = Math.max(0, total - Number(match[2]))
      } else {
        start = Number(match[1] === '' ? 0 : match[1])
        end = match[2] === '' ? total - 1 : Math.min(total - 1, Number(match[2]))
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= total) {
        res.writeHead(416, { 'content-range': `bytes */${String(total)}` })
        res.end()
        return
      }
      status = 206
    }
  }
  const body = bytes.subarray(start, end + 1)
  const headers = {
    'content-type': mimeOf(entry.format),
    'content-length': String(body.length),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  }
  if (status === 206) headers['content-range'] = `bytes ${String(start)}-${String(end)}/${String(total)}`
  res.writeHead(status, headers)
  if (req.method === 'HEAD') res.end()
  else res.end(body)
}

/** Attach a progressive stream, or fall back to its finished file. */
export async function serveStream(ctx, hub, store, req, res) {
  if (!allowGet(req, res)) return
  const id = parseId(req, STREAM_PREFIX)
  if (id === undefined) {
    sendText(res, 400, 'invalid stream id')
    return
  }
  if (!admit(ctx, req, res)) return
  const result = hub.attach(id, req, res)
  if (result.mode === 'missing') {
    // The hub retains a finished stream briefly; after that the same id still
    // resolves through the store entry written by hub.end(), so an async tool
    // card keeps working even when the user clicks much later.
    const entry = store.get(id)
    if (entry !== undefined) {
      await serveEntry(entry, req, res)
      return
    }
    sendText(res, 404, 'stream not found')
    return
  }
  if (result.mode === 'error') {
    if (result.bytes > 0) res.destroy()
    else sendText(res, 502, result.error instanceof Error ? result.error.message : 'synthesis failed')
    return
  }
  if (result.mode === 'live') return
  if (result.mode === 'file') {
    await serveEntry(result.entry, req, res)
    return
  }
  if (result.mode === 'buffer') {
    const body = Buffer.concat(result.chunks)
    res.writeHead(200, {
      'content-type': mimeOf(result.format),
      'content-length': String(body.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
    })
    if (req.method === 'HEAD') res.end()
    else res.end(body)
  }
}