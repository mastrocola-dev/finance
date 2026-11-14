export const runtimeCauses = ['missing', 'timeout', 'failed'] as const

export type RuntimeCause = (typeof runtimeCauses)[number]

export type IngestReadiness = { ready: true } | { ready: false; cause: RuntimeCause; reason: string }
