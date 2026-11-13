import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * SiteBlueprint — website type + scale → pages, features, stack blueprint.
 */

export type BlueprintType = "landing" | "blog" | "portfolio" | "ecommerce" | "saas" | "dashboard" | "marketplace" | "social";
export type BlueprintScale = "small" | "medium" | "large";

export interface BlueprintInput {
  siteType: BlueprintType;
  scale: BlueprintScale;
  usersPerMonth: number;
  payments: boolean;
  auth: boolean;
  search: boolean;
  adminPanel: boolean;
  notifications: boolean;
  realtime: boolean;
}

export interface BlueprintResult {
  report: Report;
  pages: Array<{ name: string; purpose: string }>;
  features: string[];
  stack: Array<{ layer: string; choice: string; why: string }>;
  infra: string[];
  milestones: Array<{ name: string; scope: string }>;
}

const TYPE_KB: Record<BlueprintType, {
  label: string;
  pages: Array<[string, string]>;
  features: string[];
  milestones: Array<[string, string]>;
}> = {
  landing: {
    label: "Landing page",
    pages: [["Home", "hero, value prop, CTA"], ["Features", "what you offer"], ["Contact", "form + details"], ["Legal", "privacy, terms"]],
    features: ["SEO meta + sitemap", "Analytics", "Fast LCP (<2.5s)"],
    milestones: [["Week 1", "copy + design direction"], ["Week 2", "build + SEO"], ["Week 3", "launch + analytics"]],
  },
  blog: {
    label: "Blog / content site",
    pages: [["Home", "post list + intro"], ["Post", "article view with TOC"], ["Tags", "browse by topic"], ["About", "who writes this"], ["RSS", "feed endpoint"]],
    features: ["Markdown/MDX authoring", "Syntax highlighting", "SEO + OpenGraph images", "Comments (optional)"],
    milestones: [["Week 1", "content pipeline (MDX)"], ["Week 2", "templates + SEO"], ["Week 3", "RSS, analytics, launch"]],
  },
  portfolio: {
    label: "Portfolio",
    pages: [["Home", "positioning + highlights"], ["Projects", "case-study list"], ["Project detail", "deep dive per project"], ["About", "bio + skills"], ["Contact", "email/socials"]],
    features: ["Image optimization", "Case-study template", "SEO + OG cards"],
    milestones: [["Week 1", "pick 3 best projects"], ["Week 2", "case-study pages"], ["Week 3", "polish + deploy"]],
  },
  ecommerce: {
    label: "E-commerce",
    pages: [["Home", "catalog highlights"], ["Products", "listing + filters"], ["Product", "detail, variants, reviews"], ["Cart", "session cart"], ["Checkout", "address + payment"], ["Order confirmation", "receipt + status"], ["Account", "order history, addresses"], ["Admin", "products, orders, inventory"]],
    features: ["Authentication", "Payments (Razorpay/Stripe)", "Inventory tracking", "Search + filters", "Email notifications", "Admin panel"],
    milestones: [["Phase 1", "catalog + product pages"], ["Phase 2", "cart + checkout + payments"], ["Phase 3", "accounts + order history"], ["Phase 4", "admin + inventory + emails"]],
  },
  saas: {
    label: "SaaS product",
    pages: [["Marketing home", "pitch + pricing"], ["Pricing", "plans + FAQ"], ["Docs", "how to use it"], ["Sign up / Log in", "auth flows"], ["Dashboard", "the product itself"], ["Settings", "profile, team, billing"], ["Admin", "internal management"]],
    features: ["Authentication + MFA", "Subscription billing", "Usage metering", "Team/organization support", "Role-based access", "API + webhooks", "Email notifications"],
    milestones: [["Phase 1", "auth + core product loop"], ["Phase 2", "billing + plans"], ["Phase 3", "teams + roles"], ["Phase 4", "docs, onboarding, analytics"]],
  },
  dashboard: {
    label: "Internal dashboard",
    pages: [["Login", "SSO/credentials"], ["Overview", "KPIs at a glance"], ["Reports", "drill-down views"], ["Settings", "preferences"], ["Admin", "user + data management"]],
    features: ["Authentication (SSO if possible)", "Role-based visibility", "Data export (CSV)", "Audit log"],
    milestones: [["Phase 1", "auth + data connection"], ["Phase 2", "core KPI views"], ["Phase 3", "exports + audit"]],
  },
  marketplace: {
    label: "Marketplace",
    pages: [["Home", "featured listings"], ["Search", "browse + filters"], ["Listing", "item detail"], ["Seller", "seller profile"], ["Dashboard", "buyer + seller views"], ["Checkout", "payments + escrow"], ["Admin", "moderation, disputes, payouts"]],
    features: ["Two-sided authentication", "Payments + payouts", "Reviews & trust system", "Search + discovery", "Moderation tools", "Notifications"],
    milestones: [["Phase 1", "listings + search"], ["Phase 2", "auth + messaging"], ["Phase 3", "payments + payouts"], ["Phase 4", "moderation + trust"]],
  },
  social: {
    label: "Social platform",
    pages: [["Feed", "home timeline"], ["Profile", "user page"], ["Post", "single post view"], ["Notifications", "activity"], ["Explore", "discover content"], ["Settings", "privacy, account"]],
    features: ["Authentication", "Follow/graph model", "Realtime feed updates", "Media uploads + moderation", "Push/email notifications", "Content moderation pipeline"],
    milestones: [["Phase 1", "auth + posting + feed"], ["Phase 2", "follows + notifications"], ["Phase 3", "media + moderation"], ["Phase 4", "realtime + scaling"]],
  },
};

