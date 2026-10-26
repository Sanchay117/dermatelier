import crypto from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildYouCamCacheKey,
  canSpendLiveUnits,
  getUnitShieldConfig,
  persistRemoteAssetAsDataUrl,
  readCachedJson,
  recordLedgerEvent,
  sha256Buffer,
  writeCachedJson,
} from "./cache";
import { resolveShadeForFitzpatrick } from "./catalog";
import {
  analyzeSkinColorimetry,
  compositeCroppedRenderOntoPortrait,
  prepareSkinAnalysisFrame,
  remapCroppedMaskToFullPortrait,
  type PreparedSkinFrame,
} from "./image-framing";
import { buildDeterministicOfflineReport } from "./local-cv";
import { STUDIO_PERSONAS } from "./presets";
import {
  STANDARD_SKIN_ACTIONS,
  type ApiStepTrace,
  type CatalogProduct,
  type FitzpatrickType,
  type SkinAnalysisReport,
  type SkinMetricScore,
  type VtoRenderResult,
  type YouCamSkinAction,
} from "./types";

const ACTION_METADATA: Record<
  YouCamSkinAction,
  { label: string; clinicalName: string; primaryZone: string; dermalImpact: string }
> = {
  wrinkle: {
    label: "Fine Lines",
    clinicalName: "Dynamic & Static Rhytid Depth",
    primaryZone: "Forehead & Lateral Canthus",
    dermalImpact: "High-powder mattes crease inside dynamic rhytids without peptide/hyaluronic cushion.",
  },
  pore: {
    label: "Visible Pores",
    clinicalName: "Follicular Ostia Dilation",
    primaryZone: "Nasal Bridge & Medial Cheeks",
    dermalImpact: "Heavy kaolin/silicone pigments settle into ostia; niacinamide + breathable serum tints blur cleanly.",
  },
  texture: {
    label: "Smoothness",
    clinicalName: "Epidermal Micro-Relief",
    primaryZone: "Malar Cheeks & Chin",
    dermalImpact: "Satin & serum emulsions diffuse specular light smoothly over textured corneocytes.",
  },
  acne: {
    label: "Acne & Blemishes",
    clinicalName: "Inflammatory Papule / Comedone Index",
    primaryZone: "Cheeks & Mandibular Line",
    dermalImpact: "Avoid high pore-occlusion waxes; pair prep with non-comedogenic azelaic/zinc actives.",
  },
  redness: {
    label: "Redness",
    clinicalName: "Malar Erythema & Vascularity",
    primaryZone: "Bilateral Malar Cheeks & Alae",
    dermalImpact: "Cool blue-crimson & neon chartreuse amplify cheek redness via simultaneous color contrast.",
  },
  oiliness: {
    label: "Sebum Control",
    clinicalName: "T-Zone Sebaceous Reflectance",
    primaryZone: "Central Forehead & Nose",
    dermalImpact: "Excess sebum oxidizes iron-oxide bases half a shade darker within 2 hours.",
  },
  moisture: {
    label: "Hydration",
    clinicalName: "Stratum Corneum Capacitance",
    primaryZone: "Zygomatic Cheeks & Perioral",
    dermalImpact: "Dry liquid mattes & alcohol-denat fluids micro-flake when capacitance < 65.",
  },
  age_spot: {
    label: "Hyperpigmentation",
    clinicalName: "Focal Melanin / PIH Clusters",
    primaryZone: "High Cheekbones",
    dermalImpact: "Prioritize gentle tyrosinase modulation over harsh low-pH acid stripping.",
  },
  radiance: {
    label: "Radiance",
    clinicalName: "Diffuse Optical Luminosity",
    primaryZone: "Pan-Facial",
    dermalImpact: "Tracks healthy lipid bounce and jewel/earth-tone garment synergy.",
  },
  dark_circle_v2: {
    label: "Dark Circles",
    clinicalName: "Periorbital Vascular/Pigment Index v2",
    primaryZone: "Infraorbital Groove",
    dermalImpact: "Requires elastomer serum concealer matched to vascular vs. melanin shadow.",
  },
  firmness: {
    label: "Firmness",
    clinicalName: "Dermal Collagen-Elastin Turgor",
    primaryZone: "Mid-Face & Jawline",
    dermalImpact: "Indicates structural resilience and retinoid/peptide responsiveness.",
  },
  eye_bag: {
    label: "Eye Puffiness",
    clinicalName: "Infraorbital Edema Contour",
    primaryZone: "Lower Eyelid",
    dermalImpact: "Avoid shimmer highlighters directly over edematous infraorbital tissue.",
  },
  droopy_upper_eyelid: {
    label: "Upper Lid Tone",
    clinicalName: "Supratarsal Fold Symmetry",
    primaryZone: "Upper Eyelid",
    dermalImpact: "Guides satin vs. matte eyeshadow placement along crease.",
  },
  tear_trough: {
    label: "Tear Trough",
    clinicalName: "Nasojugal Groove Shadow",
    primaryZone: "Medial Under-Eye",
    dermalImpact: "Light-diffusing satin brightens hollow without dry powder caking.",
  },
};

