import type { Finding, Report, Severity } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * HTTPGuard — analyze the *response headers* of a URL the user controls.
 * Passive and safe: one GET request, no exploitation, no fuzzing.
 */

export interface HeaderCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn" | "info";
  weight: number;
  detail: string;
  observed?: string;
  recommendation?: string;
}

export interface HeaderScanInput {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>; // lower-cased keys
  responseTimeMs: number;
  error?: string;
}

let counter = 0;
function nid(): string {
  counter += 1;
  return `hg-${counter}`;
}

function getCookieFlags(header: string | undefined): { secure: boolean; httpOnly: boolean; sameSite: boolean; count: number } {
  if (!header) return { secure: true, httpOnly: true, sameSite: true, count: 0 };
  const cookies = header.split(/,(?=[^;]+?=)/).filter(Boolean);
  let secure = true;
  let httpOnly = true;
  let sameSite = true;
  for (const c of cookies) {
    const l = c.toLowerCase();
    if (!/\bsecure\b/.test(l)) secure = false;
    if (!/\bhttponly\b/.test(l)) httpOnly = false;
    if (!/\bsamesite=/i.test(l)) sameSite = false;
  }
  return { secure, httpOnly, sameSite, count: cookies.length };
}

function parseHsts(hsts: string | undefined): { present: boolean; maxAge: number; includeSubdomains: boolean; preload: boolean } {
  if (!hsts) return { present: false, maxAge: 0, includeSubdomains: false, preload: false };
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
  return {
    present: true,
    maxAge,
    includeSubdomains: /includeSubDomains/i.test(hsts),
    preload: /preload/i.test(hsts),
  };
}

