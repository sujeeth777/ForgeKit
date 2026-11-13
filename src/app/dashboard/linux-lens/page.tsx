"use client";

import { useState } from "react";
import {
  explainCommand, commandsByCategory, CATEGORIES,
  type LensResult, type Category,
} from "@/engines/linux-lens";
import { ReportView } from "@/components/report-view";
import { Button, Card, KVTable, TextInput, ToolHeader, Badge } from "@/components/ui";
import { recordRun } from "@/lib/runs";

export default function LinuxLensPage() {
  const [input, setInput] = useState("chmod 755 script.sh");
  const [result, setResult] = useState<LensResult | null>(null);
  const [category, setCategory] = useState<Category>("filesystem");

  const explain = () => {
    if (!input.trim()) return;
    const out = explainCommand(input);
    setResult(out);
    recordRun("linux-lens", input.trim().slice(0, 60), out.report, new Date().toISOString());
  };

  return (
    <div>
      <ToolHeader
        icon="🐧"
        name="LinuxLens"
        tagline="Explain any Linux command — permission math, real examples, safety notes. Type it or browse the command explorer."
        privacy="EDUCATIONAL · LOCAL"
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Command to explain"
            value={input}
            onChange={setInput}
            placeholder="chmod 755 script.sh · journalctl -u app -f · ss -tulpn"
            onEnter={explain}
            className="min-w-[300px] flex-1"
          />
          <Button onClick={explain}>▶ EXPLAIN</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["chmod 600 id_rsa", "chmod u+x deploy.sh", "ls -la", "tar -czf app.tar.gz ./app", "dig example.com MX", "systemctl status nginx"].map((c) => (
            <button
              key={c}
              onClick={() => { setInput(c); const r = explainCommand(c); setResult(r); }}
              className="rounded border border-line px-2 py-1 font-mono text-[11px] text-dim transition-colors hover:border-accent/50 hover:text-accent"
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      {result && (
        <div className="mb-6">
          {result.modeExplanation && result.modeExplanation.numeric && (
            <Card className="mb-6" title="PERMISSION BREAKDOWN" subtitle={input.trim()}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["OWNER (u)", result.modeExplanation.owner],
                    ["GROUP (g)", result.modeExplanation.group],
                    ["OTHERS (o)", result.modeExplanation.others],
                  ].map(([label, desc]) =>
                    desc ? (
                      <div key={label} className="rounded-lg border border-line bg-panel2/60 p-4">
                        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">{label}</div>
                        <div className="mt-1.5 text-sm text-ink">{desc}</div>
                      </div>
                    ) : null,
                  )}
                </div>
                {result.modeExplanation.special && (
                  <Badge tone="amber">special: {result.modeExplanation.special}</Badge>
                )}
              </div>
            </Card>
          )}
          {result.warning && (
            <div className="mb-6 rounded-md border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-warn">
              ⚠ {result.warning}
            </div>
          )}
          <ReportView report={result.report} />
        </div>
      )}

      <Card title="COMMAND EXPLORER" subtitle={`${CATEGORIES.length} categories · local knowledge base`}>
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                category === c
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-line text-dim hover:border-line2 hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {commandsByCategory(category).map((cmd) => (
            <div key={cmd.name} className="rounded-md border border-line bg-panel2/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm font-bold text-accent">{cmd.name}</span>
                <span className="font-mono text-xs text-info">{cmd.synopsis}</span>
              </div>
              <p className="mt-1 text-[13px] text-dim">{cmd.summary}</p>
              <div className="mt-2 space-y-1">
                {cmd.examples.map((ex, i) => (
                  <div key={i} className="flex flex-wrap gap-2 text-xs">
                    <code className="rounded bg-[#070b10] px-2 py-0.5 font-mono text-accent/90">{ex.cmd}</code>
                    <span className="text-faint">{ex.what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!result && (
        <p className="mt-4 text-center font-mono text-[11px] text-faint">
          Tip: the report below updates for every command you explain — including a safety note when something looks risky.
        </p>
      )}
    </div>
  );
}
