import type { Finding, Report } from "@/lib/types";
import { getTool } from "@/lib/tools";
import { formatNumber } from "@/lib/utils";

/**
 * LogForge — normalize logs (nginx/apache combined, JSON lines, plain-text
 * with levels, CSV-ish) into a common event structure, then compute stats
 * and flag suspicious patterns (defensive analysis only).
 */

export interface LogEvent {
  line: number;
  raw: string;
  format: "nginx" | "json" | "level" | "csv" | "unknown";
  ts?: string;
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  ip?: string;
  method?: string;
  path?: string;
  status?: number;
  bytes?: number;
  ua?: string;
  message?: string;
}

export interface LogStats {
  total: number;
  parsed: number;
  failed: number;
  byLevel: Record<string, number>;
  byStatus: { x2: number; x3: number; x4: number; x5: number };
  topIps: Array<[string, number]>;
  topPaths: Array<[string, number]>;
  authFailures: number;
  suspicious: Array<{ kind: string; ip?: string; count: number; sample: string }>;
}

export interface LogForgeResult {
  report: Report;
  events: LogEvent[];
  stats: LogStats;
}

let counter = 0;
function nid(): string {
  counter += 1;
  return `lf-${counter}`;
}

const NGINX_RE =
  /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([A-Z]+) (\S+)(?: ([A-Z]+\/[0-9.]+))?" (\d{3}) (\d+|-)(?: "([^"]*)" "([^"]*)")?/;

const LEVEL_RE = /\b(DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|CRIT(?:ICAL)?|FATAL|TRACE)\b/;
const LEVEL_MAP: Record<string, LogEvent["level"]> = {
  DEBUG: "DEBUG", TRACE: "DEBUG", INFO: "INFO", NOTICE: "INFO",
  WARN: "WARN", WARNING: "WARN", ERROR: "ERROR", ERR: "ERROR",
  CRIT: "FATAL", CRITICAL: "FATAL", FATAL: "FATAL",
};

function parseLine(line: string, idx: number): LogEvent {
  // nginx / apache combined
  const m = NGINX_RE.exec(line);
  if (m) {
    return {
      line: idx + 1,
      raw: line,
      format: "nginx",
      ip: m[1],
      ts: m[4],
      method: m[5],
      path: m[6],
      status: parseInt(m[8], 10),
      bytes: m[9] === "-" ? 0 : parseInt(m[9], 10),
      ua: m[11],
    };
  }

  // JSON line
  if (line.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const levelRaw = String(obj.level ?? obj.levelName ?? obj.severity ?? "").toUpperCase();
      return {
        line: idx + 1,
        raw: line,
        format: "json",
        ts: typeof obj.timestamp === "string" ? obj.timestamp : typeof obj.ts === "string" ? obj.ts : undefined,
        level: LEVEL_MAP[levelRaw],
        ip: typeof obj.ip === "string" ? obj.ip : typeof obj.remoteAddr === "string" ? obj.remoteAddr : undefined,
        method: typeof obj.method === "string" ? obj.method : undefined,
        path: typeof obj.path === "string" ? obj.path : typeof obj.url === "string" ? obj.url : undefined,
        status: typeof obj.status === "number" ? obj.status : typeof obj.statusCode === "number" ? obj.statusCode : undefined,
        message: typeof obj.message === "string" ? obj.message : typeof obj.msg === "string" ? obj.msg : undefined,
      };
    } catch {
      /* fall through */
    }
  }

  // CSV with a status-ish column (rough heuristic)
  const cols = line.split(",");
  if (cols.length >= 4 && /^\d{3}$/.test(cols[cols.length - 1]?.trim() ?? "")) {
    return {
      line: idx + 1,
      raw: line,
      format: "csv",
      ip: cols[0]?.trim(),
      method: cols[cols.length - 3]?.trim().toUpperCase().match(/^[A-Z]+$/) ? cols[cols.length - 3].trim() : undefined,
      path: cols[cols.length - 2]?.trim(),
      status: parseInt(cols[cols.length - 1].trim(), 10),
    };
  }

  // plain text with a level token
  const lvl = LEVEL_RE.exec(line.toUpperCase());
  if (lvl) {
    return {
      line: idx + 1,
      raw: line,
      format: "level",
      level: LEVEL_MAP[lvl[1]],
      message: line,
    };
  }

  return { line: idx + 1, raw: line, format: "unknown" };
}

