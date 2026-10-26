import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getLedger } from "@/app/api/youcam/ledger/route";
import { POST as postSkinAnalysis } from "@/app/api/youcam/skin-analysis/route";
import { POST as postTts } from "@/app/api/youcam/tts/route";
import { POST as postVto } from "@/app/api/youcam/vto/route";

describe("Next.js App Router API Endpoints (/api/youcam/*)", () => {
  beforeEach(() => {
    process.env.YOUCAM_CACHE_DIR = path.join(os.tmpdir(), `dermatelier-api-${crypto.randomUUID()}`);
  });

  afterEach(() => {
    delete process.env.YOUCAM_CACHE_DIR;
  });

  it("GET /api/youcam/ledger returns 1,000-unit shield balance", async () => {
    const req = new NextRequest("http://localhost:3000/api/youcam/ledger");
    const res = await getLedger(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.ledger.totalRedeemedUnits).toBe(1000);
    expect(json.ledger.unitsRemaining).toBe(1000);
  });

  it("POST /api/youcam/skin-analysis returns 14-metric Fitzpatrick IV report for Ananya in 0-unit studio mode", async () => {
    const req = new NextRequest("http://localhost:3000/api/youcam/skin-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId: "ananya", forceLive: false }),
    });
    const res = await postSkinAnalysis(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.report.subjectName).toBe("Ananya Rao");
    expect(json.report.metrics).toHaveLength(14);
  });

  it("POST /api/youcam/vto returns both clashing SKU and dermal-calibrated counterpart VTO specs", async () => {
    const req = new NextRequest("http://localhost:3000/api/youcam/vto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personaId: "ananya",
        productId: "lip-velvet-crimson-902",
        counterpartProductId: "lip-peptide-rosewood-408",
        preferLiveApi: false,
      }),
    });
    const res = await postVto(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.primaryVto.productId).toBe("lip-velvet-crimson-902");
    expect(json.counterpartVto.productId).toBe("lip-peptide-rosewood-408");
  });

  it("POST /api/youcam/tts validates input and cleanly reports configured:false when Deepgram key is absent", async () => {
    const savedDg = process.env.DEEPGRAM_API_KEY;
    const savedTts = process.env.TTS;
    delete process.env.DEEPGRAM_API_KEY;
    delete process.env.TTS;
    try {
      const req = new NextRequest("http://localhost:3000/api/youcam/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Clinical Skin AI briefing test." }),
      });
      const res = await postTts(req);
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.configured).toBe(false);
    } finally {
      if (savedDg) process.env.DEEPGRAM_API_KEY = savedDg;
      if (savedTts) process.env.TTS = savedTts;
    }
  });
});
