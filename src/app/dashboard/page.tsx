"use client";

import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { listRuns, subscribe, clearRuns, exportAll } from "@/lib/runs";
import type { ToolRun } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { Card, StatCard, Badge, Button, EmptyState } from "@/components/ui";
import { timeAgo, formatNumber, downloadText } from "@/lib/utils";

export default function DashboardPage() {
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRuns(listRuns());
    setLoaded(true);
    const unsub = subscribe(() => setRuns(listRuns()));
    return unsub;
  }, []);

  const stats = useMemo(() => {
    const findings = runs.reduce((a, r) => a + r.findingCount, 0);
    const scored = runs.filter((r) => r.score !== undefined);
    const avgScore = scored.length
      ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length)
      : undefined;
    return { total: runs.length, findings, avgScore };
  }, [runs]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "GOOD MORNING" : hour < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-wide text-ink">
            {greeting} <span className="text-accent">👋</span>
          </h1>
          <p className="mt-1 text-sm text-dim">
            Your engineering workspace — {TOOLS.length} tools, one dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadText(
                `forgekit-data-${new Date().toISOString().slice(0, 10)}.json`,
                exportAll(),
                "application/json",
              )
            }
          >
            ⬇ EXPORT DATA
          </Button>
          {runs.length > 0 && (
            <Button variant="ghost" onClick={() => clearRuns()}>
              CLEAR HISTORY
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tool runs" value={loaded ? formatNumber(stats.total) : "—"} hint="stored locally" />
        <StatCard label="Findings" value={loaded ? formatNumber(stats.findings) : "—"} hint="med+ severity" accent={stats.findings > 0} />
        <StatCard label="Avg score" value={stats.avgScore !== undefined ? `${stats.avgScore}` : "—"} hint="across scored runs" />
        <StatCard label="Tools live" value={TOOLS.length} hint="v0.1 open-source core" accent />
      </div>

      <Card title="RECENT ACTIVITY" subtitle="Your last tool executions (kept in this browser)">
        {runs.length === 0 ? (
          <EmptyState
            icon="⚡"
            text="No runs yet. Pick a tool from the sidebar — try SecretSentry to hunt leaked keys, or HTTPGuard to audit your site's security headers."
          />
        ) : (
          <div className="divide-y divide-line">
            {runs.slice(0, 10).map((r) => {
              const tool = TOOLS.find((t) => t.id === r.tool);
              return (
                <Link
                  key={r.id}
                  href={`/dashboard/${r.tool}`}
                  className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-panel2/60"
                >
                  <span className="text-lg">{tool?.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{tool?.name}</div>
                    <div className="truncate font-mono text-[11px] text-faint">
                      {r.inputSummary}
                    </div>
                  </div>
                  {r.score !== undefined && (
                    <Badge tone={r.score >= 80 ? "green" : r.score >= 50 ? "amber" : "red"}>
                      {r.score}/100
                    </Badge>
                  )}
                  {r.findingCount > 0 && (
                    <Badge tone="red">{r.findingCount} findings</Badge>
                  )}
                  <span className="font-mono text-[11px] text-faint">
                    {timeAgo(r.finishedAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="ALL TOOLS" subtitle="Click any card to open the tool">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => {
            const toolRuns = runs.filter((r) => r.tool === t.id).length;
            return (
              <Link
                key={t.id}
                href={`/dashboard/${t.id}`}
                className="group rounded-lg border border-line bg-panel2/40 p-4 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">{t.icon}</span>
                  {toolRuns > 0 ? (
                    <Badge tone="green">{toolRuns} run{toolRuns === 1 ? "" : "s"}</Badge>
                  ) : (
                    <Badge>new</Badge>
                  )}
                </div>
                <h3 className="mt-2.5 text-sm font-semibold text-ink group-hover:text-accent">
                  {t.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-dim">{t.tagline}</p>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">
                  {t.runsIn === "browser" ? "runs in your browser" : "server-assisted"}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
