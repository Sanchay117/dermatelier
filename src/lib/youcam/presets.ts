import type { SkinAnalysisReport, SkinMetricScore } from "./types";

export interface PersonaLandmarks {
  /** Normalized 0-100 coordinates on the 896x1152 portrait */
  forehead: { x: number; y: number };
  leftUnderEye: { x: number; y: number };
  rightUnderEye: { x: number; y: number };
  noseBridge: { x: number; y: number };
  leftCheek: { x: number; y: number };
  rightCheek: { x: number; y: number };
  upperLipCenter: { x: number; y: number };
  lowerLipCenter: { x: number; y: number };
  lipWidth: number;
  lipHeight: number;
  chin: { x: number; y: number };
  torsoBox: { x: number; y: number; width: number; height: number };
}

export interface StudioPersona {
  id: string;
  name: string;
  age: number;
  location: string;
  skinProfileTag: string;
  portraitUrl: string;
  landmarks: PersonaLandmarks;
  presetReport: SkinAnalysisReport;
  defaultNaiveProductId: string;
  defaultApparelClashId: string;
}

function metric(
  action: SkinMetricScore["action"],
  label: string,
  clinicalName: string,
  uiScore: number,
  rawScore: number,
  primaryZone: string,
  dermalImpact: string,
  hotspots: SkinMetricScore["hotspots"]
): SkinMetricScore {
  const severity: SkinMetricScore["severity"] =
    rawScore >= 78 ? "optimal" : rawScore >= 64 ? "mild" : rawScore >= 50 ? "moderate" : "elevated";
  return {
    action,
    label,
    clinicalName,
    uiScore,
    rawScore,
    severity,
    primaryZone,
    dermalImpact,
    hotspots,
  };
}

