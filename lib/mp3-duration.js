/**
 * Exact MP3 duration from frame headers.
 *
 * Browsers do not reliably expose `audio.duration` for every MP3 (especially
 * files served with range/chunked responses): it can stay Infinity until the
 * very end. Counting MPEG audio frames is deterministic, works for CBR/VBR,
 * and lets the progress bar know the real total immediately after synthesis.
 *
 * Returns 0 when the buffer is not a parseable MPEG audio stream.
 */
const BITRATES = {
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
  25: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
}
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] }

export function mp3DurationMs(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? [])
  if (bytes.length < 4) return 0
  let offset = 0
  // ID3v2 header: 10 bytes + synchsafe size (+ footer when present).
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'ID3') {
    const flags = bytes[5]
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
    offset = 10 + size + ((flags & 0x10) === 0 ? 0 : 10)
  }
  let frames = 0
  let samples = 0
  let sampleRate = 0
  while (offset + 4 <= bytes.length) {
    const header = bytes.readUInt32BE(offset)
    if (header >>> 21 !== 0x7ff) break
    const versionBits = (header >>> 19) & 3
    const layerBits = (header >>> 17) & 3
    const bitrateIndex = (header >>> 12) & 15
    const rateIndex = (header >>> 10) & 3
    const padding = (header >>> 9) & 1
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) break
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25
    const layer = 4 - layerBits
    const bitrate = BITRATES[version][layer][bitrateIndex] * 1000
    const rate = SAMPLE_RATES[version][rateIndex]
    if (bitrate === 0 || rate === 0) break
    let frameLength
    if (layer === 1) frameLength = Math.floor((12 * bitrate / rate + padding) * 4)
    else if (layer === 2) frameLength = Math.floor(144 * bitrate / rate + padding)
    else frameLength = Math.floor((version === 1 ? 144 : 72) * bitrate / rate + padding)
    const frameSamples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576
    if (frameLength < 4 || offset + frameLength > bytes.length) break
    frames += 1
    samples += frameSamples
    sampleRate = rate
    offset += frameLength
  }
  if (frames === 0 || sampleRate === 0) return 0
  return Math.round((samples / sampleRate) * 1000)
}