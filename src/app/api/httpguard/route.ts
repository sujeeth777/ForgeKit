import { NextResponse } from "next/server";
import { analyzeHeaders } from "@/engines/http-guard";
import { getTool } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /^169\.254\.169\.254$/, // cloud metadata endpoint
];

/**
 * POST { url }
 * Fetches the URL once (GET), inspects response headers, and returns the
 * HTTPGuard analysis. Passive by design — no exploitation of any kind.
 */
export async function POST(req: Request) {
  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "Provide a URL to scan." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: `Not a valid URL: ${url}` }, { status: 400 });
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return NextResponse.json(
      { error: "Only http/https URLs can be scanned." },
      { status: 400 },
    );
  }
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(parsed.hostname))) {
    return NextResponse.json(
      { error: "Private and local addresses cannot be scanned from the server (SSRF protection)." },
      { status: 400 },
    );
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "ForgeKit-HTTPGuard/0.1 (+https://github.com/sujeeth777/ForgeKit)" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json(
      {
        error: `Could not fetch ${parsed.toString()}: ${msg}. Check the URL, DNS and that the site is reachable from the server.`,
      },
      { status: 502 },
    );
  }
  const responseTimeMs = Date.now() - started;

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const { report, checks } = analyzeHeaders({
    url: parsed.toString(),
    finalUrl: response.url || parsed.toString(),
    statusCode: response.status,
    headers,
    responseTimeMs,
  });

  return NextResponse.json({
    report,
    checks,
    toolLabel: getTool("http-guard").name,
  });
}
