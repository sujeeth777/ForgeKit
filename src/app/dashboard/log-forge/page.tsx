"use client";

import { useState, useRef } from "react";
import { analyzeLogs, type LogForgeResult, type LogEvent } from "@/engines/log-forge";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, EmptyState, Spinner, StatCard, TextArea, ToolHeader, Badge,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";
import { formatBytes, formatNumber } from "@/lib/utils";

const SAMPLE = `203.0.113.7 - - [14/Nov/2026:10:11:02 +0530] "GET / HTTP/1.1" 200 5123 "https://google.com" "Mozilla/5.0"
203.0.113.7 - - [14/Nov/2026:10:11:03 +0530] "GET /login HTTP/1.1" 200 2048 "-" "Mozilla/5.0"
198.51.100.9 - - [14/Nov/2026:10:11:05 +0530] "POST /login HTTP/1.1" 401 128 "-" "python-requests/2.31"
198.51.100.9 - - [14/Nov/2026:10:11:07 +0530] "POST /login HTTP/1.1" 401 128 "-" "python-requests/2.31"
198.51.100.9 - - [14/Nov/2026:10:11:09 +0530] "GET /../../etc/passwd HTTP/1.1" 404 0 "-" "-"
198.51.100.9 - - [14/Nov/2026:10:11:11 +0530] "GET /?q=1' OR '1'='1 HTTP/1.1" 404 0 "-" "-"
198.51.100.9 - - [14/Nov/2026:10:11:13 +0530] "GET /.env HTTP/1.1" 404 0 "-" "-"
203.0.113.7 - - [14/Nov/2026:10:12:00 +0530] "GET /api/products HTTP/1.1" 500 32 "-" "Mozilla/5.0"
{"level":"ERROR","msg":"DB connection refused","ts":"2026-11-14T10:12:01Z"}
{"level":"INFO","msg":"server started on :3000","ts":"2026-11-14T10:00:00Z"}`;

export default function LogForgePage() {
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LogForgeResult | null>(null);
  const [selected, setSelected] = useState<LogEvent | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = () => {
    if (!content.trim()) return;
    setRunning(true);
    setSelected(null);
    const startedAt = new Date().toISOString();
    setTimeout(() => {
      const out = analyzeLogs(content);
      setResult(out);
      setRunning(false);
      recordRun(
        "log-forge",
        `${formatNumber(out.stats.total)} lines · ${out.stats.suspicious.length} suspicious`,
        out.report,
        startedAt,
      );
    }, 30);
  };

  const handleFile = async (f: File) => {
    const text = await f.text();
    setContent(text);
    setSourceName(`${f.name} (${formatBytes(f.size)})`);
  };
  const [sourceName, setSourceName] = useState("");

  return (
    <div>
      <ToolHeader
        icon="📊"
        name="LogForge"
        tagline="Parse nginx/apache combined, JSON-lines, level-tagged and CSV logs into one event model — traffic stats, error rates, auth failures and suspicious patterns."
        privacy="RUNS LOCALLY — NOTHING UPLOADS"
      />

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
            Log content {sourceName && <span className="text-dim">— {sourceName}</span>}
          </span>
          <div className="flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".log,.txt,.json,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <Button variant="ghost" onClick={() => fileInput.current?.click()}>
              ⬆ LOAD FILE
            </Button>
            <Button variant="ghost" onClick={() => setContent(SAMPLE)}>
              LOAD SAMPLE
            </Button>
          </div>
        </div>
        <TextArea
          value={content}
          onChange={(v) => setContent(v)}
          rows={10}
          placeholder={"Paste log lines or load a file…\n203.0.113.7 - - [14/Nov/2026:10:11:02] \"GET / HTTP/1.1\" 200 5123"}
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={running || !content.trim()}>
            ▶ ANALYZE LOGS
          </Button>
          <span className="font-mono text-[11px] text-faint">
            first 5,000 lines are parsed · everything stays local
          </span>
        </div>
        {running && <div className="mt-4"><Spinner /></div>}
      </Card>

      {result && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Requests/Events" value={formatNumber(result.stats.parsed)} />
            <StatCard label="4xx client errors" value={formatNumber(result.stats.byStatus.x4)} accent={result.stats.byStatus.x4 > 0} />
            <StatCard label="5xx server errors" value={formatNumber(result.stats.byStatus.x5)} accent={result.stats.byStatus.x5 > 0} />
            <StatCard label="Suspicious" value={result.stats.suspicious.length} accent={result.stats.suspicious.length > 0} />
          </div>

          {result.stats.suspicious.length > 0 && (
            <Card className="mb-6" title="SUSPICIOUS PATTERNS" subtitle="defensive review — verify before blocking anyone">
              <div className="space-y-2">
                {result.stats.suspicious.map((s, i) => (
                  <div key={i} className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="red">{s.kind}</Badge>
                      {s.ip && <span className="font-mono text-xs text-warn">{s.ip}</span>}
                      <span className="font-mono text-xs text-dim">×{s.count}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-dim">{s.sample}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <ReportView report={result.report} />

          <Card className="mt-6" title="EVENT INSPECTOR" subtitle="click a row to see the raw log line">
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-line">
              <table className="w-full text-left font-mono text-xs">
                <thead className="sticky top-0 bg-panel2 text-faint">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-2 py-2">fmt</th>
                    <th className="px-2 py-2">ip</th>
                    <th className="px-2 py-2">method</th>
                    <th className="px-2 py-2">path</th>
                    <th className="px-2 py-2">status</th>
                    <th className="px-2 py-2">level</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.slice(0, 300).map((ev) => (
                    <tr
                      key={ev.line}
                      onClick={() => setSelected(ev)}
                      className={`cursor-pointer border-t border-line/60 hover:bg-panel2 ${
                        selected?.line === ev.line ? "bg-accent/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1 text-faint">{ev.line}</td>
                      <td className="px-2 py-1 text-faint">{ev.format}</td>
                      <td className="px-2 py-1 text-dim">{ev.ip ?? "—"}</td>
                      <td className="px-2 py-1 text-dim">{ev.method ?? "—"}</td>
                      <td className="max-w-[240px] truncate px-2 py-1 text-dim">{ev.path ?? ev.message?.slice(0, 40) ?? "—"}</td>
                      <td className="px-2 py-1">
                        {ev.status !== undefined ? (
                          <span className={
                            ev.status < 300 ? "text-accent" : ev.status < 400 ? "text-info" : ev.status < 500 ? "text-warn" : "text-danger"
                          }>
                            {ev.status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-1 text-dim">{ev.level ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && (
              <div className="mt-3">
                <div className="font-mono text-[11px] text-info">line {selected.line} ({selected.format})</div>
                <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-[#070b10] px-3 py-2 font-mono text-xs text-dim">
                  {selected.raw.slice(0, 500)}
                </pre>
              </div>
            )}
          </Card>
        </>
      )}

      {!result && !running && (
        <EmptyState
          icon="📊"
          text="Paste logs or load a file, then analyze. LogForge normalizes mixed formats, computes traffic and error stats, surfaces auth-failure bursts, 404 scanners, SQL-injection-shaped requests and sensitive-path probing — all parsed locally."
        />
      )}
    </div>
  );
}
