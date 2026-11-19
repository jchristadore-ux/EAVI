# AI identification of devices from photographs - operator guide

**Status: written, not run or type-checked; no provider key was available.** The server component
(`supabase/functions/identify-device/index.ts`) has never been deployed, executed or compiled. Nothing in this
guide has been tested. Treat the first deployment as a test and use non-client photographs for it.

## 1. What it does, and what it does not do

It does:

- Take one to four photographs (by default) that an auditor chose to send from the app, and ask a multimodal AI
  model which AV devices they show: manufacturer, make, model, product family, category, function, and any serial
  number, MAC address, IP address or other identifier that is printed on a visible label.
- Return every field with its evidence (`label_text`, `logo`, `appearance`, `not_visible`) and confidence
  (`confirmed`, `probable`, `low`). The server re-checks the answer before the app sees it:
  - a serial number, MAC address or IP address is kept only if the model says it read it from visible text; a MAC
    address must be exactly 12 hex digits (normalised to `AA:BB:CC:DD:EE:FF`); an IP address must be a valid IPv4 or
    IPv6 literal; anything else keeps only its raw text and is flagged; partial text is never completed;
  - `confirmed` is allowed only when the value was read from label text or a logo, otherwise it is lowered;
  - a model judged from appearance, where similar models exist, is marked `low` with the alternatives listed;
  - a missing or low-confidence manufacturer or model sets `needs_manual_review` with a reason;
  - a category that is not one of the app's categories is dropped.
- Suggest values. The auditor reviews them; nothing is written to a record by the function.

It does not:

- Scan, probe or connect to anything. It looks only at the images it is sent. No network discovery.
- Read data from the workspace database other than the caller's own membership rows (to check the role).
- Store images or results. The function keeps nothing; its logs contain counts, timings, status codes and error
  classes only - never images, tokens, user ids or extracted values.
- Guarantee correctness. Every suggestion must be checked against the device by the auditor.

## 2. Authorisation: the feature stays off until the client's security review approves it

The photographs are sent to the configured AI provider (Anthropic by default), which is **an external service**.
Photographs of client equipment are client infrastructure data, and the project rule is that such data is not sent
to an external AI service without explicit authorisation.

- The function refuses every identification request (`403 disabled`) unless the function secret
  `AI_IDENTIFICATION_ENABLED` is exactly `true`. Any other value, or no value, means off.
- **Setting `AI_IDENTIFICATION_ENABLED=true` is the recorded, deliberate authorisation step.** Do it only after the
  client's security review has approved sending audit photographs to the named provider, and record who approved
  it, when, for which provider and which workspace (for example in `docs/SECURITY.md` section 5).
- To withdraw authorisation, unset the secret or set it to anything other than `true`
  (`supabase secrets unset AI_IDENTIFICATION_ENABLED`). The next request is refused.

As of writing, no such authorisation is recorded anywhere in the project.

## 3. What is sent to the provider

Only:

- the photographs the auditor chose to send (base64), each with the auditor's tag (`front`, `rear`, `label`,
  `ports`, `other`) and its position in the list;
- the list of the app's device category names;
- the maximum number of devices to report, and the fixed instructions in the function.

Not sent: room, floor, building or organisation names, user names or e-mail addresses, notes, network data, or
anything else from the workspace. Note that a photograph can itself show more than intended (labels with IP
addresses, screens, whiteboards, people) and camera metadata may be inside the file; the photography policy for
the site applies.

## 4. Data retention

The function stores nothing. What the provider keeps, for how long, and whether it is used for training is governed
by the provider's terms and the account's settings (for example zero-data-retention agreements). Check the current
terms of the provider and account you configure before authorising the feature, and include them in the security
review.

## 5. Deploy

You need the project reference of the Supabase workspace (Project Settings -> General).

**From a machine with the Supabase CLI** (logged in with `supabase login`), in the folder that holds `supabase/`:

```
supabase functions deploy identify-device --project-ref <project-ref>
```

**Or from the Supabase dashboard:** Edge Functions -> Deploy a new function -> Via Editor, name it
`identify-device`, paste the contents of `supabase/functions/identify-device/index.ts`, deploy.

Leave "Verify JWT" on. If valid signed-in users get `401` from the gateway (projects that use the newer JWT
signing keys), redeploy with `--no-verify-jwt` (or turn the setting off in the dashboard): the function checks the
caller's token against the workspace's Auth service on every request regardless.

## 6. Secrets

Set them with the CLI or in the dashboard (Edge Functions -> Secrets). Keys live only there: never in the app,
the repository or a document.

