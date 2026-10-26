"use client";

import React, { useRef, useState } from "react";
import { Eye, Layers, Sparkles, SplitSquareHorizontal, Zap } from "lucide-react";
import type { PersonaLandmarks } from "@/lib/youcam/presets";
import type {
  CatalogProduct,
  DermalCompatibilityVerdict,
  SkinAnalysisReport,
  SkinMetricScore,
  VtoRenderResult,
} from "@/lib/youcam/types";

interface PortraitVtoCanvasProps {
  portraitUrl: string;
  landmarks: PersonaLandmarks;
  report: SkinAnalysisReport;
  activeStage: "scan" | "vto";
  selectedMetric: SkinMetricScore;
  isScanning: boolean;
  primaryProduct: CatalogProduct;
  counterpartProduct?: CatalogProduct;
  verdict: DermalCompatibilityVerdict;
  primaryVto?: VtoRenderResult | null;
  counterpartVto?: VtoRenderResult | null;
  onTriggerLiveVto: () => void;
  isRenderingVto: boolean;
}

function CosmeticLayer({
  portraitUrl,
  landmarks,
  product,
  vto,
  isClashSide,
}: {
  portraitUrl: string;
  landmarks: PersonaLandmarks;
  product?: CatalogProduct;
  vto?: VtoRenderResult | null;
  isClashSide?: boolean;
}) {
  // If Perfect Corp YouCam S2S returned a full rendered image, display it directly!
  if (vto?.renderedImageUrl) {
    return (
      <img
        src={vto.renderedImageUrl}
        alt={product?.name || "YouCam VTO Render"}
        className="h-full w-full object-cover select-none"
        draggable={false}
      />
    );
  }

  const lipColor = product?.youcamMakeupEffects?.lipstick?.color;
  const blushColor = product?.youcamMakeupEffects?.blush?.color;
  const foundationColor = product?.youcamMakeupEffects?.foundation?.color;
  const isMatte = product?.finish === "matte";
  const isGloss = product?.finish === "sheer_balm" || product?.finish === "dewy_serum";
  const isApparel = product?.category === "apparel";

  const lipCenterX = landmarks.upperLipCenter.x;
  const lipCenterY = (landmarks.upperLipCenter.y + landmarks.lowerLipCenter.y) / 2;
  const rx = landmarks.lipWidth / 2;
  const ry = landmarks.lipHeight / 2;

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <img
        src={portraitUrl}
        alt={product?.name || "Portrait"}
        className="h-full w-full object-cover"
        style={{
          filter: isClashSide
            ? "contrast(1.06) saturate(1.08)"
            : product
            ? "contrast(1.01) brightness(1.02)"
            : "none",
        }}
        draggable={false}
      />

      {product && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <filter id={`blur-soft-${product.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.55" />
            </filter>
            <filter id={`blur-cheek-${product.id}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <filter id={`blur-drape-${product.id}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.8" />
            </filter>
          </defs>

          {/* Complexion Tint / Matte Cast Veil */}
          {foundationColor && (
            <ellipse
              cx={landmarks.noseBridge.x}
              cy={landmarks.noseBridge.y + 1.5}
              rx={13.5}
              ry={16.5}
              fill={foundationColor}
              fillOpacity={isMatte ? 0.24 : 0.14}
              style={{ mixBlendMode: isMatte ? "normal" : "soft-light" }}
              filter={`url(#blur-cheek-${product.id})`}
            />
          )}

          {/* Malar Blush / Erythema Interaction */}
          {(blushColor || (isClashSide && (lipColor || isApparel))) && (
            <>
              <ellipse
                cx={landmarks.leftCheek.x}
                cy={landmarks.leftCheek.y}
                rx={4.8}
                ry={3.8}
                fill={isClashSide ? "#C93B4B" : blushColor || "#B86456"}
                fillOpacity={isClashSide ? 0.22 : 0.18}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#blur-cheek-${product.id})`}
              />
              <ellipse
                cx={landmarks.rightCheek.x}
                cy={landmarks.rightCheek.y}
                rx={4.8}
                ry={3.8}
                fill={isClashSide ? "#C93B4B" : blushColor || "#B86456"}
                fillOpacity={isClashSide ? 0.22 : 0.18}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#blur-cheek-${product.id})`}
              />
            </>
          )}

          {/* Anatomical Lip Pigment Layer */}
          {lipColor && (
            <g filter={`url(#blur-soft-${product.id})`}>
              <path
                d={`
                  M ${lipCenterX - rx} ${lipCenterY + 0.1}
                  Q ${lipCenterX - rx * 0.45} ${lipCenterY - ry * 1.15}, ${lipCenterX - rx * 0.12} ${lipCenterY - ry * 0.72}
                  Q ${lipCenterX} ${lipCenterY - ry * 0.45}, ${lipCenterX + rx * 0.12} ${lipCenterY - ry * 0.72}
                  Q ${lipCenterX + rx * 0.45} ${lipCenterY - ry * 1.15}, ${lipCenterX + rx} ${lipCenterY + 0.1}
                  Q ${lipCenterX + rx * 0.52} ${lipCenterY + ry * 1.28}, ${lipCenterX} ${lipCenterY + ry * 1.32}
                  Q ${lipCenterX - rx * 0.52} ${lipCenterY + ry * 1.28}, ${lipCenterX - rx} ${lipCenterY + 0.1}
                  Z
                `}
                fill={lipColor}
                fillOpacity={isMatte ? 0.68 : isGloss ? 0.48 : 0.58}
                style={{ mixBlendMode: "multiply" }}
              />
              {/* Satin / Balm Specular Cushion Highlight */}
              {!isMatte && (
                <ellipse
                  cx={lipCenterX}
                  cy={lipCenterY + ry * 0.42}
                  rx={rx * 0.42}
                  ry={ry * 0.22}
                  fill="#FFFFFF"
                  fillOpacity={isGloss ? 0.34 : 0.2}
                />
              )}
            </g>
          )}

          {/* Apparel Chromatic Drape & Chin Optical Reflection */}
          {isApparel && (
            <>
              {/* Optical bounce onto jawline & neck */}
              <ellipse
                cx={landmarks.chin.x}
                cy={landmarks.chin.y + 3.2}
                rx={12}
                ry={5}
                fill={product.swatchHex}
                fillOpacity={isClashSide ? 0.24 : 0.12}
                style={{ mixBlendMode: isClashSide ? "color" : "soft-light" }}
                filter={`url(#blur-drape-${product.id})`}
              />
              {/* Color-accurate upper-torso Studio Drape Tint */}
              <path
                d={`
                  M ${landmarks.torsoBox.x} 100
                  L ${landmarks.torsoBox.x + 4} ${landmarks.torsoBox.y + 4}
                  Q 50 ${landmarks.torsoBox.y + 11}, ${landmarks.torsoBox.x + landmarks.torsoBox.width - 4} ${landmarks.torsoBox.y + 4}
                  L ${landmarks.torsoBox.x + landmarks.torsoBox.width} 100
                  Z
                `}
                fill={product.swatchHex}
                fillOpacity={0.62}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#blur-drape-${product.id})`}
              />
            </>
          )}
        </svg>
      )}

      {/* Apparel Ghost-Mannequin Reference Inset when awaiting Live Generative Cloth VTO */}
      {isApparel && product?.garmentImageUrl && !vto?.renderedImageUrl && (
        <div className="pointer-events-none absolute bottom-14 right-3 flex items-center gap-2 rounded-xl border border-white/50 bg-white/90 p-1.5 shadow-lg backdrop-blur-md">
          <img
            src={product.garmentImageUrl}
            alt={product.name}
            className="h-14 w-11 rounded-lg object-cover"
          />
          <div className="pr-1.5 text-[10px] leading-tight text-[#171412]">
            <div className="font-semibold uppercase tracking-wider text-[#5F5850]">
              Chromatic Drape
            </div>
            <div className="max-w-[92px] truncate font-medium">{product.brand}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PortraitVtoCanvas({
  portraitUrl,
  landmarks,
  report,
  activeStage,
  selectedMetric,
  isScanning,
  primaryProduct,
  counterpartProduct,
  verdict,
  primaryVto,
  counterpartVto,
  onTriggerLiveVto,
  isRenderingVto,
}: PortraitVtoCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [thermalLoupe, setThermalLoupe] = useState<boolean>(false);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const hasClashComparison = verdict.status !== "dermal_verified" && Boolean(counterpartProduct);

  const updateSplitFromClientX = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(8, Math.min(92, Math.round(pct))));
  };

  const severityStroke =
    selectedMetric.severity === "optimal"
      ? "#2F6853"
      : selectedMetric.severity === "mild"
      ? "#B97524"
      : "#C83A3A";

  return (
    <div className="flex flex-col rounded-2xl border border-[#E5DDD0] bg-white p-3.5 shadow-[0_14px_40px_-18px_rgba(23,20,18,0.14)]">
      {/* Top Studio Control Strip */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              report.mode === "live_youcam"
                ? "bg-emerald-600"
                : report.mode === "cached_youcam"
                ? "bg-amber-600"
                : "bg-[#B85D43]"
            }`}
          />
          <span className="font-telemetry text-[11px] font-medium uppercase tracking-wider text-[#5F5850]">
            {activeStage === "scan"
              ? `Spatial Zone · ${selectedMetric.label}`
              : hasClashComparison
              ? "Split VTO · Clash vs. Dermal Match"
              : "Split VTO · Bare vs. Dermal Verified"}
          </span>
        </div>

        {activeStage === "scan" ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowZones((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                showZones
                  ? "border-[#171412] bg-[#171412] text-white"
                  : "border-[#E5DDD0] bg-[#FAF7F2] text-[#5F5850] hover:text-[#171412]"
              }`}
            >
              <Layers className="h-3 w-3" />
              Masks
            </button>
            <button
              type="button"
              onClick={() => setThermalLoupe((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                thermalLoupe
                  ? "border-[#B85D43] bg-[#B85D43] text-white"
                  : "border-[#E5DDD0] bg-[#FAF7F2] text-[#5F5850] hover:text-[#171412]"
              }`}
            >
              <Eye className="h-3 w-3" />
              Clinical Loupe
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onTriggerLiveVto}
            disabled={isRenderingVto}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#171412] bg-[#171412] px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-[#B85D43] hover:border-[#B85D43] disabled:opacity-50"
          >
            <Zap className="h-3 w-3" />
            {isRenderingVto
              ? "Rendering S2S VTO…"
              : primaryVto?.renderedImageUrl
              ? "S2S VTO Rendered"
              : `Run Live YouCam ${primaryProduct.category === "apparel" ? "Cloth" : "Makeup"} VTO`}
          </button>
        )}
      </div>

      {/* Main 3:4 Portrait Canvas Frame */}
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          if (activeStage !== "vto") return;
          setIsDragging(true);
          updateSplitFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!isDragging || activeStage !== "vto") return;
          updateSplitFromClientX(e.clientX);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#F3EDE3] ${
          activeStage === "vto" ? "cursor-ew-resize touch-none" : ""
        }`}
      >
        {activeStage === "scan" ? (
          <>
            <img
              src={portraitUrl}
              alt={report.subjectName}
              className="h-full w-full object-cover transition duration-300"
              style={{
                filter: thermalLoupe
                  ? "contrast(1.24) saturate(1.28) brightness(0.92)"
                  : "none",
              }}
              draggable={false}
            />

            {/* Optional PNG Alpha Mask returned directly by YouCam Skin Analysis API */}
            {showZones && selectedMetric.maskDataUrl && (
              <img
                src={selectedMetric.maskDataUrl}
                alt={`${selectedMetric.label} YouCam Mask`}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen"
              />
            )}

            {/* Spatial Zone Heatmap & Clinical Reticle Overlay */}
            {showZones && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <defs>
                  <radialGradient id="hotspot-elevated" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#D9383A" stopOpacity="0.52" />
                    <stop offset="65%" stopColor="#D9383A" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#D9383A" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="hotspot-mild" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#D9822B" stopOpacity="0.46" />
                    <stop offset="65%" stopColor="#D9822B" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#D9822B" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {selectedMetric.hotspots.map((spot) => (
                  <g key={spot.id}>
                    <ellipse
                      cx={spot.x}
                      cy={spot.y}
                      rx={spot.radiusX * 1.25}
                      ry={spot.radiusY * 1.25}
                      fill={
                        selectedMetric.rawScore < 64
                          ? "url(#hotspot-elevated)"
                          : "url(#hotspot-mild)"
                      }
                    />
                    <ellipse
                      cx={spot.x}
                      cy={spot.y}
                      rx={spot.radiusX}
                      ry={spot.radiusY}
                      fill="none"
                      stroke={severityStroke}
                      strokeWidth="0.28"
                      strokeDasharray="1.1 0.8"
                    />
                    <circle cx={spot.x} cy={spot.y} r="0.6" fill="#FFFFFF" stroke={severityStroke} strokeWidth="0.3" />
                  </g>
                ))}
              </svg>
            )}

            {/* Animated Laser Scan Sweep */}
            {isScanning && (
              <div className="animate-scanline pointer-events-none absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#B85D43] to-transparent shadow-[0_0_20px_4px_rgba(184,93,67,0.65)]" />
            )}

            {/* Floating Telemetry HUD Badges */}
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
              <div className="rounded-lg border border-white/40 bg-[#171412]/80 px-2.5 py-1 text-[11px] text-white backdrop-blur-md">
                <span className="font-telemetry text-[10px] text-white/70">FITZPATRICK </span>
                <span className="font-semibold">{report.fitzpatrickType}</span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-telemetry text-[10px] text-white/80">
                  SKIN AGE {report.skinAge}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/90 px-2.5 py-1 text-[11px] text-[#171412] shadow-sm backdrop-blur-md">
                <span
                  className="h-2.5 w-2.5 rounded-full border border-black/15"
                  style={{ backgroundColor: report.hexSkinTone }}
                />
                <span className="font-medium">{report.undertoneLabel.split("(")[0].trim()}</span>
              </div>
            </div>

            {/* Bottom Active Metric Diagnostic Pill */}
            <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/50 bg-[#171412]/85 p-3 text-white backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-telemetry text-[10px] uppercase tracking-wider text-white/65">
                    {selectedMetric.clinicalName} · {selectedMetric.primaryZone}
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-white/95">
                    {selectedMetric.dermalImpact}
                  </div>
                </div>
                <div className="shrink-0 text-right font-telemetry">
                  <div className="text-sm font-semibold text-white">
                    UI {selectedMetric.uiScore}
                  </div>
                  <div className="text-[10px] text-[#E6A48E]">
                    RAW {selectedMetric.rawScore.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ====================== STAGE 2: SPLIT-SLIDER VTO COMPARATOR ====================== */
          <>
            {/* RIGHT / FULL BASE LAYER: Calibrated Counterpart (if clash) OR Primary Verified SKU */}
            <div className="absolute inset-0">
              <CosmeticLayer
                portraitUrl={portraitUrl}
                landmarks={landmarks}
                product={hasClashComparison ? counterpartProduct : primaryProduct}
                vto={hasClashComparison ? counterpartVto : primaryVto}
                isClashSide={false}
              />
            </div>

            {/* LEFT CLIPPED LAYER: Naive Clash SKU (if clash) OR Bare Unretouched Skin */}
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
            >
              <CosmeticLayer
                portraitUrl={portraitUrl}
                landmarks={landmarks}
                product={hasClashComparison ? primaryProduct : undefined}
                vto={hasClashComparison ? primaryVto : null}
                isClashSide={hasClashComparison}
              />
            </div>

            {/* Vertical Draggable Divider Handle */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.45)]"
              style={{ left: `${splitPct}%` }}
            >
              <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5DDD0] bg-white text-[#171412] shadow-lg">
                <SplitSquareHorizontal className="h-4 w-4 text-[#B85D43]" />
              </div>
            </div>

            {/* Left & Right Comparison Labels */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[44%] rounded-lg border border-white/30 bg-[#171412]/80 px-2.5 py-1.5 text-[11px] text-white backdrop-blur-md">
              <div className="font-telemetry text-[9px] uppercase tracking-wider text-rose-300">
                {hasClashComparison ? `Clash · ${verdict.returnRiskPct}% Return Risk` : "Before VTO"}
              </div>
              <div className="truncate font-medium">
                {hasClashComparison ? primaryProduct.name : "Bare Clinical Portrait"}
              </div>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[44%] rounded-lg border border-emerald-400/40 bg-[#132A22]/85 px-2.5 py-1.5 text-right text-[11px] text-white backdrop-blur-md">
              <div className="inline-flex items-center gap-1 font-telemetry text-[9px] uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-2.5 w-2.5" />
                {hasClashComparison ? "Dermal-Calibrated Match" : "Dermal-Verified VTO"}
              </div>
              <div className="truncate font-medium">
                {hasClashComparison && counterpartProduct
                  ? counterpartProduct.name
                  : primaryProduct.name}
              </div>
            </div>

            {/* Bottom Drag Hint */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/40 bg-[#171412]/75 px-3 py-1 font-telemetry text-[10px] text-white backdrop-blur-md">
              Drag slider ({splitPct}%) to inspect finish & undertone behavior
            </div>
          </>
        )}
      </div>
    </div>
  );
}
