export const bodyLimit = 64 * 1024

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const text = async (request: Request, limit: number) => {
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw new HttpError(413, 'body too large')
  if (!request.body) return ''
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  for await (const chunk of request.body) {
    size += chunk.byteLength
    if (size > limit) throw new HttpError(413, 'body too large')
    body += decoder.decode(chunk, { stream: true })
  }
  return body + decoder.decode()
}

export const readJson = async (request: Request, limit = bodyLimit): Promise<unknown> => {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'content-type must be application/json')
  const body = await text(request, limit)
  try {
    return body ? JSON.parse(body) : {}
  } catch {
    throw new HttpError(400, 'body is not valid JSON')
  }
}
