export type YouCamSkinAction =
  | "wrinkle"
  | "pore"
  | "texture"
  | "acne"
  | "redness"
  | "oiliness"
  | "moisture"
  | "age_spot"
  | "radiance"
  | "dark_circle_v2"
  | "firmness"
  | "eye_bag"
  | "droopy_upper_eyelid"
  | "tear_trough";

export const STANDARD_SKIN_ACTIONS: YouCamSkinAction[] = [
  "wrinkle",
  "pore",
  "texture",
  "acne",
  "redness",
  "oiliness",
  "moisture",
  "age_spot",
  "radiance",
  "dark_circle_v2",
  "firmness",
  "eye_bag",
  "droopy_upper_eyelid",
  "tear_trough",
];

export type ExecutionMode = "live_youcam" | "cached_youcam" | "preset_studio" | "deterministic_cv";

export type UndertoneClass = "warm_golden" | "warm_olive" | "cool_rosy" | "neutral_balanced";

export type FitzpatrickType = "I" | "II" | "III" | "IV" | "V" | "VI";

export interface SpatialZoneHotspot {
  id: string;
  regionLabel: string;
  /** Normalized 0-100 coordinates on the portrait canvas */
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  intensity: number; // 0 - 1
}

export interface SkinMetricScore {
  action: YouCamSkinAction;
  label: string;
  clinicalName: string;
  /** Consumer-calibrated YouCam score (1-100, higher = healthier) */
  uiScore: number;
  /** Unmodified clinical CV model output (1-100, higher = healthier) */
  rawScore: number;
  severity: "optimal" | "mild" | "moderate" | "elevated";
  primaryZone: string;
  dermalImpact: string;
  maskDataUrl?: string;
  hotspots: SpatialZoneHotspot[];
}

export interface ApiStepTrace {
  step: string;
  method: "GET" | "POST" | "PUT";
  endpoint: string;
  status: number;
  durationMs: number;
  note?: string;
}

export interface YouCamApiTrace {
  traceId: string;
  service: "skin-analysis" | "makeup-vto" | "look-vto" | "cloth-vto";
  mode: ExecutionMode;
  cacheKey: string;
  cacheHit: boolean;
  unitsConsumed: number;
  fileId?: string;
  refFileId?: string;
  taskId?: string;
  totalDurationMs: number;
  timestamp: string;
  steps: ApiStepTrace[];
}

export interface SkinAnalysisReport {
  reportId: string;
  personaId?: string;
  subjectName: string;
  mode: ExecutionMode;
  overallUiScore: number;
  overallRawScore: number;
  skinAge: number;
  chronologicalAgeHint?: number;
  barrierIntegrityScore: number;
  fitzpatrickType: FitzpatrickType;
  undertone: UndertoneClass;
  undertoneLabel: string;
  hexSkinTone: string;
  melaninIndex: number;
  erythemaIndex: number;
  hydrationSebumBalance: "dehydrated_reactive" | "balanced_luminous" | "sebaceous_congested" | "combination_olive";
  clinicalHeadline: string;
  clinicalSummary: string;
  metrics: SkinMetricScore[];
  trace: YouCamApiTrace;
}

export type CosmeticFinish = "matte" | "velvet_satin" | "dewy_serum" | "sheer_balm" | "radiant_silk";

export type ProductCategory = "lip" | "complexion" | "cheek" | "skincare_active" | "apparel";

export type ActiveIngredientId =
  | "retinol_1"
  | "glycolic_aha_10"
  | "salicylic_bha_2"
  | "vitamin_c_laa_15"
  | "benzoyl_peroxide_5"
  | "niacinamide_5"
  | "ceramide_np"
  | "azelaic_10"
  | "peptides_copper"
  | "centella_panthenol"
  | "squalane_hyaluronic";

