import type { Finding, Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * AttackGraph — DEFENSIVE attack-surface mapping.
 * You describe how your system is connected; ForgeKit renders the flow and
 * suggests security controls per layer. No exploitation, no offense.
 */

export interface GraphNode {
  id: string;
  label: string;
  layer: number;
}

export interface ParsedGraph {
  nodes: GraphNode[];
  edges: Array<[string, string]>;
  chains: string[][];
}

/** Defensive controls per node-type keyword. */
const CONTROL_KB: Array<{ match: RegExp; controls: string[]; mitreNote: string }> = [
  {
    match: /internet|user|public|client/i,
    controls: ["DDoS protection / rate limiting at the edge", "CDN/WAF in front of origins", "TLS everywhere, HSTS"],
    mitreNote: "T1498 (Network DoS), T1190 (Exploit Public-Facing App)",
  },
  {
    match: /web|app|frontend|next|react|api|server/i,
    controls: ["Input validation + output encoding", "CSP and security headers", "Dependency scanning in CI", "Rate limiting per IP/user", "WAF rules for common injection patterns"],
    mitreNote: "T1190 (Exploit Public-Facing App), T1505.003 (Web Shell)",
  },
  {
    match: /auth|login|session|identity|sso/i,
    controls: ["MFA on all accounts", "Argon2id/bcrypt password hashing", "Rate limit + lockout on failures", "Short-lived sessions, refresh rotation", "Centralized audit log of logins"],
    mitreNote: "T1078 (Valid Accounts), T1110 (Brute Force)",
  },
  {
    match: /database|db|postgres|mysql|mongo|sql/i,
    controls: ["Encryption at rest + in transit", "Least-privilege DB users per service", "Parameterized queries only", "Automated backups + restore drills", "Query audit logging"],
    mitreNote: "T1530 (Data from Cloud Storage), T1005 (Data from Local System)",
  },
  {
    match: /cache|redis|memcached/i,
    controls: ["Bind to private network only", "Require AUTH (password/ACL)", "TLS for cross-zone traffic"],
    mitreNote: "T1552.001 (Unsecured Credentials)",
  },
  {
    match: /storage|s3|bucket|file/i,
    controls: ["Private by default, signed URLs for public reads", "Bucket policies least-privilege", "Server-side encryption", "Access logging + anomaly alerts"],
    mitreNote: "T1530 (Data from Cloud Storage)",
  },
  {
    match: /queue|worker|job|celery|kafka|sqs/i,
    controls: ["Authenticated queue access", "Poison-message handling (no crashes loops)", "Encrypt payloads with secrets at rest"],
    mitreNote: "T1059 (Command and Scripting Interpreter)",
  },
  {
    match: /admin|internal|ops|dashboard/i,
    controls: ["VPN/SSO-gated access only", "IP allowlisting", "Full audit trail of actions", "Separate credentials from app users"],
    mitreNote: "T1078.002 (Domain Accounts)",
  },
  {
    match: /email|mail|notification/i,
    controls: ["SPF/DKIM/DMARC", "Signed webhooks", "Provider API keys in secret manager"],
    mitreNote: "T1566 (Phishing) — protect your domain's senders",
  },
  {
    match: /payment|razorpay|stripe/i,
    controls: ["Never touch raw card data (use hosted checkout)", "Verify webhooks server-side with signatures", "Reconciliation job for paid/unpaid states"],
    mitreNote: "T1565 (Data Manipulation)",
  },
];

function controlsFor(label: string): string[] {
  for (const entry of CONTROL_KB) {
    if (entry.match.test(label)) return entry.controls;
  }
  return ["Identify this component's trust boundary", "Authenticate callers", "Log and alert on anomalies"];
}

function mitreFor(label: string): string {
  for (const entry of CONTROL_KB) {
    if (entry.match.test(label)) return entry.mitreNote;
  }
  return "TBD — map manually in your threat model";
}

let counter = 0;
function nid(): string {
  counter += 1;
  return `ag-${counter}`;
}

export interface AttackGraphResult {
  report: Report;
  graph: ParsedGraph;
  nodeControls: Array<{ label: string; controls: string[]; mitre: string }>;
  ascii: string;
  /** structured model for the SVG renderer */
  layers: Array<{ layer: number; labels: string[] }>;
}

export function parseAttackGraph(text: string): ParsedGraph {
  const nodes: GraphNode[] = [];
  const edges: Array<[string, string]> = [];
  const chains: string[][] = [];
  const byLabel = new Map<string, GraphNode>();

  const nodeFor = (label: string, layer: number): GraphNode => {
    const key = label.toLowerCase().trim();
    let node = byLabel.get(key);
    if (!node) {
      node = { id: key.replace(/[^a-z0-9]+/g, "-") || `n${nodes.length}`, label: label.trim(), layer };
      byLabel.set(key, node);
      nodes.push(node);
    }
    return node;
  };

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/->|→|-->|\|>/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const chain: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const node = nodeFor(parts[i], i);
      chain.push(node.label);
      if (i > 0) edges.push([nodeFor(parts[i - 1], i - 1).id, node.id]);
    }
    chains.push(chain);
  }

  const dedupedEdges = Array.from(new Set(edges.map((e) => `${e[0]}>${e[1]}`))).map(
    (s) => s.split(">") as [string, string],
  );
  return { nodes, edges: dedupedEdges, chains };
}

