import { describe, it, expect } from "vitest";
import { buildArchitecture } from "@/engines/arch-map";
import { buildBlueprint } from "@/engines/site-blueprint";
import { estimateCost } from "@/engines/web-cost";
import { buildAttackGraph } from "@/engines/attack-graph";
import { analyzeJwt, analyzePassword, buildAuthLabReport } from "@/engines/auth-lab";
import { reportToMarkdown } from "@/engines/report";

/* ---------- ArchMap ---------- */

describe("arch-map", () => {
  const input = {
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

  it("builds layered model, mermaid and ascii", () => {
    const out = buildArchitecture(input);
    expect(out.model.layers.length).toBeGreaterThanOrEqual(6);
    expect(out.mermaid).toContain("flowchart TD");
    expect(out.mermaid).toContain("fastapi");
    expect(out.ascii).toContain("NEXT.JS");
    expect(out.ascii).toContain("POSTGRESQL");
  });

  it("mermaid contains edges between adjacent layers", () => {
    const out = buildArchitecture(input);
    expect(out.mermaid).toContain("-->");
  });

  it("json export round-trips the model", () => {
    const out = buildArchitecture(input);
    const parsed = JSON.parse(out.json) as { layers: unknown[] };
    expect(parsed.layers.length).toBe(out.model.layers.length);
  });

  it("notes missing persistence", () => {
    const out = buildArchitecture({ ...input, database: "None" });
    expect(out.report.sections.some((s) => s.rows?.some(([k, v]) => k === "Persistence defined" && v.startsWith("no")))).toBe(true);
  });
});

/* ---------- SiteBlueprint ---------- */

describe("site-blueprint", () => {
  it("includes an admin page when requested", () => {
    const out = buildBlueprint({
      siteType: "blog", scale: "small", usersPerMonth: 1000,
      payments: false, auth: false, search: false, adminPanel: true,
      notifications: false, realtime: false,
    });
    expect(out.pages.some((p) => p.name === "Admin")).toBe(true);
  });

  it("adds payments feature when selected", () => {
    const out = buildBlueprint({
      siteType: "landing", scale: "small", usersPerMonth: 1000,
      payments: true, auth: false, search: false, adminPanel: false,
      notifications: false, realtime: false,
    });
    expect(out.features.some((f) => f.toLowerCase().includes("payments"))).toBe(true);
  });

  it("warns on payments without auth", () => {
    const out = buildBlueprint({
      siteType: "landing", scale: "small", usersPerMonth: 1000,
      payments: true, auth: false, search: false, adminPanel: false,
      notifications: false, realtime: false,
    });
    expect(out.report.findings.some((f) => f.title.includes("without authentication"))).toBe(true);
  });

  it("recommends redis for realtime builds", () => {
    const out = buildBlueprint({
      siteType: "social", scale: "medium", usersPerMonth: 20000,
      payments: false, auth: true, search: false, adminPanel: false,
      notifications: true, realtime: true,
    });
    expect(out.stack.some((s) => s.choice.includes("Redis"))).toBe(true);
  });
});

/* ---------- WebCost ---------- */

describe("web-cost", () => {
  const base = {
    siteType: "ecommerce" as const,
    scale: "small" as const,
    usersPerMonth: 10_000,
    designQuality: "standard" as const,
    features: {
      auth: true, payments: true, search: true, adminPanel: true,
      realtime: false, fileUploads: true, notifications: true, i18n: false,
    },
  };

  it("produces a positive estimate with ranges", () => {
    const out = estimateCost(base);
    expect(out.devTotal).toBeGreaterThan(0);
    expect(out.infraMonthlyHigh).toBeGreaterThanOrEqual(out.infraMonthlyLow);
    expect(out.report.summary).toContain("ESTIMATE");
  });

  it("premium design costs more than standard", () => {
    const premium = estimateCost({ ...base, designQuality: "premium" });
    const standard = estimateCost(base);
    expect(premium.devTotal).toBeGreaterThan(standard.devTotal);
  });

  it("more traffic means more infra cost", () => {
    const big = estimateCost({ ...base, usersPerMonth: 500_000 });
    const small = estimateCost(base);
    expect(big.infraMonthlyHigh).toBeGreaterThan(small.infraMonthlyHigh);
  });

  it("warns about payments without auth", () => {
    const out = estimateCost({
      ...base,
      features: { ...base.features, auth: false },
    });
    expect(out.report.findings.some((f) => f.title.includes("Payments without authentication"))).toBe(true);
  });
});

/* ---------- AttackGraph ---------- */

describe("attack-graph", () => {
  it("parses multi-hop paths and dedupes edges", () => {
    const { graph } = buildAttackGraph("Internet -> App -> Database\nInternet -> App -> Database");
    expect(graph.chains).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes).toHaveLength(3);
  });

  it("flags direct internet-to-database paths as critical", () => {
    const { report } = buildAttackGraph("Internet -> Database");
    expect(report.findings.some((f) => f.severity === "critical" && f.title.includes("Internet → Database"))).toBe(true);
  });

  it("flags missing auth when a db exists", () => {
    const { report } = buildAttackGraph("Internet -> Web app -> Database");
    expect(report.findings.some((f) => f.title.includes("No authentication layer"))).toBe(true);
  });

  it("suggests WAF when no edge is mapped", () => {
    const { report } = buildAttackGraph("Internet -> Web app -> Auth -> Database");
    expect(report.findings.some((f) => f.title.includes("No edge protection"))).toBe(true);
  });

  it("provides controls per component", () => {
    const out = buildAttackGraph("Internet -> Web app -> Database");
    const db = out.nodeControls.find((n) => /database/i.test(n.label));
    expect(db?.controls.length).toBeGreaterThan(2);
    expect(db?.mitre).toContain("T1");
  });

  it("renders single-chain ascii vertically", () => {
    const out = buildAttackGraph("Internet -> App -> DB");
    expect(out.ascii).toContain("INTERNET");
    expect(out.ascii).toContain("▼");
  });
});

