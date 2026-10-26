import type { Extraction, Extractor, Task } from './agent.ts'
import { chunkKey } from './staging.ts'

export type Recording = Extraction & { source: string; offset?: number }

export const recordedExtractor = (recordings: Recording[]): Extractor => {
  const byKey = new Map(recordings.map(({ source, offset, output, usage }) => [chunkKey(source, offset), { output, usage }]))
  return {
    extract: async ({ segment, offset }: Task) => {
      const recorded = byKey.get(chunkKey(segment.source, offset))
      if (!recorded) throw new Error(`no recording for ${chunkKey(segment.source, offset)}`)
      return structuredClone(recorded)
    },
  }
}
