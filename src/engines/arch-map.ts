import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * ArchMap — turn a stack selection into an architecture diagram.
 * Produces: a node/layer model, Mermaid code, ASCII art, JSON and Markdown.
 */

export interface ArchInput {
  edge: string | null;
  frontend: string | null;
  backend: string | null;
  database: string | null;
  cache: string | null;
  storage: string | null;
  queue: string | null;
  auth: string | null;
  extras: string[];
}

export interface ArchNode {
  id: string;
  label: string;
  layer: number;
}

export interface ArchModel {
  layers: Array<{ name: string; nodes: ArchNode[] }>;
  inputs: ArchInput;
}

export interface ArchOutput {
  model: ArchModel;
  mermaid: string;
  ascii: string;
  markdown: string;
  json: string;
  report: Report;
}

export const ARCH_OPTIONS: Record<keyof Omit<ArchInput, "extras">, string[]> = {
  edge: ["None", "CDN (Cloudflare)", "CDN (CloudFront)", "Load Balancer (Nginx)", "Load Balancer (ALB)"],
  frontend: ["Next.js", "React (Vite)", "Vue", "SvelteKit", "Server-rendered HTML", "Mobile app"],
  backend: ["FastAPI", "Express", "NestJS", "Django", "Rails", "Spring Boot", "Go service", "Serverless functions"],
  database: ["None", "PostgreSQL", "MySQL", "MongoDB", "SQLite", "DynamoDB", "Supabase"],
  cache: ["None", "Redis", "Memcached", "In-memory (L1)"],
  storage: ["None", "S3", "GCS", "Local disk", "Cloudflare R2"],
  queue: ["None", "Redis Queue", "RabbitMQ", "Celery", "SQS", "Kafka"],
  auth: ["None", "Supabase Auth", "JWT + sessions", "OAuth provider", "Keycloak"],
};

let counter = 0;
function nid(): string {
  counter += 1;
  return `am-${counter}`;
}

function slugId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function shortLabel(value: string): string {
  return value.toUpperCase().split(" (")[0];
}

function buildLayers(input: ArchInput): ArchModel["layers"] {
  const layers: ArchModel["layers"] = [
    { name: "Clients", nodes: [{ id: "users", label: "USERS", layer: 0 }] },
  ];

  const add = (name: string, value: string | null) => {
    if (value && value !== "None") {
      layers.push({
        name,
        nodes: [{ id: slugId(value), label: shortLabel(value), layer: layers.length }],
      });
    }
  };

  add("Edge", input.edge);
  add("Frontend", input.frontend);
  add("Backend", input.backend);
  add("Auth", input.auth);

  const leafNodes: ArchNode[] = [];
  const leafValues = [input.database, input.cache, input.storage, input.queue];
  for (const value of leafValues) {
    if (value && value !== "None") {
      leafNodes.push({ id: slugId(value), label: shortLabel(value), layer: layers.length });
    }
  }
  for (const extra of input.extras) {
    const label = extra.trim();
    if (label) leafNodes.push({ id: `x-${slugId(label)}`, label: label.toUpperCase(), layer: layers.length });
  }
  if (leafNodes.length > 0) layers.push({ name: "Services", nodes: leafNodes });

  return layers;
}

function toMermaid(layers: ArchModel["layers"]): string {
  const lines = ["flowchart TD"];
  for (let i = 0; i < layers.length; i++) {
    for (const node of layers[i].nodes) {
      lines.push(`  ${node.id}["${node.label}"]`);
    }
    if (i > 0) {
      for (const prev of layers[i - 1].nodes) {
        for (const node of layers[i].nodes) {
          lines.push(`  ${prev.id} --> ${node.id}`);
        }
      }
    }
  }
  return lines.join("\n");
}

function padCenter(label: string, width: number): string {
  if (label.length >= width) return label.slice(0, width);
  const left = Math.floor((width - label.length) / 2);
  return " ".repeat(left) + label + " ".repeat(width - label.length - left);
}

function connectorLines(parentCenters: number[], childCenters: number[], maxWidth: number): string[] {
  const line1 = Array<string>(maxWidth).fill(" ");
  for (const c of parentCenters) line1[c] = "│";
  if (parentCenters.length === 1 && childCenters.length === 1) {
    // straight drop — also mark the child side so the flow reads top-down
    line1[childCenters[0]] = "│";
    return [line1.join("")];
  }
  const line2 = Array<string>(maxWidth).fill(" ");
  const min = Math.min(...parentCenters, ...childCenters);
  const max = Math.max(...parentCenters, ...childCenters);
  for (let i = min; i <= max; i++) line2[i] = "─";
  for (const c of childCenters) line2[c] = "┬";
  for (const c of parentCenters) if (!childCenters.includes(c)) line2[c] = "┴";
  if (!childCenters.includes(min) && !parentCenters.includes(min)) line2[min] = "┌";
  if (!childCenters.includes(max) && !parentCenters.includes(max)) line2[max] = "┐";
  const line3 = Array<string>(maxWidth).fill(" ");
  for (const c of childCenters) line3[c] = "│";
  return [line1.join(""), line2.join(""), line3.join("")];
}

