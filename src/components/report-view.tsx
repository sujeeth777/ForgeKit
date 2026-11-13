"use client";

import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";
import { reportToMarkdown, reportToJSON, reportFilename } from "@/engines/report";
import { Badge, Button, Card, KVTable, ScoreBar, SeverityBadge, CodeBlock } from "@/components/ui";
import { copyText, downloadText, formatNumber } from "@/lib/utils";
import { useState } from "react";

/** The standardized ForgeKit report — rendered for every tool. */
export function ReportView({ report }: { report: Report }) {
  const [copied, setCopied] = useState(false);
  const tool = getTool(report.tool);

  const exportMd = () =>
    downloadText(reportFilename(report, "md"), reportToMarkdown(report), "text/markdown");
  const exportJson = () =>
    downloadText(reportFilename(report, "json"), reportToJSON(report), "application/json");
  const copyMd = async () => {
    if (await copyText(reportToMarkdown(report))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <Card
      title={`FORGEKIT REPORT — ${report.toolLabel.toUpperCase()}`}
      subtitle={new Date(report.generatedAt).toLocaleString()}
      right={
        <div className="flex gap-2 no-print">
          <Button variant="outline" onClick={exportMd}>
            ⬇ MD
          </Button>
          <Button variant="outline" onClick={exportJson}>
            ⬇ JSON
          </Button>
          <Button variant="outline" onClick={copyMd}>
            {copied ? "✓ COPIED" : "COPY"}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            PRINT/PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {report.score !== undefined && <ScoreBar score={report.score} />}

        <p className="text-sm leading-relaxed text-dim">{report.summary}</p>

        {report.findings.length > 0 && (
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
              Findings ({formatNumber(report.findings.length)})
            </h3>
            <div className="space-y-2">
              {report.findings.map((f) => (
                <div
                  key={f.id}
                  className="rounded-md border border-line bg-panel2/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-sm font-medium text-ink">{f.title}</span>
                    {f.location && (
                      <span className="font-mono text-[11px] text-info">{f.location}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{f.detail}</p>
                  {f.meta && Object.keys(f.meta).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(f.meta).map(([k, v]) => (
                        <Badge key={k}>
                          {k}: {String(v)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {report.findings.length === 0 && (
          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5">
            <span className="font-mono text-xs text-accent">✓ NO FINDINGS</span>
          </div>
        )}

        {report.sections.map((s, i) => (
          <div key={i}>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
              {s.heading}
            </h3>
            {s.body && (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-dim">
                {s.body}
              </pre>
            )}
            {s.rows && s.rows.length > 0 && <KVTable rows={s.rows} />}
            {s.code && <CodeBlock code={s.code} />}
          </div>
        ))}

        <div className="border-t border-line pt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          ForgeKit v0.1 · {tool.runsIn === "browser" ? "processed locally — data never left your browser" : "server-assisted scan"}
        </div>
      </div>
    </Card>
  );
}
