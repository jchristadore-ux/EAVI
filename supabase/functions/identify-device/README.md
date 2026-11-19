# identify-device

Supabase Edge Function (Deno, TypeScript, no dependencies) that identifies AV hardware in photographs sent by a
signed-in auditor, using a multimodal AI model, and returns a normalised, rule-checked answer.

**Status: written, not run or type-checked.** No Deno, Supabase CLI or AI provider key was available when it was
written. Treat the first deployment as a test.

The operator guide, including the authorisation step, what is sent, error codes and how to check it from the app,
is [docs/AI_IDENTIFICATION.md](../../../docs/AI_IDENTIFICATION.md).

## Endpoint

`{SUPABASE_URL}/functions/v1/identify-device`

- `GET` (any workspace member): status - `enabled`, `configured`, `provider`, `model`, `max_images`, `max_image_bytes`.
- `POST` (admin, lead_auditor or auditor): `{ images: [{ media_type, data, role }], categories, max_devices }`.

The caller sends `Authorization: Bearer <user access token>` and `apikey: <publishable key>`. The function checks the
user against `/auth/v1/user` and reads the user's own `org_members` rows with the public key and the user's token
(row-level security applies). The service-role key is never used.

## Environment variables (function secrets)

| Name | Required | Default | Purpose |
|---|---|---|---|
| `AI_IDENTIFICATION_ENABLED` | yes, to use it | unset (off) | Must be exactly `true` before any image is sent to a provider. This is the recorded authorisation step |
| `ALLOWED_ORIGINS` | yes | none | Comma-separated exact browser origins, e.g. `https://jchristadore-ux.github.io,http://localhost:5173` |
| `AI_PROVIDER` | no | `anthropic` | `anthropic` or `openai` |
| `AI_MODEL` | no | `claude-opus-5-5` (anthropic), `gpt-4o` (openai) | Model ID |
| `ANTHROPIC_API_KEY` | for `anthropic` | none | Anthropic API key |
| `OPENAI_API_KEY` | for `openai` | none | Key for the OpenAI-compatible service |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | Base URL of an OpenAI-compatible service |
| `AI_MAX_IMAGES` | no | `4` | Images per request (1-10) |
| `AI_EFFORT` | no | `medium` | Anthropic only: `low`, `medium`, `high`, `xhigh`, `max`, or `none` to omit the setting |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | provided by Supabase | | Used to check the caller. If `SUPABASE_ANON_KEY` is absent, the publishable key the browser sent is used (secret and service-role keys are refused) |

## Deploy

```
supabase functions deploy identify-device --project-ref <project-ref>
supabase secrets set --project-ref <project-ref> ALLOWED_ORIGINS=https://jchristadore-ux.github.io,http://localhost:5173
supabase secrets set --project-ref <project-ref> ANTHROPIC_API_KEY=<key>
# only after the client's security review has authorised it:
supabase secrets set --project-ref <project-ref> AI_IDENTIFICATION_ENABLED=true
```

Or paste `index.ts` into the Supabase dashboard (Edge Functions -> Deploy a new function -> Via Editor), name it
`identify-device`, and set the secrets under Edge Functions -> Secrets.

Leave JWT verification on. If the gateway rejects valid user tokens (projects using the newer JWT signing keys),
deploy with `--no-verify-jwt`: the function checks the token itself against `/auth/v1/user` on every request.

## Adding a provider

Write one adapter (`keyEnv`, `defaultModel`, `identify(input) -> { raw, model, inputTokens, outputTokens }`) and
add it to `ADAPTERS`. Normalisation and every rule check are shared and need no change.
