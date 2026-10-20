/** Provider registry: one adapter per synthesis service. */
import { createCosyVoiceProvider } from './cosyvoice.js'
import { createEdgeProvider } from './edge.js'

export function createProviderRegistry({ settings, ctx }) {
  const providers = new Map([
    ['cosyvoice', createCosyVoiceProvider({ settings, ctx })],
    ['edge', createEdgeProvider({ settings, ctx })],
  ])

  return {
    get(id) {
      return providers.get(id)
    },
    ids() {
      return [...providers.keys()]
    },
    list() {
      return [...providers.values()]
    },
    enabled() {
      const snapshot = settings.get()
      return [...providers.keys()].filter((id) => snapshot.providers[id]?.enabled !== false)
    },
  }
}