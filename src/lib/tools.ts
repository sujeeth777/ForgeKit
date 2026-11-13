import type { ToolCategory, ToolId } from "./types";

export interface ToolMeta {
  id: ToolId;
  name: string;
  icon: string;
  category: ToolCategory;
  tagline: string;
  /** where it runs: client = nothing leaves the browser */
  runsIn: "browser" | "server";
  phase: number;
}

export const TOOLS: ToolMeta[] = [
  {
    id: "repo-analyzer",
    name: "Repo Analyzer",
    icon: "🔍",
    category: "developer",
    tagline: "Drop a ZIP — languages, structure, large files, config smell.",
    runsIn: "browser",
    phase: 2,
  },
  {
    id: "env-doctor",
    name: "EnvDoctor",
    icon: "🩺",
    category: "developer",
    tagline: "Health-check .env files: duplicates, placeholders, weak secrets.",
    runsIn: "browser",
    phase: 1,
  },
  {
    id: "dep-watch",
    name: "DepWatch",
    icon: "📦",
    category: "developer",
    tagline: "Dependencies, live outdated checks and known advisories.",
    runsIn: "browser",
    phase: 2,
  },
  {
    id: "secret-sentry",
    name: "SecretSentry",
    icon: "🛡",
    category: "security",
    tagline: "Hunt leaked API keys & tokens. Values are never displayed.",
    runsIn: "browser",
    phase: 1,
  },
  {
    id: "http-guard",
    name: "HTTPGuard",
    icon: "🔒",
    category: "security",
    tagline: "Security headers + HTTPS audit for a URL you control.",
    runsIn: "server",
    phase: 1,
  },
  {
    id: "net-peek",
    name: "NetPeek",
    icon: "🌐",
    category: "network",
    tagline: "Your connection, DNS records and network fingerprints.",
    runsIn: "browser",
    phase: 2,
  },
  {
    id: "log-forge",
    name: "LogForge",
    icon: "📊",
    category: "logs",
    tagline: "Parse nginx/JSON/plain logs into stats and suspicious patterns.",
    runsIn: "browser",
    phase: 2,
  },
  {
    id: "linux-lens",
    name: "LinuxLens",
    icon: "🐧",
    category: "linux",
    tagline: "Explain any Linux command — chmod, ssh, systemctl and more.",
    runsIn: "browser",
    phase: 2,
  },
  {
    id: "arch-map",
    name: "ArchMap",
    icon: "🏗",
    category: "architecture",
    tagline: "Stack → architecture diagram. Export Mermaid, SVG, JSON, MD.",
    runsIn: "browser",
    phase: 1,
  },
  {
    id: "site-blueprint",
    name: "SiteBlueprint",
    icon: "📐",
    category: "architecture",
    tagline: "Website type + scale → pages, features, stack blueprint.",
    runsIn: "browser",
    phase: 4,
  },
  {
    id: "web-cost",
    name: "WebCost",
    icon: "💰",
    category: "cost",
    tagline: "Estimate development & monthly infra cost, clearly labelled.",
    runsIn: "browser",
    phase: 1,
  },
  {
    id: "attack-graph",
    name: "AttackGraph",
    icon: "🕸",
    category: "security",
    tagline: "Map your attack surface and the defensive controls per layer.",
    runsIn: "browser",
    phase: 3,
  },
  {
    id: "auth-lab",
    name: "AuthLab",
    icon: "🔐",
    category: "labs",
    tagline: "Learn auth: hashing, salts, PBKDF2, JWT — live in your browser.",
    runsIn: "browser",
    phase: 3,
  },
];

export function getTool(id: ToolId): ToolMeta {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
