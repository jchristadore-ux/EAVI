# Putting the project on GitHub and deploying from it

**Status (12 November 2026):** pushed to the public repository `jchristadore-ux/EAVI`; Pages source is GitHub
Actions. The first run of `.github/workflows/deploy.yml` failed at the demo-seed check under PowerShell 7, with no
reason visible without a signed-in log. The workflow now builds and checks under Windows PowerShell 5.1, and the
check is `tools/check-site.ps1`, which prints each finding and can be run locally after `tools\build.ps1`.

## 1. Who may open the site

**Decided by the project owner on 12 November 2026: a public GitHub Pages site is acceptable for the application
code.** The points below remain true and are kept for the security review.

GitHub Pages sites are **public** unless the repository belongs to a GitHub Enterprise Cloud organisation with
private Pages enabled. The repository can be private only on a paid plan (GitHub Pro, Team or Enterprise): on a
Free account, Pages requires a **public** repository.

- The deployed site holds **no audit data**. Records stay in each browser; the site is only the application code.
- [SECURITY.md](SECURITY.md) nevertheless asks for access control in front of the application, and for the client's
  approval of the hosting before real information is entered. A public Pages site does not meet the first point.
- If the site must be private and private Pages is not available, keep the repository on GitHub and deploy
  `dist/site` to a host with sign-in instead ([DEPLOYMENT.md](DEPLOYMENT.md) §2, templates in `deploy/`).

## 2. Create the repository and push

1. Install Git for Windows (https://git-scm.com/download/win), or use GitHub Desktop.
2. Create an empty repository on GitHub (no README, no .gitignore): private if the plan allows Pages for private
   repositories (see section 1), otherwise decide first whether a public repository is acceptable.
3. In this folder:

```bash
git init -b main
```

```bash
git add -A
```

```bash
git commit -m "AV Environment Intelligence 1.0.0"
```

```bash
git remote add origin https://github.com/<owner>/<repository>.git
```

```bash
git push -u origin main
```

`dist/` and `.testout/` are ignored. Check before the first push that nothing you do not want in the repository
is in the folder: there are no credentials in the project, and the only data is the synthetic set in `demo/`.

## 3. Deploy with GitHub Pages

1. Repository → *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. The push to `main` starts the workflow *Deploy site*. It builds on a Windows runner with `tools/build.ps1`
   (device-only site, no demo data), stops if it finds the demo seed file or its content in the output, and publishes
   `dist/site`.
3. The address is shown on the workflow run and under *Settings → Pages*. A project site is served from
   `https://<owner>.github.io/<repository>/`; the application uses relative addresses and works from a sub-path.

Because the workflow has never run, treat the first run as a test: read its log, then do the checks in
[DEPLOYMENT.md](DEPLOYMENT.md) §6 on the published address. Known points to watch: the build script was written
for Windows PowerShell 5.1 and runs under PowerShell 7 on the runner; GitHub Pages cannot send the extra response
headers listed in DEPLOYMENT.md §2 (the page's own Content-Security-Policy still applies).

## 4. After it is live

- On each iPhone: open the address in Safari, *Share → Add to Home Screen*, and work only from that icon
  ([MOBILE_GUIDE.md](MOBILE_GUIDE.md)). Data belongs to the address: do not change it later.
- Load the room list: [ROOM_LIST.md](ROOM_LIST.md).
- Every later push to `main` redeploys. Installed copies fetch a new build the next time they are opened with a
  connection and use it from the following start.
