"use client";

import type { Report, ToolRun } from "./types";
import { uid } from "./utils";

/**
 * Local-first ToolRun store (localStorage).
 * The unified data model from the spec (User → Projects → ToolRuns) starts
 * here; a server backend can adopt the same ToolRun shape later.
 */

const KEY = "forgekit.runs.v1";
export const MAX_RUNS = 200;

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): ToolRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ToolRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(runs: ToolRun[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // storage full — drop old runs and retry once
    try {
      window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, 25)));
    } catch {
      /* give up silently */
    }
  }
  listeners.forEach((l) => l());
}

export function recordRun(
  tool: ToolRun["tool"],
  inputSummary: string,
  report: Report,
  startedAt: string,
): ToolRun {
  const run: ToolRun = {
    id: uid(),
    tool,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "completed",
    inputSummary,
    score: report.score,
    findingCount: report.findings.filter(
      (f) => f.severity === "high" || f.severity === "critical" || f.severity === "medium",
    ).length,
    report,
  };
  const runs = read();
  write([run, ...runs]);
  return run;
}

export function listRuns(): ToolRun[] {
  return read();
}

export function listRunsFor(tool: ToolRun["tool"]): ToolRun[] {
  return read().filter((r) => r.tool === tool);
}

export function clearRuns(): void {
  write([]);
}

export function clearRunsFor(tool: ToolRun["tool"]): void {
  write(read().filter((r) => r.tool !== tool));
}

export function exportAll(): string {
  return JSON.stringify({ version: 1, runs: read() }, null, 2);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
