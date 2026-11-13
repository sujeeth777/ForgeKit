import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * NetPeek — inspect network facts about YOUR OWN connection/environment.
 * Client: browser + device fingerprints. DNS: Cloudflare DoH (public resolver).
 * Server: what the request looks like when it reaches your app.
 */

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: number;
}

export interface NetPeekInput {
  client: {
    userAgent: string;
    language: string;
    languages: string[];
    platform: string;
    timezone: string;
    screen: string;
    cores?: number;
    memoryGb?: number;
    online: boolean;
    connectionType?: string;
    ipv4Hint?: string | null;
  };
  server?: {
    ip?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    asn?: string | null;
  };
  dns?: {
    domain: string;
    records: DnsRecord[];
    errors?: string[];
  };
}

export interface NetPeekResult {
  report: Report;
}

export function buildNetPeekReport(input: NetPeekInput): NetPeekResult {
  const clientRows: Array<[string, string]> = [
    ["User agent", input.client.userAgent],
    ["Languages", input.client.languages.join(", ") || input.client.language],
    ["Platform", input.client.platform],
    ["Timezone", input.client.timezone],
    ["Screen", input.client.screen],
    ["CPU cores", input.client.cores ? String(input.client.cores) : "unknown"],
    ["Memory", input.client.memoryGb ? `≈${input.client.memoryGb} GB` : "unknown"],
    ["Online", input.client.online ? "yes" : "no"],
    ["Connection", input.client.connectionType ?? "unknown"],
  ];

  const serverRows: Array<[string, string]> = input.server
    ? ([
        ["Your IP (as seen by server)", input.server.ip ?? "unknown"],
        ["Edge location", [input.server.city, input.server.region, input.server.country].filter(Boolean).join(", ") || "unknown"],
        ["Network (ASN)", input.server.asn ?? "unknown"],
      ] as Array<[string, string]>)
    : [];

  const dnsRows: Array<[string, string]> =
    input.dns?.records.map((r) => [`${r.type} ${r.name}`, `${r.value} (ttl ${r.ttl}s)`]) ?? [];

  const findings: Array<import("@/lib/types").Finding> = [];
  if (!input.dns && input.client.online) {
    // no-op; dns is optional
  }
  const missingMx = input.dns?.records.length && !input.dns.records.some((r) => r.type === "MX");
  if (missingMx && input.dns) {
    findings.push({
      id: "np-mx",
      severity: "info",
      title: "No MX record",
      detail: `${input.dns.domain} has no mail exchanger — email to @${input.dns.domain} will bounce. Fine unless you plan to receive mail there.`,
    });
  }
  const spf = input.dns?.records.find((r) => r.type === "TXT" && /v=spf1/i.test(r.value));
  if (input.dns && input.dns.records.some((r) => r.type === "MX" || r.type === "A") && !spf) {
    findings.push({
      id: "np-spf",
      severity: "low",
      title: "No SPF record (or not queried)",
      detail: "Without SPF, anyone can send email claiming to be from your domain. Add a TXT record like `v=spf1 include:_spf.example.com -all`.",
    });
  }

  const report: Report = {
    tool: "net-peek",
    toolLabel: getTool("net-peek").name,
    title: "ForgeKit NetPeek Report",
    generatedAt: new Date().toISOString(),
    summary:
      `Inspected your connection: ${input.client.platform}, ${input.client.timezone}` +
      (input.server?.ip ? `, egress IP ${input.server.ip}` : "") +
      (input.dns?.records.length ? `, ${input.dns.records.length} DNS records for ${input.dns.domain}` : "") +
      ". All lookups are of your own machine/domain — passive by design.",
    findings,
    sections: [
      { heading: "Your browser & device", rows: clientRows },
      ...(serverRows.length ? [{ heading: "You as the server sees you", rows: serverRows }] : []),
      ...(dnsRows.length ? [{ heading: `DNS records — ${input.dns?.domain}`, rows: dnsRows }] : []),
      {
        heading: "What NetPeek will never do",
        body:
          "No port scanning of third parties, no packet sniffing of others' traffic, no requests to systems you haven't pointed it at. " +
          "It inspects your own connection and domains you query — that's the whole scope.",
      },
    ],
    meta: { "DNS provider": "Cloudflare DoH (1.1.1.1)" },
  };

  return { report };
}

/** Query Cloudflare's public DNS-over-HTTPS JSON API. Browser-safe. */
export async function lookupDns(domain: string, signal?: AbortSignal): Promise<{ records: DnsRecord[]; errors: string[] }> {
  const records: DnsRecord[] = [];
  const errors: string[] = [];
  const types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"];

  await Promise.all(
    types.map(async (type) => {
      try {
        const res = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
          { headers: { Accept: "application/dns-json" }, signal },
        );
        if (!res.ok) throw new Error(`${type}: ${res.status}`);
        const data = (await res.json()) as {
          Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
        };
        for (const ans of data.Answer ?? []) {
          records.push({
            type: dnsTypeToString(type),
            name: ans.name.replace(/\.$/, ""),
            value: cleanRecord(type, ans.data),
            ttl: ans.TTL,
          });
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }),
  );

  records.sort((a, b) => a.type.localeCompare(b.type));
  return { records, errors };
}

function cleanRecord(type: string, data: string): string {
  if (type === "TXT") return data.replace(/"/g, "");
  if (type === "MX") return data;
  return data;
}

function dnsTypeToString(t: string): string {
  return t;
}

export const NETPEEK_EXPLAIN: Array<{ title: string; body: string }> = [
  {
    title: "What your browser leaks (by design)",
    body: "User agent, languages, screen size, timezone and connection type are sent with every request so sites can serve you correctly. Fingerprint-resistant browsers (Tor, Brave shields) reduce this on purpose.",
  },
  {
    title: "Your egress IP",
    body: "The IP your request appears to come from belongs to your network (or VPN). Sites see it, geo-locate it via databases, and rate-limit by it. On Vercel-style platforms it surfaces as x-forwarded-for / x-real-ip headers.",
  },
  {
    title: "DNS — the internet's phone book",
    body: "A records point names at IPv4 addresses, AAAA at IPv6, MX says who receives your mail, TXT carries SPF/verification data, CNAME aliases one name to another, NS delegates the zone. TTL controls how long resolvers may cache each answer.",
  },
  {
    title: "DoH — DNS over HTTPS",
    body: "Classic DNS is plaintext (anyone on the path sees your lookups). DNS-over-HTTPS encrypts them. This tool uses Cloudflare's public DoH JSON endpoint — a good default you can also set system-wide.",
  },
];
