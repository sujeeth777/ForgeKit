"use client";

import { useState } from "react";
import {
  parseManifest, analyzeDeps, checkNpmOutdated,
  type ParsedDep, type DepWatchResult,
} from "@/engines/dep-watch";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, EmptyState, Select, Spinner, TextArea, TextInput, ToolHeader, Badge,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";

const SAMPLE = `{
  "name": "sample-app",
  "version": "1.0.0",
  "license": "MIT",
  "dependencies": {
    "express": "^4.17.1",
    "lodash": "4.17.15",
    "axios": "^1.2.0",
    "jsonwebtoken": "8.5.1",
    "next": "14.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`;

const ECOSYSTEMS = [
  { value: "package.json", label: "package.json (npm)" },
  { value: "requirements.txt", label: "requirements.txt (Python)" },
  { value: "go.mod", label: "go.mod (Go)" },
  { value: "cargo.toml", label: "Cargo.toml (Rust)" },
  { value: "pom.xml", label: "pom.xml (Maven)" },
];

export default function DepWatchPage() {
  const [name, setName] = useState("package.json");
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [liveCheck, setLiveCheck] = useState(true);
  const [result, setResult] = useState<DepWatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!content.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const startedAt = new Date().toISOString();
    try {
      const deps = parseManifest(name, content);
      if (deps.length === 0) {
        setError(
          `No dependencies parsed from "${name}". Check the content matches the selected manifest type.`,
        );
        setRunning(false);
        return;
      }
      let outdated: Record<string, { current: string; latest: string }> = {};
      let npmCheckRan = false;
      let npmCheckFailed = false;
      if (liveCheck && deps.some((d) => d.ecosystem === "npm")) {
        try {
          const r = await checkNpmOutdated(deps);
          outdated = r.outdated;
          npmCheckRan = true;
          npmCheckFailed = r.failed;
        } catch {
          npmCheckFailed = true;
        }
      }
      const out = analyzeDeps(deps, {
        outdated, npmCheckRan, npmCheckFailed, manifestName: name,
      });
      setResult(out);
      recordRun("dep-watch", `${name} · ${deps.length} deps`, out.report, startedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  };

  return (
    <div>
      <ToolHeader
        icon="📦"
        name="DepWatch"
        tagline="Parse dependency manifests, flag known advisories (offline snapshot, clearly dated) and run a LIVE outdated check against the npm registry."
        privacy="LOCAL + OPTIONAL NPM LOOKUP"
      />

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Manifest type"
            value={name}
            onChange={setName}
            options={ECOSYSTEMS}
            className="w-64"
          />
          <TextInput
            label="Filename (if different)"
            value={name}
            onChange={setName}
            className="w-44"
          />
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-dim">
            <input
              type="checkbox"
              checked={liveCheck}
              onChange={(e) => setLiveCheck(e.target.checked)}
              className="h-4 w-4 accent-[#34d399]"
            />
            Live npm outdated check
          </label>
          <Button variant="ghost" onClick={() => { setName("package.json"); setContent(SAMPLE); }} className="ml-auto">
            LOAD SAMPLE
          </Button>
        </div>
        <TextArea
          value={content}
          onChange={setContent}
          rows={12}
          label={`Manifest content (${name})`}
          placeholder="Paste package.json / requirements.txt / go.mod / Cargo.toml / pom.xml here…"
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void run()} disabled={running || !content.trim()}>
            ▶ ANALYZE
          </Button>
          <span className="font-mono text-[11px] text-faint">
            advisory snapshot: offline · outdated: queries registry.npmjs.org directly from your browser
          </span>
        </div>
        {running && <div className="mt-4"><Spinner label="Parsing and checking npm registry…" /></div>}
        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </Card>

      {result && (
        <>
          {result.vulnerabilities.length > 0 && (
            <Card className="mb-6" title="MATCHED ADVISORIES" subtitle="From the offline snapshot — verify on the official advisory DB before acting">
              <div className="space-y-2">
                {result.vulnerabilities.map(({ dep, advisory }) => (
                  <div key={dep.name + advisory.fixed} className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={advisory.severity === "critical" ? "red" : "amber"}>
                        {advisory.severity}
                      </Badge>
                      <span className="font-mono text-sm text-ink">
                        {dep.name}@{dep.version}
                      </span>
                      <span className="text-[13px] text-dim">— {advisory.title}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-faint">
                      {advisory.cves.join(" · ")} → upgrade to ≥ {advisory.fixed}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <ReportView report={result.report} />
        </>
      )}

      {!result && !running && (
        <EmptyState
          icon="📦"
          text="Paste a dependency manifest and analyze. DepWatch parses package.json, requirements.txt, go.mod, Cargo.toml and pom.xml; it flags known vulnerable versions from a dated offline snapshot and (for npm) fetches latest versions live."
        />
      )}
    </div>
  );
}