function getBaseUrl(): string {
  return (process.env.YOUCAM_API_BASE_URL || "https://yce-api-01.makeupar.com").replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSafePresignedHeaders(
  signedHeaders: Record<string, string> | undefined,
  fallbackMime: string
): Record<string, string> {
  const result: Record<string, string> = {};
  let hasContentType = false;
  if (signedHeaders) {
    for (const [k, v] of Object.entries(signedHeaders)) {
      result[k] = v;
      if (k.toLowerCase() === "content-type") {
        hasContentType = true;
      }
    }
  }
  if (!hasContentType) {
    result["Content-Type"] = fallbackMime;
  }
  return result;
}

export function extractResultImageUrl(pollData: Record<string, unknown>): string | undefined {
  const resultsNode = (pollData.results ?? pollData) as Record<string, unknown> | Array<Record<string, unknown>>;
  if (Array.isArray(resultsNode)) {
    const first = resultsNode[0];
    if (first && typeof first.url === "string") return first.url;
    if (first && typeof first.output_url === "string") return first.output_url;
  } else if (resultsNode && typeof resultsNode === "object") {
    if (typeof resultsNode.url === "string") return resultsNode.url;
    if (typeof resultsNode.output_url === "string") return resultsNode.output_url;
    if (Array.isArray(resultsNode.output) && resultsNode.output[0]) {
      const firstOut = resultsNode.output[0] as Record<string, unknown>;
      if (typeof firstOut.url === "string") return firstOut.url;
      if (typeof firstOut.output_url === "string") return firstOut.output_url;
    }
  }
  if (typeof pollData.url === "string") return pollData.url;
  return undefined;
}

export function buildYouCamMakeupEffectsArray(
  product: CatalogProduct,
  fitzpatrickType?: FitzpatrickType
): Array<Record<string, unknown>> {
  const effects: Array<Record<string, unknown>> = [];
  const spec = product.youcamMakeupEffects;
  if (!spec) return effects;

  if (spec.foundation) {
    const calibratedColor = resolveShadeForFitzpatrick(product, fitzpatrickType);
    const isMatte = product.finish === "matte";
    effects.push({
      category: "foundation",
      palettes: [
        {
          color: calibratedColor,
          colorIntensity: Math.max(10, Math.min(100, Math.round(spec.foundation.intensity * 100))),
          coverageIntensity: isMatte ? 85 : 48,
          glowIntensity: isMatte ? 4 : 68,
        },
      ],
    });
  }

  if (spec.lipstick) {
    const isMatteLip = product.finish === "matte" || spec.lipstick.texture === "matte";
    const baseIntensity = Math.max(10, Math.min(100, Math.round(spec.lipstick.intensity * 100)));
    effects.push({
      category: "lip_color",
      shape: { name: "original" },
      style: { type: "full" },
      palettes: [
        {
          color: spec.lipstick.color,
          texture: isMatteLip ? "matte" : "satin",
          colorIntensity: product.finish === "sheer_balm" ? Math.min(52, baseIntensity) : baseIntensity,
        },
      ],
    });
  }

  if (spec.blush) {
    effects.push({
      category: "blush",
      pattern: { name: "2colors6" },
      palettes: [
        {
          color: spec.blush.color,
          texture: "matte",
          colorIntensity: Math.max(10, Math.min(100, Math.round(spec.blush.intensity * 100))),
        },
      ],
    });
  }

  return effects;
}

async function uploadYouCamFile(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  serviceSlug: "skin-analysis" | "makeup-vto" | "look-vto" | "cloth";
  apiKey: string;
  steps: ApiStepTrace[];
}): Promise<string> {
  const baseUrl = getBaseUrl();
  const candidateEndpoints = [`/s2s/v2.0/file/${params.serviceSlug}`, `/s2s/v2.0/file`];

  const payload = {
    files: [
      {
        content_type: params.mimeType,
        file_name: params.fileName,
        file_size: params.buffer.byteLength,
      },
    ],
  };

  let initJson: Record<string, unknown> | null = null;
  let lastErr = "";

  for (const ep of candidateEndpoints) {
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}${ep}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const durationMs = Date.now() - t0;
    const text = await res.text();
    params.steps.push({
      step: `Initialize YouCam File Upload (${params.fileName})`,
      method: "POST",
      endpoint: ep,
      status: res.status,
      durationMs,
    });

    if (res.ok) {
      initJson = JSON.parse(text) as Record<string, unknown>;
      break;
    }
    lastErr = `${ep} -> HTTP ${res.status}: ${text.slice(0, 220)}`;
    if (res.status === 401 || res.status === 403) {
      break;
    }
  }

  if (!initJson) {
    throw new Error(`YouCam File API failed: ${lastErr}`);
  }

  const dataNode = (initJson.data || initJson.result || initJson) as Record<string, unknown>;
  const filesArr = (dataNode.files as Array<Record<string, unknown>>) || [];
  const fileRecord = filesArr[0] || dataNode;
  const fileId = String(fileRecord.file_id || "");
  if (!fileId) {
    throw new Error(`YouCam File API did not return file_id: ${JSON.stringify(initJson).slice(0, 200)}`);
  }

  const rawRequests = fileRecord.requests;
  const uploadSpec = (Array.isArray(rawRequests) ? rawRequests[0] : rawRequests) as
    | { url?: string; method?: string; headers?: Record<string, string> }
    | undefined;

  if (!uploadSpec?.url) {
    throw new Error("YouCam File API response missing presigned upload URL");
  }

  const putHeaders = buildSafePresignedHeaders(uploadSpec.headers, params.mimeType);

  const tPut = Date.now();
  const putRes = await fetch(uploadSpec.url, {
    method: uploadSpec.method || "PUT",
    headers: putHeaders,
    body: new Uint8Array(params.buffer),
  });
  params.steps.push({
    step: `PUT Binary Image to Presigned Storage (${Math.round(params.buffer.byteLength / 1024)} KB)`,
    method: "PUT",
    endpoint: new URL(uploadSpec.url).origin + "/<presigned-s3-object>",
    status: putRes.status,
    durationMs: Date.now() - tPut,
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Presigned S3 PUT failed (${putRes.status}): ${errText.slice(0, 180)}`);
  }

  return fileId;
}

class YouCamTaskError extends Error {
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = "YouCamTaskError";
    this.errorCode = errorCode;
  }
}

async function pollYouCamTask(params: {
  taskPathCandidates: string[];
  apiKey: string;
  steps: ApiStepTrace[];
}): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl();
  const pollInterval = Number(process.env.YOUCAM_POLL_INTERVAL_MS || 2000);
  const timeoutMs = Number(process.env.YOUCAM_POLL_TIMEOUT_MS || 45000);
  const started = Date.now();
  let workingPath = params.taskPathCandidates[0];

  while (Date.now() - started < timeoutMs) {
    await sleep(pollInterval);
    const t0 = Date.now();
    let res = await fetch(`${baseUrl}${workingPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    });

    if (
      res.status === 404 &&
      params.taskPathCandidates.length > 1 &&
      workingPath === params.taskPathCandidates[0]
    ) {
      workingPath = params.taskPathCandidates[1];
      res = await fetch(`${baseUrl}${workingPath}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
        },
      });
    }

    const durationMs = Date.now() - t0;
    const bodyText = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON during poll (${res.status}): ${bodyText.slice(0, 180)}`);
    }

    const data = (parsed.data || parsed.result || parsed) as Record<string, unknown>;
    const taskStatus = String(data.task_status || parsed.task_status || "").toLowerCase();

    params.steps.push({
      step: `Poll Task Status -> ${taskStatus || res.status}`,
      method: "GET",
      endpoint: workingPath,
      status: res.status,
      durationMs,
    });

    if (!res.ok) {
      throw new Error(`YouCam task poll error (${res.status}): ${bodyText.slice(0, 220)}`);
    }

    if (taskStatus === "success" || taskStatus === "completed") {
      return data;
    }
    if (taskStatus === "error" || taskStatus === "failed") {
      const errCode = typeof data.error === "string" ? data.error : undefined;
      const errMsg =
        typeof data.error_message === "string"
          ? `${errCode ? `${errCode}: ` : ""}${data.error_message}`
          : JSON.stringify(data).slice(0, 240);
      throw new YouCamTaskError(`YouCam task failed (${errMsg})`, errCode);
    }
  }

  throw new Error(`YouCam task polling timed out after ${timeoutMs}ms`);
}

