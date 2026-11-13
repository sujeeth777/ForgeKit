import { describe, it, expect } from "vitest";
import { analyzeHeaders } from "@/engines/http-guard";
import { analyzeLogs } from "@/engines/log-forge";
import { buildNetPeekReport } from "@/engines/net-peek";

/* ---------- HTTPGuard ---------- */

describe("http-guard", () => {
  const base = {
    url: "https://example.com",
    finalUrl: "https://example.com/",
    statusCode: 200,
    responseTimeMs: 120,
  };

  it("scores a well-hardened response high", () => {
    const { report, checks } = analyzeHeaders({
      ...base,
      headers: {
        "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
        "content-security-policy": "default-src 'self'; script-src 'self'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=()",
        "set-cookie": "sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
      },
    });
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.findings).toHaveLength(0);
    expect(checks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("marks plain HTTP as critical", () => {
    const { report, checks } = analyzeHeaders({
      ...base,
      finalUrl: "http://example.com/",
      headers: {},
    });
    const httpsCheck = checks.find((c) => c.id === "https");
    expect(httpsCheck?.status).toBe("fail");
    expect(report.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(report.score).toBeLessThan(40);
  });

  it("detects missing cookie flags", () => {
    const { checks } = analyzeHeaders({
      ...base,
      headers: { "set-cookie": "sid=abc; Path=/", "x-content-type-options": "nosniff" },
    });
    const cookie = checks.find((c) => c.id === "cookies");
    expect(cookie?.status === "fail" || cookie?.status === "warn").toBe(true);
  });

  it("treats no cookies as informational, not a failure", () => {
    const { checks } = analyzeHeaders({ ...base, headers: {} });
    expect(checks.find((c) => c.id === "cookies")?.status).toBe("info");
  });

  it("warns about unsafe-inline CSP", () => {
    const { checks } = analyzeHeaders({
      ...base,
      headers: { "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'" },
    });
    expect(checks.find((c) => c.id === "csp")?.status).toBe("warn");
  });
});

/* ---------- LogForge ---------- */

describe("log-forge", () => {
  const nginx = [
    '1.2.3.4 - - [14/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 512 "-" "Mozilla/5.0"',
    '1.2.3.4 - - [14/Nov/2026:10:00:01 +0000] "GET /api/users HTTP/1.1" 404 0 "-" "curl/8"',
    '1.2.3.4 - - [14/Nov/2026:10:00:02 +0000] "POST /login HTTP/1.1" 500 32 "-" "Mozilla/5.0"',
  ].join("\n");

  it("parses nginx combined format", () => {
    const { events, stats } = analyzeLogs(nginx);
    expect(stats.parsed).toBe(3);
    expect(events[0].format).toBe("nginx");
    expect(events[0].ip).toBe("1.2.3.4");
    expect(events[0].status).toBe(200);
  });

  it("computes status class stats", () => {
    const { stats } = analyzeLogs(nginx);
    expect(stats.byStatus.x2).toBe(1);
    expect(stats.byStatus.x4).toBe(1);
    expect(stats.byStatus.x5).toBe(1);
  });

  it("parses JSON lines with levels", () => {
    const { events, stats } = analyzeLogs('{"level":"ERROR","msg":"boom"}\n{"level":"INFO","msg":"ok"}');
    expect(stats.parsed).toBe(2);
    expect(events[0].level).toBe("ERROR");
    expect(events[0].message).toBe("boom");
  });

  it("flags 401 bursts as suspicious", () => {
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) {
      lines.push(`10.0.0.9 - - [14/Nov/2026:10:00:${String(i % 60).padStart(2, "0")} +0000] "POST /login HTTP/1.1" 401 12 "-" "-"`);
    }
    const { stats, report } = analyzeLogs(lines.join("\n"));
    expect(stats.authFailures).toBe(15);
    expect(stats.suspicious.some((s) => s.kind === "Auth-failure burst")).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("flags SQL-injection-shaped paths and sensitive probing", () => {
    const { stats } = analyzeLogs(
      '1.1.1.1 - - [14/Nov/2026:10:00:00 +0000] "GET /?id=1%20OR%201=1 HTTP/1.1" 200 10 "-" "-"\n1.1.1.1 - - [14/Nov/2026:10:00:01 +0000] "GET /.env HTTP/1.1" 404 0 "-" "-"',
    );
    expect(stats.suspicious.some((s) => s.kind.includes("SQL-injection"))).toBe(true);
    expect(stats.suspicious.some((s) => s.kind.includes("Sensitive-path"))).toBe(true);
  });

  it("counts unrecognized lines without crashing", () => {
    const { stats } = analyzeLogs("hello\nworld\nrandom gibberish");
    expect(stats.total).toBe(3);
    expect(stats.failed).toBe(3);
  });
});

/* ---------- NetPeek ---------- */

describe("net-peek", () => {
  it("builds a report from client + server + dns inputs", () => {
    const { report } = buildNetPeekReport({
      client: {
        userAgent: "test-agent",
        language: "en",
        languages: ["en"],
        platform: "TestOS",
        timezone: "UTC",
        screen: "800x600",
        online: true,
      },
      server: { ip: "203.0.113.5", city: "Hyderabad", country: "IN" },
      dns: {
        domain: "example.com",
        records: [{ type: "A", name: "example.com", value: "93.184.216.34", ttl: 3600 }],
      },
    });
    expect(report.summary).toContain("DNS records");
    expect(report.sections.some((s) => s.heading.includes("DNS records — example.com"))).toBe(true);
  });

  it("flags missing SPF when MX/A exist but no TXT spf", () => {
    const { report } = buildNetPeekReport({
      client: {
        userAgent: "a", language: "en", languages: ["en"], platform: "p",
        timezone: "UTC", screen: "1x1", online: true,
      },
      dns: {
        domain: "mail.example.com",
        records: [{ type: "MX", name: "mail.example.com", value: "10 mx", ttl: 300 }],
      },
    });
    expect(report.findings.some((f) => f.title.includes("No SPF"))).toBe(true);
  });
});
