"use client";

import { useState } from "react";
import { buildNetPeekReport, lookupDns, NETPEEK_EXPLAIN, type NetPeekInput, type DnsRecord } from "@/engines/net-peek";
import { ReportView } from "@/components/report-view";
import { Button, Card, EmptyState, Spinner, TextInput, ToolHeader, Badge, KVTable } from "@/components/ui";
import { recordRun } from "@/lib/runs";

interface ServerView {
  ip?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  asn?: string | null;
}

export default function NetPeekPage() {
  const [running, setRunning] = useState(false);
  const [dnsRunning, setDnsRunning] = useState(false);
  const [domain, setDomain] = useState("");
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);
  const [dnsErrors, setDnsErrors] = useState<string[]>([]);
  const [dnsDomain, setDnsDomain] = useState("");
  const [report, setReport] = useState<ReturnType<typeof buildNetPeekReport>["report"] | null>(null);
  const [clientInfo, setClientInfo] = useState<NetPeekInput["client"] | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerView | null>(null);

  const peek = async () => {
    setRunning(true);
    setReport(null);
    const startedAt = new Date().toISOString();

    const client: NetPeekInput["client"] = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: Array.from(navigator.languages ?? [navigator.language]),
      platform: navigator.platform ?? "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
      cores: navigator.hardwareConcurrency,
      memoryGb: (navigator as { deviceMemory?: number }).deviceMemory,
      online: navigator.onLine,
      connectionType:
        (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType,
    };
    setClientInfo(client);

    // server view: ask our own API what it saw
    let server: ServerView | undefined;
    try {
      const res = await fetch("/api/netpeek");
      if (res.ok) server = (await res.json()) as ServerView;
      setServerInfo(server ?? null);
    } catch {
      setServerInfo(null);
    }

    const out = buildNetPeekReport({
      client,
      server,
      dns: dnsRecords ? { domain: dnsDomain, records: dnsRecords, errors: dnsErrors } : undefined,
    });
    setReport(out.report);
    recordRun("net-peek", `${client.platform} · ${client.timezone}`, out.report, startedAt);
    setRunning(false);
  };

  const runDns = async () => {
    const d = domain.trim();
    if (!d) return;
    setDnsRunning(true);
    setDnsRecords(null);
    setDnsErrors([]);
    try {
      const res = await lookupDns(d);
      setDnsRecords(res.records);
      setDnsErrors(res.errors);
      setDnsDomain(d);
    } catch (e) {
      setDnsErrors([e instanceof Error ? e.message : String(e)]);
    }
    setDnsRunning(false);
  };

  return (
    <div>
      <ToolHeader
        icon="🌐"
        name="NetPeek"
        tagline="Inspect YOUR connection: browser fingerprint, how the server sees you, and DNS records for any domain you query — via encrypted DNS-over-HTTPS."
        privacy="SELF-INSPECTION ONLY"
      />

      <div className="space-y-6">
        <Card title="DNS LOOKUP" subtitle="A / AAAA / MX / TXT / NS / CNAME via Cloudflare 1.1.1.1 DoH">
          <div className="flex flex-wrap items-end gap-3">
            <TextInput
              label="Domain"
              value={domain}
              onChange={setDomain}
              placeholder="example.com"
              onEnter={() => void runDns()}
              className="min-w-[260px] flex-1"
            />
            <Button onClick={() => void runDns()} disabled={dnsRunning || !domain.trim()}>
              ▶ RESOLVE
            </Button>
          </div>
          {dnsRunning && <div className="mt-4"><Spinner label="Querying DNS-over-HTTPS…" /></div>}
          {dnsRecords && (
            <div className="mt-4 overflow-hidden rounded-md border border-line">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-panel2 text-faint">
                  <tr>
                    <th className="px-3 py-2">type</th>
                    <th className="px-3 py-2">name</th>
                    <th className="px-3 py-2">value</th>
                    <th className="px-3 py-2">ttl</th>
                  </tr>
                </thead>
                <tbody>
                  {dnsRecords.map((r, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className="px-3 py-1.5 text-accent">{r.type}</td>
                      <td className="px-3 py-1.5 text-dim">{r.name}</td>
                      <td className="max-w-[320px] break-all px-3 py-1.5 text-ink">{r.value}</td>
                      <td className="px-3 py-1.5 text-faint">{r.ttl}s</td>
                    </tr>
                  ))}
                  {dnsRecords.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-faint">
                        no records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {dnsErrors.length > 0 && (
            <p className="mt-2 font-mono text-[11px] text-warn">
              {dnsErrors.length} lookup(s) failed (offline? blocked network?)
            </p>
          )}
        </Card>

        <Card title="CONNECTION PEEK" subtitle="what your browser + the server know about you">
          <Button onClick={() => void peek()} disabled={running}>
            ▶ PEEK MY CONNECTION
          </Button>
          {running && <div className="mt-4"><Spinner /></div>}
          {clientInfo && !running && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-line bg-panel2/50 p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">BROWSER</div>
                <KVTable
                  rows={[
                    ["Platform", clientInfo.platform],
                    ["Timezone", clientInfo.timezone],
                    ["Screen", clientInfo.screen],
                    ["Cores", clientInfo.cores ? String(clientInfo.cores) : "—"],
                    ["Connection", clientInfo.connectionType ?? "—"],
                  ]}
                />
              </div>
              <div className="rounded-md border border-line bg-panel2/50 p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">AS THE SERVER SEES YOU</div>
                {serverInfo ? (
                  <KVTable
                    rows={[
                      ["IP", serverInfo.ip ?? "—"],
                      ["Edge location", [serverInfo.city, serverInfo.region, serverInfo.country].filter(Boolean).join(", ") || "—"],
                      ["Network (ASN)", serverInfo.asn ?? "—"],
                    ]}
                  />
                ) : (
                  <p className="text-xs text-faint">server view unavailable (run the app locally?)</p>
                )}
              </div>
            </div>
          )}
          {clientInfo && !running && (
            <div className="mt-3">
              <Badge tone="green">user agent</Badge>
              <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-[#070b10] p-2 font-mono text-[11px] text-dim">
                {clientInfo.userAgent}
              </pre>
            </div>
          )}
        </Card>

        {report && <ReportView report={report} />}

        <Card title="HOW IT WORKS" subtitle="net-peek fundamentals">
          <div className="space-y-3">
            {NETPEEK_EXPLAIN.map((x) => (
              <details key={x.title} className="rounded-md border border-line bg-panel2/40 px-3 py-2.5">
                <summary className="cursor-pointer font-mono text-sm text-ink">{x.title}</summary>
                <p className="mt-2 text-[13px] leading-relaxed text-dim">{x.body}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
