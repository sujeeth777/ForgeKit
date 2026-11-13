import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * AuthLab — educational authentication concepts with local demos.
 * Pure functions (JWT decode/analysis, password analysis). Hashing demos run
 * in the browser with WebCrypto (PBKDF2) — no plaintext ever leaves the page.
 */

export interface JwtPart {
  raw: string;
  decoded: string;
}

export interface JwtAnalysis {
  validStructure: boolean;
  header?: JwtPart;
  payload?: JwtPart;
  signature?: string;
  headerJson?: Record<string, unknown>;
  payloadJson?: Record<string, unknown>;
  issues: Array<{ severity: "critical" | "high" | "medium" | "low" | "info"; title: string; detail: string }>;
  claims: Array<[string, string]>;
  expReadable?: string;
}

function base64UrlDecode(part: string): string | null {
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    // atob exists in browsers and Node 18+; guard for safety
    if (typeof atob === "function") {
      return decodeURIComponent(
        atob(padded)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      );
    }
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

export function analyzeJwt(token: string): JwtAnalysis {
  const parts = token.trim().split(".");
  const issues: JwtAnalysis["issues"] = [];
  const result: JwtAnalysis = { validStructure: parts.length === 3, issues, claims: [] };

  if (parts.length !== 3) {
    issues.push({
      severity: "high",
      title: "Not a JWT structure",
      detail: `A JWT has three dot-separated base64url parts (header.payload.signature). Found ${parts.length} part${parts.length === 1 ? "" : "s"}. This could be an opaque token — that's fine, it just isn't a JWT.`,
    });
    return result;
  }

  const headerDecoded = base64UrlDecode(parts[0]);
  const payloadDecoded = base64UrlDecode(parts[1]);
  result.signature = parts[2];

  if (headerDecoded) {
    result.header = { raw: parts[0], decoded: headerDecoded };
    try {
      result.headerJson = JSON.parse(headerDecoded) as Record<string, unknown>;
      const alg = String(result.headerJson.alg ?? "?");
      if (alg === "none") {
        issues.push({
          severity: "critical",
          title: 'Algorithm is "none"',
          detail: "Unsigned tokens are a classic CVE (alg:none). Never accept them — your library must enforce a single expected algorithm.",
        });
      }
    } catch {
      issues.push({ severity: "medium", title: "Header is not valid JSON", detail: "The first part did not decode to JSON." });
    }
  }

  if (payloadDecoded) {
    result.payload = { raw: parts[1], decoded: payloadDecoded };
    try {
      const payload = JSON.parse(payloadDecoded) as Record<string, unknown>;
      result.payloadJson = payload;
      for (const [k, v] of Object.entries(payload)) {
        result.claims.push([k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
      }

      if ("exp" in payload && typeof payload.exp === "number") {
        result.expReadable = new Date(payload.exp * 1000).toISOString();
        const expired = payload.exp * 1000 < Date.now();
        issues.push({
          severity: expired ? "medium" : "info",
          title: expired ? "Token is expired" : "Token has an expiry",
          detail: expired
            ? `exp was ${result.expReadable} — this token is no longer valid. Expired tokens found in logs or URLs are harmless leftovers but should not be reused.`
            : `Expires at ${result.expReadable}. Access tokens should be short-lived (minutes), with refresh tokens rotating server-side.`,
        });
      } else {
        issues.push({
          severity: "medium",
          title: "No exp claim",
          detail: "Without an expiry, a stolen token works forever. Always set exp on access tokens.",
        });
      }

      const sensitive = Object.keys(payload).filter((k) => /password|ssn|credit|secret|api.?key/i.test(k));
      if (sensitive.length > 0) {
        issues.push({
          severity: "high",
          title: `Sensitive data in payload: ${sensitive.join(", ")}`,
          detail: "JWT payloads are base64, NOT encrypted — anyone holding the token can read them. Keep only identifiers and non-sensitive claims.",
        });
      }
    } catch {
      issues.push({ severity: "medium", title: "Payload is not valid JSON", detail: "The second part did not decode to JSON." });
    }
  }

  if (parts[2].length < 20) {
    issues.push({
      severity: "medium",
      title: "Suspiciously short signature",
      detail: "A real HS256/RS256 signature is long. A short one suggests a hand-built token — verify your signing setup.",
    });
  }

  return result;
}

/* ---------- password analysis ---------- */

export interface PasswordAnalysis {
  length: number;
  entropyBits: number;
  charsetNotes: string[];
  commonPatternHits: string[];
  verdict: "very-weak" | "weak" | "okay" | "strong" | "excellent";
  /** rough offline-crack times at 10^10 guesses/sec (GPU rig vs SHA-256) */
  crackTimeSha256: string;
  crackTimeArgon2: string;
}

const COMMON_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:password|passwd|passwort)/i, "starts with 'password'"],
  [/^(?:admin|root|user)/i, "starts with admin/root/user"],
  [/^[a-z]+[0-9]{1,4}!?$/i, "word + digits + optional ! — the classic pattern"],
  [/123456|qwerty|letmein|iloveyou|dragon|monkey|football|baseball/i, "contains a top-10 leaked password"],
  [/^(.)\1+$/, "same character repeated"],
  [/(?:19|20)\d{2}$/, "ends with a year"],
];

