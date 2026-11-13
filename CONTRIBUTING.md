# Contributing to ForgeKit

Thanks for thinking about contributing! The core philosophy:

1. **Local-first** — a tool should run in the browser whenever it possibly can.
2. **Pure engines** — tool logic lives in `src/engines/` as pure TypeScript with
   zero DOM/network dependencies, so it's testable and portable.
3. **One unified report** — every tool returns the standard `Report` shape.
4. **Defensive security only** — no exploit code, no credential theft, no
   attack tooling. Educational demonstrations run locally on the user's own data.

## Adding a new tool (the main contribution path)

1. **Engine** — create `src/engines/my-tool.ts` exporting a function that takes
   inputs and returns `{ report: Report, ...extras }`. Build the report with
   `getTool("my-tool")` metadata and `Finding`/`ReportSection` types.
2. **Registry** — add an entry to `TOOLS` in `src/lib/tools.ts` (pick a category,
   tagline, `runsIn: "browser" | "server"`), and extend the `ToolId` union in
   `src/lib/types.ts`.
3. **Page** — create `src/app/dashboard/my-tool/page.tsx` using `ToolHeader`,
   the shared UI kit, and `<ReportView report={...} />`.
4. **Record runs** — call `recordRun("my-tool", inputSummary, report, startedAt)`
   so the dashboard activity feed works.
5. **Tests** — add cases to `src/tests/`. Engines must have coverage.
6. **Verify** — `npm run typecheck && npm test && npm run build`.

## Rules of thumb

- Never render raw secret values anywhere. Mask like the existing engines do.
- Findings should always include a **fix**, not just a complaint.
- Estimates/calculations must state assumptions and a snapshot date.
- Match the existing dark, mono-accented UI. Don't add heavy dependencies
  without discussion — the bundle stays lean.

## Development

```bash
npm run dev        # dev server
npm test           # vitest (watch: npm run test:watch)
npm run typecheck  # strict tsc
npm run build      # production build
```

## Reporting security issues in ForgeKit itself

Please open a GitHub security advisory rather than a public issue. If you
found a real secret in your own code using SecretSentry: rotate it first,
then celebrate.
