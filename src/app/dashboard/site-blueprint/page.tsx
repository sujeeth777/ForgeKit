"use client";

import { useState } from "react";
import {
  buildBlueprint, type BlueprintInput, type BlueprintResult, type BlueprintType,
} from "@/engines/site-blueprint";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, Checkbox, EmptyState, Select, TextInput, ToolHeader,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";

const DEFAULT: BlueprintInput = {
  siteType: "ecommerce",
  scale: "small",
  usersPerMonth: 10_000,
  payments: true,
  auth: true,
  search: true,
  adminPanel: true,
  notifications: false,
  realtime: false,
};

export default function SiteBlueprintPage() {
  const [input, setInput] = useState<BlueprintInput>(DEFAULT);
  const [result, setResult] = useState<BlueprintResult | null>(null);

  const run = () => {
    const out = buildBlueprint(input);
    setResult(out);
    recordRun("site-blueprint", `${input.siteType} · ${input.scale}`, out.report, new Date().toISOString());
  };

  return (
    <div>
      <ToolHeader
        icon="📐"
        name="SiteBlueprint"
        tagline="Website type + scale → pages, features, recommended stack, infrastructure sketch and build milestones. Pair it with WebCost for money and ArchMap for the diagram."
        privacy="LOCAL"
      />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="WEBSITE TYPE"
            value={input.siteType}
            onChange={(v) => setInput((p) => ({ ...p, siteType: v as BlueprintType }))}
            options={[
              { value: "landing", label: "Landing page" },
              { value: "blog", label: "Blog / content" },
              { value: "portfolio", label: "Portfolio" },
              { value: "ecommerce", label: "E-commerce" },
              { value: "saas", label: "SaaS product" },
              { value: "dashboard", label: "Internal dashboard" },
              { value: "marketplace", label: "Marketplace" },
              { value: "social", label: "Social platform" },
            ]}
          />
          <Select
            label="SCALE"
            value={input.scale}
            onChange={(v) => setInput((p) => ({ ...p, scale: v as BlueprintInput["scale"] }))}
            options={[
              { value: "small", label: "Small (MVP)" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
          <TextInput
            label="USERS / MONTH"
            value={String(input.usersPerMonth)}
            onChange={(v) => setInput((p) => ({ ...p, usersPerMonth: Math.max(0, parseInt(v.replace(/[^0-9]/g, ""), 10) || 0) }))}
          />
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">REQUIREMENTS</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Checkbox checked={input.auth} onChange={(v) => setInput((p) => ({ ...p, auth: v }))} label="Accounts / auth" />
            <Checkbox checked={input.payments} onChange={(v) => setInput((p) => ({ ...p, payments: v }))} label="Payments" />
            <Checkbox checked={input.search} onChange={(v) => setInput((p) => ({ ...p, search: v }))} label="Search" />
            <Checkbox checked={input.adminPanel} onChange={(v) => setInput((p) => ({ ...p, adminPanel: v }))} label="Admin panel" />
            <Checkbox checked={input.notifications} onChange={(v) => setInput((p) => ({ ...p, notifications: v }))} label="Notifications" />
            <Checkbox checked={input.realtime} onChange={(v) => setInput((p) => ({ ...p, realtime: v }))} label="Real-time" />
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={run}>▶ GENERATE BLUEPRINT</Button>
        </div>
      </Card>

      {result ? (
        <>
          <Card className="mb-6" title="PAGE MAP" subtitle={`${result.pages.length} pages`}>
            <pre className="overflow-x-auto rounded-md border border-line bg-[#070b10] p-4 font-mono text-xs leading-relaxed text-dim">
{`PAGES
├── ` + result.pages.slice(0, -1).map((p) => p.name).join("\n├── ") + (result.pages.length > 1 ? "\n└── " : "") + (result.pages.at(-1)?.name ?? "") + "\n\nFEATURES\n" + result.features.map((f) => `├── ${f}`).join("\n")}
            </pre>
          </Card>
          <Card className="mb-6" title="STACK" subtitle="with the reasoning, so you can argue with it">
            <div className="space-y-2">
              {result.stack.map((s) => (
                <div key={s.layer} className="rounded-md border border-line bg-panel2/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-faint">{s.layer}</span>
                    <span className="font-mono text-sm text-accent">{s.choice}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-dim">{s.why}</p>
                </div>
              ))}
            </div>
          </Card>
          <ReportView report={result.report} />
        </>
      ) : (
        <EmptyState
          icon="📐"
          text="Pick a website type and scale to generate a complete blueprint: page map, feature list, a reasoned stack, infrastructure sketch and phased milestones you can start executing this week."
        />
      )}
    </div>
  );
}
