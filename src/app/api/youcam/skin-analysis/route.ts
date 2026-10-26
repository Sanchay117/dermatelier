import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getUnitShieldLedger } from "@/lib/youcam/cache";
import { executeSkinAnalysis } from "@/lib/youcam/client";
import { STUDIO_PERSONAS } from "@/lib/youcam/presets";

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid base64 image data URL");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      personaId?: string;
      imageDataUrl?: string;
      subjectName?: string;
      forceLive?: boolean;
    };
    const apiKeyOverride = req.headers.get("x-youcam-api-key") || undefined;

    let imageBuffer: Buffer;
    let mimeType = "image/jpeg";
    let fileName = "portrait.jpg";
    let subjectName = body.subjectName || "Live Shopper Scan";

    if (body.imageDataUrl) {
      const parsed = parseDataUrl(body.imageDataUrl);
      imageBuffer = parsed.buffer;
      mimeType = parsed.mimeType;
      fileName = mimeType.includes("png") ? "portrait.png" : "portrait.jpg";
    } else if (body.personaId) {
      const persona = STUDIO_PERSONAS.find((p) => p.id === body.personaId);
      if (!persona) {
        return NextResponse.json({ ok: false, error: "Unknown studio persona" }, { status: 400 });
      }
      // If not forcing live API call, return zero-unit studio preset immediately
      if (!body.forceLive) {
        return NextResponse.json({
          ok: true,
          report: persona.presetReport,
          ledger: getUnitShieldLedger(apiKeyOverride),
        });
      }
      const diskPath = path.join(process.cwd(), "public", persona.portraitUrl.replace(/^\//, ""));
      imageBuffer = fs.readFileSync(diskPath);
      fileName = `${persona.id}.jpg`;
      subjectName = persona.name;
    } else {
      return NextResponse.json(
        { ok: false, error: "Provide either personaId or imageDataUrl" },
        { status: 400 }
      );
    }

    const report = await executeSkinAnalysis({
      imageBuffer,
      mimeType,
      fileName,
      subjectName,
      personaId: body.personaId,
      forceLive: body.forceLive,
      apiKeyOverride,
    });

    return NextResponse.json({
      ok: true,
      report,
      ledger: getUnitShieldLedger(apiKeyOverride),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skin analysis request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
