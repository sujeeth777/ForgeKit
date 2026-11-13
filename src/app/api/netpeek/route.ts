import { NextResponse } from "next/server";

/**
 * GET /api/netpeek
 * Returns what the SERVER sees about the caller: forwarded IP, edge geo
 * headers, ASN. Only fields the platform itself provides — no third-party
 * lookups, nothing stored.
 */
export async function GET(req: Request) {
  const h = req.headers;

  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;

  return NextResponse.json(
    {
      ip,
      city: h.get("x-vercel-ip-city"),
      region: h.get("x-vercel-ip-country-region"),
      country: h.get("x-vercel-ip-country"),
      asn: h.get("x-vercel-ip-as-number"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
