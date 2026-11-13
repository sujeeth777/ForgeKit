<div align="center">

# ⚒ ForgeKit

**One dashboard. Dozens of engineering tools. Open-source core.**

Analyze repositories · hunt leaked secrets · audit HTTP headers · map architecture ·
estimate costs · parse logs · learn Linux & auth — all from one place.

[![CI](https://github.com/sujeeth777/ForgeKit/actions/workflows/ci.yml/badge.svg)](https://github.com/sujeeth777/ForgeKit/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%E2%89%A520-blue)

</div>

---

## What is ForgeKit?

ForgeKit is a web-based engineering toolbox with an OS-style dashboard. A
developer can analyze a project, check HTTP security, inspect dependencies,
generate architecture diagrams, estimate website costs, analyze logs and learn
Linux/security concepts — without installing 12 different apps.

**Local-first by design:** every tool that can run in your browser does. Your
code, logs and secrets never leave your machine unless you explicitly ask a
server-assisted tool (like HTTPGuard) to fetch a URL.

## Tools (v0.1 — all live)

| Tool | What it does | Runs |
|---|---|---|
| 🔍 **Repo Analyzer** | Drop a repo ZIP → languages, structure, largest files, committed artifacts (`.env`, `node_modules`), build-config inventory | browser |
| 🩺 **EnvDoctor** | Health-check `.env`: duplicates, empty values, leftover placeholders, weak secrets (values masked) | browser |
| 📦 **DepWatch** | Parse `package.json`/`requirements.txt`/`go.mod`/`Cargo.toml`/`pom.xml` + dated advisory snapshot + **live** npm outdated check | browser |
| 🛡 **SecretSentry** | Scan text/ZIP for API keys, tokens, private keys, DB credentials. **Values are never displayed** — only location, type, confidence | browser |
| 🔒 **HTTPGuard** | Security-header audit for a URL you control: HTTPS, HSTS, CSP, cookies, framing → score /100 with fixes | server (passive GET) |
| 🌐 **NetPeek** | Your connection fingerprint, how the server sees you, DNS records via DoH | browser |
| 📊 **LogForge** | nginx/apache/JSON/CSV logs → unified events, traffic stats, auth-failure bursts, SQLi-shaped requests, scanners | browser |
| 🐧 **LinuxLens** | Explain Linux commands + permission math (`chmod 755` → rwx breakdown) + browsable command explorer | browser |
| 🏗 **ArchMap** | Stack selection → layered diagram with SVG preview; export Mermaid / ASCII / JSON / Markdown | browser |
| 📐 **SiteBlueprint** | Website type + scale → pages, features, reasoned stack, infra sketch, milestones | browser |
| 💰 **WebCost** | Development + monthly infra cost estimate (clearly labelled, indicative Nov 2026 INR rates) | browser |
| 🕸 **AttackGraph** | Defensive attack-surface mapping: describe flows, get per-component controls + MITRE notes | browser |
| 🔐 **AuthLab** | Learn auth by doing: WebCrypto hashing demo (SHA-256 vs PBKDF2), JWT explorer + HS256 verifier | browser |

Every tool produces a **standardized report** (score, findings, sections) that
exports to **Markdown / JSON / PDF** — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
git clone https://github.com/sujeeth777/ForgeKit.git
cd ForgeKit
npm install
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run build        # production build
npm start            # serve production build
npm test             # vitest suite (77 tests)
npm run typecheck    # tsc --noEmit
```

## Deployment

### Vercel (recommended)
1. Push the repo to GitHub (already done if you're reading this from there).
2. Import the repo on [vercel.com](https://vercel.com) — the Next.js defaults just work.
3. Optionally set `NEXT_PUBLIC_SITE_URL` to your domain.

### Docker (self-host)
```bash
docker compose up -d
# → http://localhost:3000
```

### Anywhere Node runs
```bash
npm run build && npm start
```

> The app has **no required environment variables**. See [.env.example](.env.example)
> for the optional ones used by Phase 5 (auth, Redis, payments).

## Project structure

```
forgekit/
├── src/
│   ├── app/
│   │   ├── page.tsx              # landing
│   │   ├── dashboard/            # OS-style dashboard shell
│   │   │   ├── page.tsx          # overview (runs, stats, activity)
│   │   │   └── <tool>/page.tsx   # 13 tool pages
│   │   └── api/
│   │       ├── httpguard/route.ts # server-assisted header scan (SSRF-guarded)
│   │       └── netpeek/route.ts   # what the server sees
│   ├── engines/                  # pure, testable tool logic (no DOM)
│   │   ├── secret-sentry.ts
│   │   ├── env-doctor.ts
│   │   ├── http-guard.ts
│   │   ├── dep-watch.ts
│   │   ├── repo-analyzer.ts
│   │   ├── log-forge.ts
│   │   ├── linux-lens.ts
│   │   ├── arch-map.ts
│   │   ├── site-blueprint.ts
│   │   ├── web-cost.ts
│   │   ├── attack-graph.ts
│   │   ├── auth-lab.ts
│   │   ├── net-peek.ts
│   │   └── report.ts             # unified Report model → MD/JSON
│   ├── components/               # UI kit, report renderer, shell
│   ├── lib/                      # types, tool registry, run store, utils
│   └── tests/                    # 77 vitest tests
├── .github/workflows/ci.yml      # typecheck + test + build
├── Dockerfile                    # multi-stage, non-root, standalone output
└── docker-compose.yml
```

## The unified data model

Every tool execution is a **ToolRun**; every run produces a **Report**:

```
ToolRun  { tool, startedAt, finishedAt, status, inputSummary, score, findingCount, report }
Report   { tool, title, generatedAt, score?, summary, findings[], sections[] }
Finding  { severity (critical→info), title, detail, location?, meta? }
```

In v0.1 runs are stored in `localStorage` (exportable as JSON). The same shapes
are designed to move to Postgres + a job queue in Phase 5 without changing the engines.

## Security posture

- **SecretSentry never displays secret values** — findings carry location, type,
  confidence and a masked snippet (`████`), nothing else.
- **EnvDoctor masks values** before anything is rendered or recorded.
- **HTTPGuard** performs one passive GET with redirect-following, blocks
  private/local/metadata addresses (SSRF guard), and never sends anything
  beyond the request itself.
- **AttackGraph is defensive-only** — it maps your architecture and suggests
  controls; there is no exploit functionality anywhere in ForgeKit.
- No cookies, no accounts, no tracking in the open-source core.

## Roadmap

- [x] **Phase 0** — Foundation: Next.js + dashboard + unified data model
- [x] **Phase 1** — SecretSentry, EnvDoctor, HTTPGuard, ArchMap, WebCost
- [x] **Phase 2** — Repo Analyzer, DepWatch, LogForge, LinuxLens, NetPeek
- [x] **Phase 3** — AttackGraph (defensive), AuthLab, standardized reports
- [x] **Phase 4** — SiteBlueprint
- [ ] **Phase 5** — Ecosystem: Supabase auth + Postgres persistence, job queue,
      hosted service, CLI, plugin API

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a tool is a great first
contribution: one pure engine + one page + tests + registry entry.

## License

[MIT](LICENSE) — use it, fork it, self-host it. If you build something cool on
top, a star is always appreciated ⭐
