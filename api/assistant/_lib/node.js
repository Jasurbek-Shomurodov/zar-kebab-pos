// Bridges Vercel/Vite Node (req, res) handlers to the library's Web
// Request/Response handler, streaming the response body as it is produced.

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? Buffer.concat(chunks) : null
}

export async function toWebRequest(req, signal) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req)
  return new Request(url, { method: req.method, headers, body, signal })
}

export async function sendWebResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  if (!response.body) {
    res.end()
    return
  }
  res.flushHeaders?.()
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (res.destroyed) {
        await reader.cancel()
        break
      }
      res.write(value)
    }
  } finally {
    if (!res.writableEnded) res.end()
  }
}

/** Runs a Web handler for a Node request; closing the connection aborts it. */
export async function handleWithWebHandler(req, res, handle) {
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const response = await handle(await toWebRequest(req, controller.signal))
  await sendWebResponse(res, response)
}