export function analyzeHeaders(input: HeaderScanInput): { report: Report; checks: HeaderCheck[] } {
  counter = 0;
  const checks: HeaderCheck[] = [];
  const h = input.headers;
  const isHttps = input.finalUrl.startsWith("https://");
  const redirected = input.finalUrl !== input.url;
  const cookies = getCookieFlags(h["set-cookie"]);
  const hsts = parseHsts(h["strict-transport-security"]);

  checks.push({
    id: "https",
    label: "HTTPS",
    status: isHttps ? "pass" : "fail",
    weight: 20,
    detail: isHttps
      ? "Served over HTTPS. All traffic is encrypted in transit."
      : "Served over plain HTTP — traffic can be read and modified in transit. Obtain a TLS certificate (e.g. Let's Encrypt) and redirect HTTP → HTTPS.",
    observed: input.finalUrl,
    recommendation: isHttps ? undefined : "Enable TLS and force HTTPS redirects.",
  });

  checks.push({
    id: "hsts",
    label: "HSTS",
    status: !isHttps ? "warn" : hsts.present && hsts.maxAge >= 15552000 ? "pass" : hsts.present ? "warn" : "fail",
    weight: 15,
    detail: hsts.present
      ? `max-age=${hsts.maxAge} (${hsts.maxAge >= 15552000 ? "≥ 180 days ✓" : "below the recommended 15552000 (180 days)"}), includeSubDomains: ${hsts.includeSubdomains}, preload: ${hsts.preload}.`
      : "Strict-Transport-Security missing — browsers can still be tricked into the first HTTP request (protocol downgrade / cookie hijacking).",
    observed: h["strict-transport-security"],
    recommendation: hsts.present && hsts.maxAge >= 15552000
      ? undefined
      : "Set: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
  });

  const csp = h["content-security-policy"];
  checks.push({
    id: "csp",
    label: "Content-Security-Policy",
    status: csp ? (csp.includes("unsafe-inline") ? "warn" : "pass") : "fail",
    weight: 15,
    detail: csp
      ? csp.includes("unsafe-inline")
        ? "CSP present but allows 'unsafe-inline' — this weakens XSS protection significantly."
        : "CSP present without 'unsafe-inline' — strong mitigation against XSS and content injection."
      : "No Content-Security-Policy — the browser has no guardrails against injected scripts.",
    observed: csp?.slice(0, 120),
    recommendation: csp && !csp.includes("unsafe-inline")
      ? undefined
      : "Start with: Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'",
  });

  const xcto = h["x-content-type-options"];
  checks.push({
    id: "xcto",
    label: "X-Content-Type-Options",
    status: xcto?.toLowerCase() === "nosniff" ? "pass" : "fail",
    weight: 10,
    detail: xcto?.toLowerCase() === "nosniff"
      ? "MIME sniffing disabled — browsers will not reinterpret files as scripts."
      : "Missing — browsers may sniff content types and execute uploads as scripts.",
    observed: xcto,
    recommendation: "Set: X-Content-Type-Options: nosniff",
  });

  const xfo = h["x-frame-options"];
  const frameAncestors = csp?.match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
  const framed = xfo?.toLowerCase() === "deny" || xfo?.toLowerCase() === "sameorigin" ||
    (frameAncestors && !/unsafe|https?:|\*/i.test(frameAncestors));
  checks.push({
    id: "framing",
    label: "Clickjacking protection",
    status: framed ? "pass" : "fail",
    weight: 10,
    detail: framed
      ? "Framing restricted (X-Frame-Options or CSP frame-ancestors)."
      : "Page can be embedded in an <iframe> anywhere — classic clickjacking exposure.",
    observed: xfo ?? frameAncestors,
    recommendation: "Set: X-Frame-Options: DENY (or CSP frame-ancestors 'none')",
  });

  const REFERRER_PASS = ["no-referrer", "strict-origin-when-cross-origin", "same-origin", "strict-origin"];
  const referrer = h["referrer-policy"];
  checks.push({
    id: "referrer",
    label: "Referrer-Policy",
    status: referrer ? (REFERRER_PASS.includes(referrer.toLowerCase()) ? "pass" : "warn") : "fail",
    weight: 10,
    detail: referrer
      ? REFERRER_PASS.includes(referrer.toLowerCase())
        ? "Referrer data minimized."
        : `Policy "${referrer}" leaks more referrer data than needed.`
      : "Missing — full URLs (including query strings and tokens) may leak via the Referer header.",
    observed: referrer,
    recommendation: "Set: Referrer-Policy: strict-origin-when-cross-origin",
  });

  checks.push({
    id: "permissions",
    label: "Permissions-Policy",
    status: h["permissions-policy"] ? "pass" : "warn",
    weight: 5,
    detail: h["permissions-policy"]
      ? "Browser feature grants are restricted."
      : "Missing — any embedded page can request camera/microphone/geo (subject to browser prompts). Low severity, easy win.",
    observed: h["permissions-policy"],
    recommendation: "Set: Permissions-Policy: camera=(), microphone=(), geolocation=()",
  });

  const cookieIssues: string[] = [];
  if (cookies.count > 0) {
    if (!cookies.secure) cookieIssues.push("missing Secure flag");
    if (!cookies.httpOnly) cookieIssues.push("missing HttpOnly flag");
    if (!cookies.sameSite) cookieIssues.push("missing SameSite attribute");
  }
  checks.push({
    id: "cookies",
    label: "Cookie hardening",
    status: cookies.count === 0 ? "info" : cookieIssues.length === 0 ? "pass" : cookieIssues.length > 1 ? "fail" : "warn",
    weight: 15,
    detail: cookies.count === 0
      ? "No Set-Cookie on this response — nothing to assess here."
      : cookieIssues.length === 0
        ? `${cookies.count} cookie(s), all Secure + HttpOnly + SameSite.`
        : `${cookies.count} cookie(s): ${cookieIssues.join(", ")}. Cookies without these flags can travel over HTTP, be stolen by XSS, or be sent on cross-site requests (CSRF).`,
    recommendation: cookieIssues.length > 0
      ? "Set Secure; HttpOnly; SameSite=Lax (or Strict) on every cookie."
      : undefined,
  });

  const server = h["server"];
  const poweredBy = h["x-powered-by"];
  if (server || poweredBy) {
    checks.push({
      id: "disclosure",
      label: "Server version disclosure",
      status: "info",
      weight: 0,
      detail: `${server ? `Server: ${server}` : ""}${server && poweredBy ? ", " : ""}${poweredBy ? `X-Powered-By: ${poweredBy}` : ""}. Revealing stack versions helps attackers pick matching exploits.`,
      observed: [server, poweredBy].filter(Boolean).join(" / "),
      recommendation: "Remove or genericize Server/X-Powered-By headers.",
    });
  }

  // Findings from failed/warn checks
  const findings: Finding[] = [];
  for (const c of checks) {
    if (c.status === "pass" || c.status === "info") continue;
    const severity: Severity =
      c.id === "https" ? "critical"
      : c.id === "csp" || c.id === "hsts" ? "high"
      : c.id === "cookies" || c.id === "framing" ? "high"
      : c.status === "warn" ? "low" : "medium";
    findings.push({
      id: nid(),
      severity,
      title: `${c.label}: ${c.status === "warn" ? "weak" : "missing/failed"}`,
      detail: c.recommendation ? `${c.detail} Fix: ${c.recommendation}` : c.detail,
      location: input.finalUrl,
    });
  }
  if (redirected && input.finalUrl !== input.url && !input.finalUrl.startsWith("https://")) {
    findings.push({
      id: nid(),
      severity: "high",
      title: "Redirect chain ends on HTTP",
      detail: `The request to ${input.url} ended at the insecure ${input.finalUrl}.`,
      location: input.finalUrl,
    });
  }

  const maxScore = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => {
    if (c.status === "pass") return a + c.weight;
    if (c.status === "warn") return a + c.weight * 0.4;
    return a;
  }, 0);
  const score = maxScore === 0 ? 0 : Math.round((earned / maxScore) * 100);

  const summary =
    `${isHttps ? "HTTPS ✓" : "HTTPS ✗"} · ` +
    checks.filter((c) => c.status === "pass").length + "/" + checks.filter((c) => c.status !== "info").length +
    ` checks passed. Score ${score}/100. ` +
    (findings.length === 0
      ? "Solid header posture — keep monitoring after deployments."
      : `Top priority: ${findings[0].title.replace(": missing/failed", "").replace(": weak", "")}.`);

  const report: Report = {
    tool: "http-guard",
    toolLabel: getTool("http-guard").name,
    title: "ForgeKit HTTPGuard Report",
    generatedAt: new Date().toISOString(),
    score,
    summary,
    findings,
    sections: [
      {
        heading: "Response overview",
        rows: [
          ["Requested URL", input.url],
          ["Final URL", input.finalUrl],
          ["Status", String(input.statusCode)],
          ["Response time", `${input.responseTimeMs} ms`],
          ["Protocol secure", isHttps ? "yes" : "no"],
          ...(input.error ? [["Fetch note", input.error] as [string, string]] : []),
        ],
      },
      {
        heading: "How to fix the common ones",
        body:
          "Most fixes are one response header. Example for Express:\n" +
          "  app.use(helmet())            // sets most headers\n" +
          "or Nginx:\n" +
          "  add_header Strict-Transport-Security \"max-age=63072000; includeSubDomains\" always;\n" +
          "  add_header X-Content-Type-Options nosniff always;\n" +
          "  add_header X-Frame-Options DENY always;\n" +
          "  add_header Referrer-Policy strict-origin-when-cross-origin always;",
      },
    ],
    meta: { "Scan type": "passive header check" },
  };

  return { report, checks };
}
