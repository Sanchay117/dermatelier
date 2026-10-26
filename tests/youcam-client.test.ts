import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildYouCamMakeupEffectsArray,
  executeProductVto,
  executeSkinAnalysis,
  extractResultImageUrl,
} from "@/lib/youcam/client";
import { getProductById } from "@/lib/youcam/catalog";

describe("YouCam S2S API v2.0 Client & SHA-256 Unit-Shield Contract", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.YOUCAM_CACHE_DIR = path.join(os.tmpdir(), `dermatelier-test-${crypto.randomUUID()}`);
    process.env.YOUCAM_POLL_INTERVAL_MS = "10";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.YOUCAM_CACHE_DIR;
    delete process.env.YOUCAM_POLL_INTERVAL_MS;
    vi.restoreAllMocks();
  });

  it("formats /s2s/v2.0/task/makeup-vto effects[] array with verified category, shape, style & 0..100 integer intensities", () => {
    const satinLip = getProductById("lip-peptide-rosewood-408")!;
    const serumTint = getProductById("complexion-ceramide-tint-210")!;

    const lipEffects = buildYouCamMakeupEffectsArray(satinLip, "IV");
    expect(Array.isArray(lipEffects)).toBe(true);
    const lipNode = lipEffects.find((e) => e.category === "lip_color") as Record<string, unknown>;
    expect(lipNode).toBeDefined();
    expect(lipNode.shape).toEqual({ name: "original" });
    expect(lipNode.style).toEqual({ type: "full" });
    const lipPalette = (lipNode.palettes as Array<Record<string, unknown>>)[0];
    expect(lipPalette.colorIntensity).toBeGreaterThanOrEqual(10);
    expect(lipPalette.colorIntensity).toBeLessThanOrEqual(100);

    const fdnEffects = buildYouCamMakeupEffectsArray(serumTint, "VI");
    const fdnNode = fdnEffects.find((e) => e.category === "foundation") as Record<string, unknown>;
    expect(fdnNode).toBeDefined();
    const fdnPalette = (fdnNode.palettes as Array<Record<string, unknown>>)[0];
    expect(fdnPalette.color).toBe("#683E28");
    expect(fdnPalette.coverageIntensity).toBe(48);
    expect(fdnPalette.glowIntensity).toBe(68);
    expect(fdnPalette.texture).toBeUndefined();
  });

  it("extracts output URLs across nested YouCam S2S v2.0 results shapes", () => {
    expect(extractResultImageUrl({ results: { url: "https://s3/a.jpg" } })).toBe("https://s3/a.jpg");
    expect(extractResultImageUrl({ results: [{ output_url: "https://s3/b.jpg" }] })).toBe(
      "https://s3/b.jpg"
    );
    expect(extractResultImageUrl({ results: { output: [{ url: "https://s3/c.jpg" }] } })).toBe(
      "https://s3/c.jpg"
    );
  });

  it("executes full File API -> Presigned S3 PUT -> Skin Analysis Task -> Poll flow and serves subsequent calls from 0-unit SHA-256 cache", async () => {
    const uniqueImage = crypto.randomBytes(2048);
    let networkCalls = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      networkCalls += 1;
      const url = String(input);

      if (url.includes("/s2s/v2.0/file/skin-analysis")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              files: [
                {
                  file_id: "file_skin_test_001",
                  requests: {
                    url: "https://s3.mock-youcam.local/upload/file_skin_test_001",
                    method: "PUT",
                    headers: { "content-type": "image/jpeg" },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (url.startsWith("https://s3.mock-youcam.local/upload/")) {
        expect(init?.method).toBe("PUT");
        const hdrs = init?.headers as Record<string, string>;
        expect(Object.keys(hdrs).filter((k) => k.toLowerCase() === "content-type")).toHaveLength(1);
        return new Response("", { status: 200 });
      }

      if (url.endsWith("/s2s/v2.0/task/skin-analysis")) {
        const body = JSON.parse(String(init?.body));
        expect(body.src_file_id).toBe("file_skin_test_001");
        expect(Array.isArray(body.dst_actions)).toBe(true);
        return new Response(
          JSON.stringify({ status: 200, data: { task_id: "task_skin_live_999" } }),
          { status: 200 }
        );
      }

      if (url.includes("/s2s/v2.0/task/skin-analysis/task_skin_live_999")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              task_status: "success",
              results: {
                output: [
                  { type: "moisture", ui_score: 64, raw_score: 55.2 },
                  { type: "redness", ui_score: 61, raw_score: 52.8 },
                  { type: "pore", ui_score: 73, raw_score: 65.0 },
                  { type: "wrinkle", ui_score: 88, raw_score: 83.4 },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    // 1st Call: Live S2S v2.0 execution (4 HTTP calls, 1 API unit)
    const firstReport = await executeSkinAnalysis({
      imageBuffer: uniqueImage,
      mimeType: "image/jpeg",
      fileName: "test.jpg",
      subjectName: "Contract Test",
      apiKeyOverride: "yk_live_mock_bearer_token_12345",
    });

    expect(firstReport.mode).toBe("live_youcam");
    expect(firstReport.trace.unitsConsumed).toBe(1);
    expect(firstReport.trace.taskId).toBe("task_skin_live_999");
    expect(firstReport.metrics.find((m) => m.action === "moisture")?.rawScore).toBe(55.2);
    expect(networkCalls).toBe(4);

    // 2nd Call with identical image bytes: SHA-256 Unit-Shield Cache HIT (0 HTTP calls, 0 API units!)
    const secondReport = await executeSkinAnalysis({
      imageBuffer: uniqueImage,
      mimeType: "image/jpeg",
      fileName: "test.jpg",
      subjectName: "Contract Test",
      apiKeyOverride: "yk_live_mock_bearer_token_12345",
    });

    expect(secondReport.mode).toBe("cached_youcam");
    expect(secondReport.trace.cacheHit).toBe(true);
    expect(secondReport.trace.unitsConsumed).toBe(0);
    expect(networkCalls).toBe(4); // Zero additional network calls!
  });

  it("executes AI Makeup VTO (/s2s/v2.0/task/makeup-vto) with verified array effects schema and persists rendered output", async () => {
    const personImg = crypto.randomBytes(1536);
    const satinRosewood = getProductById("lip-peptide-rosewood-408")!;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/s2s/v2.0/file/makeup-vto")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              files: [
                {
                  file_id: "makeup_file_1",
                  requests: [{ url: "https://s3.mock-youcam.local/put/m1", method: "PUT" }],
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (url.startsWith("https://s3.mock-youcam.local/put/")) {
        return new Response("", { status: 200 });
      }

      if (url.endsWith("/s2s/v2.0/task/makeup-vto")) {
        const body = JSON.parse(String(init?.body));
        expect(body.version).toBe("1.0");
        expect(Array.isArray(body.effects)).toBe(true);
        expect(body.effects[0].category).toBe("lip_color");
        expect(body.effects[0].style).toEqual({ type: "full" });
        return new Response(
          JSON.stringify({ status: 200, data: { task_id: "makeup_task_555" } }),
          { status: 200 }
        );
      }

      if (url.includes("/s2s/v2.0/task/makeup-vto/makeup_task_555")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              task_status: "success",
              results: { url: "https://s3.mock-youcam.local/output/rendered_makeup.jpg" },
            },
          }),
          { status: 200 }
        );
      }

      if (url === "https://s3.mock-youcam.local/output/rendered_makeup.jpg") {
        return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const vto = await executeProductVto({
      personBuffer: personImg,
      personMime: "image/jpeg",
      product: satinRosewood,
      fitzpatrickType: "IV",
      preferLiveApi: true,
      apiKeyOverride: "yk_live_mock_bearer_token_12345",
    });

    expect(vto.mode).toBe("live_youcam");
    expect(vto.trace.service).toBe("makeup-vto");
    expect(vto.renderedImageUrl?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("executes AI Clothes VTO (/s2s/v2.0/task/cloth) with person + garment File API uploads and persists rendered output", async () => {
    const personImg = crypto.randomBytes(1536);
    const garmentImg = crypto.randomBytes(1536);
    const emeraldSilk = getProductById("apparel-emerald-silk")!;

    let fileCounter = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/s2s/v2.0/file/cloth")) {
        fileCounter += 1;
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              files: [
                {
                  file_id: `cloth_file_${fileCounter}`,
                  requests: [{ url: `https://s3.mock-youcam.local/put/${fileCounter}`, method: "PUT" }],
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (url.startsWith("https://s3.mock-youcam.local/put/")) {
        return new Response("", { status: 200 });
      }

      if (url.endsWith("/s2s/v2.0/task/cloth")) {
        return new Response(
          JSON.stringify({ status: 200, data: { task_id: "cloth_task_777" } }),
          { status: 200 }
        );
      }

      if (url.includes("/s2s/v2.0/task/cloth/cloth_task_777")) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              task_status: "success",
              results: { url: "https://s3.mock-youcam.local/output/rendered_cloth.jpg" },
            },
          }),
          { status: 200 }
        );
      }

      if (url === "https://s3.mock-youcam.local/output/rendered_cloth.jpg") {
        return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const vto = await executeProductVto({
      personBuffer: personImg,
      personMime: "image/jpeg",
      garmentBuffer: garmentImg,
      garmentMime: "image/jpeg",
      product: emeraldSilk,
      preferLiveApi: true,
      apiKeyOverride: "yk_live_mock_bearer_token_12345",
    });

    expect(vto.mode).toBe("live_youcam");
    expect(vto.trace.service).toBe("cloth-vto");
    expect(vto.trace.fileId).toBe("cloth_file_1");
    expect(vto.trace.refFileId).toBe("cloth_file_2");
    expect(vto.renderedImageUrl?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});