const CHARSET_SIZE = 26 + 26 + 10 + 33; // lower + upper + digits + common symbols

export function analyzePassword(pw: string): PasswordAnalysis {
  const length = pw.length;
  const unique = new Set(pw.split("")).size;
  const notes: string[] = [];
  if (/[a-z]/.test(pw)) notes.push("lowercase ✓");
  if (/[A-Z]/.test(pw)) notes.push("uppercase ✓");
  if (/[0-9]/.test(pw)) notes.push("digits ✓");
  if (/[^a-zA-Z0-9]/.test(pw)) notes.push("symbols ✓");
  if (unique < length * 0.5 && length > 6) notes.push("⚠ many repeated characters");

  // Shannon-ish entropy estimate over an assumed uniform charset
  const pool = (() => {
    let size = 0;
    if (/[a-z]/.test(pw)) size += 26;
    if (/[A-Z]/.test(pw)) size += 26;
    if (/[0-9]/.test(pw)) size += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) size += 33;
    return Math.max(size, 1);
  })();
  const entropyBits = Math.round(length * Math.log2(pool));

  const hits = COMMON_PATTERNS.filter(([re]) => re.test(pw)).map(([, label]) => label);

  const guessSpace = Math.pow(2, Math.min(entropyBits, 128));
  const gpuRate = 1e10; // naive SHA-256 guesses/sec on a multi-GPU rig
  const argonRate = 1e4; // Argon2id with sane params
  const seconds = (rate: number) => guessSpace / rate;
  const fmtTime = (s: number) => {
    if (!isFinite(s)) return "beyond practical reach";
    if (s < 1) return "instantly";
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    if (s < 3.15e7) return `${Math.round(s / 86400)} days`;
    const years = s / 3.15e7;
    if (years < 1e6) return `${Math.round(years).toLocaleString()} years`;
    if (years < 1e12) return `${(years / 1e6).toPrecision(2)} million years`;
    return `${(years / 1e9).toPrecision(2)} billion years`;
  };

  let verdict: PasswordAnalysis["verdict"] = "very-weak";
  if (hits.length === 0 && length >= 16 && entropyBits >= 80) verdict = "excellent";
  else if (hits.length === 0 && length >= 12 && entropyBits >= 60) verdict = "strong";
  else if (length >= 10 && entropyBits >= 50) verdict = "okay";
  else if (length >= 8 && entropyBits >= 35) verdict = "weak";
  // dictionary-style patterns make crack time irrelevant to the entropy math
  if (hits.length > 0 && (verdict === "okay" || verdict === "strong" || verdict === "excellent")) {
    verdict = "weak";
  }

  return {
    length,
    entropyBits,
    charsetNotes: notes,
    commonPatternHits: hits,
    verdict,
    crackTimeSha256: fmtTime(seconds(gpuRate)),
    crackTimeArgon2: fmtTime(seconds(argonRate)),
  };
}

