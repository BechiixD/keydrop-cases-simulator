import { NextResponse } from "next/server";
import type { CaseDefinition } from "@/lib/types";
import { getCase } from "@/lib/scraper/cache";
import { openOnce } from "@/lib/caseEngine";
import { hashServerSeed } from "@/lib/provablyFair";

interface VerifyRequest {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  caseSlug: string;
  serverSeedHash?: string;
  expectedTicket?: string;
  expectedSkinName?: string;
  expectedWear?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  const { serverSeed, clientSeed, nonce, caseSlug } = body;
  if (
    typeof serverSeed !== "string" ||
    typeof clientSeed !== "string" ||
    typeof caseSlug !== "string" ||
    !Number.isFinite(nonce)
  ) {
    return NextResponse.json(
      { ok: false, reason: "missing_fields" },
      { status: 400 },
    );
  }

  const c: CaseDefinition | null = await getCase(caseSlug);
  if (!c) {
    return NextResponse.json(
      { ok: false, reason: "case_not_found", caseSlug },
      { status: 404 },
    );
  }

  const drop = openOnce({
    case: c,
    serverSeed,
    clientSeed,
    nonce,
    caseSlug,
  });
  if (!drop) {
    return NextResponse.json(
      { ok: false, reason: "engine_no_drop" },
      { status: 500 },
    );
  }

  const recomputedHash = hashServerSeed(serverSeed);
  const hashMatches = body.serverSeedHash
    ? body.serverSeedHash === recomputedHash
    : true;
  const ticketMatches = body.expectedTicket
    ? body.expectedTicket === drop.ticket
    : true;
  const skinMatches = body.expectedSkinName
    ? body.expectedSkinName === drop.skin.name
    : true;
  const wearMatches = body.expectedWear
    ? body.expectedWear === drop.wear.wear
    : true;

  return NextResponse.json({
    ok: true,
    case: { slug: c.slug, name: c.name },
    serverSeedHash: recomputedHash,
    nonce,
    clientSeed,
    ticket: drop.ticket,
    skin: { name: drop.skin.name, rarity: drop.skin.rarity },
    wear: drop.wear.wear,
    value: drop.value,
    match: hashMatches && ticketMatches && skinMatches && wearMatches,
    checks: { hashMatches, ticketMatches, skinMatches, wearMatches },
  });
}