export function buildAttackGraph(text: string): AttackGraphResult {
  counter = 0;
  const graph = parseAttackGraph(text);

  const findings: Finding[] = [];
  const nodeControls: AttackGraphResult["nodeControls"] = [];

  const labels = graph.nodes.map((n) => n.label);
  const hasInternet = labels.some((l) => /internet|public|user/i.test(l));
  const hasAuth = labels.some((l) => /auth|login|sso|identity/i.test(l));
  const hasDb = labels.some((l) => /database|db|postgres|mysql|mongo/i.test(l));
  const hasWaf = labels.some((l) => /waf|cdn|proxy|gateway/i.test(l));

  // direct internet→db path (skipping auth/app) — check chains
  for (const chain of graph.chains) {
    if (chain.length >= 2 && /internet|public/i.test(chain[0]) && /database|db|postgres|mysql|mongo/i.test(chain[1])) {
      findings.push({
        id: nid(),
        severity: "critical",
        title: "Direct Internet → Database path",
        detail: "A path reaches the database without an application/auth layer in between. Databases should never be directly internet-reachable: put them on a private network behind an app layer.",
      });
    }
    if (chain.length >= 2 && /database|db/i.test(chain[0]) && /internet/i.test(chain[1])) {
      findings.push({
        id: nid(),
        severity: "medium",
        title: "Data flows outward to the internet",
        detail: `Chain "${chain.join(" → ")}" moves data from the database toward the internet. Confirm this is intended (e.g. API responses) and encrypted in transit.`,
      });
    }
  }
  if (hasInternet && !hasWaf) {
    findings.push({
      id: nid(),
      severity: "medium",
      title: "No edge protection in the map",
      detail: "Public traffic appears to hit the app directly. A CDN/WAF layer absorbs volumetric attacks and filters common exploits before they reach your code.",
    });
  }
  if (hasDb && !hasAuth) {
    findings.push({
      id: nid(),
      severity: "high",
      title: "No authentication layer in the map",
      detail: "The graph has a database but no auth component. If any request reaches the DB without identity checks, add an auth layer (sessions/JWT + MFA).",
    });
  }
  if (graph.chains.length === 0) {
    findings.push({
      id: nid(),
      severity: "info",
      title: "No paths parsed",
      detail: "Describe flows one per line like: Internet -> Web app -> Auth -> Database.",
    });
  }

  const maxLayer = Math.max(0, ...graph.nodes.map((n) => n.layer));
  const layers: AttackGraphResult["layers"] = [];
  for (let i = 0; i <= maxLayer; i++) {
    layers.push({ layer: i, labels: graph.nodes.filter((n) => n.layer === i).map((n) => n.label) });
  }

  for (const node of graph.nodes) {
    nodeControls.push({ label: node.label, controls: controlsFor(node.label), mitre: mitreFor(node.label) });
  }

  // ASCII rendering: single chain or merged layers
  const asciiLines: string[] = [];
  if (graph.chains.length === 1) {
    for (let i = 0; i < graph.chains[0].length; i++) {
      const label = graph.chains[0][i].toUpperCase();
      const pad = Math.max(0, Math.floor((40 - label.length) / 2));
      asciiLines.push(" ".repeat(pad) + label);
      if (i < graph.chains[0].length - 1) {
        asciiLines.push(" ".repeat(19) + "│");
        asciiLines.push(" ".repeat(19) + "▼");
      }
    }
  } else if (graph.chains.length > 1) {
    for (const chain of graph.chains) {
      asciiLines.push(chain.join("  →  "));
      asciiLines.push("");
    }
  }

  const report: Report = {
    tool: "attack-graph",
    toolLabel: getTool("attack-graph").name,
    title: "ForgeKit AttackGraph Report (defensive)",
    generatedAt: new Date().toISOString(),
    summary:
      graph.chains.length === 0
        ? "No attack paths parsed yet. Describe flows one per line: Internet -> Web app -> Auth -> Database."
        : `Mapped ${graph.nodes.length} components across ${graph.chains.length} path${graph.chains.length === 1 ? "" : "s"} with ${findings.length} defensive finding${findings.length === 1 ? "" : "s"}. MITRE ATT&CK references are included to support defensive planning only.`,
    findings,
    sections: [
      { heading: "Attack paths (ASCII)", code: asciiLines.join("\n") || "(none)" },
      {
        heading: "Suggested defensive controls per component",
        rows: nodeControls.flatMap((nc) => [
          [`${nc.label} — controls`, nc.controls.join("; ")],
          [`${nc.label} — MITRE note`, nc.mitre],
        ]) as Array<[string, string]>,
      },
      {
        heading: "Scope & ethics",
        body:
          "This tool maps YOUR system's attack surface for defensive purposes: fixing architecture, prioritizing controls, and planning incident response. " +
          "It does not generate exploits. Test only systems you own or have written authorization to assess.",
      },
    ],
    meta: { Components: String(graph.nodes.length), Paths: String(graph.chains.length) },
  };

  return { report, graph, nodeControls, ascii: asciiLines.join("\n"), layers };
}
