import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildYouCamCacheKey } from "@/lib/youcam/cache";
import {
  DERMATELIER_CATALOG,
  getProductById,
  resolveShadeForFitzpatrick,
} from "@/lib/youcam/catalog";
import { auditCartFormulations, evaluateProductCompatibility } from "@/lib/youcam/dermal-engine";
import { analyzeSkinColorimetry, prepareSkinAnalysisFrame } from "@/lib/youcam/image-framing";
import { buildDeterministicOfflineReport } from "@/lib/youcam/local-cv";
import { STUDIO_PERSONAS } from "@/lib/youcam/presets";

describe("DermAtelier — Dermal Compatibility, CIE L*a*b* ITA° & Unit-Shield Engine", () => {
  it("produces canonical SHA-256 Unit-Shield keys regardless of parameter key order", () => {
    const k1 = buildYouCamCacheKey("skin-analysis", ["img_hash_1"], {
      format: "json",
      actions: ["wrinkle", "pore"],
    });
    const k2 = buildYouCamCacheKey("skin-analysis", ["img_hash_1"], {
      actions: ["wrinkle", "pore"],
      format: "json",
    });
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64);
  });

  it("ensures 100% referential integrity across all catalog calibratedCounterpartId links and Fitzpatrick I–VI shade maps", () => {
    expect(DERMATELIER_CATALOG.length).toBeGreaterThanOrEqual(12);
    for (const product of DERMATELIER_CATALOG) {
      if (product.calibratedCounterpartId) {
        const target = getProductById(product.calibratedCounterpartId);
        expect(target, `Dangling counterpart ${product.calibratedCounterpartId} on ${product.id}`).toBeDefined();
      }
    }

    const serumTint = getProductById("complexion-ceramide-tint-210")!;
    const shadeFitzII = resolveShadeForFitzpatrick(serumTint, "II");
    const shadeFitzVI = resolveShadeForFitzpatrick(serumTint, "VI");
    expect(shadeFitzII).not.toBe(shadeFitzVI);
    expect(shadeFitzVI).toBe("#683E28");
  });

  it("computes accurate dermatological CIE L*a*b* ITA° and Dual-Framing Face ROI crops from decoded RGB pixels", async () => {
    const porcelainJpeg = await sharp({
      create: {
        width: 896,
        height: 1200,
        channels: 3,
        background: { r: 236, g: 205, b: 197 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const deepGoldenJpeg = await sharp({
      create: {
        width: 896,
        height: 1200,
        channels: 3,
        background: { r: 88, g: 57, b: 39 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const porcelainCol = await analyzeSkinColorimetry(porcelainJpeg);
    const deepCol = await analyzeSkinColorimetry(deepGoldenJpeg);

    expect(porcelainCol.itaDegrees).toBeGreaterThan(41);
    expect(["I", "II"]).toContain(porcelainCol.fitzpatrickType);

    expect(deepCol.itaDegrees).toBeLessThan(0);
    expect(["V", "VI"]).toContain(deepCol.fitzpatrickType);

    const frame = await prepareSkinAnalysisFrame(porcelainJpeg);
    expect(frame.fullWidth).toBe(896);
    expect(frame.fullHeight).toBe(1200);
    expect(frame.cropBox.width).toBeLessThan(600);
    const croppedMeta = await sharp(frame.croppedBuffer).metadata();
    expect(croppedMeta.width).toBe(768);
  });

  it("flags Ultra-Matte Blue-Crimson (#902) as a dermal clash on Ananya's reactive warm-olive skin and verifies Satin Rosewood (#408)", () => {
    const ananyaReport = STUDIO_PERSONAS.find((p) => p.id === "ananya")!.presetReport;
    const matteCrimson = getProductById("lip-velvet-crimson-902")!;
    const satinRosewood = getProductById("lip-peptide-rosewood-408")!;

    const clashVerdict = evaluateProductCompatibility(ananyaReport, matteCrimson);
    const matchVerdict = evaluateProductCompatibility(ananyaReport, satinRosewood);

    expect(clashVerdict.status).toBe("dermal_clash");
    expect(clashVerdict.recommendedCounterpartId).toBe("lip-peptide-rosewood-408");
    expect(clashVerdict.returnRiskPct).toBeGreaterThan(45);

    expect(matchVerdict.status).toBe("dermal_verified");
    expect(matchVerdict.compatibilityScore).toBeGreaterThanOrEqual(88);
    expect(matchVerdict.returnRiskPct).toBeLessThanOrEqual(12);
  });

  it("catches dehydrating Clay Matte Foundation on Claire (Fitzpatrick II, moisture raw 49.5) and ashy cast on Zuri (Fitzpatrick VI)", () => {
    const claireReport = STUDIO_PERSONAS.find((p) => p.id === "claire")!.presetReport;
    const zuriReport = STUDIO_PERSONAS.find((p) => p.id === "zuri")!.presetReport;
    const clayMatte = getProductById("complexion-matte-fluid-105")!;

    const claireVerdict = evaluateProductCompatibility(claireReport, clayMatte);
    const zuriVerdict = evaluateProductCompatibility(zuriReport, clayMatte);

    expect(claireVerdict.status).toBe("dermal_clash");
    expect(claireVerdict.requiredPrepProductId).toBe("skin-ceramide-barrier");

    expect(zuriVerdict.status).toBe("dermal_clash");
    expect(zuriVerdict.clashReasons.some((r) => r.includes("Fitzpatrick VI"))).toBe(true);
  });

  it("intercepts Retinol 1.0% + pH 3.4 Glycolic AHA collision in cart and restores >85 safety after smart swaps", () => {
    const ananyaReport = STUDIO_PERSONAS.find((p) => p.id === "ananya")!.presetReport;
    const hazardousCart = [
      "lip-velvet-crimson-902",
      "apparel-chartreuse-polo",
      "skin-retinol-1",
      "skin-glycolic-peel-10",
    ];

    const initialAudit = auditCartFormulations(ananyaReport, hazardousCart, DERMATELIER_CATALOG);
    expect(initialAudit.conflicts.length).toBeGreaterThanOrEqual(3);
    expect(initialAudit.conflicts.some((c) => c.id === "conflict-retinol-aha")).toBe(true);
    expect(initialAudit.estimatedCartReturnRiskPct).toBeGreaterThan(45);

    const calibratedCart = [
      "lip-peptide-rosewood-408",
      "apparel-emerald-silk",
      "skin-retinol-1",
      "skin-niacinamide-zinc",
      "skin-ceramide-barrier",
    ];
    const cleanAudit = auditCartFormulations(ananyaReport, calibratedCart, DERMATELIER_CATALOG);
    expect(cleanAudit.conflicts).toHaveLength(0);
    expect(cleanAudit.barrierSafetyScore).toBeGreaterThanOrEqual(85);
    expect(cleanAudit.estimatedCartReturnRiskPct).toBeLessThanOrEqual(16);
    expect(cleanAudit.estimatedSavedReturnUsd).toBeGreaterThan(80);
  });

  it("produces deterministic, repeatable 14-metric reports for identical portrait buffers offline", async () => {
    const sampleJpeg = await sharp({
      create: {
        width: 320,
        height: 400,
        channels: 3,
        background: { r: 194, g: 146, b: 118 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const r1 = await buildDeterministicOfflineReport(sampleJpeg, "Test Subject");
    const r2 = await buildDeterministicOfflineReport(sampleJpeg, "Test Subject");

    expect(r1.overallRawScore).toBe(r2.overallRawScore);
    expect(r1.itaDegrees).toBeDefined();
    expect(r1.metrics).toHaveLength(14);
    expect(r1.metrics.map((m) => m.rawScore)).toEqual(r2.metrics.map((m) => m.rawScore));
  });
});