let counter = 0;
function nid(): string {
  counter += 1;
  return `sb-${counter}`;
}

export function buildBlueprint(input: BlueprintInput): BlueprintResult {
  counter = 0;
  const kb = TYPE_KB[input.siteType];
  const scaleFactor = input.scale === "large" ? 3 : input.scale === "medium" ? 2 : 1;

  const pages = kb.pages.map(([name, purpose]) => ({ name, purpose }));
  const features = [...kb.features];
  if (input.auth && !features.includes("Authentication")) features.unshift("Authentication");
  if (input.payments && !features.includes("Payments")) features.push("Payments (Razorpay/Stripe)");
  if (input.search && !features.includes("Search")) features.push("Search");
  if (input.adminPanel && !pages.some((p) => p.name === "Admin")) pages.push({ name: "Admin", purpose: "internal management" });
  if (input.notifications) features.push("Notifications (email/push)");
  if (input.realtime) features.push("Real-time updates (WebSocket/SSE)");

  const traffic = input.usersPerMonth;
  const heavy = traffic > 50_000 || input.scale === "large";

  const stack: BlueprintResult["stack"] = [];
  stack.push({
    layer: "Frontend",
    choice: heavy ? "Next.js" : input.realtime ? "Next.js" : "Next.js or Astro",
    why: heavy ? "SSR/ISR + image optimization at scale" : "App Router handles content + app pages well",
  });
  stack.push({
    layer: "Backend",
    choice: input.realtime ? "Node.js (Socket.io/WS) + API routes" : input.siteType === "saas" ? "Node.js or FastAPI" : "API routes / serverless",
    why: input.realtime ? "persistent connections need a long-lived server" : "start serverless, graduate to a service under load",
  });
  stack.push({
    layer: "Database",
    choice: heavy ? "PostgreSQL (managed)" : "PostgreSQL (Supabase/Neon free tier)",
    why: "relational core with room to grow",
  });
  if (input.search) stack.push({ layer: "Search", choice: heavy ? "Meilisearch/Typesense" : "Postgres full-text", why: "dedicated engine only when volume justifies it" });
  if (heavy || input.realtime) stack.push({ layer: "Cache/Queue", choice: "Redis", why: "sessions, rate limiting, background jobs" });
  if (input.payments) stack.push({ layer: "Payments", choice: "Razorpay (India) / Stripe (global)", why: "hosted checkout = never touch raw card data" });
  stack.push({ layer: "Storage", choice: "Object storage (S3/R2) + CDN", why: "media off the app server" });
  stack.push({ layer: "Hosting", choice: heavy ? "Container platform (Railway/Fly.io) + CDN" : "Vercel/Railway", why: heavy ? "long-running processes + predictable cost at scale" : "free tiers + instant CI/CD" });

  const infra: string[] = [
    `Domain + TLS (automatic on Vercel/Railway)`,
    `Managed database with automated backups`,
    heavy ? "Redis for sessions/cache/queues" : "Redis optional — start without it",
    `Object storage + CDN for media`,
    input.notifications ? "Transactional email (Resend/SES)" : "Email deferred until needed",
    "Monitoring: uptime ping + error tracking (Sentry free tier)",
    "Logs: platform logs → export when volume grows",
  ];

  const milestones = kb.milestones.map(([name, scope]) => ({ name, scope }));

  const findings: Array<import("@/lib/types").Finding> = [];
  if (input.payments && !input.auth) {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "Payments selected without authentication",
      detail: "Payments need accounts (receipts, refunds, disputes). Add auth or commit to a strict guest-checkout design.",
    });
  }
  if (input.siteType === "social" && !input.realtime) {
    findings.push({
      id: nid(),
      severity: "info",
      title: "Social type without real-time updates",
      detail: "Polling works for an MVP; add WebSockets/SSE when the feed feels stale.",
    });
  }
  if (traffic > 100_000 && input.scale === "small") {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "Scale mismatch",
      detail: `${traffic.toLocaleString()} users/mo on a ${input.scale} build — plan caching, CDN and a queue from day one.`,
    });
  }

  const report: Report = {
    tool: "site-blueprint",
    toolLabel: getTool("site-blueprint").name,
    title: "ForgeKit SiteBlueprint",
    generatedAt: new Date().toISOString(),
    summary: `${kb.label} blueprint at ${input.scale} scale (${traffic.toLocaleString()} users/mo): ${pages.length} pages, ${features.length} features, ${stack.length}-layer stack, ${milestones.length} milestones.`,
    findings,
    sections: [
      { heading: "PAGES", rows: pages.map((p) => [p.name, p.purpose]) },
      { heading: "FEATURES", body: features.map((f) => `✓ ${f}`).join("\n") },
      { heading: "STACK", rows: stack.map((s) => [`${s.layer}: ${s.choice}`, s.why]) },
      { heading: "INFRASTRUCTURE", body: infra.map((i) => `- ${i}`).join("\n") },
      { heading: "MILESTONES", rows: milestones.map((m) => [m.name, m.scope]) },
      {
        heading: "How to use this",
        body: "This is a starting blueprint, not a contract — cut anything you can. Pair it with WebCost for a budget and ArchMap for the diagram.",
      },
    ],
    meta: { Type: kb.label, Scale: input.scale, "Users / month": traffic.toLocaleString() },
  };

  return { report, pages, features, stack, infra, milestones };
}
