# ForgeKit Architecture

This document describes how ForgeKit v0.1 works today and how it grows into
the full hosted product without rewriting anything.

## 1. The product in one diagram

```
                         FORGEKIT
                            │
             ┌──────────────┼──────────────┐
          DEVELOPER       SECURITY      ARCHITECTURE
             │              │              │
      Repo Analyzer    SecretSentry   ArchMap
      EnvDoctor        HTTPGuard      SiteBlueprint
      DepWatch         AttackGraph    WebCost
      LogForge         AuthLab
      LinuxLens        NetPeek
             │              │              │
             └──────────────┼──────────────┘
                            ▼
              UNIFIED ENGINE LAYER (src/engines)
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Reports        ToolRuns      Exports
             │              │              │
             └──────────────┼──────────────┘
                            ▼
        v0.1: localStorage → Phase 5: Postgres + queue
```

## 2. Layers

### 2.1 Engines (`src/engines/*`) — pure logic

Every tool is one pure TypeScript module:

- **No DOM, no React, no network** (except the explicitly client-side network
  helpers in `net-peek.ts` and `dep-watch.ts`, which are separate exported
  functions the pages call).
- Deterministic input → output. This is what makes them testable in vitest
  under a plain Node environment, and reusable by a future CLI or worker.
- Return a tool-specific result containing a standard `Report`.

### 2.2 The unified report model (`engines/report.ts` + `lib/types.ts`)

```
Report {
  tool: ToolId
  toolLabel: string
  title: string
  generatedAt: ISO string
  score?: 0..100          // when the tool supports scoring
  summary: string         // one-paragraph human summary
  findings: Finding[]     // severity: critical|high|medium|low|info
  sections: ReportSection[]  // heading + body | rows | code
  meta?: Record<string, string|number>
}
```

- `ReportView` renders any report identically: score bar, findings with
  severity chips, key/value tables, code blocks.
- `reportToMarkdown` / `reportToJSON` power the MD/JSON exports; print → PDF.
- Adding a tool never touches the report renderer.

### 2.3 Tool registry (`lib/tools.ts`)

Single source of truth for names, icons, categories, taglines and where a
tool runs. The sidebar, dashboard grid and landing page are generated from it.

### 2.4 ToolRun store (`lib/runs.ts`)

```
ToolRun { id, tool, startedAt, finishedAt, status,
          inputSummary, score?, findingCount, report? }
```

- v0.1 persistence: `localStorage` (key `forgekit.runs.v1`, capped at 200 runs,
  export/import as JSON). This keeps the open-source core zero-backend.
- The shape is deliberately server-ready: Phase 5 swaps the storage functions
  for API calls without touching engines or pages.

### 2.5 UI (`components/` + `app/`)

- **Landing** (`/`) — product overview, generated from the registry.
- **Dashboard** (`/dashboard`) — OS-style shell: sidebar with categorized
  tools, overview page with run stats + activity + tool grid.
- **Tool pages** (`/dashboard/<tool-id>`) — `ToolHeader` + inputs + custom
  result widgets + the shared `ReportView`.
- Design tokens live in `globals.css` (`@theme`): near-black panels, mono
  accents, severity colors, engineering grid backdrop. Print CSS strips chrome
  for PDF export.

### 2.6 API routes (`app/api/*`)

| Route | Purpose | Guards |
|---|---|---|
| `POST /api/httpguard` | One passive GET, analyze headers | Protocol allowlist, private/metadata-address blocklist (SSRF), 20s timeout |
| `GET /api/netpeek` | Return the caller's IP/edge geo as the platform saw it | Read-only headers, no storage |

Everything else runs client-side. Two tool engines fetch public APIs **from
the browser** (npm registry for outdated checks, Cloudflare DoH for DNS) so no
proxying is needed.

## 3. Security design decisions

1. **Secrets are never displayed.** SecretSentry findings carry location, type,
   confidence and a masked snippet only. EnvDoctor masks values the moment
   they're parsed. This is enforced in the engines, not just the UI.
2. **SSRF protection.** HTTPGuard rejects non-HTTP(S) schemes and resolves
   blocks for localhost, RFC-1918 ranges, link-local (169.254.169.254 metadata),
   and `.local` names. When Phase 5 adds cloud scans, this moves into the
   sandbox worker with egress controls.
3. **No execution of user code.** Repo Analyzer reads ZIP entries as bytes —
   nothing is interpreted, evaluated or executed. Phase 5's sandbox-worker
   (container-per-scan, restricted FS/network, CPU/memory caps, non-root,
   auto-cleanup) follows the same principle for tools that truly need execution.
4. **Defensive-only security tools.** AttackGraph maps surfaces and suggests
   controls; AuthLab demonstrates hashing/JWT on the user's own inputs in the
   browser; NetPeek inspects only the caller's own connection.
5. **No accounts, cookies or tracking in the core.** Local-first means the
   default deployment leaks nothing.

## 4. Growth path (Phase 5)

```
Browser ──► Next.js (UI)
              │
              ▼
            FastAPI / Next API ──► Postgres (users, projects, tool_runs, reports)
              │
              ▼
        Redis job queue ──► sandbox workers (isolated scans)
              │
              ▼
        Supabase Auth ──► sessions ──► ₹10 lifetime pass (Razorpay webhook,
                                        server-verified — never the redirect)
```

- **Engines don't change** — workers import the same modules.
- **ToolRun/Report shapes don't change** — they gain a `userId` and land in Postgres.
- **Limits**: ₹10 buys access, not unlimited CPU — daily scan quotas, repo size
  caps, sandbox time budgets stay server-side.

## 5. Monorepo extraction plan

Engines are isolated modules by design. When one matures into a standalone
product (e.g. `forgekit-secret-sentry`), it extracts with its tests verbatim:

```
packages/<engine>/  ← src/engines/<engine>.ts + src/tests/*engine* tests
```

until then the single-app layout keeps CI and DX simple.
