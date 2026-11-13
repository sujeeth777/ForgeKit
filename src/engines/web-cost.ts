import type { Report, Finding } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * WebCost — website development + infrastructure cost estimator.
 * ALL outputs are clearly-labelled estimates based on indicative rates
 * (snapshot: Nov 2026, Indian market rates in INR). Verify with providers.
 */

export type SiteType = "landing" | "blog" | "portfolio" | "ecommerce" | "saas" | "dashboard" | "marketplace" | "social";
export type Scale = "small" | "medium" | "large";
export type DesignQuality = "standard" | "premium";

export interface CostInput {
  siteType: SiteType;
  scale: Scale;
  usersPerMonth: number;
  designQuality: DesignQuality;
  features: {
    auth: boolean;
    payments: boolean;
    search: boolean;
    adminPanel: boolean;
    realtime: boolean;
    fileUploads: boolean;
    notifications: boolean;
    i18n: boolean;
  };
}

export interface CostBreakdownRow {
  item: string;
  amount: number;
  note: string;
}

export interface CostResult {
  report: Report;
  devTotal: number;
  infraMonthlyLow: number;
  infraMonthlyHigh: number;
  devRows: CostBreakdownRow[];
  infraRows: Array<{ item: string; low: number; high: number; note: string }>;
}

const SITE_TYPE_META: Record<SiteType, { label: string; basePages: number; baseCost: number }> = {
  landing: { label: "Landing page", basePages: 3, baseCost: 30_000 },
  blog: { label: "Blog / content site", basePages: 6, baseCost: 55_000 },
  portfolio: { label: "Portfolio", basePages: 5, baseCost: 35_000 },
  ecommerce: { label: "E-commerce", basePages: 12, baseCost: 180_000 },
  saas: { label: "SaaS product", basePages: 14, baseCost: 260_000 },
  dashboard: { label: "Internal dashboard", basePages: 8, baseCost: 120_000 },
  marketplace: { label: "Marketplace", basePages: 16, baseCost: 320_000 },
  social: { label: "Social platform", basePages: 15, baseCost: 300_000 },
};

const SCALE_MULTIPLIER: Record<Scale, number> = { small: 1, medium: 1.6, large: 2.6 };
const DESIGN_MULTIPLIER: Record<DesignQuality, number> = { standard: 1, premium: 1.8 };

const FEATURE_COSTS: Array<{ key: keyof CostInput["features"]; label: string; cost: number }> = [
  { key: "auth", label: "Authentication & accounts", cost: 45_000 },
  { key: "payments", label: "Payments integration", cost: 65_000 },
  { key: "search", label: "Search", cost: 50_000 },
  { key: "adminPanel", label: "Admin panel", cost: 85_000 },
  { key: "realtime", label: "Real-time features", cost: 75_000 },
  { key: "fileUploads", label: "File uploads & media", cost: 25_000 },
  { key: "notifications", label: "Notifications (email/push)", cost: 30_000 },
  { key: "i18n", label: "Internationalization", cost: 40_000 },
];

