# Pro-curo Website — Migration Inventory

**Repo:** `markwalker-pcs/pro-curo-website` (public)
**Live URL:** <https://www.pro-curo.com>
**Owner entity:** Pro-curo Software Limited
**Risk tier:** Tier 2
**Last updated:** 20 April 2026

A new engineer should be able to read this in ten minutes and take the site over with no further briefing. If a section grows past that test, trim it.

---

## Changes made during discovery

*(This section records live changes made to the repo, cloud, or DNS during the discovery pass. All destructive or externally-visible changes require Mark's explicit approval — see "Questions for Mark".)*

- **2026-04-20** — Extended `.gitignore` to cover `.env`, `.env.*`, `local.settings.json`, `bin/`, `obj/`, `.azurefunctions/` (Azure Functions local/build artefacts). Allowed-inline per brief; approved by Mark.
- **2026-04-20** — Rewrote local `origin` remote URL from `https://markwalker-pcs@github.com/markwalker-pcs/pro-curo-website.git` to `https://github.com/markwalker-pcs/pro-curo-website.git`. Local-only change (nothing pushed). Allowed-inline per brief; approved by Mark.
- **2026-04-20** — Set `git config --local user.email mark.walker@pro-curo.com` (was `mark@pro-curo.com` — wrong address, corrected per Mark).
- **2026-04-20** — Installed Azure CLI (`winget install Microsoft.AzureCLI`, v2.85.0) and signed in as `mark.walker@pro-curo.com` (device-code flow). Ran read-only queries scoped to `rg-procuro-website` and the subscription DNS namespace. No writes.
- **2026-04-20** — Switched `gh` CLI auth from stale `DisruptsMedia` (invalid keyring token) to `markwalker-pcs` via browser login.
- **2026-04-20** — Enabled classic branch protection on `main` for `markwalker-pcs/pro-curo-website`: `required_linear_history=true`, `allow_force_pushes=false`, `allow_deletions=false`. `enforce_admins=false` so Mark retains an emergency admin-override path (sensible for a solo repo). No required reviews, no required status checks. Allowed-inline per brief.

### Material findings from the Azure read-only pass (2026-04-20)

1. **DNS is NOT hosted on Azure.** Nameservers for `pro-curo.com` are `dns1–5.name-services.com` (eNom's nameserver pool). `Microsoft.Network` is **NotRegistered** on the subscription; zero DNS zones. The Cowork brief had assumed Azure DNS — corrected throughout this inventory and in `CLAUDE.md`.
2. **RG location is `centralus`**, not `uksouth` as `DEPLOYMENT.md` suggested. SWA control-plane doesn't run in `uksouth`, so the RG fell back to `centralus`. The Storage Account `procuronewscache` sits in `uksouth` separately. The SWA itself is global via CDN — location of the control-plane RG is cosmetic.
3. **`NEWS_CACHE_CONNECTION` IS set** on the Static Web App — points at Storage Account `procuronewscache` (`Standard_LRS`, in this RG, in `uksouth`).
4. **Default SWA hostname is `zealous-sand-02c845110.4.azurestaticapps.net`**, not `procuro-website.azurestaticapps.net` as `DEPLOYMENT.md` guessed.
5. **Diagnostic settings on the SWA: empty.** No logs flow anywhere. Application Insights is not connected.
6. **Role assignments (RG + inherited): only Mark**, Owner at subscription scope. No other principals.

---

## Questions for Mark

Remaining after the Azure read-only pass and the GitHub pass — three items need Mark's direct action:

1. **eNom registrar — lock and auto-renewal status** for `pro-curo.com`, plus the current renewal date. Needs a login to the eNom portal.
2. **Availability monitoring — sign up and configure.** The brief's fallback (UptimeRobot free tier) is the recommended choice because Application Insights is not connected and enabling Azure availability tests would add a monthly cost line. Setup needs Mark: sign up at <https://uptimerobot.com> (free tier), add HTTP(s) monitor for `https://www.pro-curo.com/` at 5-minute interval, add email alert contact. Brief specifies `mark@taraniscapital.com` — a cross-entity mailbox — flag if Mark prefers a Pro-curo address.
3. **Rollback drill.** Trivial text change / deploy / revert / redeploy cycle against production. Holding until Mark OKs running it — even a footer-copyright change temporarily changes the live site and publishes two workflow runs.

### Proposed inline fixes — final state

- **A.** ~~Extend `.gitignore` with `.env`, `.env.*`, `local.settings.json`, `bin/`, `obj/`, `.azurefunctions/`.~~ **Done 2026-04-20.**
- **B.** ~~Rewrite the remote URL in `website/.git/config` to drop the embedded `markwalker-pcs@` username.~~ **Done 2026-04-20.**
- **C.** ~~Enable branch protection on `main`.~~ **Done 2026-04-20** (linear history, no force-push, no deletion; admin override retained).
- **D.** Add availability monitoring — **chosen: UptimeRobot free tier** (cheapest option that does the job; App Insights would cost monthly). Actual signup pending Mark (see Questions for Mark #2).

### Out-of-scope hygiene items noticed

- **No DMARC record for `pro-curo.com`.** SPF + Google Workspace MX + MailerLite are all wired, but `_dmarc.pro-curo.com` returns NXDOMAIN. Adding `v=DMARC1; p=none; rua=mailto:...` would give visibility without rejecting mail. Not a discovery-pass fix; flagging for a separate task.

---

## 1. Identity

| Field | Value |
|---|---|
| Project | Pro-curo Software Limited corporate website |
| Company | Pro-curo Software Limited (**not** Taranis Capital) |
| Live URL | <https://www.pro-curo.com> |
| Azure default hostname | `zealous-sand-02c845110.4.azurestaticapps.net` (confirmed 2026-04-20) |
| Risk tier | Tier 2 |
| Business owner / escalation | Mark Walker |
| GSC verified owner | `mark.walker@pro-curo.com` |

---

## 2. Git

| Field | Value |
|---|---|
| Repo | `markwalker-pcs/pro-curo-website` |
| Visibility | **Public** |
| MFA on `markwalker-pcs` | **On** (confirmed 2026-04-20) |
| Default branch | `main` |
| Branch protection | **On** (2026-04-20) — `required_linear_history=true`, `allow_force_pushes=false`, `allow_deletions=false`, `enforce_admins=false` (admin override retained for emergencies) |
| Remote URL | `https://github.com/markwalker-pcs/pro-curo-website.git` (embedded `markwalker-pcs@` username removed 2026-04-20) |
| Local `user.email` (this clone) | `mark.walker@pro-curo.com` |
| `gh` CLI state on Mark's machine | Signed in as `markwalker-pcs` (as of 2026-04-20). The stale `DisruptsMedia` entry was removed. If the keyring ever reverts, `gh auth login` restores the right account |
| Commit count | 19 commits on `main` from initial commit (9df97d0) to current HEAD (2d326ea) |
| Secret-history grep | **Clean** (AKIA*, AIza*, AccountKey=, DefaultEndpointsProtocol, BEGIN RSA/OPENSSH, SG.*, api_key, client_secret, connectionstring, primary_key — no hits with actual values). No `local.settings.json` or `.env` has ever been committed |

### Git account discipline

Three GitHub accounts live on Mark's machine (`Walkerma75` for Taranis, `markwalker-pcs` for Pro-curo, and the Disrupts Media account). Rules for this repo:

- Always set `git config --local user.email mark.walker@pro-curo.com` (already set)
- Before push, confirm `gh auth status` shows `markwalker-pcs` as active, or use Credential Manager directly
- The remote URL should not embed the username — credentials belong in Credential Manager

---

## 3. Cloud

### Subscription

| Field | Value |
|---|---|
| Provider | Microsoft Azure |
| Subscription ID | `d8892a71-7ab7-4b75-a1e3-500262a9b943` |
| Subscription type | Pay-As-You-Go |
| **Shared** | **Yes** — same subscription also hosts the Pro-curo V5 application in resource group `procuro-production`. Scope all work for this project to `rg-procuro-website` |

### Resources (confirmed 2026-04-20)

| Field | Value |
|---|---|
| Resource group | `rg-procuro-website` |
| RG location | **`centralus`** (SWA control-plane doesn't run in `uksouth` — RG fell back to `centralus` when the SWA was created) |
| Static Web App name | `procuro-website` |
| Static Web App location | `centralus` (control-plane only — CDN is global) |
| Static Web App SKU | **Free** |
| Default hostname | `zealous-sand-02c845110.4.azurestaticapps.net` |
| Custom hostnames | `www.pro-curo.com` (Ready, created 2026-03-26), `pro-curo.com` (Ready, created 2026-03-26) |
| Provider / branch / repo | GitHub, `main`, `https://github.com/markwalker-pcs/pro-curo-website` |
| SSL | Azure Static Web Apps free SSL, auto-renewing (both hostnames report status `Ready`) |
| App settings on SWA | Only `NEWS_CACHE_CONNECTION` is set |
| Storage Account (news cache) | `procuronewscache`, `Standard_LRS`, located in `uksouth`, inside this RG. Referenced by `NEWS_CACHE_CONNECTION` |
| Application Insights | **None** — not connected to the Static Web App |
| Diagnostic settings on SWA | **None** — no log destinations configured |
| Azure DNS zone | **None in this subscription** — DNS is at eNom (see §6) |

### Role assignments (RG + inherited, confirmed 2026-04-20)

| Principal | Role | Scope |
|---|---|---|
| `mark.walker_pro-curo.com#EXT#@markwalkerprocuro.onmicrosoft.com` (User, external) | Owner | `/subscriptions/d8892a71-7ab7-4b75-a1e3-500262a9b943` (inherited) |

Single user, no service principals, no group memberships, no other owners. **Do not change role assignments on this subscription** — changes ripple to V5 in `procuro-production`.

### Rotation procedure — deploy token

`AZURE_STATIC_WEB_APPS_API_TOKEN_ZEALOUS_SAND_02C845110` is auto-managed by Azure. To rotate: Azure portal → Static Web App `procuro-website` → **Manage deployment token** → Reset. Azure updates the GitHub repo secret automatically. Next deploy uses the new token.

---

## 4. Secrets

| Secret | Where it lives | Notes |
|---|---|---|
| Static Web App deploy token | GitHub repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN_ZEALOUS_SAND_02C845110` | Auto-managed by Azure. Rotation procedure above. Never commit |
| `NEWS_CACHE_CONNECTION` | Azure Static Web App → Configuration → Application settings. **Set 2026-04-20**, points at Storage Account `procuronewscache` (in this RG, `uksouth`) | Azure Storage connection string for `api/news` blob cache. Function falls back to in-memory cache if unset. Never commit. Never put in `local.settings.json` locally |
| Google reCAPTCHA site key `6Lf1...slaD` | Hardcoded in `contact.html` | **Public by design** — site keys are not secrets; the corresponding secret key is held by MailerLite (not Pro-curo) |
| MailerLite account/form IDs | Hardcoded in `contact.html` (`action` URL for account `2222074`, form `183534805221115798`) | Public URLs — not secrets |
| GA4 measurement ID `G-8CS9W53CST` | Hardcoded in every HTML `<head>` | Public by design |

**`.gitignore` coverage (as of 2026-04-20):** OS files, editor files, `node_modules/`, `.env`, `.env.*`, `local.settings.json`, `bin/`, `obj/`, `.azurefunctions/`, `DEPLOYMENT.md`.

---

## 5. CI/CD

| Field | Value |
|---|---|
| Workflow file | `.github/workflows/azure-static-web-apps-zealous-sand-02c845110.yml` |
| Trigger | Push to `main`; PR lifecycle (opened, synchronize, reopened, closed) against `main` |
| Build | None — plain static HTML |
| Deploy action | `Azure/static-web-apps-deploy@v1` (pinned to v1 major) |
| `app_location` | `/` |
| `api_location` | `/api` |
| `output_location` | `.` |
| Token | Repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN_ZEALOUS_SAND_02C845110` |
| PR previews | Yes — the same workflow handles PR preview environments on `opened/synchronize/reopened` and cleans them up on `closed` |
| Manual deploy path | **None intended.** The GitHub Actions workflow is the only deployment path — no `swa deploy` from dev machines |

### Rollback

1. **Trivial case:** `git revert <bad-commit>` on `main`, push, workflow redeploys (≈2 min)
2. **If revert is unsafe:** Azure portal → Static Web App `procuro-website` → **Environments** → swap in the previous production deployment
3. [CONFIRM] rollback drill — a trivial text change / deploy / revert / redeploy cycle is pending Mark's OK (see Questions for Mark #8)

---

## 6. DNS

### Registrar

| Field | Value |
|---|---|
| Registrar | eNom |
| Domain | `pro-curo.com` |
| Auto-renewal | [CONFIRM] at eNom |
| Renewal date | [CONFIRM] at eNom |

### DNS host

**DNS is hosted at the registrar (eNom), NOT Azure DNS.** Confirmed 2026-04-20: `Microsoft.Network` provider is `NotRegistered` on subscription `d8892a71-7ab7-4b75-a1e3-500262a9b943` and no DNS zones exist. Any DNS change has to be made in the eNom control panel, not via `az`.

| Field | Value |
|---|---|
| Nameservers | `dns1.name-services.com`, `dns2.name-services.com`, `dns3.name-services.com`, `dns4.name-services.com`, `dns5.name-services.com` (eNom pool) |
| SOA primary | `dns1.name-services.com` |
| SOA responsible party | `info.name-services.com` |

### Records captured 2026-04-20 (via 8.8.8.8)

| Record | Value | Purpose |
|---|---|---|
| `www.pro-curo.com` CNAME | → `zealous-sand-02c845110.4.azurestaticapps.net` (via Azure Traffic Manager → App Service backend in Amsterdam) | Website www hostname |
| `pro-curo.com` apex | No direct A record returned; SWA reports hostname "Ready" so apex uses eNom ALIAS/ANAME → SWA default hostname (eNom supports synthetic A at apex). [CONFIRM in eNom UI] | Website apex |
| `pro-curo.com` MX | `aspmx.l.google.com` priority 10 | Google Workspace mail |
| `pro-curo.com` TXT (SPF) | `v=spf1 include:_spf.mlsend.com include:_spf.google.com ~all` | Mail authorisation for MailerLite + Google Workspace |
| `pro-curo.com` TXT (GSC verification) | `google-site-verification=peifu9cUhJBtcQIM1jRPl9g5lTp9y1HYk4bdplTZqNc` | **GSC verification method = DNS TXT** |
| `pro-curo.com` TXT (SWA validation) | `_6kh1v1mbfo981cwvpzbi36ozdbgkfpr` | Azure SWA custom-domain validation token for the apex |
| `pro-curo.com` TXT (MailerLite verification) | `mailerlite-domain-verification=5b0bac44c89b1a62e60e3ae443618cee337eb109` | MailerLite sender-domain verification |
| `_dmarc.pro-curo.com` | **NXDOMAIN** — no DMARC record configured | Mail hygiene gap (see "Out-of-scope hygiene items") |
| `app.pro-curo.com` | → `procuro-frontend.grayriver-3c973afe.uksouth.azurecontainerapps.io` (20.108.207.154) | **Pro-curo V5 (out of scope here)** — V5 runs on Azure Container Apps in `uksouth`. Captured for future V5 brief; no changes from this pass |

### SSL

Azure Static Web Apps free cert, auto-renewing. Confirmed 2026-04-20: `az staticwebapp hostname list` shows both `www.pro-curo.com` and `pro-curo.com` as status `Ready`.

---

## 7. Third-party integrations

| Integration | Where | Notes |
|---|---|---|
| Google Analytics 4 | Measurement ID `G-8CS9W53CST` in every HTML `<head>` | Verified owner on GSC: `mark.walker@pro-curo.com` |
| Google Search Console | Verified owner `mark.walker@pro-curo.com`. Verification method = **DNS TXT** on `pro-curo.com` (`google-site-verification=peifu9cUhJBtcQIM1jRPl9g5lTp9y1HYk4bdplTZqNc`) | SEO fix revalidation depends on this mailbox staying live and the TXT record staying in eNom DNS |
| MailerLite contact form | `contact.html` posts to `https://assets.mailerlite.com/jsonp/2222074/forms/183534805221115798/subscribe` | Replaces the old JS-only form handler |
| Google reCAPTCHA v2 | Site key `6Lf1KHQUAAAAAFNKEX1hdSWCS3mRMv4FlFaNslaD` on the contact form | Public key; secret held by MailerLite |
| RSS/Atom sources (api/news) | 17 feed entries in `api/news/index.js` — 1 HTA, 1 NHSBT, 12 The Scientist, 1 Biobanking.com, 1 eLife, 1 Lab News | All public feed endpoints, no auth |

### Industry news feed URLs

Hardcoded in `api/news/index.js` `FEEDS` array. Swap when a feed goes dead. Current list:

- `https://www.gov.uk/government/organisations/human-tissue-authority.atom`
- `https://www.gov.uk/government/organisations/nhs-blood-and-transplant.atom`
- `https://www.the-scientist.com/atom/latest` plus 11 topic feeds under `the-scientist.com/atom/`
- `https://www.biobanking.com/feed/`
- `https://elifesciences.org/rss/recent.xml`
- `https://www.labnews.co.uk/section/1.rss`

---

## 8. Database

**N/A.** No database. The only state store is the optional Azure Blob Storage cache for the news feed (`NEWS_CACHE_CONNECTION`), which is disposable — losing it means the next `/api/news` call refetches the upstream feeds. In-memory cache is the fallback if Blob Storage is unset.

---

## 9. Monitoring

**Today: none.** Confirmed 2026-04-20:
- Application Insights: **not connected** to the Static Web App
- Diagnostic settings on the SWA: **empty**, no log destinations
- No availability test, no alerting, no uptime check

Outstanding: cost-of-service decision for availability monitoring — Azure availability test (paid per test/month per region) vs UptimeRobot free tier (1 check, 5-minute interval, email alert). Target URL: `https://www.pro-curo.com/`. Alert destination: `mark@taraniscapital.com` per brief (cross-entity mailbox — flag if Mark wants a Pro-curo mailbox instead).

---

## 10. Backup and DR

| Component | Recovery path |
|---|---|
| Static site source | GitHub — clone the repo |
| Static Web App config (`staticwebapp.config.json`) | In git |
| Azure Function source (`api/news/`) | In git |
| `NEWS_CACHE_CONNECTION` Blob Storage contents | **Disposable.** Next `/api/news` call refetches |
| DNS records | Authoritative export in §6 above. Source is the eNom control panel — back up by copying that table out of this inventory; rebuild in eNom (or in any new DNS host) on restore |
| Deploy token | Azure auto-generates and pushes to GitHub repo secret — reset via Azure portal if lost |
| GSC verification | Tied to `mark.walker@pro-curo.com` — keep that mailbox alive |

### Full-rebuild procedure (≈1 hour end to end)

1. Create fresh Azure Static Web App in a new RG (same subscription or different). Note the RG location falls back to `centralus` automatically since `uksouth` isn't an SWA control-plane region: `az staticwebapp create --name procuro-website --resource-group <new-rg> --source https://github.com/markwalker-pcs/pro-curo-website --branch main --app-location "/" --api-location "/api" --output-location "." --login-with-github`
2. Azure auto-creates the GitHub Actions workflow and deploy token secret
3. Re-create Storage Account `procuronewscache` (Standard_LRS, `uksouth`) and set `NEWS_CACHE_CONNECTION` app setting on the SWA to its connection string
4. `az staticwebapp hostname set` for `www.pro-curo.com` and `pro-curo.com` — note the SWA validation TXT token it prints; add it to eNom DNS
5. In the eNom control panel, update the CNAME for `www` and the apex ALIAS to point at the new SWA default hostname (`<new-random>.azurestaticapps.net`). Leave MX, SPF, GSC verification TXT and MailerLite verification TXT untouched
6. SSL provisions automatically once DNS resolves

---

## 11. Tribal knowledge

- **Why static HTML, not a CMS.** Speed, cost, no editor team. The site has a single author (Mark); a CMS would add moving parts without adding value.
- **Why the `version5-page/` pages are not live.** They're drafts for the V5 launch, sitting in the Cowork folder (outside this repo) waiting on a product decision. Not an accident of deployment.
- **The SEO fix landed 2026-04-20.** Google Search Console showed 351 not-indexed URLs — Tumblr-era junk query strings and old `.php` pages. Fix = `robots.txt` disallow for Tumblr patterns + `/resources/` + ~40 new 301 redirects in `staticwebapp.config.json`. Google URL-inspection revalidation takes 2–4 weeks, that's a Google-paced task, not a deploy step.
- **`Company Docs/` stays out of the repo.** Internal T&Cs, HTA statement, support contracts and case-study PDFs live in the Cowork working folder only. The repo is public; they stay out of it.
- **Same subscription as Pro-curo V5.** The V5 app is a live, paid-customer service in `procuro-production` in the same subscription. Any subscription-scoped misfire during maintenance on this site reaches V5. Always scope to `rg-procuro-website`.
- **GSC verification is tied to `mark.walker@pro-curo.com`** and held via a DNS TXT record on `pro-curo.com` (`google-site-verification=peifu9cUhJBtcQIM1jRPl9g5lTp9y1HYk4bdplTZqNc`). If that mailbox is retired, GSC access needs re-verification before any further SEO action. If the TXT is ever removed from eNom, GSC ownership is lost.
- **Brand identity in the Azure tenant.** The Azure tenant is `markwalkerprocuro.onmicrosoft.com` and Mark's principal is an external user `mark.walker_pro-curo.com#EXT#@...`. Tenant-level admin lives with whichever account originally provisioned the subscription — worth writing down separately if that ever needs to be rotated.

---

## 12. Known risks and open items

- **Shared subscription with Pro-curo V5.** Hard guard rail: scope every `az` command to `rg-procuro-website`; never touch subscription-level role assignments, policies or defaults; never touch `procuro-production`.
- **Public repo with historical content.** Any secret ever committed is exposed. Secret-history grep clean as of 2026-04-20 (see §2), but every future change must pass pre-commit grep too.
- **No monitoring on a live public site.** Decision recorded: UptimeRobot free tier. Signup pending Mark (Questions for Mark #2).
- **SEO fix revalidation outstanding.** Google-paced; track in `TASKS.md`, not here.
- **Deploy-token rotation procedure not previously written down.** Captured in §3 above.
- **Alert destination for future availability checks.** Brief specifies `mark@taraniscapital.com` — cross-entity mailbox. Flag for Mark to choose a Pro-curo-side address if preferred.
- **GSC mailbox continuity.** `mark.walker@pro-curo.com` must stay live; if retired, re-verify GSC first.
