"use client";

import { useState, useTransition } from "react";
import {
  analyzeJwt, analyzePassword, buildAuthLabReport, AUTH_CONCEPTS,
  type JwtAnalysis, type PasswordAnalysis,
} from "@/engines/auth-lab";
import type { Report } from "@/lib/types";
import { ReportView } from "@/components/report-view";
import {
  Button, Card, KVTable, TextArea, TextInput, ToolHeader, Badge,
} from "@/components/ui";
import { recordRun } from "@/lib/runs";

/* ---------- PBKDF2 demo via WebCrypto ---------- */

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hex(password: string, salt: string, iterations: number): Promise<{ hex: string; ms: number }> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const t0 = performance.now();
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations },
    key,
    256,
  );
  const ms = performance.now() - t0;
  return { hex: [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join(""), ms };
}

function HashingDemo({ onAnalysis }: { onAnalysis: (a: PasswordAnalysis) => void }) {
  const [pw, setPw] = useState("");
  const [salt] = useState(() => Math.random().toString(36).slice(2, 10));
  const [result, setResult] = useState<{ fast?: string; slow?: string; ms?: number; iterations: number } | null>(null);
  const [analysis, setAnalysis] = useState<PasswordAnalysis | null>(null);
  const [isPending, startTransition] = useTransition();

  const runDemo = () => {
    if (!pw) return;
    const a = analyzePassword(pw);
    setAnalysis(a);
    onAnalysis(a);
    startTransition(async () => {
      const fast = await sha256Hex(pw + salt);
      const iterations = 100_000;
      const { hex, ms } = await pbkdf2Hex(pw, salt, iterations);
      setResult({ fast, slow: hex, ms, iterations });
    });
  };

  return (
    <Card
      title="DEMO 1 — WHY SLOW HASHES MATTER"
      subtitle="same password, two storage strategies, run in YOUR browser via WebCrypto"
    >
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label="try a password (never leaves this page)"
          value={pw}
          onChange={setPw}
          placeholder="correct horse battery staple"
          onEnter={runDemo}
          className="min-w-[280px] flex-1"
        />
        <Button onClick={runDemo} disabled={isPending || !pw}>
          ▶ HASH IT
        </Button>
      </div>
      {analysis && result && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
              <div className="font-mono text-[11px] uppercase tracking-wider text-danger">
                SHA-256 (fast) — don't store passwords this way
              </div>
              <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-dim">{result.fast?.slice(0, 48)}…</pre>
              <p className="mt-2 text-xs text-dim">a GPU rig tries <span className="font-mono text-warn">~10 billion/sec</span> against this</p>
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
              <div className="font-mono text-[11px] uppercase tracking-wider text-accent">
                PBKDF2-SHA256 ×{result.iterations.toLocaleString()} (+ random salt)
              </div>
              <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-dim">{result.slow?.slice(0, 48)}…</pre>
              <p className="mt-2 text-xs text-dim">
                took <span className="font-mono text-accent">{result.ms?.toFixed(0)} ms</span> per guess → same rig only ~10k/sec.
                Production uses Argon2id/bcrypt for stronger GPU resistance.
              </p>
            </div>
          </div>
          <KVTable
            rows={[
              ["Salt (random, per user)", salt],
              ["Length / entropy", `${analysis.length} chars · ~${analysis.entropyBits} bits`],
              ["Charset", analysis.charsetNotes.join(", ") || "—"],
              ["Pattern flags", analysis.commonPatternHits.join("; ") || "none ✓"],
              ["Cracked vs SHA-256 rig", analysis.crackTimeSha256],
              ["Cracked vs Argon2id", analysis.crackTimeArgon2],
              ["Verdict", analysis.verdict],
            ]}
          />
        </div>
      )}
    </Card>
  );
}

/* ---------- JWT explorer ---------- */

