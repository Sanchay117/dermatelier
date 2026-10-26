import { describe, expect, it } from "vitest";
import { buildYouCamCacheKey } from "@/lib/youcam/cache";
import { DERMATELIER_CATALOG, getProductById } from "@/lib/youcam/catalog";
import { auditCartFormulations, evaluateProductCompatibility } from "@/lib/youcam/dermal-engine";
import { buildDeterministicOfflineReport } from "@/lib/youcam/local-cv";
import { STUDIO_PERSONAS } from "@/lib/youcam/presets";

describe("DermAtelier — Dermal Compatibility & Unit-Shield Engine", () => {
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

  it("intercepts Retinol 1.0% + pH 3.4 Glycolic AHA collision in cart and restores >90 safety after smart swaps", () => {
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

  it("produces deterministic, repeatable 14-metric reports for identical byte buffers offline", () => {
    const sampleBuf = Buffer.alloc(4096, 137);
    const r1 = buildDeterministicOfflineReport(sampleBuf, "Test Subject");
    const r2 = buildDeterministicOfflineReport(sampleBuf, "Test Subject");

    expect(r1.overallRawScore).toBe(r2.overallRawScore);
    expect(r1.metrics).toHaveLength(14);
    expect(r1.metrics.map((m) => m.rawScore)).toEqual(r2.metrics.map((m) => m.rawScore));
  });
});