export const STUDIO_PERSONAS: StudioPersona[] = [
  {
    id: "ananya",
    name: "Ananya Rao",
    age: 24,
    location: "Mumbai · Humid Coastal UV 9",
    skinProfileTag: "Fitzpatrick IV · Warm-Olive · Malar Erythema & T-Zone Pores",
    portraitUrl: "/demo/persona-ananya.jpg",
    defaultNaiveProductId: "lip-velvet-crimson-902",
    defaultApparelClashId: "apparel-chartreuse-polo",
    landmarks: {
      forehead: { x: 50, y: 17.8 },
      leftUnderEye: { x: 43.5, y: 26.8 },
      rightUnderEye: { x: 56.8, y: 26.8 },
      noseBridge: { x: 50.2, y: 27.8 },
      leftCheek: { x: 41.5, y: 31.2 },
      rightCheek: { x: 58.8, y: 31.2 },
      upperLipCenter: { x: 50.2, y: 34.8 },
      lowerLipCenter: { x: 50.2, y: 36.3 },
      lipWidth: 11.6,
      lipHeight: 3.4,
      chin: { x: 50.2, y: 40.0 },
      torsoBox: { x: 16, y: 44, width: 68, height: 54 },
    },
    presetReport: {
      reportId: "rep-ananya-studio-v2",
      personaId: "ananya",
      subjectName: "Ananya Rao",
      mode: "preset_studio",
      overallUiScore: 76,
      overallRawScore: 68.4,
      skinAge: 25,
      chronologicalAgeHint: 24,
      barrierIntegrityScore: 63,
      fitzpatrickType: "IV",
      undertone: "warm_olive",
      undertoneLabel: "Warm Olive-Golden (Melanin-Rich Neutral-Warm)",
      hexSkinTone: "#B98562",
      melaninIndex: 58,
      erythemaIndex: 66,
      hydrationSebumBalance: "combination_olive",
      clinicalHeadline: "Reactive Malar Erythema + Sebaceous T-Zone Micro-Pores",
      clinicalSummary:
        "High elasticity and minimal rhytids, but active cheek erythema (raw 54.2) and post-inflammatory macules make cool-blue matte pigments and unbuffered glycolic/retinoid stacks high-risk for irritation and shade oxidation.",
      metrics: [
        metric("redness", "Redness", "Malar Erythema Index", 62, 54.2, "Bilateral Malar Cheeks", "Cool crimson & acidic chartreuse pigments create chromatic contrast that visually magnifies cheek redness by +21%.", [
          { id: "an-red-l", regionLabel: "Left Malar Cheek", x: 41.2, y: 31.2, radiusX: 5.5, radiusY: 4.4, intensity: 0.86 },
          { id: "an-red-r", regionLabel: "Right Malar Cheek", x: 59.0, y: 31.0, radiusX: 5.8, radiusY: 4.5, intensity: 0.89 },
        ]),
        metric("acne", "Acne & Blemishes", "Inflammatory Papule / PIH Count", 65, 57.8, "Lateral Cheeks & Chin", "Avoid heavy comedogenic waxes and silicones (pore occlusion > 65); pair makeup prep with Azelaic + Niacinamide.", [
          { id: "an-acne-r", regionLabel: "Right Cheek Macules", x: 59.8, y: 31.8, radiusX: 4.2, radiusY: 3.6, intensity: 0.82 },
          { id: "an-acne-l", regionLabel: "Left Cheek Macules", x: 40.8, y: 31.6, radiusX: 3.9, radiusY: 3.3, intensity: 0.74 },
        ]),
        metric("pore", "Visible Pores", "Follicular Ostia Dilation", 70, 61.5, "Nasal Alae & Medial Cheeks", "High-powder matte foundations settle into dilated medial-cheek ostia within 90 minutes without blurring niacinamide prep.", [
          { id: "an-pore-c", regionLabel: "Nasal Bridge & Alae", x: 50.2, y: 29.2, radiusX: 4.5, radiusY: 4.0, intensity: 0.78 },
          { id: "an-pore-l", regionLabel: "Medial Left Cheek", x: 44.5, y: 30.5, radiusX: 3.6, radiusY: 3.2, intensity: 0.68 },
        ]),
        metric("oiliness", "Sebum Control", "T-Zone Sebum Reflectance", 69, 60.9, "Forehead & Nasal T-Zone", "Elevated humid-climate sebum oxidizes iron-oxide foundations half a shade darker unless oil-balanced.", [
          { id: "an-oil-f", regionLabel: "Central Forehead", x: 50.0, y: 18.2, radiusX: 8.5, radiusY: 4.2, intensity: 0.72 },
          { id: "an-oil-n", regionLabel: "Nasal Tip", x: 50.2, y: 29.8, radiusX: 3.2, radiusY: 3.8, intensity: 0.76 },
        ]),
        metric("moisture", "Hydration", "Stratum Corneum Capacitance", 72, 65.4, "Perioral & Lateral Jaw", "Borderline perioral hydration means ultra-dry liquid mattes feather along vermilion micro-lines.", [
          { id: "an-moist-m", regionLabel: "Perioral Zone", x: 50.2, y: 36.2, radiusX: 6.8, radiusY: 3.5, intensity: 0.58 },
        ]),
        metric("texture", "Smoothness", "Epidermal Micro-Relief", 75, 67.9, "Malar & Chin Zone", "Satin and serum-tint finishes diffuse specular bounce across textured cheek zones.", [
          { id: "an-tex-r", regionLabel: "Right Malar Relief", x: 58.2, y: 31.5, radiusX: 4.8, radiusY: 3.8, intensity: 0.62 },
        ]),
        metric("dark_circle_v2", "Dark Circles", "Periorbital Pigmentation v2", 71, 63.7, "Infraorbital Tear Trough", "Warm peach-bisque undertone corrector neutralizes olive-violet periorbital shadow.", [
          { id: "an-dc-l", regionLabel: "Left Infraorbital", x: 44.0, y: 26.8, radiusX: 4.2, radiusY: 2.1, intensity: 0.66 },
          { id: "an-dc-r", regionLabel: "Right Infraorbital", x: 56.5, y: 26.8, radiusX: 4.2, radiusY: 2.1, intensity: 0.65 },
        ]),
        metric("age_spot", "Hyperpigmentation", "Post-Inflammatory Melanin Clusters", 74, 66.2, "Upper Cheekbones", "Requires daily UV + gentle tyrosinase modulation rather than aggressive acid stripping.", [
          { id: "an-spot-r", regionLabel: "Right Zygomatic", x: 59.5, y: 29.5, radiusX: 3.8, radiusY: 2.8, intensity: 0.60 },
        ]),
        metric("radiance", "Radiance", "Diffuse Luminosity Index", 82, 76.4, "Forehead & High Cheekbones", "Strong natural golden-olive warmth responds exceptionally to emerald, terracotta, and warm rosewood palettes.", []),
        metric("wrinkle", "Fine Lines", "Dynamic Rhytid Depth", 90, 86.1, "Glabella & Periorbital", "Minimal rhytid formation; preventative peptide hydration is sufficient.", []),
        metric("firmness", "Firmness", "Dermal Elastin Turgor", 91, 87.5, "Lower Face & Jawline", "Intact collagen matrix with crisp mandibular contour.", []),
        metric("eye_bag", "Eye Puffiness", "Infraorbital Edema", 85, 80.2, "Lower Eyelid", "Low fluid retention.", []),
        metric("tear_trough", "Tear Trough", "Nasojugal Groove Depth", 79, 73.1, "Medial Under-Eye", "Mild anatomical hollow; light-reflective concealer recommended over matte baking.", []),
        metric("droopy_upper_eyelid", "Upper Lid Tone", "Levator Fold Symmetry", 89, 84.8, "Supratarsal Fold", "Balanced symmetrical lid contour.", []),
      ],
      trace: {
        traceId: "preset-trace-ananya",
        service: "skin-analysis",
        mode: "preset_studio",
        cacheKey: "studio_ananya_14_actions_v2",
        cacheHit: true,
        unitsConsumed: 0,
        taskId: "studio_precalibrated_ananya",
        totalDurationMs: 6,
        timestamp: "2026-10-26T12:00:00.000Z",
        steps: [
          {
            step: "Unit-Shield Studio Preset Loaded (Click 'Run Live YouCam API' to execute live S2S v2.0 scan)",
            method: "GET",
            endpoint: "/local/preset/ananya",
            status: 200,
            durationMs: 6,
          },
        ],
      },
    },
  },
  {
    id: "claire",
    name: "Claire Lin",
    age: 29,
    location: "San Francisco · Dry Micro-Climate",
    skinProfileTag: "Fitzpatrick II · Cool Porcelain · Dehydrated Barrier & Periorbital Shadow",
    portraitUrl: "/demo/persona-claire.jpg",
    defaultNaiveProductId: "complexion-matte-fluid-105",
    defaultApparelClashId: "apparel-chartreuse-polo",
    landmarks: {
      forehead: { x: 50.0, y: 17.5 },
      leftUnderEye: { x: 44.5, y: 26.8 },
      rightUnderEye: { x: 56.2, y: 26.8 },
      noseBridge: { x: 50.4, y: 27.5 },
      leftCheek: { x: 42.5, y: 30.5 },
      rightCheek: { x: 58.2, y: 30.5 },
      upperLipCenter: { x: 50.4, y: 33.9 },
      lowerLipCenter: { x: 50.4, y: 35.1 },
      lipWidth: 10.2,
      lipHeight: 2.8,
      chin: { x: 50.4, y: 38.8 },
      torsoBox: { x: 18, y: 45, width: 64, height: 53 },
    },
    presetReport: {
      reportId: "rep-claire-studio-v2",
      personaId: "claire",
      subjectName: "Claire Lin",
      mode: "preset_studio",
      overallUiScore: 79,
      overallRawScore: 71.2,
      skinAge: 30,
      chronologicalAgeHint: 29,
      barrierIntegrityScore: 58,
      fitzpatrickType: "II",
      undertone: "cool_rosy",
      undertoneLabel: "Cool Porcelain-Neutral (Low Melanin, Translucent Vascularity)",
      hexSkinTone: "#E6C7B2",
      melaninIndex: 24,
      erythemaIndex: 52,
      hydrationSebumBalance: "dehydrated_reactive",
      clinicalHeadline: "Lipid-Depleted Stratum Corneum + Translucent Periorbital Vascularity",
      clinicalSummary:
        "Exceptionally clear pores and low acne activity, but low moisture capacitance (raw 49.5) and impaired lipid barrier (58/100) cause matte powders/foundations to micro-flake within 2 hours and make high-strength Retinol + AHA stacks hazardous.",
      metrics: [
        metric("moisture", "Hydration", "Stratum Corneum Capacitance", 58, 49.5, "Cheeks, Perioral & Forehead", "Critical dehydration alert: alcohol-denat or high-silica matte bases will cling and crack across zygomatic and perioral skin.", [
          { id: "cl-moist-l", regionLabel: "Left Cheek Lipid Deficit", x: 42.5, y: 30.5, radiusX: 5.8, radiusY: 4.5, intensity: 0.90 },
          { id: "cl-moist-r", regionLabel: "Right Cheek Lipid Deficit", x: 58.0, y: 30.5, radiusX: 5.8, radiusY: 4.5, intensity: 0.88 },
          { id: "cl-moist-m", regionLabel: "Vermilion Border", x: 50.4, y: 34.6, radiusX: 5.5, radiusY: 2.6, intensity: 0.84 },
        ]),
        metric("dark_circle_v2", "Dark Circles", "Periorbital Vascularity v2", 64, 56.1, "Medial Infraorbital", "Thin periorbital dermis reveals blue-violet vascular tone; requires serum-elastomer concealer, never dry baking.", [
          { id: "cl-dc-l", regionLabel: "Left Tear Trough", x: 44.8, y: 26.8, radiusX: 4.0, radiusY: 2.0, intensity: 0.81 },
          { id: "cl-dc-r", regionLabel: "Right Tear Trough", x: 56.2, y: 26.8, radiusX: 4.0, radiusY: 2.0, intensity: 0.79 },
        ]),
        metric("tear_trough", "Tear Trough", "Nasojugal Groove Shadow", 67, 59.4, "Medial Under-Eye", "Hydrating squalane + light-diffusing satin pigments soften groove shadow by 34%.", [
          { id: "cl-tt-l", regionLabel: "Left Nasojugal Groove", x: 45.2, y: 27.3, radiusX: 3.4, radiusY: 1.8, intensity: 0.74 },
          { id: "cl-tt-r", regionLabel: "Right Nasojugal Groove", x: 55.6, y: 27.3, radiusX: 3.4, radiusY: 1.8, intensity: 0.72 },
        ]),
        metric("texture", "Smoothness", "Dry Desquamation Micro-Flakes", 68, 60.2, "Lower Cheeks & Chin", "Micro-desquamation traps high-pigment matte lipsticks and full-coverage fluids.", [
          { id: "cl-tex-c", regionLabel: "Chin Micro-Texture", x: 50.4, y: 38.2, radiusX: 5.0, radiusY: 2.8, intensity: 0.69 },
        ]),
        metric("wrinkle", "Fine Lines", "Dehydration Periorbital Crinkling", 74, 66.8, "Lateral Canthus", "Fine lines are primarily dehydration-induced and plump rapidly with ceramide + hyaluronic prep.", [
          { id: "cl-wr-l", regionLabel: "Left Crow's Feet", x: 39.8, y: 25.5, radiusX: 2.6, radiusY: 2.2, intensity: 0.61 },
          { id: "cl-wr-r", regionLabel: "Right Crow's Feet", x: 60.8, y: 25.5, radiusX: 2.6, radiusY: 2.2, intensity: 0.61 },
        ]),
        metric("radiance", "Radiance", "Surface Specular Glow", 71, 63.8, "Pan-Facial", "Lipid replenishment restores porcelain glass-skin bounce.", []),
        metric("redness", "Redness", "Capillary Reactivity", 75, 68.0, "Nasal Alae & Cheeks", "Mild barrier sensitivity; avoid low-pH acid peels alongside retinoids.", [
          { id: "cl-red-n", regionLabel: "Nasal Fold", x: 47.8, y: 30.5, radiusX: 2.5, radiusY: 2.2, intensity: 0.54 },
        ]),
        metric("firmness", "Firmness", "Dermal Elasticity", 82, 76.5, "Mid-Face", "Healthy structural support.", []),
        metric("age_spot", "Hyperpigmentation", "UV Lentigines", 84, 79.0, "High Zygoma", "Minimal focal pigment.", []),
        metric("pore", "Visible Pores", "Ostia Diameter", 88, 84.1, "T-Zone", "Refined, compact pore architecture.", []),
        metric("acne", "Acne & Blemishes", "Comedonal Activity", 92, 89.4, "Full Face", "Clear epidermis.", []),
        metric("oiliness", "Sebum Control", "Lipid Output", 86, 81.0, "T-Zone", "Low sebum production — prioritize emollient occlusion.", []),
        metric("eye_bag", "Eye Puffiness", "Infraorbital Volume", 81, 75.3, "Lower Lid", "Mild morning fluid retention.", []),
        metric("droopy_upper_eyelid", "Upper Lid Tone", "Supratarsal Arch", 85, 80.1, "Upper Lid", "Even lid tone.", []),
      ],
      trace: {
        traceId: "preset-trace-claire",
        service: "skin-analysis",
        mode: "preset_studio",
        cacheKey: "studio_claire_14_actions_v2",
        cacheHit: true,
        unitsConsumed: 0,
        taskId: "studio_precalibrated_claire",
        totalDurationMs: 5,
        timestamp: "2026-10-26T12:00:00.000Z",
        steps: [
          {
            step: "Unit-Shield Studio Preset Loaded (Click 'Run Live YouCam API' to execute live S2S v2.0 scan)",
            method: "GET",
            endpoint: "/local/preset/claire",
            status: 200,
            durationMs: 5,
          },
        ],
      },
    },
  },
  {
    id: "zuri",
    name: "Zuri Mensah",
    age: 26,
    location: "London · Urban Transit Humidity",
    skinProfileTag: "Fitzpatrick VI · Deep Warm-Golden · Luminous Elasticity & T-Zone Shine",
    portraitUrl: "/demo/persona-zuri.jpg",
    defaultNaiveProductId: "complexion-matte-fluid-105",
    defaultApparelClashId: "apparel-chartreuse-polo",
    landmarks: {
      forehead: { x: 50.2, y: 17.6 },
      leftUnderEye: { x: 44.5, y: 26.8 },
      rightUnderEye: { x: 56.5, y: 26.8 },
      noseBridge: { x: 50.4, y: 28.0 },
      leftCheek: { x: 42.2, y: 30.8 },
      rightCheek: { x: 58.6, y: 30.8 },
      upperLipCenter: { x: 50.4, y: 34.7 },
      lowerLipCenter: { x: 50.4, y: 36.6 },
      lipWidth: 11.8,
      lipHeight: 3.9,
      chin: { x: 50.4, y: 40.0 },
      torsoBox: { x: 20, y: 44, width: 60, height: 55 },
    },
    presetReport: {
      reportId: "rep-zuri-studio-v2",
      personaId: "zuri",
      subjectName: "Zuri Mensah",
      mode: "preset_studio",
      overallUiScore: 84,
      overallRawScore: 78.6,
      skinAge: 23,
      chronologicalAgeHint: 26,
      barrierIntegrityScore: 81,
      fitzpatrickType: "VI",
      undertone: "warm_golden",
      undertoneLabel: "Rich Deep Warm-Golden (Eumelanin Photoprotective Spectrum)",
      hexSkinTone: "#683E28",
      melaninIndex: 86,
      erythemaIndex: 34,
      hydrationSebumBalance: "sebaceous_congested",
      clinicalHeadline: "High Collagen Density + Ashy Titanium/Silica Cast Risk on T-Zone",
      clinicalSummary:
        "Outstanding dermal firmness (raw 90.4) and biological skin age 3 years younger than chronological age. Primary eCommerce return hazards are titanium-heavy/cool-pink base pigments turning grey-ashy on deep warm-golden skin and T-zone sebum breakthrough.",
      metrics: [
        metric("oiliness", "Sebum Control", "T-Zone Sebaceous Output", 66, 58.4, "Central Forehead & Nasal Bridge", "High specular T-zone sebum breaks down emollient foundations; pair with 5% Niacinamide + Zinc PCA.", [
          { id: "zu-oil-f", regionLabel: "Central Forehead Shine", x: 50.2, y: 17.8, radiusX: 8.2, radiusY: 4.4, intensity: 0.83 },
          { id: "zu-oil-n", regionLabel: "Nasal Bridge & Tip", x: 50.4, y: 28.6, radiusX: 3.6, radiusY: 4.4, intensity: 0.80 },
        ]),
        metric("pore", "Visible Pores", "Medial Cheek & Nose Ostia", 72, 64.8, "Medial Cheeks & Nose", "Breathable silk-serum tints prevent follicular congestion while controlling T-zone glare.", [
          { id: "zu-pore-l", regionLabel: "Left Medial Cheek", x: 45.2, y: 30.2, radiusX: 3.8, radiusY: 3.2, intensity: 0.69 },
          { id: "zu-pore-r", regionLabel: "Right Medial Cheek", x: 55.6, y: 30.2, radiusX: 3.8, radiusY: 3.2, intensity: 0.68 },
        ]),
        metric("age_spot", "Tone Uniformity", "Focal Hypermelanosis Risk", 77, 70.5, "Perioral & Lower Cheek", "Avoid harsh glycolic peels (>8%) that trigger rebound post-inflammatory hyperpigmentation in Fitzpatrick VI skin.", [
          { id: "zu-spot-m", regionLabel: "Lateral Oral Commissure", x: 44.5, y: 35.8, radiusX: 2.8, radiusY: 2.2, intensity: 0.56 },
        ]),
        metric("moisture", "Hydration", "Epidermal Water Retention", 80, 74.2, "Cheeks & Jawline", "Balanced hydration; satin and sheer berry-glass lip formulas harmonize with natural two-tone lip richness.", []),
        metric("radiance", "Radiance", "Natural Golden Specular Bounce", 91, 88.2, "Zygomatic Arch & Forehead", "Exceptional golden luminosity amplified by rich terracotta, spiced berry, and deep emerald satin.", []),
        metric("firmness", "Firmness", "Collagen Density Index", 94, 90.4, "Full Facial Contour", "Top-decile dermal elasticity.", []),
        metric("wrinkle", "Fine Lines", "Static/Dynamic Rhytids", 93, 89.7, "Forehead & Canthus", "Virtually zero static rhytids.", []),
        metric("texture", "Smoothness", "Surface Uniformity", 83, 77.9, "Cheeks", "Smooth micro-relief.", []),
        metric("acne", "Acne & Blemishes", "Active Blemish Count", 86, 81.5, "Jawline", "Low blemish count.", []),
        metric("redness", "Redness", "Sub-Clinical Erythema", 88, 84.0, "Cheeks", "Stable vascular tone.", []),
        metric("dark_circle_v2", "Dark Circles", "Infraorbital Contrast", 82, 76.8, "Under-Eye", "Golden-amber corrector blends seamlessly.", []),
        metric("eye_bag", "Eye Puffiness", "Infraorbital Contour", 89, 85.1, "Lower Lid", "Sleek infraorbital contour.", []),
        metric("tear_trough", "Tear Trough", "Groove Depth", 85, 80.4, "Medial Eye", "Minimal groove depth.", []),
        metric("droopy_upper_eyelid", "Upper Lid Tone", "Lid Symmetry", 90, 86.2, "Upper Lid", "Crisp symmetrical crease.", []),
      ],
      trace: {
        traceId: "preset-trace-zuri",
        service: "skin-analysis",
        mode: "preset_studio",
        cacheKey: "studio_zuri_14_actions_v2",
        cacheHit: true,
        unitsConsumed: 0,
        taskId: "studio_precalibrated_zuri",
        totalDurationMs: 5,
        timestamp: "2026-10-26T12:00:00.000Z",
        steps: [
          {
            step: "Unit-Shield Studio Preset Loaded (Click 'Run Live YouCam API' to execute live S2S v2.0 scan)",
            method: "GET",
            endpoint: "/local/preset/zuri",
            status: 200,
            durationMs: 5,
          },
        ],
      },
    },
  },
];

export const DEFAULT_LANDMARKS: PersonaLandmarks = {
  forehead: { x: 50, y: 19 },
  leftUnderEye: { x: 44, y: 27.5 },
  rightUnderEye: { x: 56, y: 27.5 },
  noseBridge: { x: 50, y: 28.5 },
  leftCheek: { x: 42, y: 31.5 },
  rightCheek: { x: 58, y: 31.5 },
  upperLipCenter: { x: 50, y: 35.2 },
  lowerLipCenter: { x: 50, y: 36.8 },
  lipWidth: 11.4,
  lipHeight: 3.4,
  chin: { x: 50, y: 40.5 },
  torsoBox: { x: 17, y: 45, width: 66, height: 53 },
};
