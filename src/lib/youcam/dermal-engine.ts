import { DERMATELIER_CATALOG, getProductById } from "./catalog";
import type {
  CartAuditResult,
  CatalogProduct,
  DermalCompatibilityVerdict,
  IngredientConflict,
  SkinAnalysisReport,
  YouCamSkinAction,
} from "./types";

function scoreFor(report: SkinAnalysisReport, action: YouCamSkinAction, fallback = 75): number {
  const found = report.metrics.find((m) => m.action === action);
  return found ? found.rawScore : fallback;
}

/**
 * Computes how a cosmetic, garment, or skincare active interacts with the shopper's
 * real YouCam dermal biology (moisture, texture, pores, redness, oiliness, acne, undertone).
 */
export function evaluateProductCompatibility(
  report: SkinAnalysisReport,
  product: CatalogProduct,
  catalog: CatalogProduct[] = DERMATELIER_CATALOG
): DermalCompatibilityVerdict {
  const moisture = scoreFor(report, "moisture");
  const texture = scoreFor(report, "texture");
  const pore = scoreFor(report, "pore");
  const redness = scoreFor(report, "redness");
  const acne = scoreFor(report, "acne");
  const oiliness = scoreFor(report, "oiliness");

  let penalty = 0;
  const clashReasons: string[] = [];
  const positiveSignals: string[] = [];
  let requiredPrepProductId: string | undefined;

  // 1. Finish × Hydration & Micro-Texture interaction
  const drynessDeficit = Math.max(0, 74 - moisture);
  const textureDeficit = Math.max(0, 74 - texture);
  if (product.dermalPhysics.moistureDemand > 60 && (drynessDeficit > 6 || textureDeficit > 6)) {
    const drag = Math.round(((drynessDeficit + textureDeficit) * product.dermalPhysics.moistureDemand) / 95);
    penalty += Math.min(34, Math.max(14, drag));
    clashReasons.push(
      `High-silica matte finish (demand ${product.dermalPhysics.moistureDemand}/100) clings to stratum corneum dehydration (raw ${moisture.toFixed(1)}) & micro-texture (${texture.toFixed(1)}).`
    );
    requiredPrepProductId = "skin-ceramide-barrier";
  } else if (product.dermalPhysics.moistureDemand <= 25 && moisture < 70) {
    positiveSignals.push(
      `Cushion emollient matrix buffers dehydrated zones (raw ${moisture.toFixed(1)}) without feathering or micro-flaking.`
    );
  }

  // 2. Pore Occlusion & Sebaceous Breakdown
  const poreDeficit = Math.max(0, 74 - pore);
  const acneDeficit = Math.max(0, 74 - acne);
  if (product.dermalPhysics.poreOcclusionRisk > 55 && (poreDeficit > 5 || acneDeficit > 5 || oiliness < 65)) {
    const porePenalty = Math.round(
      ((poreDeficit + acneDeficit + Math.max(0, 70 - oiliness)) * product.dermalPhysics.poreOcclusionRisk) / 130
    );
    penalty += Math.min(28, Math.max(12, porePenalty));
    clashReasons.push(
      `Heavy occlusive pigments risk settling into dilated T-zone/cheek ostia (pore raw ${pore.toFixed(1)}) and triggering comedones (acne raw ${acne.toFixed(1)}).`
    );
    if (!requiredPrepProductId) {
      requiredPrepProductId = "skin-niacinamide-zinc";
    }
  } else if (product.dermalPhysics.poreOcclusionRisk <= 20 && (pore < 72 || acne < 72)) {
    positiveSignals.push(
      `Non-comedogenic breathable film respects active blemish & follicular ostia zones.`
    );
  }

  // 3. Chromatic Erythema Amplification (Cosmetics & Apparel VTO)
  const rednessDeficit = Math.max(0, 76 - redness);
  if (product.dermalPhysics.erythemaAmplification > 60 && rednessDeficit > 6) {
    const redPenalty = Math.round((rednessDeficit * product.dermalPhysics.erythemaAmplification) / 85);
    penalty += Math.min(30, Math.max(14, redPenalty));
    clashReasons.push(
      product.category === "apparel"
        ? `High-chroma yellow-green reflectance creates simultaneous color contrast that magnifies malar redness (raw ${redness.toFixed(1)}) by +21%.`
        : `Cool blue-crimson / low-pH profile visually amplifies cheek & perioral erythema (raw ${redness.toFixed(1)}).`
    );
  } else if (product.dermalPhysics.erythemaAmplification <= 22 && redness < 72) {
    positiveSignals.push(
      `Chromatic undertone neutralizes malar erythema (${redness.toFixed(1)}) for calmer perceived skin tone.`
    );
  }

  // 4. Undertone & Melanin Ashy-Cast Physics
  if (product.dermalPhysics.clashingUndertones.includes(report.undertone)) {
    if (report.melaninIndex >= 70 && product.category === "complexion") {
      penalty += 34;
      clashReasons.push(
        `Titanium-heavy opaque base creates a chalky grey-violet cast on Fitzpatrick ${report.fitzpatrickType} (${report.undertoneLabel}) skin.`
      );
    } else {
      penalty += 22;
      clashReasons.push(
        `Chromatic mismatch with ${report.undertoneLabel} spectrum — high probability of "looked different than studio model" return.`
      );
    }
  } else if (product.dermalPhysics.idealUndertones.includes(report.undertone)) {
    positiveSignals.push(
      `Spectrally harmonized with your ${report.undertoneLabel} profile (Fitzpatrick ${report.fitzpatrickType}).`
    );
  }

  // 5. Fitzpatrick VI Post-Inflammatory Hyperpigmentation Guardrail for Harsh Acids
  if (
    report.melaninIndex >= 75 &&
    product.activeIngredients?.includes("glycolic_aha_10")
  ) {
    penalty += 26;
    clashReasons.push(
      `Unbuffered 10% Glycolic AHA at pH 3.4 carries elevated rebound hyperpigmentation (PIH) risk on Fitzpatrick ${report.fitzpatrickType} skin.`
    );
  }

  const compatibilityScore = Math.max(18, Math.min(98, 96 - penalty));

  const status: DermalCompatibilityVerdict["status"] =
    compatibilityScore >= 78
      ? "dermal_verified"
      : compatibilityScore >= 56
      ? "caution_prep_needed"
      : "dermal_clash";

  const returnRiskPct = Math.max(
    5,
    Math.min(
      68,
      Math.round(product.baselineReturnRatePct * (1 + (75 - compatibilityScore) / 70))
    )
  );

  let recommendedCounterpartId = product.calibratedCounterpartId;
  if (recommendedCounterpartId && !catalog.some((c) => c.id === recommendedCounterpartId)) {
    recommendedCounterpartId = undefined;
  }

  if (positiveSignals.length === 0) {
    positiveSignals.push("Compatible with baseline facial contour landmarks.");
  }

  const headline =
    status === "dermal_verified"
      ? `Dermal-Verified Match (${compatibilityScore}/100) · Low ${returnRiskPct}% Return Risk`
      : status === "caution_prep_needed"
      ? `Prep Recommended (${compatibilityScore}/100) · Barrier Primer Advised`
      : `Dermal Clash Detected (${compatibilityScore}/100) · ${returnRiskPct}% Return Risk`;

  const finishAdjustmentNote =
    status !== "dermal_verified" && recommendedCounterpartId
      ? `Auto-calibrated counterpart shifts finish/chroma to protect barrier (${report.barrierIntegrityScore}/100) and cut return risk to ${
          getProductById(recommendedCounterpartId)?.baselineReturnRatePct ?? 10
        }%.`
      : undefined;

  return {
    productId: product.id,
    compatibilityScore,
    status,
    returnRiskPct,
    headline,
    clashReasons,
    positiveSignals,
    recommendedCounterpartId,
    requiredPrepProductId,
    finishAdjustmentNote,
  };
}

