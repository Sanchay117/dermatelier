import { NextRequest, NextResponse } from "next/server";
import { getUnitShieldLedger } from "@/lib/youcam/cache";

export async function GET(req: NextRequest) {
  const headerKey = req.headers.get("x-youcam-api-key") || undefined;
  const ledger = getUnitShieldLedger(headerKey);
  return NextResponse.json({ ok: true, ledger });
}
