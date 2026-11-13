"use client";

import { useState } from "react";
import { estimateCost, type CostInput, type CostResult, type SiteType } from "@/engines/web-cost";
import { ReportView } from "@/components/report-view";
import {
  Badge, Button, Card, Checkbox, EmptyState, Select, StatCard, TextInput, ToolHeader,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";

const DEFAULT: CostInput = {
  siteType: "ecommerce",
  scale: "medium",
  usersPerMonth: 10_000,
  designQuality: "standard",
  features: {
    auth: true,
    payments: true,
    search: true,
    adminPanel: true,
    realtime: false,
    fileUploads: true,
    notifications: true,
    i18n: false,
  },
};

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function WebCostPage() {
  const [input, setInput] = useState<CostInput>(DEFAULT);
  const [result, setResult] = useState<CostResult | null>(null);

  const setFeature = (key: keyof CostInput["features"], value: boolean) =>
    setInput((prev) => ({ ...prev, features: { ...prev.features, [key]: value } }));

  const run = () => {
    const out = estimateCost(input);
    setResult(out);
    recordRun("web-cost", `${input.siteType} · ${input.scale}`, out.report, new Date().toISOString());
  };

  return (
    <div>
      <ToolHeader
        icon="💰"
        name="WebCost"
        tagline="Estimate development + monthly infrastructure cost. Every number is a clearly-labelled estimate from indicative Nov 2026 Indian-market rates — verify with providers before budgeting."
        privacy="LOCAL · ESTIMATES ONLY"
      />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="WEBSITE TYPE"
            value={input.siteType}
            onChange={(v) => setInput((p) => ({ ...p, siteType: v as SiteType }))}
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
            onChange={(v) => setInput((p) => ({ ...p, scale: v as CostInput["scale"] }))}
            options={[
              { value: "small", label: "Small (MVP)" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
          <Select
            label="DESIGN QUALITY"
            value={input.designQuality}
            onChange={(v) => setInput((p) => ({ ...p, designQuality: v as CostInput["designQuality"] }))}
            options={[
              { value: "standard", label: "Standard" },
              { value: "premium", label: "Premium (custom/motion)" },
            ]}
          />
          <TextInput
            label="USERS / MONTH"
            value={String(input.usersPerMonth)}
            onChange={(v) => setInput((p) => ({ ...p, usersPerMonth: Math.max(0, parseInt(v.replace(/[^0-9]/g, ""), 10) || 0) }))}
          />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">FEATURES</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Checkbox checked={input.features.auth} onChange={(v) => setFeature("auth", v)} label="Authentication" />
            <Checkbox checked={input.features.payments} onChange={(v) => setFeature("payments", v)} label="Payments" />
            <Checkbox checked={input.features.search} onChange={(v) => setFeature("search", v)} label="Search" />
            <Checkbox checked={input.features.adminPanel} onChange={(v) => setFeature("adminPanel", v)} label="Admin panel" />
            <Checkbox checked={input.features.realtime} onChange={(v) => setFeature("realtime", v)} label="Real-time" />
            <Checkbox checked={input.features.fileUploads} onChange={(v) => setFeature("fileUploads", v)} label="File uploads" />
            <Checkbox checked={input.features.notifications} onChange={(v) => setFeature("notifications", v)} label="Notifications" />
            <Checkbox checked={input.features.i18n} onChange={(v) => setFeature("i18n", v)} label="Multi-language" />
          </div>
        </div>

        <div className="mt-5">
          <Button onClick={run}>▶ ESTIMATE</Button>
        </div>
      </Card>

      {result && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="amber">ESTIMATE — not a quote</Badge>
            <span className="font-mono text-[11px] text-faint">indicative rates · Nov 2026 · INR</span>
          </div>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Development (one-time)" value={inr(result.devTotal)} hint="build + design + QA + devops" accent />
            <StatCard
              label="Infrastructure (monthly)"
              value={`${inr(result.infraMonthlyLow)}–${inr(result.infraMonthlyHigh)}`}
              hint={`${input.usersPerMonth.toLocaleString()} users/mo tier`}
            />
            <StatCard
              label="Year-1 total"
              value={inr(result.devTotal + result.infraMonthlyLow * 12)}
              hint={`up to ${inr(result.devTotal + result.infraMonthlyHigh * 12)}`}
            />
          </div>
          <ReportView report={result.report} />
        </>
      )}

      {!result && (
        <EmptyState
          icon="💰"
          text="Configure a project and estimate. Output includes a development breakdown (frontend/backend/UI/QA/devops), monthly infrastructure range scaled by traffic, cost-reduction levers and explicit assumptions."
        />
      )}
    </div>
  );
}
