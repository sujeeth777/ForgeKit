import type { Finding, Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * EnvDoctor — health-check a .env file.
 * Values are analyzed locally and always masked in output (first 2 chars + ***).
 */

export type EnvStack = "generic" | "node" | "next" | "python" | "docker";

export interface ParsedVar {
  key: string;
  masked: string;
  line: number;
  quoted: boolean;
  empty: boolean;
  duplicate: boolean;
  hasExport: boolean;
}

export interface EnvDiagnosis {
  report: Report;
  vars: ParsedVar[];
  stats: {
    total: number;
    unique: number;
    duplicates: number;
    empty: number;
    placeholders: number;
    weak: number;
  };
}

const PLACEHOLDER_VALUES = new Set([
  "changeme", "change_me", "change-me", "xxx", "xxxx", "xxxxx", "todo", "fixme",
  "example", "dummy", "placeholder", "test", "testing", "sample", "your_api_key",
  "your_api_key_here", "your-key", "your_key", "my_key", "mykey", "abc123",
  "123456", "12345678", "password", "password123", "secret", "admin", "none",
  "null", "undefined", "key", "value", "insert_here", "tbd", "to_be_filled",
]);

const WEAK_VALUE_WORDS = ["password", "secret", "qwerty", "letmein", "iloveyou", "dragon", "monkey", "admin", "welcome", "abc", "1234", "asdf", "forgekit"];

const RECOMMENDED: Record<EnvStack, Array<{ key: string; why: string }>> = {
  generic: [
    { key: "NODE_ENV", why: "runtime mode (development/production/test)" },
    { key: "PORT", why: "server port" },
    { key: "LOG_LEVEL", why: "logging verbosity" },
    { key: "DATABASE_URL", why: "database connection" },
    { key: "JWT_SECRET", why: "token signing (if you issue tokens)" },
  ],
  node: [
    { key: "NODE_ENV", why: "runtime mode" },
    { key: "PORT", why: "server port" },
    { key: "DATABASE_URL", why: "database connection" },
  ],
  next: [
    { key: "NEXT_PUBLIC_SITE_URL", why: "canonical site URL" },
    { key: "DATABASE_URL", why: "database connection" },
    { key: "AUTH_SECRET", why: "session/token signing secret" },
  ],
  python: [
    { key: "PYTHONUNBUFFERED", why: "real-time stdout in containers" },
    { key: "DATABASE_URL", why: "database connection" },
    { key: "SECRET_KEY", why: "framework signing secret (Django/Flask)" },
  ],
  docker: [
    { key: "POSTGRES_PASSWORD", why: "database bootstrap password" },
    { key: "POSTGRES_DB", why: "database name" },
  ],
};

let counter = 0;
function nid(): string {
  counter += 1;
  return `ed-${counter}`;
}

function mask(value: string): string {
  if (value.length <= 4) return "█".repeat(Math.max(value.length, 3));
  return value.slice(0, 2) + "█".repeat(Math.min(value.length - 2, 16));
}

function looksLikePlaceholder(v: string): boolean {
  const lower = v.toLowerCase().trim();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  if (/^(<[^>]+>|\{\{.*\}\}|\$\{.*\}|\[[^\]]+\])$/.test(lower)) return true; // <TODO> {{var}} ${var} [x]
  if (/^(your|my|insert|paste|enter|replace)[_-]/.test(lower)) return true;
  if (/example\.com$|_here$|xxxx/.test(lower)) return true;
  return false;
}

function weakReason(key: string, v: string): string | null {
  const lower = v.toLowerCase();
  const secretish = /secret|password|token|key|apikey|api_key|credential/i.test(key);
  if (!secretish) return null;
  if (v.length < 12) return `very short (${v.length} chars)`;
  for (const w of WEAK_VALUE_WORDS) {
    if (lower.includes(w)) return `contains common word "${w}"`;
  }
  if (/^[0-9]+$/.test(v)) return "numeric only";
  if (!/[A-Z]/.test(v) && v.length < 20) return "no uppercase and short — low entropy";
  return null;
}

