"use client";

import { useState } from "react";
import { buildAttackGraph, type AttackGraphResult } from "@/engines/attack-graph";
import { ReportView } from "@/components/report-view";
import { Button, Card, EmptyState, Spinner, TextArea, ToolHeader, Badge } from "@/components/ui";
import { recordRun } from "@/lib/runs";

const SAMPLE = `Internet -> CDN -> Web app -> Auth -> Database
Internet -> CDN -> Web app -> Queue -> Worker -> Database
Internet -> CDN -> Admin panel`;

export default function AttackGraphPage() {
  const [text, setText] = useState(SAMPLE);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AttackGraphResult | null>(null);

  const run = () => {
    if (!text.trim()) return;
    setRunning(true);
    const startedAt = new Date().toISOString();
    setTimeout(() => {
      const out = buildAttackGraph(text);
      setResult(out);
      setRunning(false);
      recordRun("attack-graph", `${out.graph.nodes.length} components`, out.report, startedAt);
    }, 30);
  };

  return (
    <div>
      <ToolHeader
        icon="🕸"
        name="AttackGraph"
        tagline="Map YOUR system's attack surface: draw the flow, get defensive controls per component and MITRE ATT&CK notes for defensive planning. Defensive only — no exploits."
        privacy="DEFENSIVE MAPPING"
      />

      <Card className="mb-6">
        <TextArea
          value={text}
          onChange={setText}
          rows={6}
          label="Attack paths — one flow per line, arrows between components"
          placeholder={"Internet -> Web app -> Auth -> Database\nInternet -> CDN -> Web app -> Queue -> Worker -> Database"}
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={running || !text.trim()}>
            ▶ MAP SURFACE
          </Button>
          <span className="font-mono text-[11px] text-faint">
            describe how traffic reaches your data — the tool finds the gaps
          </span>
        </div>
        {running && <div className="mt-4"><Spinner /></div>}
      </Card>

      {result && (
        <>
          <Card className="mb-6" title="FLOW MAP" subtitle="your described attack surface">
            <pre className="overflow-x-auto rounded-md border border-line bg-[#070b10] p-4 font-mono text-xs leading-loose text-dim">
              {result.ascii || "(no paths parsed)"}
            </pre>
          </Card>

          <Card className="mb-6" title="DEFENSIVE CONTROLS PER COMPONENT" subtitle="prioritized hardening checklist">
            <div className="space-y-3">
              {result.nodeControls.map((nc) => (
                <div key={nc.label} className="rounded-md border border-line bg-panel2/50 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-accent">{nc.label}</span>
                    <Badge tone="blue">{nc.mitre}</Badge>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {nc.controls.map((c) => (
                      <li key={c} className="text-[13px] text-dim">✓ {c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <ReportView report={result.report} />
        </>
      )}

      {!result && !running && (
        <EmptyState
          icon="🕸"
          text="Describe your system's flows (Internet -> App -> Auth -> Database) and map the attack surface. Findings flag dangerous paths like direct Internet→Database access or missing edge protection — with the controls that fix them."
        />
      )}
    </div>
  );
}
