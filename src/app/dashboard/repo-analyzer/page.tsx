"use client";

import { useState, useRef } from "react";
import { analyzeRepo, type RepoAnalysis, type RepoFile } from "@/engines/repo-analyzer";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, EmptyState, Spinner, ToolHeader, Badge, StatCard,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";
import { formatBytes } from "@/lib/utils";

const MAX_ENTRIES = 4000;
const MAX_TOTAL_BYTES = 80_000_000; // 80 MB safety cap

export default function RepoAnalyzerPage() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<RepoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleZip = async (file: File) => {
    setRunning(true);
    setError(null);
    setResult(null);
    const startedAt = new Date().toISOString();
    try {
      setProgress("Reading archive…");
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      if (entries.length > MAX_ENTRIES) {
        setError(`Archive has ${entries.length.toLocaleString()} entries — the limit is ${MAX_ENTRIES.toLocaleString()}. Try a repo without node_modules.`);
        setRunning(false);
        return;
      }
      const files: RepoFile[] = [];
      let total = 0;
      let i = 0;
      for (const entry of entries) {
        i += 1;
        if (i % 100 === 0) setProgress(`Extracting ${i}/${entries.length}…`);
        if (/__MACOSX|\.DS_Store/.test(entry.name)) continue;
        let size = 0;
        try {
          // JSZip reports sizes on its internal data — fall back to reading
          const data = await entry.async("uint8array");
          size = data.length;
        } catch {
          size = 0;
        }
        total += size;
        if (total > MAX_TOTAL_BYTES) {
          setError("Archive contents exceed the 80 MB processing cap — analyze a smaller slice.");
          setRunning(false);
          return;
        }
        files.push({ path: entry.name, size });
      }
      setProgress("Analyzing structure…");
      const out = analyzeRepo(files);
      setResult(out);
      setSource(`${file.name} — ${files.length.toLocaleString()} files, ${formatBytes(total)}`);
      recordRun("repo-analyzer", `${file.name} · ${files.length} files`, out.report, startedAt);
    } catch (e) {
      setError(`Could not analyze ZIP: ${e instanceof Error ? e.message : String(e)}`);
    }
    setProgress("");
    setRunning(false);
  };

  return (
    <div>
      <ToolHeader
        icon="🔍"
        name="Repo Analyzer"
        tagline="Drop a repository ZIP — get language breakdown, structure, largest files, committed artifacts (.env, node_modules) and build-config inventory. Nothing leaves your browser."
        privacy="RUNS LOCALLY — NOTHING UPLOADS"
      />

      <Card className="mb-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void handleZip(f); }}
          className={`rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-line"
          }`}
        >
          <div className="text-3xl">🗂</div>
          <p className="mt-2 text-sm text-dim">
            Drop a repo <span className="font-mono text-ink">.zip</span> here (tip: exclude{" "}
            <span className="font-mono">node_modules</span> and{" "}
            <span className="font-mono">.git</span> for speed — committed ones are flagged on purpose)
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleZip(f); }}
          />
          <Button variant="outline" className="mt-4" onClick={() => fileInput.current?.click()}>
            CHOOSE ZIP
          </Button>
        </div>
        {running && <div className="mt-4"><Spinner label={progress || "Working…"} /></div>}
        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {source && !running && (
          <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-faint">
            <Badge tone="green">✓ ANALYZED</Badge> {source}
          </div>
        )}
      </Card>

      {result && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Files" value={result.totalFiles.toLocaleString()} />
            <StatCard label="Size" value={formatBytes(result.totalBytes)} />
            <StatCard
              label="Languages"
              value={result.languages.filter((l) => l.share > 0).length}
              accent
            />
            <StatCard label="Manifests" value={result.manifests.length} />
          </div>

          {result.languages.filter((l) => l.share > 0).length > 0 && (
            <Card className="mb-6" title="LANGUAGE BREAKDOWN" subtitle="share of code bytes">
              <div className="space-y-2">
                {result.languages
                  .filter((l) => l.share > 0)
                  .slice(0, 10)
                  .map((l) => (
                    <div key={l.language} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 font-mono text-xs text-ink">{l.language}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel2">
                        <div
                          className="h-full rounded-full bg-accent/80"
                          style={{ width: `${Math.max(l.share, 2)}%` }}
                        />
                      </div>
                      <span className="w-32 text-right font-mono text-[11px] text-faint">
                        {l.share}% · {l.files}f
                      </span>
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
          icon="🔍"
          text="Analyze a ZIP to get the full picture: languages by bytes, directory map, oversized files, committed .env/node_modules, minified artifacts, missing README — every finding comes with a fix."
        />
      )}
    </div>
  );
}