/* ---------- AuthLab ---------- */

describe("auth-lab", () => {
  const b64url = (s: string) =>
    Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const makeJwt = (header: object, payload: object, sig = "a".repeat(40)) =>
    `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.${sig}`;

  it("decodes a valid JWT structure", () => {
    const r = analyzeJwt(makeJwt({ alg: "HS256", typ: "JWT" }, { sub: "123", exp: Math.floor(Date.now() / 1000) + 3600 }));
    expect(r.validStructure).toBe(true);
    expect(r.claims.some(([k, v]) => k === "sub" && v === "123")).toBe(true);
    expect(r.expReadable).toBeDefined();
  });

  it("flags alg:none as critical", () => {
    const r = analyzeJwt(makeJwt({ alg: "none" }, { sub: "1" }));
    expect(r.issues.some((i) => i.severity === "critical" && i.title.includes("none"))).toBe(true);
  });

  it("flags missing exp", () => {
    const r = analyzeJwt(makeJwt({ alg: "HS256" }, { sub: "1" }));
    expect(r.issues.some((i) => i.title.includes("No exp claim"))).toBe(true);
  });

  it("rejects non-JWT strings", () => {
    const r = analyzeJwt("not-a-jwt");
    expect(r.validStructure).toBe(false);
    expect(r.issues.some((i) => i.title.includes("Not a JWT structure"))).toBe(true);
  });

  it("analyzes weak passwords", () => {
    const a = analyzePassword("password123");
    expect(["very-weak", "weak"]).toContain(a.verdict);
    expect(a.commonPatternHits.length).toBeGreaterThan(0);
    expect(a.crackTimeSha256).toBeTruthy();
  });

  it("rates long random passphrases highly", () => {
    const a = analyzePassword("correct-horse-battery-staple-42!");
    expect(["strong", "excellent"]).toContain(a.verdict);
  });

  it("builds a combined session report", () => {
    const report = buildAuthLabReport(analyzePassword("abc"), analyzeJwt(makeJwt({ alg: "HS256" }, { sub: "x" })));
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.sections.some((s) => s.heading === "Password analysis")).toBe(true);
  });
});

/* ---------- Report export ---------- */

describe("report export", () => {
  it("renders markdown with findings and score", () => {
    const md = reportToMarkdown({
      tool: "secret-sentry",
      toolLabel: "SecretSentry",
      title: "Test Report",
      generatedAt: "2026-11-14T00:00:00Z",
      score: 72,
      summary: "test summary",
      findings: [{ id: "f1", severity: "high", title: "Something bad", detail: "details here", location: "a.ts:1" }],
      sections: [{ heading: "Section", rows: [["k", "v"]] }],
    });
    expect(md).toContain("# Test Report");
    expect(md).toContain("**Score:** 72/100");
    expect(md).toContain("**[HIGH]** Something bad");
    expect(md).toContain("| k | v |");
  });
});
