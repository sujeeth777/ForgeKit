"use client";

import { useState } from "react";
import {
  buildArchitecture, ARCH_OPTIONS,
  type ArchInput, type ArchOutput,
} from "@/engines/arch-map";
import { ReportView } from "@/components/report-view";
import { Button, Card, EmptyState, Select, TextInput, ToolHeader, Badge } from "@/components/ui";
import { recordRun } from "@/lib/runs";
import { copyText, downloadText } from "@/lib/utils";

const DEFAULT: ArchInput = {
  edge: "CDN (Cloudflare)",
  frontend: "Next.js",
  backend: "FastAPI",
  database: "PostgreSQL",
  cache: "Redis",
  storage: "S3",
  queue: "None",
  auth: "Supabase Auth",
  extras: [],
};

/** Layered SVG preview built from the ArchModel. */
function ArchSvg({ output }: { output: ArchOutput }) {
  const layers = output.model.layers;
  const nodeW = 150;
  const nodeH = 40;
  const gapX = 24;
  const width = Math.max(640, layers.length > 0 ? Math.max(...layers.map((l) => l.nodes.length)) * (nodeW + gapX) + gapX : 640);
  const rowH = 74;
  const height = layers.length * rowH + 24;

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-[#070b10] p-4">
      <svg width={width} height={height} className="mx-auto block">
        {layers.map((layer, li) => {
          const count = layer.nodes.length;
          const rowWidth = count * nodeW + (count - 1) * gapX;
          const startX = (width - rowWidth) / 2;
          const y = 12 + li * rowH;
          return (
            <g key={li}>
              {layer.nodes.map((node, ni) => {
                const x = startX + ni * (nodeW + gapX);
                return (
                  <g key={node.id}>
                    <rect
                      x={x}
                      y={y}
                      width={nodeW}
                      height={nodeH}
                      rx={8}
                      fill={li === 0 ? "#13202b" : "#0f1a24"}
                      stroke="#34d399"
                      strokeOpacity={li === 0 ? 0.5 : 0.85}
                      strokeWidth={1.5}
                    />
                    <text
                      x={x + nodeW / 2}
                      y={y + nodeH / 2 + 4}
                      textAnchor="middle"
                      fill="#e6edf3"
                      fontSize="12"
                      fontFamily="ui-monospace, monospace"
                    >
                      {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
                    </text>
                    {li > 0 && (
                      <line
                        x1={x + nodeW / 2}
                        y1={y - rowH + nodeH + 8}
                        x2={x + nodeW / 2}
                        y2={y}
                        stroke="#2b3b52"
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              })}
              {li < layers.length - 1 && (
                <line
                  x1={width / 2}
                  y1={y + nodeH}
                  x2={width / 2}
                  y2={y + rowH - 8}
                  stroke="#2b3b52"
                  strokeWidth={1.5}
                />
              )}
              <text x={8} y={y + nodeH / 2 + 4} fill="#5d6b7d" fontSize="9" fontFamily="ui-monospace, monospace">
                {layer.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ArchMapPage() {
  const [input, setInput] = useState<ArchInput>(DEFAULT);
  const [output, setOutput] = useState<ArchOutput | null>(null);
  const [extraText, setExtraText] = useState("");
  const [copied, setCopied] = useState(false);

  const set = (key: keyof ArchInput, value: string | null) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const run = () => {
    const extras = extraText.split(",").map((s) => s.trim()).filter(Boolean);
    const out = buildArchitecture({ ...input, extras });
    setOutput(out);
    recordRun(
      "arch-map",
      `${out.model.layers.length} layers · ${[input.frontend, input.backend, input.database].filter(Boolean).join("/")}`,
      out.report,
      new Date().toISOString(),
    );
  };

  return (
    <div>
      <ToolHeader
        icon="🏗"
        name="ArchMap"
        tagline="Pick your stack layers → get a layered architecture diagram with SVG preview, Mermaid, ASCII, JSON and Markdown exports."
        privacy="LOCAL"
      />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(ARCH_OPTIONS) as Array<keyof typeof ARCH_OPTIONS>).map((key) => (
            <Select
              key={key}
              label={key.toUpperCase()}
              value={(input[key] as string) ?? "None"}
              onChange={(v) => set(key, v)}
              options={ARCH_OPTIONS[key].map((o) => ({ value: o, label: o }))}
            />
          ))}
        </div>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <TextInput
            label="EXTRA COMPONENTS (comma-separated)"
            value={extraText}
            onChange={setExtraText}
            placeholder="Elasticsearch, Temporal, Grafana…"
            onEnter={run}
          />
          <Button onClick={run}>▶ BUILD DIAGRAM</Button>
        </div>
      </Card>

      {output ? (
        <>
          <Card className="mb-6" title="DIAGRAM PREVIEW" subtitle="layered SVG — exports below">
            <ArchSvg output={output} />
          </Card>

          <Card className="mb-6" title="EXPORTS" subtitle="Mermaid renders natively on GitHub; JSON feeds the Phase-5 plugin API">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="blue">mermaid</Badge>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={async () => { if (await copyText(output.mermaid)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
                      {copied ? "✓ COPIED" : "COPY"}
                    </Button>
                    <Button variant="ghost" onClick={() => downloadText("architecture.mmd", output.mermaid)}>
                      ⬇ .mmd
                    </Button>
                  </div>
                </div>
                <pre className="max-h-56 overflow-auto rounded-md border border-line bg-[#070b10] p-3 font-mono text-[11px] leading-relaxed text-dim">
                  {output.mermaid}
                </pre>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="blue">ascii</Badge>
                  <Button variant="ghost" onClick={() => downloadText("architecture.md", output.markdown, "text/markdown")}>
                    ⬇ .md
                  </Button>
                </div>
                <pre className="max-h-56 overflow-auto rounded-md border border-line bg-[#070b10] p-3 font-mono text-[11px] leading-relaxed text-dim">
                  {output.ascii}
                </pre>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadText("architecture.json", output.json, "application/json")}>
                ⬇ JSON MODEL
              </Button>
              <Button variant="outline" onClick={() => downloadText("architecture.md", output.markdown, "text/markdown")}>
                ⬇ MARKDOWN DOC
              </Button>
              <Button variant="outline" onClick={() => downloadText("architecture.mmd", output.mermaid)}>
                ⬇ MERMAID
              </Button>
            </div>
          </Card>

          <ReportView report={output.report} />
        </>
      ) : (
        <EmptyState
          icon="🏗"
          text="Choose your stack above (defaults are a classic Next.js + FastAPI + PostgreSQL setup) and build. You get a diagram plus sanity notes — e.g. when auth or persistence is missing."
        />
      )}
    </div>
  );
}