function infRAmount(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function infraTier(usersPerMonth: number): number {
  if (usersPerMonth <= 5_000) return 0.6;
  if (usersPerMonth <= 25_000) return 1;
  if (usersPerMonth <= 100_000) return 1.8;
  if (usersPerMonth <= 500_000) return 3.2;
  return 5.5;
}

let counter = 0;
function nid(): string {
  counter += 1;
  return `wc-${counter}`;
}

export function estimateCost(input: CostInput): CostResult {
  counter = 0;
  const meta = SITE_TYPE_META[input.siteType];
  const pages = Math.max(meta.basePages, Math.round(meta.basePages * SCALE_MULTIPLIER[input.scale]));

  const scaleMultiplier = SCALE_MULTIPLIER[input.scale];
  const designMultiplier = DESIGN_MULTIPLIER[input.designQuality];

  const baseDev = meta.baseCost * scaleMultiplier * designMultiplier;

  const selectedFeatures = FEATURE_COSTS.filter((f) => input.features[f.key]);
  const featureTotal = selectedFeatures.reduce((a, f) => a + f.cost * (input.scale === "large" ? 1.4 : 1), 0);

  const subtotal = baseDev + featureTotal;
  const uiUx = Math.round(subtotal * 0.15);
  const testing = Math.round(subtotal * 0.12);
  const devops = Math.round(subtotal * 0.08);
  const contingency = Math.round(subtotal * 0.1);
  const devTotal = subtotal + uiUx + testing + devops + contingency;

  const devRows: CostBreakdownRow[] = [
    { item: `Core build (${meta.label}, ${pages} pages, ${input.scale} scale)`, amount: Math.round(baseDev), note: `design quality: ${input.designQuality}` },
    ...selectedFeatures.map((f) => ({
      item: f.label,
      amount: Math.round(f.cost * (input.scale === "large" ? 1.4 : 1)),
      note: "feature add-on",
    })),
    { item: "UI/UX design & polish", amount: uiUx, note: "15% of build" },
    { item: "Testing & QA", amount: testing, note: "12% of build" },
    { item: "DevOps & deployment setup", amount: devops, note: "8% of build" },
    { item: "Contingency", amount: contingency, note: "10% — scope always grows" },
  ];

  const tier = infraTier(input.usersPerMonth);
  const infraRows = [
    { item: "Hosting (app)", low: Math.round(300 * tier), high: Math.round(2_500 * tier), note: "Vercel/Railway/Render tier + overages" },
    { item: "Database", low: Math.round(0 * tier + 350), high: Math.round(2_000 * tier), note: "managed Postgres (Supabase/Neon/RDS)" },
    { item: "Object storage + CDN", low: Math.round(50 * tier), high: Math.round(900 * tier), note: "images/assets" },
    { item: "Email", low: input.features.notifications ? 500 : 0, high: input.features.notifications ? 1_500 * tier : 0, note: "transactional email (Resend/SES)" },
    { item: "Monitoring & logs", low: 0, high: Math.round(800 * tier), note: "free tiers cover small sites" },
    { item: "Backups", low: 100, high: Math.round(500 * tier), note: "managed DB backups" },
    { item: "Secrets / misc", low: 0, high: 400, note: "domains, misc services" },
  ].filter((r) => r.high > 0 || r.low > 0);

  const infraMonthlyLow = infraRows.reduce((a, r) => a + r.low, 0);
  const infraMonthlyHigh = infraRows.reduce((a, r) => a + r.high, 0);

  const findings: Finding[] = [];
  if (input.features.payments && !input.features.auth) {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "Payments without authentication",
      detail: "Payments need accounts to attach transactions to — add auth or use guest checkout explicitly.",
    });
  }
  if (input.usersPerMonth > 100_000 && input.scale === "small") {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "Traffic/size mismatch",
      detail: "You projected high traffic with a small build. Small builds rarely survive 100k monthly users without caching, queues and load testing.",
    });
  }
  if (input.siteType === "marketplace" && !input.features.payments) {
    findings.push({
      id: nid(),
      severity: "low",
      title: "Marketplace without payments",
      detail: "Marketplaces usually need payments (and escrow/payouts). Double-check the feature list.",
    });
  }
  if (input.designQuality === "premium") {
    findings.push({
      id: nid(),
      severity: "info",
      title: "Premium design selected",
      detail: "Custom illustration, motion and brand work dominate timelines. Budget most of the schedule for design iterations.",
    });
  }

  const report: Report = {
    tool: "web-cost",
    toolLabel: getTool("web-cost").name,
    title: "ForgeKit WebCost Estimate",
    generatedAt: new Date().toISOString(),
    summary:
      `ESTIMATE — ${meta.label} at ${input.scale} scale (${input.usersPerMonth.toLocaleString()} users/mo): ` +
      `development ${infRAmount(devTotal)} one-time, infrastructure ${infRAmount(infraMonthlyLow)}–${infRAmount(infraMonthlyHigh)}/month. ` +
      "These are planning figures from indicative Nov 2026 Indian-market rates, not quotes.",
    findings,
    sections: [
      {
        heading: "ESTIMATED DEVELOPMENT (one-time)",
        rows: devRows.map((r) => [r.item, `${infRAmount(r.amount)}  (${r.note})`] as [string, string]).concat([["TOTAL", infRAmount(devTotal)]]),
      },
      {
        heading: "ESTIMATED MONTHLY INFRASTRUCTURE",
        rows: infraRows
          .map((r) => [r.item, `${infRAmount(r.low)} – ${infRAmount(r.high)}/mo  (${r.note})`] as [string, string])
          .concat([["TOTAL", `${infRAmount(infraMonthlyLow)} – ${infRAmount(infraMonthlyHigh)}/mo`]]),
      },
      {
        heading: "Assumptions & disclaimers",
        body:
          "- Indicative rates snapshot: Nov 2026, Indian market (INR), agency/freelancer blend.\n" +
          "- Assumes one iteration cycle per feature; enterprise SLAs, compliance (PCI audits), custom ML and native mobile apps are NOT included.\n" +
          "- Infrastructure assumes managed providers, not reserved bare metal.\n" +
          "- Always verify current provider pricing (Razorpay, Vercel, Supabase, AWS…) before budgeting — pricing changes frequently.\n" +
          "- Label every number you share from this report as an ESTIMATE.",
      },
      {
        heading: "Cost-reduction levers",
        body:
          "- Ship v1 with fewer features (auth + core flow), add payments/admin later.\n" +
          "- Use managed platforms early — they cost more per month but dramatically less eng time.\n" +
          "- Standard design + a strong template beats premium design + a rushed build.\n" +
          "- Cache aggressively; most early infra cost is bandwidth and DB egress.",
      },
    ],
    meta: {
      "Site type": meta.label,
      Scale: input.scale,
      "Users / month": input.usersPerMonth.toLocaleString(),
      "Estimate basis": "indicative rates, Nov 2026 (INR)",
    },
  };

  return { report, devTotal, infraMonthlyLow, infraMonthlyHigh, devRows, infraRows };
}