const SQLI_RE = /(union\s+select|select\s+.+\s+from|or\s+1=1|'\s*or\s*'|;\s*drop\s+table|--\s*$)/i;
const TRAVERSAL_RE = /(\.\.\/|\.\.\\|%2e%2e%2f)/i;
const PROBE_RE = /(\/\.env|\/\.git|\/wp-admin|\/wp-login|\/phpmyadmin|\/\.aws|\/config\.json|\/actuator)/i;

/** Best-effort URL decode so encoded attacks (%20, %27…) are still caught. */
function decodeUrlish(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

export function analyzeLogs(text: string, maxEvents = 5000): LogForgeResult {
  counter = 0;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const events: LogEvent[] = [];
  let failed = 0;

  lines.slice(0, maxEvents).forEach((line, idx) => {
    const ev = parseLine(line, idx);
    if (ev.format === "unknown") failed += 1;
    events.push(ev);
  });

  const byLevel: Record<string, number> = {};
  const byStatus = { x2: 0, x3: 0, x4: 0, x5: 0 };
  const ipCounts = new Map<string, number>();
  const pathCounts = new Map<string, number>();
  const ip40x = new Map<string, number>();
  const ip404 = new Map<string, number>();
  const sqliHits: Array<{ ip?: string; sample: string }> = [];
  const traversalHits: Array<{ ip?: string; sample: string }> = [];
  const probeHits = new Map<string, { count: number; ip?: string; sample: string }>();
  let authFailures = 0;

  for (const ev of events) {
    if (ev.level) byLevel[ev.level] = (byLevel[ev.level] ?? 0) + 1;
    if (ev.status !== undefined) {
      const s = Math.floor(ev.status / 100);
      if (s === 2) byStatus.x2 += 1;
      else if (s === 3) byStatus.x3 += 1;
      else if (s === 4) byStatus.x4 += 1;
      else if (s === 5) byStatus.x5 += 1;
      if (ev.status === 401 || ev.status === 403) authFailures += 1;
    }
    if (ev.ip) {
      ipCounts.set(ev.ip, (ipCounts.get(ev.ip) ?? 0) + 1);
      if (ev.status === 401 || ev.status === 403) ip40x.set(ev.ip, (ip40x.get(ev.ip) ?? 0) + 1);
      if (ev.status === 404) ip404.set(ev.ip, (ip404.get(ev.ip) ?? 0) + 1);
    }
    if (ev.path) pathCounts.set(ev.path, (pathCounts.get(ev.path) ?? 0) + 1);
    const decodedPath = ev.path ? decodeUrlish(ev.path) : "";
    if (decodedPath && SQLI_RE.test(decodedPath) && ev.path) {
      sqliHits.push({ ip: ev.ip, sample: ev.path });
    }
    if (ev.path && TRAVERSAL_RE.test(ev.path)) traversalHits.push({ ip: ev.ip, sample: ev.path });
    if (ev.path && PROBE_RE.test(ev.path)) {
      const key = ev.path;
      const prev = probeHits.get(key);
      probeHits.set(key, { count: (prev?.count ?? 0) + 1, ip: ev.ip, sample: key });
    }
    if (ev.message && /failed password|invalid user|authentication failure|login failed/i.test(ev.message)) {
      authFailures += 1;
    }
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const suspicious: LogStats["suspicious"] = [];
  for (const [ip, count] of top(ip40x, 3)) {
    if (count >= 10) {
      suspicious.push({ kind: "Auth-failure burst", ip, count, sample: `${count}× 401/403 from one address — credential stuffing or brute force` });
    }
  }
  for (const [ip, count] of top(ip404, 3)) {
    if (count >= 20) {
      suspicious.push({ kind: "404 scanning burst", ip, count, sample: `${count}× 404s from one address — directory/endpoint scanning` });
    }
  }
  if (sqliHits.length > 0) {
    suspicious.push({ kind: "SQL-injection-shaped requests", ip: sqliHits[0].ip, count: sqliHits.length, sample: sqliHits[0].sample });
  }
  if (traversalHits.length > 0) {
    suspicious.push({ kind: "Path traversal attempts", ip: traversalHits[0].ip, count: traversalHits.length, sample: traversalHits[0].sample });
  }
  for (const [, v] of probeHits) {
    if (v.count >= 1) {
      suspicious.push({ kind: "Sensitive-path probing", ip: v.ip, count: v.count, sample: `${v.sample} (${v.count}×) — bot probing for exposed files` });
    }
  }

  const stats: LogStats = {
    total: lines.length,
    parsed: events.length - failed,
    failed,
    byLevel,
    byStatus,
    topIps: top(ipCounts, 8),
    topPaths: top(pathCounts, 8),
    authFailures,
    suspicious,
  };

  const findings: Finding[] = [];
  for (const s of suspicious) {
    findings.push({
      id: nid(),
      severity: s.kind.includes("SQL-injection") ? "high" : s.kind.includes("Auth-failure") || s.kind.includes("traversal") ? "high" : "medium",
      title: `${s.kind}${s.ip ? ` from ${s.ip}` : ""}`,
      detail: `${s.sample}. Consider rate limiting, WAF rules, and blocking/allowlisting as appropriate. (Defensive analysis — investigate before blocking legitimate users.)`,
    });
  }
  if (byStatus.x5 > 0) {
    findings.push({
      id: nid(),
      severity: byStatus.x5 / Math.max(events.length, 1) > 0.05 ? "high" : "medium",
      title: `${formatNumber(byStatus.x5)} server errors (5xx)`,
      detail: "5xx responses mean your app crashed or a dependency failed. Sample a few raw lines below and trace them to logs/monitoring.",
    });
  }
  if (stats.failed > stats.parsed) {
    findings.push({
      id: nid(),
      severity: "info",
      title: `${formatNumber(stats.failed)} lines could not be parsed`,
      detail: "Mixed formats or truncated lines. LogForge handles nginx/apache combined, JSON lines, level-tagged text and simple CSV. Unrecognized lines are still inspectable in the raw view.",
    });
  }

  const score = Math.max(0, Math.min(100, 100 - findings.reduce((acc, f) => {
    const cost: Record<string, number> = { critical: 30, high: 12, medium: 6, low: 2, info: 1 };
    return acc + (cost[f.severity] ?? 0);
  }, 0)));

  const errorRate = events.length > 0 ? Math.round(((byStatus.x4 + byStatus.x5) / events.length) * 1000) / 10 : 0;

  const report: Report = {
    tool: "log-forge",
    toolLabel: getTool("log-forge").name,
    title: "ForgeKit LogForge Report",
    generatedAt: new Date().toISOString(),
    score,
    summary:
      `Parsed ${formatNumber(stats.parsed)} of ${formatNumber(stats.total)} lines. ` +
      `HTTP: ${formatNumber(byStatus.x2)} 2xx, ${formatNumber(byStatus.x4)} 4xx, ${formatNumber(byStatus.x5)} 5xx (error rate ${errorRate}%). ` +
      `${authFailures} auth failures. ${suspicious.length > 0 ? `${suspicious.length} suspicious pattern${suspicious.length === 1 ? "" : "s"} detected.` : "No suspicious patterns detected."}`,
    findings,
    sections: [
      {
        heading: "Overview",
        rows: [
          ["Lines", formatNumber(stats.total)],
          ["Parsed", formatNumber(stats.parsed)],
          ["Unrecognized", formatNumber(stats.failed)],
          ["Auth failures (401/403/password)", formatNumber(authFailures)],
          ...Object.entries(byLevel).map(([k, v]) => [`Level ${k}`, formatNumber(v)] as [string, string]),
        ],
      },
      {
        heading: "Status codes",
        rows: [
          ["2xx success", formatNumber(byStatus.x2)],
          ["3xx redirect", formatNumber(byStatus.x3)],
          ["4xx client error", formatNumber(byStatus.x4)],
          ["5xx server error", formatNumber(byStatus.x5)],
        ],
      },
      {
        heading: "Top client IPs",
        rows: stats.topIps.map(([ip, c]) => [ip, formatNumber(c)]),
      },
      {
        heading: "Top request paths",
        rows: stats.topPaths.map(([p, c]) => [p, formatNumber(c)]),
      },
    ],
    meta: { "Formats detected": [...new Set(events.map((e) => e.format))].join(", ") || "—" },
  };

  return { report, events, stats };
}
