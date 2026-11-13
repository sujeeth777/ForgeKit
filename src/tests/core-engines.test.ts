import { describe, it, expect } from "vitest";
import { scanFiles } from "@/engines/secret-sentry";
import { diagnoseEnv } from "@/engines/env-doctor";

/* ---------- SecretSentry ---------- */

describe("secret-sentry", () => {
  it("detects a hardcoded AWS access key", () => {
    const { report } = scanFiles([
      { path: "src/config.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE";' },
    ]);
    expect(report.findings.some((f) => f.title.includes("AWS access key"))).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it("detects GitHub tokens and database URLs with passwords", () => {
    const { report } = scanFiles([
      {
        path: "a.env",
        content: "GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\nDATABASE_URL=postgres://admin:hunter2@db.internal:5432/prod",
      },
    ]);
    const titles = report.findings.map((f) => f.title);
    expect(titles.some((t) => t.includes("GitHub token"))).toBe(true);
    expect(titles.some((t) => t.includes("Database connection string"))).toBe(true);
  });

  it("detects private key blocks as critical", () => {
    const { report } = scanFiles([
      { path: "server.pem", content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...\n-----END RSA PRIVATE KEY-----" },
    ]);
    const f = report.findings.find((x) => x.title.includes("Private key"));
    expect(f?.severity).toBe("critical");
  });

  it("flags committed .env files by name", () => {
    const { report } = scanFiles([{ path: "app/.env", content: "A=1" }]);
    expect(report.findings.some((f) => f.title.includes("Environment file"))).toBe(true);
  });

  it("NEVER includes the secret value in any finding", () => {
    const secret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const { report } = scanFiles([{ path: "x.js", content: `token = "${secret}"` }]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
  });

  it("masks matched spans in snippets", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const { report } = scanFiles([{ path: "c.ts", content: `key = "${secret}";` }]);
    const f = report.findings.find((x) => x.meta?.snippet);
    expect(f).toBeDefined();
    expect(String(f?.meta?.snippet)).not.toContain(secret);
    expect(String(f?.meta?.snippet)).toContain("█");
  });

  it("gives a clean report for innocent files", () => {
    const { report, filesScanned } = scanFiles([
      { path: "README.md", content: "# hello world\nplain text, nothing here" },
    ]);
    expect(report.findings).toHaveLength(0);
    expect(report.score).toBe(100);
    expect(filesScanned).toBe(1);
  });

  it("deduplicates repeated hits on the same line", () => {
    const { report } = scanFiles([
      { path: "d.ts", content: "const a = AKIAIOSFODNN7EXAMPLE; // AKIAIOSFODNN7EXAMPLE again" },
    ]);
    expect(report.findings.filter((f) => f.location === "d.ts:1")).toHaveLength(1);
  });
});

/* ---------- EnvDoctor ---------- */

describe("env-doctor", () => {
  it("detects duplicate keys", () => {
    const { report, stats } = diagnoseEnv("API_KEY=abc\nAPI_KEY=def\n");
    expect(stats.duplicates).toBe(1);
    expect(report.findings.some((f) => f.title.includes("Duplicate key: API_KEY"))).toBe(true);
  });

  it("detects empty values and placeholders", () => {
    const { report, stats } = diagnoseEnv("DATABASE_URL=\nAPI_KEY=changeme\n");
    expect(stats.empty).toBe(1);
    expect(stats.placeholders).toBe(1);
  });

  it("flags weak secrets", () => {
    const { report } = diagnoseEnv("JWT_SECRET=secret123\n");
    expect(report.findings.some((f) => f.title.includes("Weak secret: JWT_SECRET"))).toBe(true);
  });

  it("masks every value in output", () => {
    const { report } = diagnoseEnv("JWT_SECRET=superlongsecretvalue123456\n");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("superlongsecretvalue123456");
  });

  it("reports missing baseline keys for the selected stack", () => {
    const { report } = diagnoseEnv("PORT=3000\n", "next");
    expect(report.findings.some((f) => f.title.includes("Missing common key: NEXT_PUBLIC_SITE_URL"))).toBe(true);
  });

  it("accepts export prefixes and quotes", () => {
    const { vars } = diagnoseEnv('export DATABASE_URL="postgres://localhost/app"\n');
    expect(vars).toHaveLength(1);
    expect(vars[0].quoted).toBe(true);
    expect(vars[0].hasExport).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const { vars } = diagnoseEnv("# comment\n\nPORT=3000\n");
    expect(vars).toHaveLength(1);
  });

  it("scores a broken env low", () => {
    const { report } = diagnoseEnv("A=\nA=\nAPI_KEY=changeme\nJWT_SECRET=123\n");
    expect(report.score).toBeLessThan(60);
  });
});
