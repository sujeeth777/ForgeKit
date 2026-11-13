/** Shared types for the unified ForgeKit data model. */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type ToolId =
  | "repo-analyzer"
  | "env-doctor"
  | "dep-watch"
  | "secret-sentry"
  | "http-guard"
  | "net-peek"
  | "log-forge"
  | "linux-lens"
  | "arch-map"
  | "site-blueprint"
  | "web-cost"
  | "attack-graph"
  | "auth-lab";

export type ToolCategory =
  | "developer"
  | "security"
  | "network"
  | "linux"
  | "architecture"
  | "cost"
  | "logs"
  | "labs";

/** A single finding produced by any tool. Values are never raw secrets. */
export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** e.g. "src/config.py:18" or a URL or a label */
  location?: string;
  meta?: Record<string, string | number>;
}

export interface ReportSection {
  heading: string;
  body?: string;
  /** key/value rows rendered as a table */
  rows?: Array<[string, string]>;
  /** pre-formatted block (diagram, code, sample) */
  code?: string;
}

export interface Report {
  tool: ToolId;
  toolLabel: string;
  title: string;
  generatedAt: string;
  /** 0–100, when the tool supports scoring */
  score?: number;
  summary: string;
  findings: Finding[];
  sections: ReportSection[];
  meta?: Record<string, string | number>;
}

/** A recorded execution of any tool — the unified ToolRun model. */
export interface ToolRun {
  id: string;
  tool: ToolId;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "failed";
  /** short human description of what was run */
  inputSummary: string;
  score?: number;
  /** high/medium/critical finding count */
  findingCount: number;
  report?: Report;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function worstSeverity(findings: Finding[]): Severity | null {
  if (findings.length === 0) return null;
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )[0].severity;
}
