"use client";

import { useState, useRef } from "react";
import { scanFiles, type ScanFile } from "@/engines/secret-sentry";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, EmptyState, Spinner, TextArea, ToolHeader, Badge,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";
import { formatBytes } from "@/lib/utils";

const MAX_FILES = 300;
const MAX_TEXT_BYTES = 2_000_000; // per text file we scan line-by-line

type Mode = "text" | "zip";

export default function SecretSentryPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ScanFile[] | null>(null);
  const [source, setSource] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof scanFiles> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const runScan = (toScan: ScanFile[], label: string) => {
    if (toScan.length === 0) {
      setError("Nothing to scan — the archive/text was empty.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const startedAt = new Date().toISOString();
      // small tick so the spinner paints before the synchronous scan
      setTimeout(() => {
        try {
          const out = scanFiles(toScan);
          setResult(out);
          recordRun("secret-sentry", label, out.report, startedAt);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        setRunning(false);
      }, 30);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  };

  const handleText = () => {
    if (!text.trim()) {
      setError("Paste some text or code first.");
      return;
    }
    setFiles(null);
    runScan([{ path: "pasted-input", content: text }], "pasted text scan");
  };

  const extractZip = async (file: File) => {
    setRunning(true);
    setError(null);
    setResult(null);
    setFiles(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      const out: ScanFile[] = [];
      let skippedBinary = 0;
      for (const entry of entries.slice(0, MAX_FILES)) {
        if (/__MACOSX|\.DS_Store|node_modules\/|\.git\/objects/.test(entry.name)) continue;
        try {
          const content = await entry.async("string");
          // crude binary check — NUL byte in first 1KB
          if (content.length > 0 && content.charCodeAt(0) === 0) {
            skippedBinary += 1;
            out.push({ path: entry.name, content: "" });
            continue;
          }
          if (content.length > MAX_TEXT_BYTES) {
            out.push({ path: entry.name, content: content.slice(0, MAX_TEXT_BYTES) });
          } else {
            out.push({ path: entry.name, content });
          }
        } catch {
          skippedBinary += 1;
        }
      }
      setFiles(out);
      setSource(`${file.name} (${formatBytes(file.size)}) — ${out.length} text files${skippedBinary ? `, ${skippedBinary} binary/skipped` : ""}`);
      runScan(out, `ZIP scan: ${file.name}`);
    } catch (e) {
      setError(`Could not read ZIP: ${e instanceof Error ? e.message : String(e)}`);
      setRunning(false);
    }
  };

  const handleFileInput = async (fl: FileList | null) => {
    if (!fl || fl.length === 0) return;
    const file = fl[0];
    if (file.name.toLowerCase().endsWith(".zip")) {
      await extractZip(file);
    } else {
      const content = await file.text();
      setFiles([{ path: file.name, content }]);
      setSource(`${file.name} (${formatBytes(file.size)})`);
      runScan([{ path: file.name, content }], `file scan: ${file.name}`);
    }
  };

  const reset = () => {
    setResult(null);
    setFiles(null);
    setSource("");
    setError(null);
    setRunning(false);
  };

  return (
    <div>
      <ToolHeader
        icon="🛡"
        name="SecretSentry"
        tagline="Hunt potential API keys, tokens, private keys and credentials in code. Discovered values are NEVER displayed — only location, type and confidence."
        privacy="RUNS LOCALLY — NOTHING UPLOADS"
      />

      <Card className="mb-6">
        <div className="mb-4 flex gap-2">
          <Button variant={mode === "text" ? "primary" : "outline"} onClick={() => { setMode("text"); reset(); }}>
            PASTE TEXT
          </Button>
          <Button variant={mode === "zip" ? "primary" : "outline"} onClick={() => { setMode("zip"); reset(); }}>
            UPLOAD ZIP / FILE
          </Button>
        </div>

        {mode === "text" ? (
          <>
            <TextArea
              value={text}
              onChange={setText}
              rows={10}
              label="Paste code, config or logs to inspect"
              placeholder={"// paste anything you suspect contains secrets\nDATABASE_URL=postgres://admin:hunter2@db.example.com/prod\nGITHUB_TOKEN=ghp_..."}
            />
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handleText} disabled={running}>
                ▶ SCAN TEXT
              </Button>
              <span className="font-mono text-[11px] text-faint">
                {text.length.toLocaleString()} chars · scanned in your browser
              </span>
            </div>
          </>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFileInput(e.dataTransfer.files); }}
            className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? "border-accent bg-accent/5" : "border-line"
            }`}
          >
            <div className="text-3xl">📦</div>
            <p className="mt-2 text-sm text-dim">
              Drop a <span className="font-mono text-ink">.zip</span> or any text file here — extraction and
              scanning happen entirely in your browser.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,.txt,.env,.json,.py,.js,.ts,.yml,.yaml,.toml,.md"
              className="hidden"
              onChange={(e) => void handleFileInput(e.target.files)}
            />
            <Button variant="outline" className="mt-4" onClick={() => fileInput.current?.click()}>
              CHOOSE FILE
            </Button>
          </div>
        )}

        {running && <div className="mt-4"><Spinner label="Scanning…" /></div>}
        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {files && source && !running && (
          <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-faint">
            <Badge tone="green">✓ LOADED</Badge> {source}
          </div>
        )}
      </Card>

      {result && (
        <>
          <ReportView report={result.report} />
          {result.report.findings.some((f) => f.meta?.snippet) && (
            <Card className="mt-6" title="MASKED CONTEXT" subtitle="Matched spans are replaced with █ — the secret value is not shown">
              <div className="space-y-3">
                {result.report.findings
                  .filter((f) => f.meta?.snippet)
                  .slice(0, 30)
                  .map((f) => (
                    <div key={f.id}>
                      <div className="font-mono text-[11px] text-info">{f.location}</div>
                      <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-[#070b10] px-3 py-2 font-mono text-xs text-dim">
                        {String(f.meta?.snippet)}
                      </pre>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </>
      )}

      {!result && !running && (
        <EmptyState
          icon="🛡"
          text="Run a scan to see findings. Every match shows only WHERE and WHAT TYPE — never the secret value itself. If you find a real secret: rotate it, purge it from git history, and move it to a secret manager."
        />
      )}
    </div>
  );
}
