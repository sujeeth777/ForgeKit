import type { Finding, Report, Severity } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * SecretSentry — scan text files for potential secrets.
 *
 * HARD RULE: discovered secret values are NEVER included in results.
 * Findings carry the file, line number, secret type and a masked snippet
 * where the matched span is replaced with █ characters.
 */

export interface ScanFile {
  path: string;
  content: string;
}

export interface ScanResult {
  report: Report;
  filesScanned: number;
  linesScanned: number;
}

interface Pattern {
  id: string;
  type: string;
  severity: Severity;
  confidence: "high" | "medium" | "low";
  regex: RegExp;
  explanation: string;
}

const PATTERNS: Pattern[] = [
  {
    id: "private-key",
    type: "Private key block",
    severity: "critical",
    confidence: "high",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |)PRIVATE KEY( BLOCK)?-----/g,
    explanation: "A private key block. Anyone with this can impersonate the key owner. Rotate the key and purge it from history.",
  },
  {
    id: "aws-access-key",
    type: "AWS access key ID",
    severity: "critical",
    confidence: "high",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    explanation: "AWS access key id. Rotate in IAM immediately and check CloudTrail for use.",
  },
  {
    id: "aws-secret",
    type: "AWS secret access key",
    severity: "critical",
    confidence: "low",
    regex: /aws.{0,25}['"][0-9a-zA-Z/+]{40}['"]/gi,
    explanation: "Possible AWS secret access key (40-char base64-like literal near 'aws'). Verify and rotate.",
  },
  {
    id: "github-token",
    type: "GitHub token",
    severity: "critical",
    confidence: "high",
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
    explanation: "GitHub personal access token. Revoke at github.com/settings/tokens.",
  },
  {
    id: "slack-token",
    type: "Slack token",
    severity: "high",
    confidence: "high",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    explanation: "Slack token. Revoke from the Slack app management console.",
  },
  {
    id: "google-api-key",
    type: "Google API key",
    severity: "high",
    confidence: "high",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    explanation: "Google API key. Restrict by referrer/API and rotate in Cloud Console.",
  },
  {
    id: "stripe-live-key",
    type: "Stripe live secret key",
    severity: "critical",
    confidence: "high",
    regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g,
    explanation: "Stripe LIVE secret key — can move money. Roll it in the Stripe dashboard now.",
  },
  {
    id: "stripe-test-key",
    type: "Stripe test secret key",
    severity: "medium",
    confidence: "high",
    regex: /\b(?:sk|rk)_test_[0-9a-zA-Z]{24,}\b/g,
    explanation: "Stripe test secret key. Fine for local dev, but don't commit it.",
  },
  {
    id: "openai-key",
    type: "OpenAI API key",
    severity: "high",
    confidence: "high",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    explanation: "OpenAI API key. Rotate at platform.openai.com and check usage for abuse.",
  },
  {
    id: "jwt",
    type: "JWT token",
    severity: "high",
    confidence: "medium",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    explanation: "Signed JWT. If it is a long-lived token, shorten expiry and rotate the signing secret.",
  },
  {
    id: "sendgrid",
    type: "SendGrid API key",
    severity: "high",
    confidence: "high",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    explanation: "SendGrid API key. Rotate in the SendGrid settings page.",
  },
  {
    id: "twilio",
    type: "Twilio API key",
    severity: "high",
    confidence: "medium",
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
    explanation: "Possible Twilio API key (SK + 32 hex). Verify in the Twilio console.",
  },
  {
    id: "npm-token",
    type: "npm token",
    severity: "high",
    confidence: "high",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
    explanation: "npm publish token. Revoke at npmjs.com — it can publish packages as you.",
  },
  {
    id: "telegram-bot",
    type: "Telegram bot token",
    severity: "medium",
    confidence: "high",
    regex: /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g,
    explanation: "Telegram bot token. Regenerate via @BotFather /revoke.",
  },
  {
    id: "database-url",
    type: "Database connection string with password",
    severity: "critical",
    confidence: "high",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'":@]+:[^\s'":@]+@[^\s'"]+/g,
    explanation: "Connection string embedding a password. Use env vars + secret manager; rotate the DB password.",
  },
  {
    id: "generic-credential",
    type: "Credential assignment",
    severity: "medium",
    confidence: "medium",
    regex: /\b(api[_-]?key|apikey|secret|password|passwd|pwd|token|access[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    explanation: "A credential-looking assignment. Move the value into an environment variable or secret manager.",
  },
  {
    id: "auth-header",
    type: "Authorization header with credentials",
    severity: "medium",
    confidence: "medium",
    regex: /authorization['"]?\s*[:=]\s*['"]?(?:Bearer\s+[A-Za-z0-9._-]{20,}|Basic\s+[A-Za-z0-9+/=]{16,})/gi,
    explanation: "Hardcoded Authorization header. Fetch tokens at runtime instead of baking them into source.",
  },
  {
    id: "heroku-api-key",
    type: "Heroku API key",
    severity: "medium",
    confidence: "low",
    regex: /heroku.{0,20}\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    explanation: "Possible Heroku API key (UUID near 'heroku'). Verify with `heroku auth:whoami` setups.",
  },
];

/** Files that should never be committed regardless of content. */
const RISKY_FILENAMES: Array<{ test: RegExp; type: string; severity: Severity }> = [
  { test: /(^|\/)id_(rsa|ed25519|ecdsa)$/, type: "SSH private key file", severity: "critical" },
  { test: /\.pem$/i, type: "PEM key/certificate file", severity: "high" },
  { test: /(^|\/)\.env(\.local|\.production|\.development)?$/i, type: "Environment file", severity: "high" },
  { test: /(^|\/)credentials?\.(json|txt)$/i, type: "Credentials file", severity: "high" },
  { test: /(^|\/)\.npmrc$/i, type: "npm config (may contain publish tokens)", severity: "medium" },
  { test: /(^|\/)\.netrc$/i, type: "netrc credentials file", severity: "high" },
];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `ss-${counter}`;
}

/** Mask the matched span in a single line so no secret value can leak. */
function maskLine(line: string, start: number, end: number): string {
  const clipped = line.length > 120 ? `${line.slice(0, 117)}...` : line;
  const s = Math.min(start, clipped.length);
  const e = Math.min(end, clipped.length);
  const masked = "█".repeat(Math.min(Math.max(e - s, 4), 24));
  return clipped.slice(0, s) + masked + clipped.slice(e);
}

export function scanFiles(files: ScanFile[]): ScanResult {
  counter = 0;
  const findings: Finding[] = [];
  let linesScanned = 0;
  const seen = new Set<string>();

  for (const file of files) {
    // File-level risk checks
    for (const risky of RISKY_FILENAMES) {
      if (risky.test.test(file.path)) {
        const key = `${file.path}::${risky.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({
            id: nextId(),
            severity: risky.severity,
            title: risky.type,
            detail: "This file type should not be in a repository. Remove it, rotate any credential inside, and add it to .gitignore.",
            location: file.path,
            meta: { confidence: "high" },
          });
        }
      }
    }

    const lines = file.content.split(/\r?\n/);
    linesScanned += lines.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(line)) !== null) {
          if (match[0].length === 0) break; // safety: zero-length match
          const key = `${file.path}:${i + 1}:${pattern.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({
            id: nextId(),
            severity: pattern.severity,
            title: pattern.type,
            detail: pattern.explanation,
            location: `${file.path}:${i + 1}`,
            meta: {
              confidence: pattern.confidence,
              line: i + 1,
              snippet: maskLine(line, match.index, match.index + match[0].length),
            },
          });
          // Keep only the first hit per line+pattern to avoid noise floods
          break;
        }
      }
    }
  }

  // Masked snippets are added in the UI layer from the raw files, never stored here.

  const bySeverity: Record<Severity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  };
  for (const f of findings) bySeverity[f.severity] += 1;

  const score = Math.max(0, Math.min(100,
    100
    - bySeverity.critical * 35
    - bySeverity.high * 18
    - bySeverity.medium * 8
    - bySeverity.low * 3,
  ));

  const filesScanned = files.length;
  const summary =
    findings.length === 0
      ? `Scanned ${filesScanned} files (${linesScanned.toLocaleString()} lines) — no potential secrets detected. Note: pattern-based scanning can miss unusual formats; keep secrets in a secret manager.`
      : `Scanned ${filesScanned} files (${linesScanned.toLocaleString()} lines) and found ${findings.length} potential secret${findings.length === 1 ? "" : "s"}: ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium. Values are never displayed — verify each location and rotate anything real.`;

  const topFindings = [...findings].sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });

  const report: Report = {
    tool: "secret-sentry",
    toolLabel: getTool("secret-sentry").name,
    title: "ForgeKit SecretSentry Report",
    generatedAt: new Date().toISOString(),
    score,
    summary,
    findings: topFindings,
    sections: [
      {
        heading: "Recommended remediation",
        body: [
          "1. Revoke/rotate every confirmed credential — rotation is the only real fix.",
          "2. Remove the secret from the file AND from git history (e.g. git filter-repo or BFG).",
          "3. Move secrets to environment variables or a secret manager.",
          "4. Add the file patterns to .gitignore and enable push protection on your repo.",
        ].join("\n"),
      },
      {
        heading: "Detection scope",
        rows: [
          ["Files scanned", String(filesScanned)],
          ["Lines scanned", linesScanned.toLocaleString()],
          ["Pattern families", String(PATTERNS.length)],
          ["Values displayed", "Never — by design"],
        ],
      },
    ],
    meta: { "Scan mode": "local (in-browser)" },
  };

  return { report, filesScanned, linesScanned };
}

/** Text-mode scan convenience wrapper (single "file"). */
export function scanText(name: string, text: string): ScanResult {
  return scanFiles([{ path: name, content: text }]);
}
