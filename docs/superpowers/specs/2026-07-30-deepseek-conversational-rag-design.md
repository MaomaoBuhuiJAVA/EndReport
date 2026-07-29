# DeepSeek Conversational RAG Design

## Goal

Make the school assistant answer naturally with DeepSeek while retaining the
existing knowledge search, source citations, photo results, access filtering,
and fallback behavior.

## Request Flow

1. Validate the incoming message and retain the recent conversation history.
2. Run the existing `searchKnowledge` lookup for every request.
3. Build a bounded context from the matched knowledge chunks and source titles.
4. Send the system instructions, retrieved context, recent history, and current
   message to DeepSeek for every valid request, including requests with multiple
   matching documents.
5. Return the generated reply together with the existing `sources` and optional
   `photos` payloads so both chat entry points keep their current behavior.
6. If the model call times out, returns an invalid response, or the model is not
   configured, return the existing database-derived fallback reply.

## Model Contract

- The API key remains server-side in `DEEPSEEK_API_KEY` and is never exposed to
  the browser.
- `DEEPSEEK_API_URL` remains configurable and keeps the current DeepSeek chat
  completions endpoint as its default.
- The model must treat retrieved material as the authoritative source for school
  facts. When no supporting material exists, it can still converse naturally but
  must say that the knowledge base has no confirmed information for that point.
- Existing rules that exclude private device status, monitoring, logs, and
  control details for ordinary users remain in force.

## Code Boundaries

- Extract DeepSeek request construction and response parsing into a focused
  server helper so the route remains responsible for HTTP validation and payload
  formatting.
- Keep `searchKnowledge`, `wantsPhotoResults`, `FloatingChat`, and `SciencePet`
  contracts unchanged.
- Preserve the current response shape: `reply`, `provider`, `photos`, and
  `sources`.

## Verification

- Add focused tests for a multi-result query reaching the model, source/photo
  preservation, and fallback behavior on a failed model request.
- Run the test suite, lint, and production build.
- Configure the provided key in Vercel production and preview environments,
  deploy, and verify an online multi-result question produces `provider:
  "deepseek"` while retaining sources.