/**
 * Audits an entire shopping cart for active-ingredient biochemical clashes AND
 * dermal barrier overload against the shopper's YouCam Skin Analysis report.
 */
export function auditCartFormulations(
  report: SkinAnalysisReport,
  cartProductIds: string[],
  catalog: CatalogProduct[] = DERMATELIER_CATALOG
): CartAuditResult {
  const items = cartProductIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is CatalogProduct => Boolean(p));

  const conflicts: IngredientConflict[] = [];

  const retinolItem = items.find((p) => p.activeIngredients?.includes("retinol_1"));
  const ahaBhaItem = items.find(
    (p) =>
      p.activeIngredients?.includes("glycolic_aha_10") ||
      p.activeIngredients?.includes("salicylic_bha_2")
  );

  // Pairwise Conflict 1: Retinol 1% + Unbuffered 10% Glycolic/BHA Acid
  if (retinolItem && ahaBhaItem) {
    conflicts.push({
      id: "conflict-retinol-aha",
      severity: "critical_barrier_hazard",
      productAId: retinolItem.id,
      productBId: ahaBhaItem.id,
      title: "Retinol 1.0% × pH 3.4 Glycolic/BHA Barrier Strip Hazard",
      mechanism:
        "Combining unbuffered alpha/beta hydroxy acids (pH 3.4) with 1.0% Retinol accelerates corneocyte stripping while destabilizing neutral-pH retinoid conversion, causing acute erythema and peeling.",
      dermalTrigger: `Amplified by your current Barrier Integrity (${report.barrierIntegrityScore}/100) and Malar Redness raw score (${scoreFor(
        report,
        "redness"
      ).toFixed(1)}).`,
      resolutionText:
        "Replace pH 3.4 Glycolic Peel with pH 5.5 5% Niacinamide + Azelaic Serum (clinically proven to buffer retinoid irritation while refining pores).",
      swapRemoveProductId: ahaBhaItem.id,
      swapAddProductId: "skin-niacinamide-zinc",
    });
  }

  // Single-Item Barrier Overload: High-potency acid or retinol without lipid barrier support on compromised barrier
  const hasBarrierSupport = items.some((p) => p.activeIngredients?.includes("ceramide_np"));
  if (report.barrierIntegrityScore < 66 && (retinolItem || ahaBhaItem) && !hasBarrierSupport) {
    const triggerItem = ahaBhaItem || retinolItem!;
    conflicts.push({
      id: "conflict-unbuffered-barrier",
      severity: "moderate_efficacy_loss",
      productAId: triggerItem.id,
      title: "Unbuffered High-Potency Active on Lipid-Depleted Barrier",
      mechanism: `YouCam capacitance & erythema telemetry indicates a ${report.barrierIntegrityScore}/100 barrier score. Applying ${triggerItem.name} without 3:1:1 ceramide lipid buffering spikes transepidermal water loss (TEWL).`,
      dermalTrigger: `Hydration raw score ${scoreFor(report, "moisture").toFixed(1)} · Barrier ${report.barrierIntegrityScore}/100`,
      resolutionText:
        "Swap or buffer with Triple-Ceramide NP + Squalane Barrier Veil to seal intercellular lipids.",
      swapRemoveProductId: triggerItem.id,
      swapAddProductId: "skin-ceramide-barrier",
    });
  }

  // VTO Cosmetic / Apparel Clash left in cart
  for (const item of items) {
    if (item.category === "lip" || item.category === "complexion" || item.category === "apparel") {
      const verdict = evaluateProductCompatibility(report, item, catalog);
      if (verdict.status === "dermal_clash" && verdict.recommendedCounterpartId) {
        const counterpart = catalog.find((c) => c.id === verdict.recommendedCounterpartId);
        if (counterpart && !items.some((i) => i.id === counterpart.id)) {
          conflicts.push({
            id: `conflict-vto-${item.id}`,
            severity: "moderate_efficacy_loss",
            productAId: item.id,
            title: `Dermal/Undertone Clash: ${item.name}`,
            mechanism: verdict.clashReasons[0] || "Incompatible with current skin texture/undertone telemetry.",
            dermalTrigger: `Compatibility ${verdict.compatibilityScore}/100 · Predicted Return Risk ${verdict.returnRiskPct}%`,
            resolutionText: `1-Click Upgrade to ${counterpart.name} (${counterpart.baselineReturnRatePct}% return risk).`,
            swapRemoveProductId: item.id,
            swapAddProductId: counterpart.id,
          });
        }
      }
    }
  }

  const verdicts = items.map((item) => evaluateProductCompatibility(report, item, catalog));
  const avgCompatibility =
    verdicts.length > 0
      ? verdicts.reduce((acc, v) => acc + v.compatibilityScore, 0) / verdicts.length
      : 92;

  const conflictPenalty = conflicts.reduce(
    (sum, c) => sum + (c.severity === "critical_barrier_hazard" ? 28 : 14),
    0
  );
  const barrierSafetyScore = Math.max(15, Math.min(99, Math.round(avgCompatibility - conflictPenalty * 0.65)));

  const estimatedCartReturnRiskPct =
    verdicts.length > 0
      ? Math.min(
          69,
          Math.round(
            verdicts.reduce((acc, v) => acc + v.returnRiskPct, 0) / verdicts.length +
              conflicts.length * 9
          )
        )
      : 0;

  const baselineIndustryReturnRiskPct = 44;
  const cartSubtotal = items.reduce((sum, item) => sum + item.priceUsd, 0);
  const riskDelta = Math.max(0, baselineIndustryReturnRiskPct - estimatedCartReturnRiskPct) / 100;
  const estimatedSavedReturnUsd = Math.round(cartSubtotal * riskDelta * 100) / 100;

  const amRoutine = items.filter(
    (i) => i.clinicalRole === "am_protect" || i.clinicalRole === "am_pm_barrier"
  );
  const pmRoutine = items.filter(
    (i) => i.clinicalRole === "pm_renew" || i.clinicalRole === "am_pm_barrier"
  );
  const wearNowItems = items.filter((i) => i.category !== "skincare_active");

  return {
    barrierSafetyScore,
    estimatedCartReturnRiskPct,
    baselineIndustryReturnRiskPct,
    conflicts,
    amRoutine,
    pmRoutine,
    wearNowItems,
    estimatedSavedReturnUsd,
  };
}
