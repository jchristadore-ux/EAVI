# Hosting templates

Starting points for serving `dist/site/` from a static host. **They have not been deployed or tested**: they were
written from each host's documented configuration format, without access to a hosting account (the Azure file was
compared with Microsoft's *Configure Azure Static Web Apps* page on 12 November 2026). After the first deployment,
run the checks in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) §6.

Copy the file for the chosen host into `dist/site/` (next to `index.html`) before uploading.

| File | Host | Notes |
|---|---|---|
| `staticwebapp.config.json` | Azure Static Web Apps | Every route requires a signed-in user holding the custom role `auditor`; an anonymous request is redirected to Microsoft Entra ID sign-in. Assign the role to each member of the audit team by invitation (Static Web App → Role management), or with a role-assignment function for group-based access. The GitHub and X sign-in providers are switched off. Custom roles are limited by the plan's quotas |
| `_headers` | Cloudflare Pages, Netlify | Headers and cache rules only. Put the site behind the host's access control (Cloudflare Access, Netlify SSO) separately |

Both set the same response headers:

- the application's Content-Security-Policy with `frame-ancestors 'none'` added;
- `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security`;
- `Cache-Control: no-cache` for `index.html` and `sw.js`, so an updated build is picked up.

For a **sync-enabled** build, edit `connect-src` in the header to `'self' https://<project>.supabase.co` — the same
single origin that was passed to `tools\build.ps1 -SyncOrigin`. A header that is stricter than the page's own policy
blocks sync; one that is looser weakens the device-only guarantee.

Any other host works if it can meet the requirements in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) §2.