function toAscii(layers: ArchModel["layers"]): string {
  const cellWidth = Math.max(
    8,
    ...layers.flatMap((l) => l.nodes.map((n) => n.label.length)),
  );
  const layerWidths = layers.map(
    (l) => l.nodes.length * cellWidth + (l.nodes.length - 1) * 4,
  );
  const maxWidth = Math.max(...layerWidths);

  const centersOf = (l: ArchModel["layers"][number]) => {
    const rowWidth = l.nodes.length * cellWidth + (l.nodes.length - 1) * 4;
    const offset = Math.floor((maxWidth - rowWidth) / 2);
    return l.nodes.map((_, i) => offset + i * (cellWidth + 4) + Math.floor(cellWidth / 2));
  };

  const lines: string[] = [];
  layers.forEach((layer, idx) => {
    const rowWidth = layer.nodes.length * cellWidth + (layer.nodes.length - 1) * 4;
    const offset = Math.floor((maxWidth - rowWidth) / 2);
    lines.push(
      " ".repeat(offset) + layer.nodes.map((n) => padCenter(n.label, cellWidth)).join("    "),
    );
    if (idx < layers.length - 1) {
      lines.push(...connectorLines(centersOf(layer), centersOf(layers[idx + 1]), maxWidth));
    }
  });
  return lines.join("\n");
}

function toMarkdownDoc(layers: ArchModel["layers"], input: ArchInput): string {
  const lines: string[] = ["# Architecture", "", "## Layers", ""];
  for (const layer of layers) {
    lines.push(`### ${layer.name}`);
    for (const node of layer.nodes) lines.push(`- ${node.label}`);
    lines.push("");
  }
  lines.push("## Stack choices", "");
  for (const [k, v] of Object.entries(input)) {
    if (k === "extras") {
      lines.push(`- **Extras:** ${v.length ? v.join(", ") : "—"}`);
    } else {
      lines.push(`- **${k}:** ${v ?? "—"}`);
    }
  }
  lines.push("", "## Mermaid", "", "```mermaid", toMermaid(layers), "```");
  return lines.join("\n");
}

export function buildArchitecture(input: ArchInput): ArchOutput {
  counter = 0;
  const layers = buildLayers(input);
  const archModel: ArchModel = { layers, inputs: input };
  const mermaid = toMermaid(layers);
  const ascii = toAscii(layers);
  const markdown = toMarkdownDoc(layers, input);
  const json = JSON.stringify(archModel, null, 2);

  const nodeCount = layers.reduce((a, l) => a + l.nodes.length, 0);
  const hasBackend = !!input.backend && input.backend !== "None";
  const hasDb = !!input.database && input.database !== "None";

  const report: Report = {
    tool: "arch-map",
    toolLabel: getTool("arch-map").name,
    title: "ForgeKit ArchMap Report",
    generatedAt: new Date().toISOString(),
    summary: `Architecture mapped: ${layers.length} layers, ${nodeCount} components. Exports: Mermaid, SVG (in-app preview), JSON, Markdown.`,
    findings: [],
    sections: [
      { heading: "ASCII diagram", code: ascii },
      { heading: "Mermaid diagram", body: "Paste into any Mermaid renderer (GitHub READMEs render it natively).", code: mermaid },
      {
        heading: "Sanity notes",
        rows: [
          ["Backend defined", hasBackend ? "yes ✓" : "no — data flows need something to route through"],
          ["Persistence defined", hasDb ? "yes ✓" : "no — every stateful app needs one"],
          ["Auth strategy", input.auth && input.auth !== "None" ? input.auth : "none — fine for internal tools, risky for anything public"],
          ...(!input.cache || input.cache === "None" ? [["Caching", "none — fine at small scale; revisit under load"] as [string, string]] : []),
          ...(input.queue && input.queue !== "None" ? [["Background work", input.queue] as [string, string]] : []),
        ],
      },
    ],
    meta: { Layers: String(layers.length), Components: String(nodeCount) },
  };

  return { model: archModel, mermaid, ascii, markdown, json, report };
}
