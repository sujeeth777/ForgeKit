import type { Finding, Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * DepWatch — dependency manifest analysis.
 * - Parses package.json / requirements.txt / go.mod / Cargo.toml / pom.xml
 * - Offline advisory snapshot (labelled with a date — not a live feed)
 * - Optional LIVE outdated check against the npm registry (client-side)
 */

export interface ParsedDep {
  name: string;
  version: string;
  section: string;
  ecosystem: "npm" | "pypi" | "go" | "cargo" | "maven";
}

export interface Advisory {
  ecosystem: ParsedDep["ecosystem"];
  package: string;
  introduced?: string;
  fixed: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  cves: string[];
}

/** Snapshot of well-known advisories — deliberately small and clearly labelled. */
export const ADVISORY_SNAPSHOT: Advisory[] = [
  { ecosystem: "npm", package: "lodash", introduced: "0.0.0", fixed: "4.17.21", severity: "high", title: "Prototype pollution & command injection", cves: ["CVE-2020-8203", "CVE-2021-23337"] },
  { ecosystem: "npm", package: "next", introduced: "13.0.0", fixed: "15.2.3", severity: "critical", title: "Middleware authorization bypass (upgrade ≥ 14.2.25 / 15.2.3 line)", cves: ["CVE-2025-29927"] },
  { ecosystem: "npm", package: "axios", introduced: "0.8.1", fixed: "1.6.0", severity: "high", title: "Credential leak on cross-origin redirect", cves: ["CVE-2023-45857"] },
  { ecosystem: "npm", package: "axios", introduced: "1.6.0", fixed: "1.8.2", severity: "high", title: "Server-side request forgery via absolute URL", cves: ["CVE-2025-27152"] },
  { ecosystem: "npm", package: "express", introduced: "0.0.0", fixed: "4.19.2", severity: "medium", title: "Open redirect via malformed URLs", cves: ["CVE-2024-29041"] },
  { ecosystem: "npm", package: "jsonwebtoken", introduced: "0.0.0", fixed: "9.0.0", severity: "critical", title: "Unrestricted key type → signature bypass", cves: ["CVE-2022-23529", "CVE-2022-23539", "CVE-2022-23540"] },
  { ecosystem: "npm", package: "semver", introduced: "0.0.0", fixed: "6.3.1", severity: "medium", title: "ReDoS in range parsing", cves: ["CVE-2022-25883"] },
  { ecosystem: "npm", package: "ws", introduced: "6.0.0", fixed: "8.17.1", severity: "high", title: "DoS via many HTTP headers", cves: ["CVE-2024-37890"] },
  { ecosystem: "npm", package: "node-fetch", introduced: "2.0.0", fixed: "2.7.0", severity: "medium", title: "Forward proxy header leak", cves: ["CVE-2022-0235"] },
  { ecosystem: "npm", package: "tar", introduced: "4.4.0", fixed: "6.2.1", severity: "high", title: "Arbitrary file overwrite on extraction", cves: ["CVE-2024-28863"] },
  { ecosystem: "npm", package: "braces", introduced: "0.0.0", fixed: "3.0.3", severity: "medium", title: "ReDoS via crafted patterns", cves: ["CVE-2024-4068"] },
  { ecosystem: "npm", package: "minimatch", introduced: "0.0.0", fixed: "3.0.5", severity: "medium", title: "ReDoS", cves: ["CVE-2022-3517"] },
  { ecosystem: "npm", package: "fast-xml-parser", introduced: "4.0.0", fixed: "4.4.1", severity: "high", title: "Entity expansion memory exhaustion", cves: ["CVE-2024-41818"] },
  { ecosystem: "pypi", package: "requests", introduced: "2.0.0", fixed: "2.32.0", severity: "medium", title: "Verify=False persists across redirects", cves: ["CVE-2024-35195"] },
  { ecosystem: "pypi", package: "jinja2", introduced: "2.0.0", fixed: "3.1.6", severity: "high", title: "Sandbox escape via str.format", cves: ["CVE-2025-27516"] },
  { ecosystem: "pypi", package: "django", introduced: "4.2.0", fixed: "4.2.16", severity: "high", title: "Multiple: SQL injection via Key/Path transforms, DoS", cves: ["CVE-2024-45230", "CVE-2024-45231"] },
  { ecosystem: "pypi", package: "flask", introduced: "2.0.0", fixed: "3.0.1", severity: "medium", title: "Host header injection on subdomains", cves: ["CVE-2023-30861"] },
  { ecosystem: "maven", package: "log4j-core", introduced: "2.0.0", fixed: "2.17.1", severity: "critical", title: "Log4Shell — RCE via crafted log messages", cves: ["CVE-2021-44228", "CVE-2021-45046"] },
  { ecosystem: "cargo", package: "serde_yaml", introduced: "0.0.0", fixed: "0.9.21", severity: "medium", title: "Uncontrolled recursion → stack overflow", cves: ["RUSTSEC-2024-0320"] },
  { ecosystem: "go", package: "golang.org/x/net", introduced: "0.0.0", fixed: "0.17.0", severity: "high", title: "HTTP/2 rapid reset DoS (upgrade x/net)", cves: ["CVE-2023-39325"] },
];

export const ADVISORY_SNAPSHOT_DATE = "2026-11";

/* ---------- version helpers (semver-ish, tolerant) ---------- */

function versionParts(v: string): number[] {
  const clean = v.trim().replace(/^[^0-9]+/, "").split(/[+\-]/)[0];
  const parts = clean.split(".").map((p) => {
    const n = parseInt(p.replace(/^v/, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Extract a concrete version from an npm range like ^1.2.3, ~2.0, >=3.1.0 */
function npmRangeBaseVersion(range: string): string | null {
  const m = /(\d+\.\d+\.\d+)/.exec(range);
  return m ? m[1] : null;
}

function isAffected(depVersion: string, adv: Advisory): boolean {
  if (adv.ecosystem !== "npm") {
    // pypi/go/cargo/maven manifests carry exact or minimal versions
    return compareVersions(depVersion, adv.fixed) < 0;
  }
  const base = npmRangeBaseVersion(depVersion);
  if (!base) return false;
  if (compareVersions(base, adv.fixed) >= 0) return false;
  if (adv.introduced && compareVersions(base, adv.introduced) < 0) return false;
  return true;
}

/* ---------- manifest parsers ---------- */

export function parseManifest(filename: string, content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  const lower = filename.toLowerCase();

  if (lower.endsWith("package.json")) {
    try {
      const json = JSON.parse(content) as Record<string, Record<string, string>>;
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const obj = json[section];
        if (obj && typeof obj === "object") {
          for (const [name, version] of Object.entries(obj)) {
            if (typeof version === "string") {
              deps.push({ name, version, section, ecosystem: "npm" });
            }
          }
        }
      }
    } catch {
      // caller handles empty list; UI shows parse error
    }
    return deps;
  }

  if (lower.includes("requirements")) {
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.startsWith("-")) continue;
      const m = /^([A-Za-z0-9_.\[\]-]+)\s*(?:([=<>!~]=?)\s*([^;#]+))?/.exec(t);
      if (m) {
        deps.push({
          name: m[1].replace(/\[.*\]/, ""),
          version: m[3]?.trim() ?? "",
          section: "requirements",
          ecosystem: "pypi",
        });
      }
    }
    return deps;
  }

  if (lower === "go.mod") {
    let section = "module";
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("require (")) { section = "require"; continue; }
      if (t.startsWith(")")) { section = "module"; continue; }
      const m = /^\t?([a-z0-9._/-]+)\s+(v[0-9][^\s]+)?/.exec(t);
      if (m && m[1] && m[1] !== "go" && !m[1].startsWith("module")) {
        deps.push({ name: m[1], version: m[2] ?? "", section, ecosystem: "go" });
      }
    }
    return deps;
  }

  if (lower === "cargo.toml") {
    let inDeps = false;
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("[") ) { inDeps = t === "[dependencies]"; continue; }
      if (!inDeps) continue;
      const m = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/.exec(t);
      if (m) deps.push({ name: m[1], version: m[2], section: "dependencies", ecosystem: "cargo" });
    }
    return deps;
  }

  if (lower === "pom.xml") {
    const re = /<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      deps.push({
        name: `${match[1]}:${match[2]}`,
        version: match[3] ?? "",
        section: "dependencies",
        ecosystem: "maven",
      });
    }
    return deps;
  }

  return deps;
}

/* ---------- analysis ---------- */

export interface OutdatedInfo {
  current: string;
  latest: string;
}

export interface DepWatchResult {
  report: Report;
  deps: ParsedDep[];
  vulnerabilities: Array<{ dep: ParsedDep; advisory: Advisory }>;
  /** name → latest version, from the live npm check (when it ran) */
  outdated: Record<string, OutdatedInfo>;
  npmCheckRan: boolean;
  npmCheckFailed: boolean;
}

let counter = 0;
function nid(): string {
  counter += 1;
  return `dw-${counter}`;
}

export function analyzeDeps(deps: ParsedDep[], opts?: { outdated?: Record<string, OutdatedInfo>; npmCheckRan?: boolean; npmCheckFailed?: boolean; manifestName?: string }): DepWatchResult {
  counter = 0;
  const findings: Finding[] = [];
  const vulnerabilities: Array<{ dep: ParsedDep; advisory: Advisory }> = [];
  const outdated = opts?.outdated ?? {};

  for (const dep of deps) {
    for (const adv of ADVISORY_SNAPSHOT) {
      if (adv.package === dep.name && adv.ecosystem === dep.ecosystem && dep.version && isAffected(dep.version, adv)) {
        vulnerabilities.push({ dep, advisory: adv });
        findings.push({
          id: nid(),
          severity: adv.severity,
          title: `${dep.name} ${dep.version} — ${adv.title}`,
          detail: `Affected below ${adv.fixed}. ${adv.cves.join(", ")}. Upgrade ${dep.name} to ≥ ${adv.fixed}. (Offline advisory snapshot ${ADVISORY_SNAPSHOT_DATE} — always confirm on the official advisory DB.)`,
          location: `${dep.name}@${dep.version}`,
        });
        break; // one advisory finding per dep
      }
    }
  }

  let outdatedCount = 0;
  for (const [name, info] of Object.entries(outdated)) {
    outdatedCount += 1;
    const dep = deps.find((d) => d.name === name);
    findings.push({
      id: nid(),
      severity: "low",
      title: `Outdated: ${name} ${dep?.version ?? "?"} → ${info.latest}`,
      detail: `Latest on npm: ${info.latest}. Read the changelog, then update — staying current keeps security patches flowing.`,
      location: `${name}@${dep?.version ?? ""}`,
    });
  }

  const sections: Array<Report["sections"][number]> = [
    {
      heading: "Dependency inventory",
      rows: deps.slice(0, 200).map((d) => [`${d.name}`, `${d.version || "any"} (${d.section})`]),
    },
    {
      heading: "Data sources",
      rows: [
        ["Advisory database", `offline snapshot ${ADVISORY_SNAPSHOT_DATE} (${ADVISORY_SNAPSHOT.length} entries) — not exhaustive`],
        ["npm outdated check", opts?.npmCheckFailed ? "attempted but failed (network) — findings skipped" : opts?.npmCheckRan ? `live via registry.npmjs.org (${outdatedCount} outdated)` : "not run"],
        ["PyPI/go/cargo/maven outdated", "not checked in v0.1 — advisory scan only"],
      ],
    },
  ];

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  const score = Math.max(0, Math.min(100, 100 - counts.critical * 30 - counts.high * 15 - counts.medium * 7 - counts.low * 2));

  const summary = deps.length === 0
    ? "No dependencies parsed. Supported manifests: package.json, requirements.txt, go.mod, Cargo.toml, pom.xml."
    : `Parsed ${deps.length} dependencies: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium advisories matched, ${outdatedCount} outdated (npm). ${opts?.npmCheckFailed ? "Live npm check failed — results are from the offline snapshot only." : ""}`;

  const report: Report = {
    tool: "dep-watch",
    toolLabel: getTool("dep-watch").name,
    title: "ForgeKit DepWatch Report",
    generatedAt: new Date().toISOString(),
    score,
    summary,
    findings,
    sections,
    meta: { Dependencies: String(deps.length), Manifest: opts?.manifestName ?? "—" },
  };

  return { report, deps, vulnerabilities, outdated, npmCheckRan: opts?.npmCheckRan ?? false, npmCheckFailed: opts?.npmCheckFailed ?? false };
}

/** Live npm outdated check (client-side; registry allows CORS). */
export async function checkNpmOutdated(
  deps: ParsedDep[],
  signal?: AbortSignal,
): Promise<{ outdated: Record<string, OutdatedInfo>; failed: boolean }> {
  const npmDeps = deps.filter((d) => d.ecosystem === "npm" && d.version);
  const results: Record<string, OutdatedInfo> = {};
  let failed = 0;

  const queue = [...npmDeps];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length > 0) {
      const dep = queue.shift();
      if (!dep) break;
      try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`, {
          signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { version?: string };
        const latest = data.version;
        if (!latest) continue;
        const base = npmRangeBaseVersion(dep.version) ?? dep.version;
        if (compareVersions(base, latest) < 0) {
          results[dep.name] = { current: dep.version, latest };
        }
      } catch {
        failed += 1;
      }
    }
  });
  await Promise.all(workers);
  return { outdated: results, failed: npmDeps.length > 0 && failed === npmDeps.length };
}
