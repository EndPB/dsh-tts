/**
 * Read assistant text out of the durable Session log.
 *
 * `sessionQuery.readSession` is the live-preferred reader, so this works for
 * a running turn and for a persisted session. `agents` is the fallback when
 * the query service is absent (headless or reduced compositions).
 */

async function readEvents(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') throw new Error('dsh-tts: sessionId is required')
  const query = ctx.get('sessionQuery')
  if (query !== undefined && typeof query.readSession === 'function') {
    try {
      const snapshot = await query.readSession(sessionId)
      if (Array.isArray(snapshot?.events)) return snapshot.events
    } catch {
      // A live session may not be readable through persistence yet; fall
      // through to the live Agent's own log below.
    }
  }
  const agent = ctx.get('agents')?.get(sessionId)
  return Array.isArray(agent?.session?.events) ? agent.session.events : []
}

function textOf(event) {
  const message = event?.data?.message
  if (message === undefined || !Array.isArray(message.content)) return ''
  return message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n\n')
    .trim()
}

/** Plain text of one finalized assistant message, or undefined. */
export async function assistantMessageText(ctx, sessionId, messageId) {
  if (typeof messageId !== 'string' || messageId === '') throw new Error('dsh-tts: messageId is required')
  const events = await readEvents(ctx, sessionId)
  for (const event of events) {
    if (event?.type !== 'assistant/message') continue
    if (event.data?.message?.id !== messageId) continue
    const text = textOf(event)
    if (text !== '') return text
  }
  return undefined
}

/** Plain text of the last assistant message committed before `beforeSeq`. */
export async function lastAssistantTextBefore(ctx, sessionId, beforeSeq) {
  const events = await readEvents(ctx, sessionId)
  let chosen
  for (const event of events) {
    if (event?.type !== 'assistant/message') continue
    if (Number.isFinite(beforeSeq) && !(event.seq < beforeSeq)) continue
    if (chosen === undefined || event.seq > chosen.seq) chosen = event
  }
  if (chosen === undefined) return undefined
  const text = textOf(chosen)
  return text === '' ? undefined : text
}
/** One assistant message with the coordinates the speech resolver needs. */
export async function assistantMessageInfo(ctx, sessionId, { messageId, beforeSeq } = {}) {
  const events = await readEvents(ctx, sessionId)
  let chosen
  for (const event of events) {
    if (event?.type !== 'assistant/message') continue
    const message = event.data?.message
    if (message === undefined) continue
    if (typeof messageId === 'string' && messageId !== '') {
      if (message.id !== messageId) continue
      chosen = event
      break
    }
    if (Number.isFinite(beforeSeq) && !(event.seq < beforeSeq)) continue
    if (chosen === undefined || event.seq > chosen.seq) chosen = event
  }
  if (chosen === undefined) return undefined
  return {
    text: textOf(chosen),
    seq: chosen.seq,
    turn: chosen.data?.turn,
    messageId: chosen.data?.message?.id,
  }
}

/** Parse the model's tool-call arguments, which may arrive as an object or JSON text. */
function argumentsOf(value) {
  if (value !== null && typeof value === 'object') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the words the assistant asked to speak.
 *
 * The last `tts_speak` call in the message's turn wins. Its `arguments.text`
 * is the text the model generated at call time, which may differ from the
 * rendered reply; it lives in the durable Session log, so clearing the audio
 * cache never removes it. Without such a call the finalized reply is used.
 */
export async function speechSourceFor(ctx, sessionId, options = {}) {
  const info = await assistantMessageInfo(ctx, sessionId, options)
  if (info === undefined) throw new Error('the assistant message was not found in this session')
  const events = await readEvents(ctx, sessionId)
  const boundary = Number.isFinite(options.beforeSeq) ? options.beforeSeq : info.seq + 1
  let call
  for (const event of events) {
    if (event?.type !== 'tool/call') continue
    if (event.data?.name !== 'tts_speak') continue
    if (info.turn !== undefined && event.data?.turn !== info.turn) continue
    if (!(event.seq < boundary)) continue
    if (call === undefined || event.seq > call.seq) call = event
  }
  const args = call === undefined ? undefined : argumentsOf(call.data?.arguments)
  if (args !== undefined && typeof args.text === 'string' && args.text.trim() !== '') {
    return {
      ...info,
      rawText: args.text,
      source: 'tool',
      arguments: args,
      callId: call.data?.callId,
    }
  }
  return { ...info, rawText: info.text, source: 'reply', arguments: {}, callId: undefined }
}