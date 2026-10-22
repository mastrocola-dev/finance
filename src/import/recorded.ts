import type { Extraction, Extractor, Task } from './agent.ts'

export type Recording = Extraction & { source: string; offset?: number }

export const recordingKey = (source: string, offset = 0) => `${source}@${offset}`

export const recordedExtractor = (recordings: Recording[]): Extractor => {
  const byKey = new Map(recordings.map(({ source, offset, output, usage }) => [recordingKey(source, offset), { output, usage }]))
  return {
    extract: async ({ segment, offset }: Task) => {
      const recorded = byKey.get(recordingKey(segment.source, offset))
      if (!recorded) throw new Error(`no recording for ${recordingKey(segment.source, offset)}`)
      return structuredClone(recorded)
    },
  }
}
