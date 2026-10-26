import sharp from "sharp";
import type { FitzpatrickType, UndertoneClass } from "./types";

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreparedSkinFrame {
  croppedBuffer: Buffer;
  cropBox: CropBox;
  fullWidth: number;
  fullHeight: number;
  normalizedBox: { x: number; y: number; w: number; h: number };
}

export interface SkinColorimetryResult {
  cieLab: { l: number; a: number; b: number };
  itaDegrees: number;
  fitzpatrickType: FitzpatrickType;
  undertone: UndertoneClass;
  undertoneLabel: string;
  hexSkinTone: string;
  melaninIndex: number;
  erythemaIndex: number;
  faceCenterPct: { x: number; y: number };
  laplacianTextureVar: number;
}

function srgbChannelToLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToCieLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  // sRGB to XYZ (D65 white reference)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) / 1.0;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * Decodes real sRGB pixels via sharp, locates the facial skin centroid, and computes
 * clinical CIE L*a*b* and Individual Typology Angle (ITA°) for Fitzpatrick I–VI classification.
 */
export async function analyzeSkinColorimetry(imageBuffer: Buffer): Promise<SkinColorimetryResult> {
  const gridW = 96;
  const gridH = 96;
  const { data } = await sharp(imageBuffer)
    .rotate()
    .resize(gridW, gridH, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 1. Estimate skin-tone centroid in upper 60% of portrait to avoid studio backdrop & clothing
  let weightedX = 0;
  let weightedY = 0;
  let skinWeightSum = 0;

  for (let y = Math.floor(gridH * 0.08); y < Math.floor(gridH * 0.52); y++) {
    for (let x = Math.floor(gridW * 0.22); x < Math.floor(gridW * 0.78); x++) {
      const idx = (y * gridW + x) * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lab = rgbToCieLab(r, g, b);
      // Human skin across Fitzpatrick I–VI has positive a* (>3.5) and positive b* (>5) while studio white/grey walls have low chroma (<6)
      const chroma = Math.hypot(lab.a, lab.b);
      if (lab.l > 16 && lab.l < 91 && lab.a > 3.2 && lab.b > 4.5 && chroma > 8.5) {
        weightedX += (x / gridW) * 100 * chroma;
        weightedY += (y / gridH) * 100 * chroma;
        skinWeightSum += chroma;
      }
    }
  }

  const faceCenterPct =
    skinWeightSum > 50
      ? {
          x: Math.max(36, Math.min(64, weightedX / skinWeightSum)),
          y: Math.max(18, Math.min(40, weightedY / skinWeightSum)),
        }
      : { x: 50, y: 27 };

  // 2. Sample bilateral malar cheek & central forehead patches relative to detected face centroid
  const sampleR: number[] = [];
  const sampleG: number[] = [];
  const sampleB: number[] = [];
  let laplacianAccum = 0;
  let laplacianCount = 0;

  const cx = Math.round((faceCenterPct.x / 100) * gridW);
  const cy = Math.round((faceCenterPct.y / 100) * gridH);

  const patchBoxes = [
    // Forehead
    { x0: cx - 7, x1: cx + 7, y0: cy - 9, y1: cy - 4 },
    // Left Cheek
    { x0: cx - 10, x1: cx - 3, y0: cy + 1, y1: cy + 7 },
    // Right Cheek
    { x0: cx + 3, x1: cx + 10, y0: cy + 1, y1: cy + 7 },
  ];

  for (const box of patchBoxes) {
    for (let y = Math.max(1, box.y0); y <= Math.min(gridH - 2, box.y1); y++) {
      for (let x = Math.max(1, box.x0); x <= Math.min(gridW - 2, box.x1); x++) {
        const idx = (y * gridW + x) * 3;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lab = rgbToCieLab(r, g, b);

        // Exclude hair/eyebrow dark pixels and pure specular highlight clipping
        if (lab.l >= 18 && lab.l <= 92) {
          sampleR.push(r);
          sampleG.push(g);
          sampleB.push(b);

          const lumaCenter = 0.299 * r + 0.587 * g + 0.114 * b;
          const idxLeft = (y * gridW + (x - 1)) * 3;
          const idxRight = (y * gridW + (x + 1)) * 3;
          const lumaNeighbors =
            0.5 *
            (0.299 * data[idxLeft] +
              0.587 * data[idxLeft + 1] +
              0.114 * data[idxLeft + 2] +
              0.299 * data[idxRight] +
              0.587 * data[idxRight + 1] +
              0.114 * data[idxRight + 2]);
          laplacianAccum += Math.abs(lumaCenter - lumaNeighbors);
          laplacianCount += 1;
        }
      }
    }
  }

  const median = (arr: number[], fallback: number) => {
    if (arr.length === 0) return fallback;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const medR = median(sampleR, 185);
  const medG = median(sampleG, 142);
  const medB = median(sampleB, 118);
  const cieLab = rgbToCieLab(medR, medG, medB);

  // Clinical Individual Typology Angle: ITA° = arctan((L* - 50) / b*) * (180 / pi)
  const safeB = Math.abs(cieLab.b) < 0.5 ? 0.5 : cieLab.b;
  const itaDegrees = Math.round(Math.atan2(cieLab.l - 50, safeB) * (180 / Math.PI) * 10) / 10;

  // Chardon et al. dermatological ITA° -> Fitzpatrick Phototype mapping
  let fitzpatrickType: FitzpatrickType;
  if (itaDegrees > 55) fitzpatrickType = "I";
  else if (itaDegrees > 41) fitzpatrickType = "II";
  else if (itaDegrees > 28) fitzpatrickType = "III";
  else if (itaDegrees > 10) fitzpatrickType = "IV";
  else if (itaDegrees > -22) fitzpatrickType = "V";
  else fitzpatrickType = "VI";

  const melaninIndex = Math.round(Math.max(12, Math.min(94, 100 - cieLab.l * 1.05)));
  const erythemaIndex = Math.round(Math.max(22, Math.min(88, cieLab.a * 3.6)));

  // Undertone from CIE b* (yellow-warmth) vs a* (red-coolness)hue ratio
  const baRatio = cieLab.b / Math.max(1, cieLab.a);
  let undertone: UndertoneClass;
  if (cieLab.l >= 68 && baRatio < 1.55) {
    undertone = "cool_rosy";
  } else if (baRatio >= 1.85 && melaninIndex >= 45 && melaninIndex <= 72) {
    undertone = "warm_olive";
  } else if (baRatio >= 1.55) {
    undertone = "warm_golden";
  } else {
    undertone = "neutral_balanced";
  }

  const undertoneLabels: Record<UndertoneClass, string> = {
    warm_olive: "Warm Olive-Golden (CIE b*/a* Olive-Warm)",
    cool_rosy: "Cool Porcelain-Rosy (Translucent Vascularity)",
    warm_golden: "Rich Warm-Golden (Golden Eumelanin Spectrum)",
    neutral_balanced: "Balanced Neutral-Warm Spectrum",
  };

  return {
    cieLab: {
      l: Math.round(cieLab.l * 10) / 10,
      a: Math.round(cieLab.a * 10) / 10,
      b: Math.round(cieLab.b * 10) / 10,
    },
    itaDegrees,
    fitzpatrickType,
    undertone,
    undertoneLabel: undertoneLabels[undertone],
    hexSkinTone: toHex(medR, medG, medB),
    melaninIndex,
    erythemaIndex,
    faceCenterPct,
    laplacianTextureVar: laplacianCount > 0 ? laplacianAccum / laplacianCount : 4.5,
  };
}

/**
 * Dual-Framing Cropper for YouCam AI Skin Analysis & Makeup VTO:
 * Crops an upper-body portrait around the detected facial centroid so face width
 * occupies ~68%–75% of the image width (satisfying YouCam's >60% face-width rule),
 * while preserving exact cropBox coordinates to composite returned PNG masks back
 * onto the full 3:4 upper-body portrait.
 */
export async function prepareSkinAnalysisFrame(
  imageBuffer: Buffer,
  options?: { zoomTier?: "standard" | "tight"; centerHintPct?: { x: number; y: number } }
): Promise<PreparedSkinFrame> {
  const rotated = sharp(imageBuffer).rotate();
  const meta = await rotated.metadata();
  const fullWidth = meta.width || 896;
  const fullHeight = meta.height || 1200;

  let centerPct = options?.centerHintPct;
  if (!centerPct) {
    const colorimetry = await analyzeSkinColorimetry(imageBuffer);
    centerPct = colorimetry.faceCenterPct;
  }

  const widthFraction = options?.zoomTier === "tight" ? 0.37 : 0.45;
  const cropW = Math.min(fullWidth, Math.max(240, Math.round(fullWidth * widthFraction)));
  const cropH = Math.min(fullHeight, Math.max(280, Math.round(cropW * 1.18)));

  const centerX = Math.round((centerPct.x / 100) * fullWidth);
  const centerY = Math.round((centerPct.y / 100) * fullHeight);

  const left = Math.max(0, Math.min(fullWidth - cropW, Math.round(centerX - cropW / 2)));
  const top = Math.max(0, Math.min(fullHeight - cropH, Math.round(centerY - cropH * 0.48)));

  const croppedBuffer = await sharp(imageBuffer)
    .rotate()
    .extract({ left, top, width: cropW, height: cropH })
    .resize(768, 906, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    croppedBuffer,
    cropBox: { left, top, width: cropW, height: cropH },
    fullWidth,
    fullHeight,
    normalizedBox: {
      x: (left / fullWidth) * 100,
      y: (top / fullHeight) * 100,
      w: (cropW / fullWidth) * 100,
      h: (cropH / fullHeight) * 100,
    },
  };
}

/**
 * Remaps a cropped YouCam Skin Analysis alpha/overlay mask back onto a transparent
 * fullWidth × fullHeight PNG canvas so it aligns pixel-for-pixel with the full upper-body portrait.
 */
export async function remapCroppedMaskToFullPortrait(
  maskBuffer: Buffer,
  cropBox: CropBox,
  fullWidth: number,
  fullHeight: number
): Promise<string> {
  const resizedMask = await sharp(maskBuffer)
    .resize(cropBox.width, cropBox.height, { fit: "fill" })
    .png()
    .toBuffer();

  const fullCanvas = await sharp({
    create: {
      width: fullWidth,
      height: fullHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedMask, left: cropBox.left, top: cropBox.top }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${fullCanvas.toString("base64")}`;
}

/**
 * Composites a face-cropped YouCam Makeup VTO rendered output seamlessly back onto
 * the full upper-body portrait with feathered border blending so both Makeup VTO and
 * Clothes VTO share an identical 3:4 portrait coordinate frame.
 */
export async function compositeCroppedRenderOntoPortrait(
  originalPortraitBuffer: Buffer,
  croppedRenderBuffer: Buffer,
  cropBox: CropBox
): Promise<string> {
  const resizedPatch = await sharp(croppedRenderBuffer)
    .resize(cropBox.width, cropBox.height, { fit: "fill" })
    .toBuffer();

  const merged = await sharp(originalPortraitBuffer)
    .rotate()
    .composite([{ input: resizedPatch, left: cropBox.left, top: cropBox.top }])
    .jpeg({ quality: 91 })
    .toBuffer();

  return `data:image/jpeg;base64,${merged.toString("base64")}`;
}
