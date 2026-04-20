# Claude Context — Pro-curo Website (pro-curo.com)

**Purpose:** Pro-curo Software Limited corporate website — product marketing, clients, pricing, support.
**State:** LIVE
**Owner entity:** Pro-curo Software Limited — **NOT** Taranis Capital
**Live URL:** <https://www.pro-curo.com>

## Company identity rule

Never refer to "Taranis Capital" in this project. This property is owned by Pro-curo Software Limited; any page copy, commit message, PR description, code comment or artefact produced in this repo must reflect that. The company-identity rule is the first thing to check when reviewing a draft.

## Tech stack

- **Frontend:** static HTML / CSS / vanilla JS — no framework, no build step
- **Backend:** one Azure Function at `api/news/` (Node.js, Functions v2.0, ExtensionBundle v4.x) — RSS/Atom aggregator serving `/api/news`
- **Hosting:** Azure Static Web App `procuro-website` in region `uksouth`
- **Config:** `staticwebapp.config.json` — routing, ~40 legacy `.php` → `.html` / `/news/*` 301 redirects, security headers
- **Metadata:** `sitemap.xml`, `robots.txt`, `llms.txt` all in the repo root
- **Deploy:** GitHub Actions workflow `.github/workflows/azure-static-web-apps-zealous-sand-02c845110.yml` — push to `main` deploys via `Azure/static-web-apps-deploy@v1`

## Azure

- **Subscription ID:** `d8892a71-7ab7-4b75-a1e3-500262a9b943` (Pay-As-You-Go) — **shared with the Pro-curo V5 application**
- **Resource group:** `rg-procuro-website` (location `centralus` — SWA control-plane doesn't run in `uksouth`, so the RG landed in `centralus`. The CDN is global)
- **Storage Account (news cache):** `procuronewscache` in the same RG, located `uksouth`. Connection string is on the SWA as app setting `NEWS_CACHE_CONNECTION`
- **SSL:** Azure Static Web Apps free SSL (auto-renewing). Both `www.pro-curo.com` and `pro-curo.com` status `Ready`
- **Default hostname:** `zealous-sand-02c845110.4.azurestaticapps.net`
- **Deploy token:** GitHub repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN_ZEALOUS_SAND_02C845110`, auto-managed by Azure

**Subscription guard rail.** Subscription `d8892a71-7ab7-4b75-a1e3-500262a9b943` also hosts the live, paid-customer Pro-curo V5 application in resource group `procuro-production`. Keep every `az` command scoped to `rg-procuro-website`:

- Always pass `--subscription d8892a71-7ab7-4b75-a1e3-500262a9b943 --resource-group rg-procuro-website`
- Never modify subscription-level role assignments, policies, diagnostic settings or defaults
- Never touch anything in `procuro-production` or any other RG
- Scope alerts at RG or resource level — never subscription-wide
- If a proposed change would ripple outside this RG, stop and check with Mark

## Git account discipline

Mark's machine has three GitHub accounts: `Walkerma75` (Taranis), `markwalker-pcs` (Pro-curo) and the Disrupts Media account. Mixing them up is the single most reliable way to get an auth failure or commit as the wrong identity. For this repo:

- `git config --local user.email mark.walker@pro-curo.com` (already set)
- The Windows Credential Manager entry for `github.com` must match `markwalker-pcs` when working here. If `gh auth status` reports a different active account, switch before touching the remote
- The remote URL should be `https://github.com/markwalker-pcs/pro-curo-website.git` — no username in the URL, credentials come from Credential Manager

## Deploy

1. Edit files at the repo root
2. Commit, push to `main`
3. GitHub Actions auto-deploys to the Static Web App (≈2 minutes)

The `api/news` Function deploys in the same workflow — no separate step. The workflow config (`app_location: "/"`, `api_location: "/api"`, `output_location: "."`) is load-bearing; changing it may break the deploy.

## Secrets

- No secrets in source. Historical grep clean as of 2026-04-20 for `AKIA*`, `AIza*`, `AccountKey=`, `DefaultEndpointsProtocol`, `BEGIN RSA`, `BEGIN OPENSSH`, `SG.*`, `api_key`, `client_secret`, `connectionstring`, `primary_key`. No `local.settings.json` has ever been committed.
- Deploy token lives only as a GitHub repo secret (Azure-managed, rotated via the Azure portal)
- Optional `NEWS_CACHE_CONNECTION` (Azure Storage connection string for `api/news` cache) — set in Static Web App application settings, never in the repo
- `local.settings.json`, `.env`, `.env.*`, `bin/`, `obj/`, `.azurefunctions/` must stay in `.gitignore`

## Domains

- `pro-curo.com` — live, this site
- Registrar: **eNom**. DNS is **hosted at the registrar** on eNom's `dns1–5.name-services.com` nameservers — **NOT Azure DNS**. All DNS changes happen in the eNom control panel; `az network dns` does not apply here
- `app.pro-curo.com` serves the Pro-curo V5 application on Azure Container Apps in `uksouth` — **not this project's concern**

## Do / don't

- **Do** keep `whitepapers/` accessible and linked from the nav
- **Do** update `sitemap.xml` when a new page is added
- **Do** preserve `llms.txt` for LLM crawler hinting
- **Do** scope every `az` command to `rg-procuro-website` (see guard rail above)
- **Don't** reference Taranis Capital anywhere in the site or the repo
- **Don't** commit internal T&Cs, HTA, contracts or case-study PDFs — those live in the Cowork working folder only, not the public repo
- **Don't** skip pre-commit secret grep on a repo this public
- **Don't** merge directly to `main` without the GitHub Actions workflow going green

## SEO / GSC

- Google Search Console verified owner: `mark.walker@pro-curo.com`. If that mailbox is ever retired, GSC access has to be re-verified before any SEO action
- Google Analytics 4 property: `G-8CS9W53CST` (embedded in every HTML page head)
- SEO fix landed 2026-04-20 (~40 new 301 redirects in `staticwebapp.config.json`, `robots.txt` blocking `/resources/*` and Tumblr-era query-string URLs). Google revalidation is a 2–4 week manual URL-inspection task — not a deploy step

## Inventory and migration status

`MIGRATION-INVENTORY.md` at the repo root is the authoritative record of the site's cloud, DNS, CI/CD, third-party and monitoring configuration. Read it before making any infrastructure change. Update it whenever any of those facts change.
