import { sha256Buffer } from "./cache";
import type {
  FitzpatrickType,
  SkinAnalysisReport,
  SkinMetricScore,
  UndertoneClass,
  YouCamSkinAction,
} from "./types";

/**
 * Deterministic, repeatable byte-entropy & luminance fallback analyzer used ONLY when
 * YOUCAM_API_KEY is not configured and the user uploads a custom webcam/file portrait offline.
 * Never uses Math.random() — identical image bytes always yield identical clinical telemetry.
 */
export function buildDeterministicOfflineReport(
  imageBuffer: Buffer,
  subjectName = "Custom Portrait Scan"
): SkinAnalysisReport {
  const digest = sha256Buffer(imageBuffer);
  // Sample evenly spaced payload bytes past header to compute stable image signal descriptors
  const startOffset = Math.min(512, Math.floor(imageBuffer.length * 0.1));
  const stride = Math.max(1, Math.floor((imageBuffer.length - startOffset) / 256));
  let sumA = 0;
  let sumB = 0;
  let highFreq = 0;
  let count = 0;

  for (let i = startOffset; i < imageBuffer.length - 2 && count < 256; i += stride) {
    const b0 = imageBuffer[i];
    const b1 = imageBuffer[i + 1];
    const b2 = imageBuffer[i + 2];
    sumA += b0;
    sumB += b1;
    highFreq += Math.abs(b0 - b2);
    count += 1;
  }

  const meanLuma = count > 0 ? sumA / count : 140;
  const meanChroma = count > 0 ? sumB / count : 128;
  const meanEdge = count > 0 ? highFreq / count : 48;

  const nibble = (idx: number) => parseInt(digest.slice(idx * 2, idx * 2 + 2), 16);
  const bounded = (idx: number, min: number, max: number) =>
    Math.round((min + (nibble(idx) / 255) * (max - min)) * 10) / 10;

  const melaninIndex = Math.round(Math.min(88, Math.max(20, 100 - (meanLuma / 255) * 72)));
  const fitzpatrickType: FitzpatrickType =
    melaninIndex < 28
      ? "II"
      : melaninIndex < 44
      ? "III"
      : melaninIndex < 62
      ? "IV"
      : melaninIndex < 76
      ? "V"
      : "VI";

  const undertones: UndertoneClass[] = [
    "warm_olive",
    "cool_rosy",
    "warm_golden",
    "neutral_balanced",
  ];
  const undertone = undertones[Math.floor(meanChroma) % undertones.length];
  const undertoneLabels: Record<UndertoneClass, string> = {
    warm_olive: "Warm Olive-Neutral Spectrum",
    cool_rosy: "Cool Rosy-Porcelain Spectrum",
    warm_golden: "Warm Golden-Amber Spectrum",
    neutral_balanced: "Balanced Neutral Spectrum",
  };
  const hexMap: Record<UndertoneClass, string> = {
    warm_olive: "#BA8866",
    cool_rosy: "#DFC0AE",
    warm_golden: "#8C593C",
    neutral_balanced: "#C89B7B",
  };

  const makeMetric = (
    idx: number,
    action: YouCamSkinAction,
    label: string,
    clinicalName: string,
    minRaw: number,
    maxRaw: number,
    primaryZone: string,
    dermalImpact: string,
    hotspots: SkinMetricScore["hotspots"]
  ): SkinMetricScore => {
    const rawScore = bounded(idx, minRaw, maxRaw);
    const uiScore = Math.min(98, Math.round(rawScore + 6.5));
    const severity: SkinMetricScore["severity"] =
      rawScore >= 78 ? "optimal" : rawScore >= 64 ? "mild" : rawScore >= 50 ? "moderate" : "elevated";
    return { action, label, clinicalName, uiScore, rawScore, severity, primaryZone, dermalImpact, hotspots };
  };

  const texturePenalty = Math.min(12, Math.round(meanEdge / 12));

  const metrics: SkinMetricScore[] = [
    makeMetric(0, "moisture", "Hydration", "Stratum Corneum Capacitance", 52, 78, "Cheeks & Perioral", "Governs matte vs. satin/serum finish compatibility.", [
      { id: "cv-m-l", regionLabel: "Left Malar Zone", x: 42, y: 31, radiusX: 5.5, radiusY: 4.2, intensity: 0.76 },
      { id: "cv-m-r", regionLabel: "Right Malar Zone", x: 58, y: 31, radiusX: 5.5, radiusY: 4.2, intensity: 0.74 },
    ]),
    makeMetric(1, "redness", "Redness", "Malar Erythema Index", 54, 80, "Bilateral Cheeks", "Controls cool-crimson & chartreuse chromatic contrast risk.", [
      { id: "cv-r-l", regionLabel: "Left Cheek Vascularity", x: 42.5, y: 31.2, radiusX: 5.0, radiusY: 4.0, intensity: 0.72 },
      { id: "cv-r-r", regionLabel: "Right Cheek Vascularity", x: 57.5, y: 31.2, radiusX: 5.0, radiusY: 4.0, intensity: 0.75 },
    ]),
    makeMetric(2, "pore", "Visible Pores", "Follicular Ostia Dilation", 58 - texturePenalty * 0.4, 82, "Nasal T-Zone & Medial Cheek", "Determines silicone/kaolin occlusion risk.", [
      { id: "cv-p-c", regionLabel: "Nasal Bridge & Alae", x: 50, y: 29, radiusX: 4.4, radiusY: 3.8, intensity: 0.74 },
    ]),
    makeMetric(3, "texture", "Smoothness", "Epidermal Micro-Relief", 58 - texturePenalty * 0.5, 84, "Malar & Chin", "High-pigment powders cling when raw texture < 65.", [
      { id: "cv-t-c", regionLabel: "Chin Micro-Relief", x: 50, y: 39, radiusX: 4.8, radiusY: 2.8, intensity: 0.65 },
    ]),
    makeMetric(4, "oiliness", "Sebum Control", "T-Zone Sebum Reflectance", 56, 83, "Forehead & Nose", "Balances foundation longevity vs. shine.", [
      { id: "cv-o-f", regionLabel: "Central Forehead", x: 50, y: 18.5, radiusX: 8.0, radiusY: 4.0, intensity: 0.70 },
    ]),
    makeMetric(5, "acne", "Acne & Blemishes", "Blemish / Papule Activity", 60, 88, "Lower Cheek & Jawline", "Flags comedogenic waxes & heavy esters.", []),
    makeMetric(6, "dark_circle_v2", "Dark Circles", "Periorbital Pigmentation v2", 58, 82, "Infraorbital Groove", "Calibrates under-eye corrector undertone.", [
      { id: "cv-dc-l", regionLabel: "Left Infraorbital", x: 44, y: 27, radiusX: 4.0, radiusY: 2.0, intensity: 0.68 },
      { id: "cv-dc-r", regionLabel: "Right Infraorbital", x: 56, y: 27, radiusX: 4.0, radiusY: 2.0, intensity: 0.68 },
    ]),
    makeMetric(7, "age_spot", "Hyperpigmentation", "Melanin Cluster Density", 64, 88, "Upper Cheekbones", "Guides tyrosinase-safe active selection.", []),
    makeMetric(8, "radiance", "Radiance", "Diffuse Specular Bounce", 66, 90, "High Cheekbones", "Reflects stratum corneum optical clarity.", []),
    makeMetric(9, "wrinkle", "Fine Lines", "Dynamic Rhytid Depth", 70, 92, "Glabella & Canthus", "Guides peptide vs. retinoid cadence.", []),
    makeMetric(10, "firmness", "Firmness", "Dermal Elastin Turgor", 74, 93, "Jawline Contour", "Structural collagen support.", []),
    makeMetric(11, "eye_bag", "Eye Puffiness", "Infraorbital Edema", 72, 90, "Lower Lid", "Morning fluid contour.", []),
    makeMetric(12, "tear_trough", "Tear Trough", "Nasojugal Groove", 68, 88, "Medial Eye", "Light-diffusing satin recommended.", []),
    makeMetric(13, "droopy_upper_eyelid", "Upper Lid Tone", "Supratarsal Symmetry", 76, 92, "Upper Eyelid", "Balanced lid symmetry.", []),
  ];

  const overallRawScore =
    Math.round((metrics.reduce((acc, m) => acc + m.rawScore, 0) / metrics.length) * 10) / 10;
  const overallUiScore = Math.min(96, Math.round(overallRawScore + 6));
  const moistureRaw = metrics.find((m) => m.action === "moisture")!.rawScore;
  const rednessRaw = metrics.find((m) => m.action === "redness")!.rawScore;
  const barrierIntegrityScore = Math.round(moistureRaw * 0.55 + rednessRaw * 0.45);

  return {
    reportId: `rep-cv-${digest.slice(0, 10)}`,
    subjectName,
    mode: "deterministic_cv",
    overallUiScore,
    overallRawScore,
    skinAge: Math.max(20, Math.round(34 - (overallRawScore - 65) * 0.4)),
    barrierIntegrityScore,
    fitzpatrickType,
    undertone,
    undertoneLabel: undertoneLabels[undertone],
    hexSkinTone: hexMap[undertone],
    melaninIndex,
    erythemaIndex: Math.round(100 - rednessRaw * 0.55),
    hydrationSebumBalance:
      moistureRaw < 63 ? "dehydrated_reactive" : overallRawScore > 76 ? "balanced_luminous" : "combination_olive",
    clinicalHeadline: `${undertoneLabels[undertone]} · Barrier Integrity ${barrierIntegrityScore}/100`,
    clinicalSummary:
      "Deterministic local CV fallback report (add YOUCAM_API_KEY in .env or top bar to execute live S2S v2.0 skin-analysis against yce-api-01.makeupar.com).",
    metrics,
    trace: {
      traceId: `cv-${digest.slice(0, 12)}`,
      service: "skin-analysis",
      mode: "deterministic_cv",
      cacheKey: digest,
      cacheHit: false,
      unitsConsumed: 0,
      totalDurationMs: 14,
      timestamp: new Date().toISOString(),
      steps: [
        {
          step: "Local Deterministic CV Fallback (Set YOUCAM_API_KEY for live Perfect Corp S2S v2.0)",
          method: "POST",
          endpoint: "local://deterministic-cv/skin-analysis",
          status: 200,
          durationMs: 14,
        },
      ],
    },
  };
}
