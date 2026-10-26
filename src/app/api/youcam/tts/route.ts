import { NextResponse } from "next/server";
import { buildYouCamCacheKey, readCachedJson, writeCachedJson } from "@/lib/youcam/cache";

export const runtime = "nodejs";

interface CachedTtsPayload {
  audioDataUrl: string;
  model: string;
}

function getDeepgramKey(): string {
  const raw =
    process.env.DEEPGRAM_API_KEY ||
    process.env.DEEPGRAM_TTS_KEY ||
    process.env.TTS ||
    "";
  return raw.trim().replace(/^Token\s+/i, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text || "").trim().slice(0, 1800);
    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });
    }

    const model = "aura-2-thalia-en";
    const cacheKey = buildYouCamCacheKey("deepgram-tts", [], { model, text });
    const cached = readCachedJson<CachedTtsPayload>(cacheKey);
    if (cached?.audioDataUrl) {
      return NextResponse.json({
        ok: true,
        audioDataUrl: cached.audioDataUrl,
        model: cached.model,
        cached: true,
      });
    }

    const apiKey = getDeepgramKey();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, configured: false, error: "DEEPGRAM_API_KEY not configured" },
        { status: 503 }
      );
    }

    const dgRes = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!dgRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Deepgram TTS HTTP ${dgRes.status}` },
        { status: 502 }
      );
    }

    const mp3Buffer = Buffer.from(await dgRes.arrayBuffer());
    const audioDataUrl = `data:audio/mpeg;base64,${mp3Buffer.toString("base64")}`;
    writeCachedJson<CachedTtsPayload>(cacheKey, { audioDataUrl, model });

    return NextResponse.json({
      ok: true,
      audioDataUrl,
      model,
      cached: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unexpected TTS failure",
      },
      { status: 500 }
    );
  }
}