export interface CatalogProduct {
  id: string;
  sku: string;
  brand: string;
  name: string;
  subtitle: string;
  category: ProductCategory;
  priceUsd: number;
  swatchHex: string;
  secondaryHex?: string;
  finish?: CosmeticFinish;
  garmentCategory?: "upper_body" | "lower_body" | "full_body";
  garmentImageUrl?: string;
  /** Makeup VTO parameters sent to YouCam /s2s/v2.0/task/makeup-vto */
  youcamMakeupEffects?: {
    lipstick?: { color: string; texture: "matte" | "satin" | "gloss" | "shimmer"; intensity: number };
    blush?: { color: string; intensity: number };
    foundation?: { color: string; intensity: number };
    eyeshadow?: { color: string; intensity: number };
  };
  /** Dermal physics profile used by DermAtelier compatibility engine */
  dermalPhysics: {
    moistureDemand: number; // 0-100: high = dries skin or clings to dry patches (e.g., matte liquid lip = 82)
    poreOcclusionRisk: number; // 0-100: high = settles into enlarged pores / triggers acne
    erythemaAmplification: number; // 0-100: high = cool/acidic undertone contrast amplifies facial redness
    textureClingFactor: number; // 0-100: high = accentuates micro-texture & fine lines
    idealUndertones: UndertoneClass[];
    clashingUndertones: UndertoneClass[];
    phLevel?: number;
  };
  activeIngredients?: ActiveIngredientId[];
  clinicalRole?: "am_protect" | "pm_renew" | "am_pm_barrier" | "targeted_treat";
  baselineReturnRatePct: number;
  calibratedCounterpartId?: string;
  badge?: string;
}

export interface DermalCompatibilityVerdict {
  productId: string;
  compatibilityScore: number; // 0-100
  status: "dermal_verified" | "caution_prep_needed" | "dermal_clash";
  returnRiskPct: number;
  headline: string;
  clashReasons: string[];
  positiveSignals: string[];
  recommendedCounterpartId?: string;
  requiredPrepProductId?: string;
  finishAdjustmentNote?: string;
}

export interface VtoRenderResult {
  vtoId: string;
  productId: string;
  mode: ExecutionMode;
  /** If YouCam API returned a rendered image URL/dataUrl, it is stored here */
  renderedImageUrl?: string;
  /** Canvas physics overlay parameters for instant zero-latency comparison & fallback */
  overlaySpec: {
    type: "cosmetic" | "apparel";
    lipHex?: string;
    lipFinish?: CosmeticFinish;
    lipOpacity?: number;
    cheekHex?: string;
    cheekOpacity?: number;
    complexionHex?: string;
    complexionEvening?: number;
    textureEmphasisDelta?: number; // positive = caking/cling, negative = blurring/plumping
    garmentImageUrl?: string;
    garmentTintHex?: string;
    undertoneCastDelta?: number; // negative = washes out complexion, positive = warms/brightens
  };
  trace: YouCamApiTrace;
}

export interface IngredientConflict {
  id: string;
  severity: "critical_barrier_hazard" | "moderate_efficacy_loss";
  productAId: string;
  productBId?: string;
  title: string;
  mechanism: string;
  dermalTrigger?: string;
  resolutionText: string;
  swapRemoveProductId: string;
  swapAddProductId: string;
}

export interface CartAuditResult {
  barrierSafetyScore: number;
  estimatedCartReturnRiskPct: number;
  baselineIndustryReturnRiskPct: number;
  conflicts: IngredientConflict[];
  amRoutine: CatalogProduct[];
  pmRoutine: CatalogProduct[];
  wearNowItems: CatalogProduct[];
  estimatedSavedReturnUsd: number;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  service: YouCamApiTrace["service"];
  mode: ExecutionMode;
  cacheKeyShort: string;
  unitsDelta: number;
  unitsSaved: number;
  taskId?: string;
  durationMs: number;
}

export interface UnitShieldLedger {
  apiKeyConfigured: boolean;
  totalRedeemedUnits: number;
  maxBudgetUnits: number;
  unitsUsed: number;
  unitsRemaining: number;
  unitsSavedByCache: number;
  liveApiCalls: number;
  cacheHits: number;
  entries: LedgerEntry[];
}
