import { createZarAssistant } from './_lib/assistant.js'
import { handleWithWebHandler } from './_lib/node.js'

// Created once per instance so the library's per-model cooldowns survive
// between requests. One function on purpose: the Hobby plan allows 12.
const assistant = createZarAssistant()

/** GET: today's shared Gemini quota. POST: one streamed answer (NDJSON). */
export default function handler(req, res) {
  return handleWithWebHandler(req, res, request => assistant.handle(request))
}