export function diagnoseEnv(content: string, stack: EnvStack = "generic"): EnvDiagnosis {
  counter = 0;
  const findings: Finding[] = [];
  const vars: ParsedVar[] = [];
  const seenKeys = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  let validLines = 0;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) {
      findings.push({
        id: nid(),
        severity: "low",
        title: "Unparseable line",
        detail: "Expected KEY=VALUE format. Lines that do not parse are often typos that silently break config loading.",
        location: `line ${idx + 1}`,
        meta: {},
      });
      return;
    }
    validLines += 1;
    const [, key, rawValue] = m;
    const trimmed = rawValue.trim();
    const quoted =
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2);
    const value = quoted ? trimmed.slice(1, -1) : trimmed.split(/\s+#/)[0]; // strip trailing comment on unquoted values
    const duplicate = seenKeys.has(key);

    vars.push({
      key,
      masked: mask(value),
      line: idx + 1,
      quoted,
      empty: value.length === 0,
      duplicate,
      hasExport: /^export\s/.test(raw),
    });
    if (duplicate) {
      const firstLine = seenKeys.get(key);
      findings.push({
        id: nid(),
        severity: "medium",
        title: `Duplicate key: ${key}`,
        detail: `Defined again on line ${idx + 1} (first defined on line ${firstLine}). Most dotenv loaders keep the LAST value; others keep the first — the behavior differs across runtimes.`,
        location: `line ${idx + 1}`,
        meta: {},
      });
    } else {
      seenKeys.set(key, idx + 1);
    }

    if (value.length === 0) {
      findings.push({
        id: nid(),
        severity: "medium",
        title: `Empty value: ${key}`,
        detail: "Empty values often surface as null/undefined at runtime and cause confusing errors. Either set it or delete the line.",
        location: `line ${idx + 1}`,
        meta: {},
      });
      return;
    }

    if (looksLikePlaceholder(value)) {
      findings.push({
        id: nid(),
        severity: "high",
        title: `Placeholder value: ${key}`,
        detail: "The value looks like a placeholder that was never replaced. The app will run with fake credentials or crash in production.",
        location: `line ${idx + 1}`,
        meta: {},
      });
      return;
    }

    const weak = weakReason(key, value);
    if (weak) {
      findings.push({
        id: nid(),
        severity: "high",
        title: `Weak secret: ${key}`,
        detail: `The value is ${weak}. Generate secrets with ` +
          "`openssl rand -base64 32` or a password manager. " +
          "Showing value as: " + mask(value),
        location: `line ${idx + 1}`,
        meta: {},
      });
    }

    if (!quoted && /\s/.test(value)) {
      findings.push({
        id: nid(),
        severity: "low",
        title: `Unquoted spaces in value: ${key}`,
        detail: "The value contains spaces without quotes — some parsers truncate at the first space.",
        location: `line ${idx + 1}`,
        meta: {},
      });
    }

    if (key !== key.toUpperCase() && /^[a-z]/.test(key)) {
      findings.push({
        id: nid(),
        severity: "info",
        title: `Non-uppercase key: ${key}`,
        detail: "Environment variables are conventionally UPPER_SNAKE_CASE. Some tools ignore lowercase keys.",
        location: `line ${idx + 1}`,
        meta: {},
      });
    }
  });

  // Recommended baseline for the selected stack
  for (const r of RECOMMENDED[stack]) {
    if (!seenKeys.has(r.key)) {
      findings.push({
        id: nid(),
        severity: "info",
        title: `Missing common key: ${r.key}`,
        detail: `Typically needed for ${r.why}. Add it if this project uses it.`,
        meta: {},
      });
    }
  }

  const stats = {
    total: vars.length,
    unique: seenKeys.size,
    duplicates: vars.filter((v) => v.duplicate).length,
    empty: vars.filter((v) => v.empty).length,
    placeholders: findings.filter((f) => f.title.startsWith("Placeholder value")).length,
    weak: findings.filter((f) => f.title.startsWith("Weak secret")).length,
  };

  const deductions =
    findings.reduce((acc, f) => {
      const cost: Record<string, number> = { critical: 30, high: 14, medium: 7, low: 3, info: 1 };
      return acc + (cost[f.severity] ?? 2);
    }, 0);
  const score = Math.max(0, Math.min(100, 100 - deductions + (findings.every((f) => f.severity === "info") ? 0 : 0)));

  const summary = validLines === 0
    ? "No KEY=VALUE pairs found. Paste your .env content (values are masked immediately and never sent anywhere)."
    : `Checked ${validLines} variables: ${stats.duplicates} duplicate${stats.duplicates === 1 ? "" : "s"}, ${stats.empty} empty, ${stats.placeholders} placeholder${stats.placeholders === 1 ? "" : "s"}, ${stats.weak} weak secret${stats.weak === 1 ? "" : "s"}. Values are masked — only you see the real ones.`;

  const report: Report = {
    tool: "env-doctor",
    toolLabel: getTool("env-doctor").name,
    title: "ForgeKit EnvDoctor Report",
    generatedAt: new Date().toISOString(),
    score,
    summary,
    findings,
    sections: [
      {
        heading: "Variables",
        rows: vars.map((v) => [`L${v.line} ${v.key}`, `${v.masked}${v.duplicate ? "  (duplicate)" : ""}${v.empty ? "  (empty)" : ""}`]),
      },
      {
        heading: "Baseline for stack: " + stack,
        rows: RECOMMENDED[stack].map((r) => [r.key, seenKeys.has(r.key) ? "present ✓" : `missing — ${r.why}`]),
      },
      {
        heading: "How to fix common issues",
        body:
          "Generate strong secrets:\n    openssl rand -base64 32\n" +
          "Or in Node:\n    node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n" +
          "Never commit real .env files — commit .env.example with keys and no values.",
      },
    ],
    meta: { Stack: stack, Variables: String(vars.length) },
  };

  return { report, vars, stats };
}