export const AUTH_CONCEPTS: Array<{ title: string; body: string }> = [
  {
    title: "Password storage — the only correct answer",
    body:
      "Never store or hash passwords with SHA-256/MD5. Use a memory-hard KDF: Argon2id (first choice), bcrypt, or scrypt. " +
      "These are deliberately slow and GPU/ASIC-resistant, and they include a per-user salt built in. " +
      "OWASP 2024 guidance: Argon2id with m=19 MiB, t=2, p=1 as a floor; bcrypt with cost ≥ 10.",
  },
  {
    title: "Salts — why rainbow tables fail",
    body:
      "A salt is a unique random value per password, stored alongside the hash. Same password → different hash for every user, " +
      "so precomputed rainbow tables are useless. Modern KDFs (Argon2, bcrypt) salt automatically; a hand-rolled 'sha256(salt + pw)' is NOT sufficient — it's still fast to brute-force.",
  },
  {
    title: "Sessions vs JWT",
    body:
      "Server-side sessions: state in your DB/Redis, opaque cookie ID. Easy to revoke, easy to reason about. JWTs: signed claims stored client-side; " +
      "stateless verification but hard revocation (you need denylists or short exp + refresh). Default choice for most apps: sessions with a secure, HttpOnly, SameSite cookie.",
  },
  {
    title: "Refresh tokens",
    body:
      "Access tokens live minutes; refresh tokens live days/weeks and rotate on every use (old one invalid). Store refresh tokens server-side (hashed) so " +
      "you can revoke them. If a refresh token is reused after rotation → assume theft, kill the whole session family.",
  },
  {
    title: "MFA",
    body:
      "Something you know (password) + something you have (TOTP app, passkey/WebAuthn, hardware key). SMS is better than nothing but SIM-swap vulnerable. " +
      "Passkeys (WebAuthn) are the modern gold standard — phishing-resistant by design.",
  },
  {
    title: "Rate limiting",
    body:
      "Throttle login attempts per-account AND per-IP (e.g. 5 failures → exponential backoff). Combine with global limits on the API. " +
      "Rate limiting is the control that turns online brute-force from 'feasible' to 'useless'.",
  },
  {
    title: "The demo here is safe",
    body:
      "The hashing demo runs entirely in YOUR browser with WebCrypto (PBKDF2-SHA256 as a stand-in — Argon2 needs WASM). " +
      "Nothing is sent anywhere. The JWT explorer decodes locally too; verification uses the key you type, in the page, in memory.",
  },
];

export function buildAuthLabReport(analysis: PasswordAnalysis | null, jwt: JwtAnalysis | null): Report {
  const findings: Array<import("@/lib/types").Finding> = [];
  if (analysis) {
    if (analysis.verdict === "very-weak" || analysis.verdict === "weak") {
      findings.push({
        id: "al-pw-1",
        severity: "high",
        title: `Password is ${analysis.verdict}`,
        detail: `~${analysis.entropyBits} bits of entropy. Against a SHA-256 rig: cracked ${analysis.crackTimeSha256}. Against Argon2id: ${analysis.crackTimeArgon2}. Use a password manager and a long unique phrase.`,
      });
    }
    for (const hit of analysis.commonPatternHits) {
      findings.push({
        id: "al-pw-2",
        severity: "medium",
        title: "Common pattern detected",
        detail: `Pattern: ${hit}. Cracking dictionaries start with these.`,
      });
    }
  }
  for (const issue of jwt?.issues ?? []) {
    findings.push({
      id: "al-jwt",
      severity: issue.severity,
      title: `JWT: ${issue.title}`,
      detail: issue.detail,
    });
  }

  return {
    tool: "auth-lab",
    toolLabel: getTool("auth-lab").name,
    title: "ForgeKit AuthLab Session Report",
    generatedAt: new Date().toISOString(),
    summary:
      findings.length === 0
        ? "Educational analysis complete — no issues flagged in what you analyzed. Everything ran locally in your browser."
        : `${findings.length} observation${findings.length === 1 ? "" : "s"} from your local analysis. Educational only — no data left your browser.`,
    findings,
    sections: [
      ...(analysis
        ? [{
            heading: "Password analysis",
            rows: [
              ["Length", String(analysis.length)],
              ["Charset", analysis.charsetNotes.join(", ")],
              ["Entropy estimate", `${analysis.entropyBits} bits`],
              ["vs SHA-256 rig", analysis.crackTimeSha256],
              ["vs Argon2id", analysis.crackTimeArgon2],
              ["Verdict", analysis.verdict],
            ] as Array<[string, string]>,
          }]
        : []),
      ...(jwt?.validStructure
        ? [{
            heading: "JWT structure",
            rows: [
              ["Header", jwt.header?.decoded ?? "—"],
              ["Claims", jwt.claims.map(([k, v]) => `${k}=${v}`).join(", ").slice(0, 300) || "—"],
              ["Expires", jwt.expReadable ?? "no exp claim"],
            ] as Array<[string, string]>,
          }]
        : []),
      ...AUTH_CONCEPTS.map((c) => ({ heading: c.title, body: c.body })),
    ],
    meta: { Mode: "educational, local-only" },
  };
}