```
supabase secrets set --project-ref <project-ref> ALLOWED_ORIGINS=https://jchristadore-ux.github.io,http://localhost:5173
supabase secrets set --project-ref <project-ref> ANTHROPIC_API_KEY=<key>
# only after authorisation (section 2):
supabase secrets set --project-ref <project-ref> AI_IDENTIFICATION_ENABLED=true
```

| Secret | Default | Meaning |
|---|---|---|
| `AI_IDENTIFICATION_ENABLED` | off | `true` = authorised (section 2) |
| `ALLOWED_ORIGINS` | none | Comma-separated exact origins allowed to call from a browser: the GitHub Pages origin (`https://jchristadore-ux.github.io`) and the dev server (`http://localhost:5173`). No trailing slash, no path. A browser on any other origin is refused by CORS |
| `AI_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `AI_MODEL` | `claude-opus-5-5` / `gpt-4o` | Model ID for the selected provider |
| `ANTHROPIC_API_KEY` | none | Required for `anthropic` |
| `OPENAI_API_KEY` | none | Required for `openai` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `AI_MAX_IMAGES` | `4` | Images per request, 1-10 |
| `AI_EFFORT` | `medium` | Anthropic only: `low`, `medium`, `high`, `xhigh`, `max`, or `none` (omit). Higher is more thorough but slower; the function gives up after 60 seconds |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to edge functions by Supabase. The service-role key is never
used.

## 7. Switching provider or model

No rebuild of the app is needed: change the secrets and the next request uses them.

```
supabase secrets set --project-ref <project-ref> AI_MODEL=<model-id>
supabase secrets set --project-ref <project-ref> AI_PROVIDER=openai OPENAI_API_KEY=<key>
```

A new provider is a new external service: it needs its own authorisation (section 2) before it is switched on.
The `openai` adapter is a small OpenAI-compatible chat-completions adapter and is **untested**; it works only with
models that accept images and JSON-schema structured output. With the default Anthropic model the function also
asks Anthropic to retry a declined request on another Claude model (server-side fallback); the model that answered
is returned in the response's `model` field.

## 8. Checking it from the app

The app's Settings screen shows the status that `GET /functions/v1/identify-device` returns for the signed-in user:
whether it is enabled (authorised), whether the provider key is configured, the provider and model, and the image
limits. (The browser side is written separately; this guide describes the server.) The same check by hand, with a
signed-in user's access token:

```
curl -H "Authorization: Bearer <access token>" -H "apikey: <publishable key>" https://<project-ref>.supabase.co/functions/v1/identify-device
```

Expected while not authorised: `"enabled": false`. After the secrets are set: `"enabled": true, "configured": true`.

## 9. Error codes

Every error answer is JSON `{ "code": ..., "message": ... }`.

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | Body is not valid JSON, no images, too many images, wrong media type or role, invalid base64, file is not the declared type, bad `categories` or `max_devices` |
| 401 | `not_signed_in` | No token, or the workspace's Auth service rejected it |
| 403 | `not_member` | The account is not a member of any workspace organisation |
| 403 | `read_only` | POST by a viewer: identification needs admin, lead_auditor or auditor |
| 403 | `disabled` | `AI_IDENTIFICATION_ENABLED` is not `true`: not authorised for this workspace |
| 405 | `method_not_allowed` | Not GET, POST or OPTIONS |
| 413 | `too_large` | An image over 5 MB (decoded) or a body over 20 MB |
| 500 | `server_misconfigured` | The function has no `SUPABASE_URL` or usable public key |
| 500 | `internal_error` | Unexpected failure in the function |
| 502 | `provider_error` | The AI service failed, refused, or returned nothing usable. The provider's own message is not passed on; the function log has the provider's HTTP status and an error class |
| 503 | `not_configured` | Enabled, but the selected provider's key is missing (or `AI_PROVIDER` is not a known provider) |
| 503 | `auth_unavailable` | The workspace's Auth or database could not be reached to check the caller |
| 504 | `timeout` | The AI service did not answer within 60 seconds |

`auth_unavailable`, `server_misconfigured`, `method_not_allowed` and `internal_error` are additions to the agreed
client contract; the app should treat any unknown code as a general failure.

## 10. Known limits

- Not run, not type-checked, not tested against any provider (status line above).
- No retry on provider rate limits or overload: the request fails with `provider_error` and the auditor can try again.
- Cost is per request and depends on the provider, model, image sizes and effort; the function log records token
  counts for each request so usage can be reviewed.