async function verifyHs256(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${parts[0]}.${parts[1]}`));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return expectedB64 === parts[2];
  } catch {
    return false;
  }
}

function JwtDemo({ onJwt }: { onJwt: (j: JwtAnalysis) => void }) {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [analysis, setAnalysis] = useState<JwtAnalysis | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  const run = () => {
    const out = analyzeJwt(token);
    setAnalysis(out);
    onJwt(out);
    setVerified(null);
  };

  const verify = async () => {
    if (!token || !secret) return;
    setVerified(await verifyHs256(token, secret));
  };

  return (
    <Card
      title="DEMO 2 — JWT EXPLORER"
      subtitle="paste any JWT: it decodes locally, flags bad claims, and verifies HS256 signatures with your secret"
    >
      <TextArea
        value={token}
        onChange={setToken}
        rows={4}
        label="JWT (header.payload.signature)"
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature…"
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <TextInput
          label="HS256 secret (for signature check)"
          value={secret}
          onChange={setSecret}
          placeholder="your-jwt-signing-secret"
          className="min-w-[260px] flex-1"
        />
        <Button onClick={run} disabled={!token.trim()}>▶ DECODE</Button>
        <Button variant="outline" onClick={() => void verify()} disabled={!token.trim() || !secret}>
          VERIFY SIGNATURE
        </Button>
      </div>

      {analysis && (
        <div className="mt-4 space-y-3">
          {verified !== null && (
            <div
              className={`rounded-md border px-3 py-2 font-mono text-xs ${
                verified
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {verified ? "✓ SIGNATURE VALID for this secret (HS256)" : "✗ SIGNATURE DOES NOT MATCH that secret"}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">HEADER</div>
              <pre className="overflow-x-auto rounded-md border border-line bg-[#070b10] p-3 font-mono text-[11px] text-info">
                {analysis.header?.decoded ?? "—"}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">
                PAYLOAD (readable by ANYONE holding the token)
              </div>
              <pre className="overflow-x-auto rounded-md border border-line bg-[#070b10] p-3 font-mono text-[11px] text-accent/90">
                {analysis.payload?.decoded ?? "—"}
              </pre>
            </div>
          </div>
          {analysis.issues.length > 0 && (
            <div className="space-y-2">
              {analysis.issues.map((iss, i) => (
                <div key={i} className="rounded-md border border-line bg-panel2/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        iss.severity === "critical" || iss.severity === "high"
                          ? "red"
                          : iss.severity === "medium"
                            ? "amber"
                            : "green"
                      }
                    >
                      {iss.severity}
                    </Badge>
                    <span className="text-sm text-ink">{iss.title}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-dim">{iss.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function AuthLabPage() {
  const [lastAnalysis, setLastAnalysis] = useState<PasswordAnalysis | null>(null);
  const [lastJwt, setLastJwt] = useState<JwtAnalysis | null>(null);
  const [sessionReport, setSessionReport] = useState<Report | null>(null);

  const buildReport = () => {
    const report = buildAuthLabReport(lastAnalysis, lastJwt);
    setSessionReport(report);
    recordRun("auth-lab", "educational session", report, new Date().toISOString());
  };

  return (
    <div>
      <ToolHeader
        icon="🔐"
        name="AuthLab"
        tagline="Learn authentication by doing: hashing cost, salts, JWT anatomy — live demos run entirely in your browser. Educational only."
        privacy="LOCAL-ONLY DEMOS"
      />

      <div className="space-y-6">
        <HashingDemo onAnalysis={setLastAnalysis} />
        <JwtDemo onJwt={setLastJwt} />

        <Card title="CORE CONCEPTS" subtitle="the mental model behind the demos">
          <div className="space-y-3">
            {AUTH_CONCEPTS.map((c) => (
              <details key={c.title} className="rounded-md border border-line bg-panel2/40 px-3 py-2.5">
                <summary className="cursor-pointer font-mono text-sm text-ink">{c.title}</summary>
                <p className="mt-2 text-[13px] leading-relaxed text-dim">{c.body}</p>
              </details>
            ))}
          </div>
        </Card>

        <Card title="SESSION REPORT" subtitle="export what you analyzed (MD/JSON/PDF)">
          <Button onClick={buildReport} disabled={!lastAnalysis && !lastJwt}>
            BUILD SESSION REPORT
          </Button>
          {!lastAnalysis && !lastJwt && (
            <p className="mt-2 text-xs text-faint">
              Run a demo above first — the report includes your password analysis and JWT findings.
            </p>
          )}
        </Card>

        {sessionReport && <ReportView report={sessionReport} />}
      </div>
    </div>
  );
}
