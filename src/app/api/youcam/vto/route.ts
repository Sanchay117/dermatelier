import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getUnitShieldLedger } from "@/lib/youcam/cache";
import { getProductById } from "@/lib/youcam/catalog";
import { executeProductVto } from "@/lib/youcam/client";
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

function loadGarmentBufferIfNeeded(garmentImageUrl?: string): Buffer | undefined {
  if (!garmentImageUrl || !garmentImageUrl.startsWith("/")) return undefined;
  const fullPath = path.join(process.cwd(), "public", garmentImageUrl.replace(/^\//, ""));
  if (!fs.existsSync(fullPath)) return undefined;
  return fs.readFileSync(fullPath);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      personaId?: string;
      imageDataUrl?: string;
      productId: string;
      counterpartProductId?: string;
      preferLiveApi?: boolean;
    };
    const apiKeyOverride = req.headers.get("x-youcam-api-key") || undefined;

    const product = getProductById(body.productId);
    if (!product) {
      return NextResponse.json({ ok: false, error: "Product SKU not found" }, { status: 404 });
    }

    let personBuffer: Buffer;
    let personMime = "image/jpeg";

    if (body.imageDataUrl) {
      const parsed = parseDataUrl(body.imageDataUrl);
      personBuffer = parsed.buffer;
      personMime = parsed.mimeType;
    } else {
      const persona =
        STUDIO_PERSONAS.find((p) => p.id === body.personaId) || STUDIO_PERSONAS[0];
      const diskPath = path.join(process.cwd(), "public", persona.portraitUrl.replace(/^\//, ""));
      personBuffer = fs.readFileSync(diskPath);
    }

    const primaryVto = await executeProductVto({
      personBuffer,
      personMime,
      product,
      garmentBuffer: loadGarmentBufferIfNeeded(product.garmentImageUrl),
      preferLiveApi: Boolean(body.preferLiveApi),
      apiKeyOverride,
    });

    let counterpartVto = null;
    if (body.counterpartProductId) {
      const counterpart = getProductById(body.counterpartProductId);
      if (counterpart) {
        counterpartVto = await executeProductVto({
          personBuffer,
          personMime,
          product: counterpart,
          garmentBuffer: loadGarmentBufferIfNeeded(counterpart.garmentImageUrl),
          preferLiveApi: Boolean(body.preferLiveApi),
          apiKeyOverride,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      primaryVto,
      counterpartVto,
      ledger: getUnitShieldLedger(apiKeyOverride),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Virtual Try-On request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