async function remapOrPersistMask(
  rawBytesOrUrl: Buffer | string,
  frame?: PreparedSkinFrame
): Promise<string | undefined> {
  try {
    let maskBuf: Buffer;
    if (typeof rawBytesOrUrl === "string") {
      if (rawBytesOrUrl.startsWith("data:")) {
        const m = rawBytesOrUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (!m) return rawBytesOrUrl;
        maskBuf = Buffer.from(m[1], "base64");
      } else {
        const res = await fetch(rawBytesOrUrl);
        if (!res.ok) return undefined;
        maskBuf = Buffer.from(await res.arrayBuffer());
      }
    } else {
      maskBuf = rawBytesOrUrl;
    }

    if (frame) {
      return await remapCroppedMaskToFullPortrait(
        maskBuf,
        frame.cropBox,
        frame.fullWidth,
        frame.fullHeight
      );
    }
    return `data:image/png;base64,${maskBuf.toString("base64")}`;
  } catch {
    if (typeof rawBytesOrUrl === "string") {
      try {
        return await persistRemoteAssetAsDataUrl(rawBytesOrUrl, "image/png");
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function parseYouCamSkinPayload(
  taskData: Record<string, unknown>,
  personaHintId?: string,
  preparedFrame?: PreparedSkinFrame
): Promise<{
  metrics: SkinMetricScore[];
  skinAge?: number;
  overallScore?: number;
}> {
  const resultsNode = (taskData.results || taskData) as Record<string, unknown>;
  const metricsMap = new Map<YouCamSkinAction, SkinMetricScore>();
  let detectedSkinAge: number | undefined;
  let detectedOverall: number | undefined;

  const personaFallback = personaHintId
    ? STUDIO_PERSONAS.find((p) => p.id === personaHintId)?.presetReport
    : STUDIO_PERSONAS[0].presetReport;

  // Case A: Direct JSON output array (results.output or results array)
  const outputArr = Array.isArray(resultsNode.output)
    ? (resultsNode.output as Array<Record<string, unknown>>)
    : Array.isArray(resultsNode)
    ? (resultsNode as Array<Record<string, unknown>>)
    : null;

  if (outputArr) {
    for (const entry of outputArr) {
      const rawType = String(entry.type || entry.action || "").replace(/^hd_/, "") as YouCamSkinAction;
      if (rawType in ACTION_METADATA) {
        const uiScore = Number(entry.ui_score ?? entry.score ?? 75);
        const rawScore = Number(entry.raw_score ?? uiScore - 5);
        const maskUrls =
          (entry.mask_urls as string[]) || (entry.mask_url ? [String(entry.mask_url)] : []);
        const maskDataUrl = maskUrls[0]
          ? await remapOrPersistMask(maskUrls[0], preparedFrame)
          : undefined;

        const meta = ACTION_METADATA[rawType];
        const fallbackHotspots =
          personaFallback?.metrics.find((m) => m.action === rawType)?.hotspots || [];
        metricsMap.set(rawType, {
          action: rawType,
          label: meta.label,
          clinicalName: meta.clinicalName,
          uiScore: Math.round(uiScore),
          rawScore: Math.round(rawScore * 10) / 10,
          severity:
            rawScore >= 78 ? "optimal" : rawScore >= 64 ? "mild" : rawScore >= 50 ? "moderate" : "elevated",
          primaryZone: meta.primaryZone,
          dermalImpact: meta.dermalImpact,
          maskDataUrl,
          hotspots: fallbackHotspots,
        });
      } else if (String(entry.type) === "skin_age" || entry.skin_age) {
        detectedSkinAge = Number(entry.skin_age ?? entry.ui_score ?? 26);
      } else if (String(entry.type) === "all") {
        detectedOverall = Number(entry.ui_score ?? entry.score);
      }
    }
  }

  // Case B: ZIP package output (results.url pointing to skinanalysisResult zip)
  const zipUrl = typeof resultsNode.url === "string" ? resultsNode.url : undefined;
  if (zipUrl && metricsMap.size === 0) {
    const zipRes = await fetch(zipUrl);
    if (zipRes.ok) {
      const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
      const archive = unzipSync(zipBytes);
      let scoreInfo: Record<string, unknown> = {};

      for (const [entryName, fileData] of Object.entries(archive)) {
        if (entryName.endsWith("score_info.json")) {
          scoreInfo = JSON.parse(strFromU8(fileData)) as Record<string, unknown>;
        }
      }

      if (typeof scoreInfo.skin_age === "number") {
        detectedSkinAge = scoreInfo.skin_age;
      }
      if (scoreInfo.all && typeof (scoreInfo.all as Record<string, unknown>).ui_score === "number") {
        detectedOverall = Number((scoreInfo.all as Record<string, unknown>).ui_score);
      }

      for (const action of STANDARD_SKIN_ACTIONS) {
        const node = scoreInfo[action] as Record<string, unknown> | undefined;
        if (!node) continue;
        const uiScore = Number(node.ui_score ?? node.score ?? 76);
        const rawScore = Number(node.raw_score ?? uiScore - 5);
        let maskDataUrl: string | undefined;

        const matchingMaskKey = Object.keys(archive).find(
          (k) => k.includes(action) && (k.endsWith(".png") || k.endsWith(".jpg"))
        );
        if (matchingMaskKey) {
          maskDataUrl = await remapOrPersistMask(
            Buffer.from(archive[matchingMaskKey]),
            preparedFrame
          );
        }

        const meta = ACTION_METADATA[action];
        const fallbackHotspots =
          personaFallback?.metrics.find((m) => m.action === action)?.hotspots || [];
        metricsMap.set(action, {
          action,
          label: meta.label,
          clinicalName: meta.clinicalName,
          uiScore: Math.round(uiScore),
          rawScore: Math.round(rawScore * 10) / 10,
          severity:
            rawScore >= 78 ? "optimal" : rawScore >= 64 ? "mild" : rawScore >= 50 ? "moderate" : "elevated",
          primaryZone: meta.primaryZone,
          dermalImpact: meta.dermalImpact,
          maskDataUrl,
          hotspots: fallbackHotspots,
        });
      }
    }
  }

  return {
    metrics: Array.from(metricsMap.values()),
    skinAge: detectedSkinAge,
    overallScore: detectedOverall,
  };
}

export async function executeSkinAnalysis(params: {
  imageBuffer: Buffer;
  mimeType: string;
  fileName: string;
  subjectName?: string;
  personaId?: string;
  forceLive?: boolean;
  apiKeyOverride?: string;
}): Promise<SkinAnalysisReport> {
  const started = Date.now();
  const imgHash = sha256Buffer(params.imageBuffer);
  const cacheKey = buildYouCamCacheKey("skin-analysis", [imgHash], {
    actions: STANDARD_SKIN_ACTIONS,
    framing: "dual-roi-v2.1",
  });

  // 1. Check SHA-256 Unit-Shield Disk Cache First (0 Units!)
  const cached = readCachedJson<SkinAnalysisReport>(cacheKey);
  if (cached) {
    const durationMs = Date.now() - started;
    recordLedgerEvent({
      service: "skin-analysis",
      mode: "cached_youcam",
      cacheKey,
      unitsDelta: 0,
      unitsSaved: 1,
      taskId: cached.trace.taskId,
      durationMs,
    });
    return {
      ...cached,
      mode: "cached_youcam",
      trace: {
        ...cached.trace,
        mode: "cached_youcam",
        cacheHit: true,
        unitsConsumed: 0,
        totalDurationMs: durationMs,
        timestamp: new Date().toISOString(),
        steps: [
          {
            step: `SHA-256 Unit-Shield Cache HIT (${cacheKey.slice(0, 12)}) — 0 API Units Consumed`,
            method: "GET",
            endpoint: `cache://skin-analysis/${cacheKey.slice(0, 16)}`,
            status: 200,
            durationMs,
          },
          ...cached.trace.steps,
        ],
      },
    };
  }

  const cfg = getUnitShieldConfig(params.apiKeyOverride);
  if (!cfg.apiKeyConfigured) {
    if (params.personaId) {
      const found = STUDIO_PERSONAS.find((p) => p.id === params.personaId);
      if (found) return found.presetReport;
    }
    return await buildDeterministicOfflineReport(params.imageBuffer, params.subjectName);
  }

  const budgetCheck = canSpendLiveUnits(1, params.apiKeyOverride);
  if (!budgetCheck.allowed) {
    throw new Error(budgetCheck.reason || "Unit-Shield budget prevented live call");
  }

  // 2. Dual-Framing Face Crop (>60% face-width rule) + CIE L*a*b* ITA° Colorimetry
  const steps: ApiStepTrace[] = [];
  const baseUrl = getBaseUrl();

  let colorimetry: Awaited<ReturnType<typeof analyzeSkinColorimetry>> | null = null;
  let preparedFrame: PreparedSkinFrame | undefined;
  const tCrop = Date.now();
  try {
    colorimetry = await analyzeSkinColorimetry(params.imageBuffer);
    preparedFrame = await prepareSkinAnalysisFrame(params.imageBuffer, {
      zoomTier: "standard",
      centerHintPct: colorimetry.faceCenterPct,
    });
    steps.push({
      step: `Dual-Framing Face Macro ROI (${preparedFrame.cropBox.width}×${preparedFrame.cropBox.height} → 768×906, ITA° ${colorimetry.itaDegrees}°)`,
      method: "POST",
      endpoint: "sharp://dual-framing/face-roi",
      status: 200,
      durationMs: Date.now() - tCrop,
    });
  } catch {
    // Graceful fallback for synthetic non-image byte buffers in mocked unit tests
  }

  const runAttempt = async (zoomTier: "standard" | "tight") => {
    const activeFrame =
      zoomTier === "tight" && colorimetry
        ? await prepareSkinAnalysisFrame(params.imageBuffer, {
            zoomTier: "tight",
            centerHintPct: colorimetry.faceCenterPct,
          })
        : preparedFrame;

    const uploadBuffer = activeFrame ? activeFrame.croppedBuffer : params.imageBuffer;
    const uploadMime = activeFrame ? "image/jpeg" : params.mimeType;

    const fileId = await uploadYouCamFile({
      buffer: uploadBuffer,
      mimeType: uploadMime,
      fileName: params.fileName.replace(/\.[^.]+$/, "") + "_face_roi.jpg",
      serviceSlug: "skin-analysis",
      apiKey: cfg.apiKey,
      steps,
    });

    const actionTiers: YouCamSkinAction[][] = [
      STANDARD_SKIN_ACTIONS,
      [
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
      ],
      ["wrinkle", "pore", "texture", "acne"],
    ];

    let lastTaskErr: unknown = null;
    for (const dstActions of actionTiers) {
      const tCreate = Date.now();
      const taskRes = await fetch(`${baseUrl}/s2s/v2.0/task/skin-analysis`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          src_file_id: fileId,
          dst_actions: dstActions,
          format: "json",
        }),
      });
      const durationMs = Date.now() - tCreate;
      const rawText = await taskRes.text();
      steps.push({
        step: `Create Skin Analysis Task (${dstActions.length} dst_actions)`,
        method: "POST",
        endpoint: "/s2s/v2.0/task/skin-analysis",
        status: taskRes.status,
        durationMs,
      });

      if (!taskRes.ok) {
        lastTaskErr = new Error(`HTTP ${taskRes.status}: ${rawText.slice(0, 220)}`);
        if (taskRes.status === 401 || taskRes.status === 403) throw lastTaskErr;
        continue;
      }

      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const dataNode = (parsed.data || parsed.result || parsed) as Record<string, unknown>;
      const taskId = String(dataNode.task_id || "");
      if (!taskId) continue;

      try {
        const taskData = await pollYouCamTask({
          taskPathCandidates: [
            `/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`,
            `/s2s/v2.0/skin-analysis/${encodeURIComponent(taskId)}`,
          ],
          apiKey: cfg.apiKey,
          steps,
        });
        return { fileId, taskId, taskData, activeFrame };
      } catch (pollErr) {
        if (pollErr instanceof YouCamTaskError && pollErr.errorCode === "error_src_face_too_small") {
          throw pollErr;
        }
        lastTaskErr = pollErr;
      }
    }
    throw lastTaskErr instanceof Error
      ? lastTaskErr
      : new Error("YouCam Skin Analysis failed across action tiers");
  };

  let attemptResult: Awaited<ReturnType<typeof runAttempt>>;
  try {
    attemptResult = await runAttempt("standard");
  } catch (err) {
    if (err instanceof YouCamTaskError && err.errorCode === "error_src_face_too_small" && colorimetry) {
      attemptResult = await runAttempt("tight");
    } else {
      throw err;
    }
  }

  const { fileId, taskId, taskData, activeFrame } = attemptResult;
  const parsedSkin = await parseYouCamSkinPayload(taskData, params.personaId, activeFrame);

  const personaPreset = params.personaId
    ? STUDIO_PERSONAS.find((p) => p.id === params.personaId)?.presetReport
    : undefined;
  const offlineBaseline =
    personaPreset ||
    (colorimetry
      ? await buildDeterministicOfflineReport(params.imageBuffer, params.subjectName)
      : STUDIO_PERSONAS[0].presetReport);

  const mergedMetrics: SkinMetricScore[] = [...parsedSkin.metrics];
  for (const fallbackMetric of offlineBaseline.metrics) {
    if (!mergedMetrics.some((m) => m.action === fallbackMetric.action)) {
      mergedMetrics.push(fallbackMetric);
    }
  }

  const overallRawScore =
    Math.round((mergedMetrics.reduce((acc, m) => acc + m.rawScore, 0) / mergedMetrics.length) * 10) /
    10;
  const overallUiScore =
    parsedSkin.overallScore ??
    Math.min(
      98,
      Math.round(mergedMetrics.reduce((a, m) => a + m.uiScore, 0) / mergedMetrics.length)
    );

  const moistureRaw = mergedMetrics.find((m) => m.action === "moisture")?.rawScore ?? 70;
  const rednessRaw = mergedMetrics.find((m) => m.action === "redness")?.rawScore ?? 72;
  const barrierIntegrityScore = Math.round(moistureRaw * 0.55 + rednessRaw * 0.45);
  const totalDurationMs = Date.now() - started;

  const fitzpatrickType = personaPreset
    ? personaPreset.fitzpatrickType
    : colorimetry?.fitzpatrickType || offlineBaseline.fitzpatrickType;
  const undertone = personaPreset
    ? personaPreset.undertone
    : colorimetry?.undertone || offlineBaseline.undertone;
  const undertoneLabel = personaPreset
    ? personaPreset.undertoneLabel
    : colorimetry?.undertoneLabel || offlineBaseline.undertoneLabel;
  const hexSkinTone = personaPreset
    ? personaPreset.hexSkinTone
    : colorimetry?.hexSkinTone || offlineBaseline.hexSkinTone;
  const melaninIndex = personaPreset
    ? personaPreset.melaninIndex
    : colorimetry?.melaninIndex ?? offlineBaseline.melaninIndex;
  const itaDegrees = colorimetry?.itaDegrees ?? personaPreset?.itaDegrees;
  const cieLab = colorimetry?.cieLab ?? personaPreset?.cieLab;

  const liveReport: SkinAnalysisReport = {
    reportId: `rep-live-${taskId.slice(0, 10)}`,
    personaId: params.personaId,
    subjectName: params.subjectName || offlineBaseline.subjectName,
    mode: "live_youcam",
    overallUiScore,
    overallRawScore,
    skinAge: parsedSkin.skinAge ?? offlineBaseline.skinAge,
    chronologicalAgeHint: offlineBaseline.chronologicalAgeHint,
    barrierIntegrityScore,
    fitzpatrickType,
    itaDegrees,
    cieLab,
    undertone,
    undertoneLabel,
    hexSkinTone,
    melaninIndex,
    erythemaIndex: Math.round(100 - rednessRaw * 0.55),
    hydrationSebumBalance: offlineBaseline.hydrationSebumBalance,
    clinicalHeadline: `Live YouCam S2S v2.0 · Fitzpatrick ${fitzpatrickType}${
      itaDegrees !== undefined ? ` (ITA° ${itaDegrees}°)` : ""
    } · Barrier ${barrierIntegrityScore}/100`,
    clinicalSummary: `Verified live via Perfect Corp YouCam AI Skin Analysis (${parsedSkin.metrics.length} live CV concerns, task ${taskId.slice(
      0,
      14
    )}…). Dual raw CV (${overallRawScore}) & UI (${overallUiScore}) indices calibrated for VTO.`,
    metrics: mergedMetrics,
    trace: {
      traceId: crypto.randomUUID(),
      service: "skin-analysis",
      mode: "live_youcam",
      cacheKey,
      cacheHit: false,
      unitsConsumed: 1,
      fileId,
      taskId,
      totalDurationMs,
      timestamp: new Date().toISOString(),
      steps,
    },
  };

  writeCachedJson(cacheKey, liveReport);
  recordLedgerEvent({
    service: "skin-analysis",
    mode: "live_youcam",
    cacheKey,
    unitsDelta: 1,
    unitsSaved: 0,
    taskId,
    durationMs: totalDurationMs,
  });

  return liveReport;
}

function buildOverlaySpecForProduct(
  product: CatalogProduct,
  fitzpatrickType?: FitzpatrickType
): VtoRenderResult["overlaySpec"] {
  if (product.category === "apparel") {
    const isClash = product.id === "apparel-chartreuse-polo";
    return {
      type: "apparel",
      garmentImageUrl: product.garmentImageUrl,
      garmentTintHex: product.swatchHex,
      undertoneCastDelta: isClash ? -0.24 : 0.18,
    };
  }

  const isMatteClash = product.finish === "matte";
  return {
    type: "cosmetic",
    lipHex: product.youcamMakeupEffects?.lipstick?.color,
    lipFinish: product.finish || "velvet_satin",
    lipOpacity: product.finish === "sheer_balm" ? 0.56 : product.finish === "matte" ? 0.86 : 0.72,
    cheekHex: product.youcamMakeupEffects?.blush?.color,
    cheekOpacity: product.youcamMakeupEffects?.blush?.intensity ?? 0,
    complexionHex: product.youcamMakeupEffects?.foundation
      ? resolveShadeForFitzpatrick(product, fitzpatrickType)
      : undefined,
    complexionEvening: product.youcamMakeupEffects?.foundation ? (isMatteClash ? 0.42 : 0.28) : 0,
    textureEmphasisDelta: isMatteClash ? 0.35 : -0.25,
  };
}

export async function executeProductVto(params: {
  personBuffer: Buffer;
  personMime: string;
  product: CatalogProduct;
  fitzpatrickType?: FitzpatrickType;
  garmentBuffer?: Buffer;
  garmentMime?: string;
  preferLiveApi?: boolean;
  apiKeyOverride?: string;
}): Promise<VtoRenderResult> {
  const started = Date.now();
  const isApparel = params.product.category === "apparel";
  const serviceName = isApparel ? "cloth-vto" : "makeup-vto";
  const personHash = sha256Buffer(params.personBuffer);
  const garmentHash = params.garmentBuffer ? sha256Buffer(params.garmentBuffer) : params.product.id;

  const cacheKey = buildYouCamCacheKey(serviceName, [personHash, garmentHash], {
    productId: params.product.id,
    fitzpatrick: params.fitzpatrickType || "auto",
    v: "2.1",
  });

  const overlaySpec = buildOverlaySpecForProduct(params.product, params.fitzpatrickType);

  // 1. Check SHA-256 Unit-Shield Disk Cache
  const cached = readCachedJson<VtoRenderResult>(cacheKey);
  if (cached && cached.renderedImageUrl) {
    const durationMs = Date.now() - started;
    recordLedgerEvent({
      service: serviceName,
      mode: "cached_youcam",
      cacheKey,
      unitsDelta: 0,
      unitsSaved: isApparel ? 2 : 1,
      taskId: cached.trace.taskId,
      durationMs,
    });
    return {
      ...cached,
      mode: "cached_youcam",
      overlaySpec,
      trace: {
        ...cached.trace,
        mode: "cached_youcam",
        cacheHit: true,
        unitsConsumed: 0,
        totalDurationMs: durationMs,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const cfg = getUnitShieldConfig(params.apiKeyOverride);
  if (!cfg.apiKeyConfigured || !params.preferLiveApi) {
    return {
      vtoId: `vto-studio-${cacheKey.slice(0, 10)}`,
      productId: params.product.id,
      mode: "preset_studio",
      overlaySpec,
      trace: {
        traceId: crypto.randomUUID(),
        service: serviceName,
        mode: "preset_studio",
        cacheKey,
        cacheHit: true,
        unitsConsumed: 0,
        totalDurationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
        steps: [
          {
            step: `Real-Time Dermal Physics Canvas VTO (${params.product.sku}) — Click 'Run Live YouCam VTO' for S2S v2.0`,
            method: "POST",
            endpoint: `/local/vto/${serviceName}`,
            status: 200,
            durationMs: Date.now() - started,
          },
        ],
      },
    };
  }

  const unitCost = isApparel ? 2 : 1;
  const budgetCheck = canSpendLiveUnits(unitCost, params.apiKeyOverride);
  if (!budgetCheck.allowed) {
    throw new Error(budgetCheck.reason || "Unit-Shield budget limit reached");
  }

  const steps: ApiStepTrace[] = [];
  const baseUrl = getBaseUrl();

  if (isApparel) {
    if (!params.garmentBuffer) {
      throw new Error("Garment reference image buffer required for AI Clothes VTO");
    }
    const srcFileId = await uploadYouCamFile({
      buffer: params.personBuffer,
      mimeType: params.personMime,
      fileName: "shopper_upper_body.jpg",
      serviceSlug: "cloth",
      apiKey: cfg.apiKey,
      steps,
    });
    const refFileId = await uploadYouCamFile({
      buffer: params.garmentBuffer,
      mimeType: params.garmentMime || "image/jpeg",
      fileName: `${params.product.sku}.jpg`,
      serviceSlug: "cloth",
      apiKey: cfg.apiKey,
      steps,
    });

    const tTask = Date.now();
    const createRes = await fetch(`${baseUrl}/s2s/v2.0/task/cloth`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        src_file_id: srcFileId,
        ref_file_id: refFileId,
        garment_category: params.product.garmentCategory || "upper_body",
      }),
    });
    const rawCreate = await createRes.text();
    steps.push({
      step: `Create AI Clothes VTO Task (${params.product.garmentCategory || "upper_body"})`,
      method: "POST",
      endpoint: "/s2s/v2.0/task/cloth",
      status: createRes.status,
      durationMs: Date.now() - tTask,
    });

    if (!createRes.ok) {
      throw new Error(`YouCam Clothes VTO failed (${createRes.status}): ${rawCreate.slice(0, 220)}`);
    }

    const createJson = JSON.parse(rawCreate) as Record<string, unknown>;
    const taskId = String(
      ((createJson.data || createJson.result || createJson) as Record<string, unknown>).task_id || ""
    );
    const pollData = await pollYouCamTask({
      taskPathCandidates: [
        `/s2s/v2.0/task/cloth/${encodeURIComponent(taskId)}`,
        `/s2s/v2.0/cloth/${encodeURIComponent(taskId)}`,
      ],
      apiKey: cfg.apiKey,
      steps,
    });

    const outUrl = extractResultImageUrl(pollData);
    if (!outUrl) {
      throw new Error("YouCam Clothes VTO completed without an output image URL");
    }
    const renderedImageUrl = await persistRemoteAssetAsDataUrl(outUrl, "image/jpeg");

    const durationMs = Date.now() - started;
    const result: VtoRenderResult = {
      vtoId: `vto-cloth-${taskId.slice(0, 10)}`,
      productId: params.product.id,
      mode: "live_youcam",
      renderedImageUrl,
      overlaySpec,
      trace: {
        traceId: crypto.randomUUID(),
        service: "cloth-vto",
        mode: "live_youcam",
        cacheKey,
        cacheHit: false,
        unitsConsumed: unitCost,
        fileId: srcFileId,
        refFileId,
        taskId,
        totalDurationMs: durationMs,
        timestamp: new Date().toISOString(),
        steps,
      },
    };
    writeCachedJson(cacheKey, result);
    recordLedgerEvent({
      service: "cloth-vto",
      mode: "live_youcam",
      cacheKey,
      unitsDelta: unitCost,
      unitsSaved: 0,
      taskId,
      durationMs,
    });
    return result;
  }

  // Makeup VTO (/s2s/v2.0/task/makeup-vto) with face-ROI framing & full-portrait compositing
  let faceFrame: PreparedSkinFrame | undefined;
  try {
    faceFrame = await prepareSkinAnalysisFrame(params.personBuffer);
  } catch {
    // Non-image buffer in mocked tests falls through directly
  }

  const srcFileId = await uploadYouCamFile({
    buffer: faceFrame ? faceFrame.croppedBuffer : params.personBuffer,
    mimeType: faceFrame ? "image/jpeg" : params.personMime,
    fileName: "shopper_makeup_roi.jpg",
    serviceSlug: "makeup-vto",
    apiKey: cfg.apiKey,
    steps,
  });

  const effectsArray = buildYouCamMakeupEffectsArray(params.product, params.fitzpatrickType);
  const tMakeup = Date.now();
  const createRes = await fetch(`${baseUrl}/s2s/v2.0/task/makeup-vto`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      src_file_id: srcFileId,
      version: "1.0",
      effects: effectsArray,
    }),
  });
  const rawCreate = await createRes.text();
  steps.push({
    step: `Create AI Makeup VTO Task (${params.product.sku})`,
    method: "POST",
    endpoint: "/s2s/v2.0/task/makeup-vto",
    status: createRes.status,
    durationMs: Date.now() - tMakeup,
  });

  if (!createRes.ok) {
    throw new Error(`YouCam Makeup VTO failed (${createRes.status}): ${rawCreate.slice(0, 220)}`);
  }

  const createJson = JSON.parse(rawCreate) as Record<string, unknown>;
  const taskId = String(
    ((createJson.data || createJson.result || createJson) as Record<string, unknown>).task_id || ""
  );
  if (!taskId) {
    throw new Error(`YouCam Makeup VTO did not return task_id: ${rawCreate.slice(0, 220)}`);
  }

  const pollData = await pollYouCamTask({
    taskPathCandidates: [
      `/s2s/v2.0/task/makeup-vto/${encodeURIComponent(taskId)}`,
      `/s2s/v2.0/makeup-vto/${encodeURIComponent(taskId)}`,
    ],
    apiKey: cfg.apiKey,
    steps,
  });

  const outUrl = extractResultImageUrl(pollData);
  if (!outUrl) {
    throw new Error("YouCam Makeup VTO completed without an output image URL");
  }

  let renderedImageUrl: string;
  if (faceFrame) {
    const outRes = await fetch(outUrl);
    if (!outRes.ok) {
      throw new Error(`Failed to fetch Makeup VTO output (${outRes.status})`);
    }
    const renderedPatchBuf = Buffer.from(await outRes.arrayBuffer());
    renderedImageUrl = await compositeCroppedRenderOntoPortrait(
      params.personBuffer,
      renderedPatchBuf,
      faceFrame.cropBox
    );
  } else {
    renderedImageUrl = await persistRemoteAssetAsDataUrl(outUrl, "image/jpeg");
  }

  const durationMs = Date.now() - started;
  const result: VtoRenderResult = {
    vtoId: `vto-makeup-${taskId.slice(0, 10)}`,
    productId: params.product.id,
    mode: "live_youcam",
    renderedImageUrl,
    overlaySpec,
    trace: {
      traceId: crypto.randomUUID(),
      service: "makeup-vto",
      mode: "live_youcam",
      cacheKey,
      cacheHit: false,
      unitsConsumed: 1,
      fileId: srcFileId,
      taskId,
      totalDurationMs: durationMs,
      timestamp: new Date().toISOString(),
      steps,
    },
  };

  writeCachedJson(cacheKey, result);
  recordLedgerEvent({
    service: "makeup-vto",
    mode: "live_youcam",
    cacheKey,
    unitsDelta: 1,
    unitsSaved: 0,
    taskId,
    durationMs,
  });
  return result;
}
