"use client";

import { useState } from "react";
import type { HeaderCheck } from "@/engines/http-guard";
import type { Report } from "@/lib/types";
import { ReportView } from "@/components/report-view";
import { Button, Card, EmptyState, Spinner, TextInput, ToolHeader, Badge } from "@/components/ui";
import { recordRun } from "@/lib/runs";

interface ApiResult {
  report: Report;
  checks: HeaderCheck[];
}

export default function HttpGuardPage() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const startedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/httpguard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as ApiResult & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data);
        recordRun("http-guard", url, data.report, startedAt);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
    setRunning(false);
  };

  return (
    <div>
      <ToolHeader
        icon="🔒"
        name="HTTPGuard"
        tagline="Audit the security headers of a URL you own or control. One passive GET request — HTTPS, HSTS, CSP, cookies, framing, referrer policy — scored /100 with fixes."
        privacy="PASSIVE CHECK · NO EXPLOITATION"
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="URL to audit"
            value={url}
            onChange={setUrl}
            placeholder="example.com or https://app.example.com"
            onEnter={() => void run()}
            className="min-w-[280px] flex-1"
          />
          <Button onClick={() => void run()} disabled={running || !url.trim()}>
            ▶ AUDIT
          </Button>
        </div>
        <p className="mt-3 font-mono text-[11px] text-faint">
          Only scan sites you own or have permission to test. The server performs a single
          GET (follows redirects), reads headers, and never executes anything.
        </p>
        {running && <div className="mt-4"><Spinner label="Fetching and analyzing headers…" /></div>}
        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card className="mb-6" title="HEADER CHECKS" subtitle="What the response actually carried">
            <div className="space-y-2">
              {result.checks.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md border border-line bg-panel2/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={c.status === "pass" ? "green" : c.status === "warn" ? "amber" : c.status === "fail" ? "red" : "blue"}
                    >
                      {c.status}
                    </Badge>
                    <span className="text-sm font-medium text-ink">{c.label}</span>
                    {c.weight > 0 && (
                      <span className="font-mono text-[10px] text-faint">{c.weight} pts</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{c.detail}</p>
                  {c.observed && (
                    <pre className="mt-1.5 overflow-x-auto rounded border border-line bg-[#070b10] px-2 py-1.5 font-mono text-[11px] text-info">
                      {c.observed.slice(0, 200)}
                    </pre>
                  )}
                  {c.recommendation && (
                    <p className="mt-1.5 font-mono text-[11px] text-accent">→ {c.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <ReportView report={result.report} />
        </>
      )}

      {!result && !running && (
        <EmptyState
          icon="🔒"
          text="Enter a URL above to get a header-by-header security audit with a score and concrete fixes. Missing CSP, HSTS or cookie flags are the most common findings — all fixable in one config file."
        />
      )}
    </div>
  );
}
