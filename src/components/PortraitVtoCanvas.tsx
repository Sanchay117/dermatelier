"use client";

import React, { useRef, useState } from "react";
import { Clock, Eye, Layers, Sparkles, SplitSquareHorizontal, Zap } from "lucide-react";
import { resolveShadeForFitzpatrick } from "@/lib/youcam/catalog";
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
  preservedClashPair?: {
    clashProduct: CatalogProduct;
    matchProduct: CatalogProduct;
    clashReturnRiskPct: number;
  } | null;
  primaryVto?: VtoRenderResult | null;
  counterpartVto?: VtoRenderResult | null;
  onTriggerLiveVto: () => void;
  isRenderingVto: boolean;
}

function CosmeticLayer({
  portraitUrl,
  landmarks,
  report,
  product,
  vto,
  isClashSide,
  wearHorizon,
  instanceKey,
}: {
  portraitUrl: string;
  landmarks: PersonaLandmarks;
  report: SkinAnalysisReport;
  product?: CatalogProduct;
  vto?: VtoRenderResult | null;
  isClashSide?: boolean;
  wearHorizon: "fresh" | "4h";
  instanceKey: string;
}) {
  const moistureScore =
    report.metrics.find((m) => m.action === "moisture")?.rawScore ?? 70;
  const oilinessScore =
    report.metrics.find((m) => m.action === "oiliness")?.rawScore ?? 70;
  const poreScore =
    report.metrics.find((m) => m.action === "pore")?.rawScore ?? 70;
  const rednessScore =
    report.metrics.find((m) => m.action === "redness")?.rawScore ?? 70;

  const is4h = wearHorizon === "4h";
  const isMatte = product?.finish === "matte";
  const isGloss = product?.finish === "sheer_balm" || product?.finish === "dewy_serum";
  const isApparel = product?.category === "apparel";

  const lipCenterX = landmarks.upperLipCenter.x;
  const lipCenterY = (landmarks.upperLipCenter.y + landmarks.lowerLipCenter.y) / 2;
  const rx = landmarks.lipWidth / 2;
  const ry = landmarks.lipHeight / 2;

  const lipPathD = `
    M ${lipCenterX - rx} ${lipCenterY + 0.1}
    Q ${lipCenterX - rx * 0.45} ${lipCenterY - ry * 1.15}, ${lipCenterX - rx * 0.12} ${lipCenterY - ry * 0.72}
    Q ${lipCenterX} ${lipCenterY - ry * 0.45}, ${lipCenterX + rx * 0.12} ${lipCenterY - ry * 0.72}
    Q ${lipCenterX + rx * 0.45} ${lipCenterY - ry * 1.15}, ${lipCenterX + rx} ${lipCenterY + 0.1}
    Q ${lipCenterX + rx * 0.52} ${lipCenterY + ry * 1.28}, ${lipCenterX} ${lipCenterY + ry * 1.32}
    Q ${lipCenterX - rx * 0.52} ${lipCenterY + ry * 1.28}, ${lipCenterX - rx} ${lipCenterY + 0.1}
    Z
  `;

  // Render authentic YouCam S2S generative image if available, plus T+4h wear forecast overlay if active
  if (vto?.renderedImageUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden select-none">
        <img
          src={vto.renderedImageUrl}
          alt={product?.name || "YouCam VTO Render"}
          className="h-full w-full object-cover select-none transition duration-300"
          style={{
            filter:
              is4h && isClashSide
                ? "contrast(1.1) saturate(1.12) brightness(0.96)"
                : is4h && !isClashSide
                ? "brightness(1.01) saturate(1.02)"
                : "none",
          }}
          draggable={false}
        />
        {is4h && isClashSide && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {/* T+4h T-Zone Oxidation & Pore Settling on Clash Formula */}
            {(oilinessScore < 72 || poreScore < 70) && (
              <ellipse
                cx={landmarks.noseBridge.x}
                cy={landmarks.noseBridge.y}
                rx={7.2}
                ry={8.5}
                fill="#8F4B22"
                fillOpacity={0.18}
                style={{ mixBlendMode: "multiply" }}
              />
            )}
            {/* T+4h Lip / Perioral Dry Creasing */}
            {moistureScore < 68 && isMatte && (
              <g stroke="#F8EDE6" strokeWidth="0.22" strokeOpacity="0.58">
                <line x1={lipCenterX - rx * 0.45} y1={lipCenterY - ry * 0.4} x2={lipCenterX - rx * 0.38} y2={lipCenterY + ry * 0.85} />
                <line x1={lipCenterX} y1={lipCenterY - ry * 0.35} x2={lipCenterX} y2={lipCenterY + ry * 0.95} />
                <line x1={lipCenterX + rx * 0.45} y1={lipCenterY - ry * 0.4} x2={lipCenterX + rx * 0.38} y2={lipCenterY + ry * 0.85} />
              </g>
            )}
          </svg>
        )}
      </div>
    );
  }

  const lipColor = product?.youcamMakeupEffects?.lipstick?.color;
  const blushColor = product?.youcamMakeupEffects?.blush?.color;
  const hasFoundation = Boolean(product?.youcamMakeupEffects?.foundation);
  const calibratedFoundationHex =
    product && hasFoundation
      ? resolveShadeForFitzpatrick(product, report.fitzpatrickType)
      : undefined;

  // Show chalky titanium-dioxide cast on deep melanin skin ONLY when viewing a matte clash base
  const showTitaniumAshCast = Boolean(
    isClashSide && hasFoundation && isMatte && report.melaninIndex >= 70
  );

  const maskId = `face-zone-mask-${instanceKey}`;
  const blurSoftId = `blur-soft-${instanceKey}`;
  const blurCheekId = `blur-cheek-${instanceKey}`;
  const blurDrapeId = `blur-drape-${instanceKey}`;

  // Tailored torso geometry kept strictly inside torso boundaries (no bleeding onto arms)
  const torsoLeft = landmarks.torsoBox.x + landmarks.torsoBox.width * 0.14;
  const torsoRight = landmarks.torsoBox.x + landmarks.torsoBox.width * 0.86;
  const shoulderTop = landmarks.torsoBox.y + 3.5;

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <img
        src={portraitUrl}
        alt={product?.name || "Portrait"}
        className="h-full w-full object-cover transition duration-300"
        style={{
          filter: isClashSide
            ? is4h
              ? "contrast(1.11) saturate(1.14) brightness(0.96)"
              : "contrast(1.05) saturate(1.06)"
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
            <filter id={blurSoftId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.52" />
            </filter>
            <filter id={blurCheekId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
            <filter id={blurDrapeId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.1" />
            </filter>

            {/* Anatomical Face Mask: Protects eyes, brows, nostrils & lips from foundation tint */}
            <mask id={maskId}>
              <rect x="0" y="0" width="100" height="100" fill="black" />
              <ellipse
                cx={landmarks.noseBridge.x}
                cy={landmarks.noseBridge.y + 0.8}
                rx={13.2}
                ry={16.4}
                fill="white"
                filter={`url(#${blurCheekId})`}
              />
              {/* Cut out bilateral eye & brow zones */}
              <ellipse
                cx={landmarks.noseBridge.x - 5.4}
                cy={landmarks.noseBridge.y - 4.4}
                rx={3.6}
                ry={2.2}
                fill="black"
              />
              <ellipse
                cx={landmarks.noseBridge.x + 5.4}
                cy={landmarks.noseBridge.y - 4.4}
                rx={3.6}
                ry={2.2}
                fill="black"
              />
              {/* Cut out nostrils */}
              <ellipse
                cx={landmarks.noseBridge.x}
                cy={landmarks.noseBridge.y + 3.4}
                rx={2.1}
                ry={1.1}
                fill="black"
              />
              {/* Cut out lips */}
              <path d={lipPathD} fill="black" />
            </mask>
          </defs>

          {/* Masked Complexion Layer (Fitzpatrick-matched vs Titanium Matte Cast) */}
          {calibratedFoundationHex && (
            <g mask={`url(#${maskId})`}>
              <rect
                x="20"
                y="8"
                width="60"
                height="58"
                fill={showTitaniumAshCast ? "#CFC2BC" : calibratedFoundationHex}
                fillOpacity={
                  showTitaniumAshCast
                    ? is4h
                      ? 0.28
                      : 0.22
                    : isMatte
                    ? 0.24
                    : 0.18
                }
                style={{
                  mixBlendMode: showTitaniumAshCast
                    ? "screen"
                    : isMatte
                    ? "multiply"
                    : "soft-light",
                }}
              />
              {/* Dewy Serum Specular Cheekbone Bounce on Calibrated Tint */}
              {!isMatte && !isClashSide && (
                <>
                  <ellipse
                    cx={landmarks.leftCheek.x - 0.8}
                    cy={landmarks.leftCheek.y - 1.8}
                    rx={3.1}
                    ry={1.6}
                    fill="#FFF9F2"
                    fillOpacity={is4h ? 0.22 : 0.26}
                    filter={`url(#${blurSoftId})`}
                  />
                  <ellipse
                    cx={landmarks.rightCheek.x + 0.8}
                    cy={landmarks.rightCheek.y - 1.8}
                    rx={3.1}
                    ry={1.6}
                    fill="#FFF9F2"
                    fillOpacity={is4h ? 0.22 : 0.26}
                    filter={`url(#${blurSoftId})`}
                  />
                </>
              )}
            </g>
          )}

          {/* Malar Blush / Erythema Simultaneous Contrast */}
          {(blushColor || (isClashSide && (lipColor || isApparel))) && (
            <>
              <ellipse
                cx={landmarks.leftCheek.x}
                cy={landmarks.leftCheek.y}
                rx={4.6}
                ry={3.6}
                fill={isClashSide ? "#C93B4B" : blushColor || "#B86456"}
                fillOpacity={isClashSide ? (is4h ? 0.29 : 0.21) : 0.17}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#${blurCheekId})`}
              />
              <ellipse
                cx={landmarks.rightCheek.x}
                cy={landmarks.rightCheek.y}
                rx={4.6}
                ry={3.6}
                fill={isClashSide ? "#C93B4B" : blushColor || "#B86456"}
                fillOpacity={isClashSide ? (is4h ? 0.29 : 0.21) : 0.17}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#${blurCheekId})`}
              />
            </>
          )}

          {/* T+4h Sebum Oxidation & Ostia Settling on Uncalibrated Base */}
          {is4h && isClashSide && hasFoundation && (oilinessScore < 72 || poreScore < 70) && (
            <g mask={`url(#${maskId})`}>
              <ellipse
                cx={landmarks.noseBridge.x}
                cy={landmarks.noseBridge.y + 0.5}
                rx={6.8}
                ry={8.2}
                fill="#9C4F20"
                fillOpacity={0.22}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#${blurCheekId})`}
              />
              {/* Micro-ostia pigment pooling dots along medial cheeks */}
              {[-3.4, -2.5, -1.8, 1.8, 2.5, 3.4].map((dx, i) => (
                <circle
                  key={i}
                  cx={landmarks.noseBridge.x + dx}
                  cy={landmarks.noseBridge.y + 1.8 + (i % 2) * 0.9}
                  r="0.19"
                  fill="#5A3422"
                  fillOpacity="0.45"
                />
              ))}
            </g>
          )}

          {/* Anatomical Lip Pigment Layer */}
          {lipColor && (
            <g filter={`url(#${blurSoftId})`}>
              <path
                d={lipPathD}
                fill={lipColor}
                fillOpacity={isMatte ? (is4h && isClashSide ? 0.74 : 0.66) : isGloss ? 0.46 : 0.58}
                style={{ mixBlendMode: "multiply" }}
              />
              {/* Satin / Peptide Balm Cushion Specular Highlight */}
              {!isMatte && (
                <ellipse
                  cx={lipCenterX}
                  cy={lipCenterY + ry * 0.42}
                  rx={rx * 0.42}
                  ry={ry * 0.22}
                  fill="#FFFFFF"
                  fillOpacity={isGloss ? 0.34 : 0.22}
                />
              )}
              {/* T+4h Dehydrated Matte Lip Micro-Flaking Striations */}
              {is4h && isClashSide && isMatte && moistureScore < 68 && (
                <g stroke="#F5E4DC" strokeWidth="0.2" strokeOpacity="0.62">
                  <line
                    x1={lipCenterX - rx * 0.48}
                    y1={lipCenterY - ry * 0.3}
                    x2={lipCenterX - rx * 0.42}
                    y2={lipCenterY + ry * 0.85}
                  />
                  <line
                    x1={lipCenterX - rx * 0.14}
                    y1={lipCenterY - ry * 0.25}
                    x2={lipCenterX - rx * 0.12}
                    y2={lipCenterY + ry * 0.95}
                  />
                  <line
                    x1={lipCenterX + rx * 0.18}
                    y1={lipCenterY - ry * 0.25}
                    x2={lipCenterX + rx * 0.15}
                    y2={lipCenterY + ry * 0.95}
                  />
                  <line
                    x1={lipCenterX + rx * 0.48}
                    y1={lipCenterY - ry * 0.3}
                    x2={lipCenterX + rx * 0.42}
                    y2={lipCenterY + ry * 0.85}
                  />
                </g>
              )}
            </g>
          )}

          {/* Tailored Apparel Collar/Bodice Chromatic Preview + Jawline Optical Bounce */}
          {isApparel && (
            <>
              {/* Subsurface chromatic bounce onto jawline & neck */}
              <ellipse
                cx={landmarks.chin.x}
                cy={landmarks.chin.y + 3.0}
                rx={10.5}
                ry={4.2}
                fill={product.swatchHex}
                fillOpacity={isClashSide ? 0.24 : 0.11}
                style={{ mixBlendMode: isClashSide ? "color" : "soft-light" }}
                filter={`url(#${blurCheekId})`}
              />
              {/* Clean sculpted bodice drape inside inner torso bounds (avoids bare arms) */}
              <path
                d={`
                  M ${torsoLeft} 100
                  L ${torsoLeft + 2.5} ${shoulderTop + 2.5}
                  L ${landmarks.chin.x - 8.5} ${shoulderTop}
                  Q ${landmarks.chin.x} ${shoulderTop + 9.2}, ${landmarks.chin.x + 8.5} ${shoulderTop}
                  L ${torsoRight - 2.5} ${shoulderTop + 2.5}
                  L ${torsoRight} 100
                  Z
                `}
                fill={product.swatchHex}
                fillOpacity={0.72}
                style={{ mixBlendMode: "multiply" }}
                filter={`url(#${blurDrapeId})`}
              />
            </>
          )}
        </svg>
      )}

      {/* Apparel Ghost-Mannequin Studio Swatch Inset when awaiting Generative Cloth VTO */}
      {isApparel && product?.garmentImageUrl && !vto?.renderedImageUrl && !isClashSide && (
        <div className="pointer-events-none absolute bottom-12 right-3 z-10 flex items-center gap-2 rounded-xl border border-white/60 bg-white/92 p-1.5 shadow-lg backdrop-blur-md">
          <img
            src={product.garmentImageUrl}
            alt={product.name}
            className="h-14 w-11 rounded-lg object-cover"
          />
          <div className="pr-1.5 text-[10px] leading-tight text-[#171412]">
            <div className="font-telemetry text-[9px] font-semibold uppercase tracking-wider text-[#2F6853]">
              Ref Garment Ready
            </div>
            <div className="max-w-[104px] truncate font-semibold">{product.name}</div>
            <div className="text-[9px] text-[#5F5850]">Run Live Cloth VTO ↑</div>
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
  preservedClashPair,
  primaryVto,
  counterpartVto,
  onTriggerLiveVto,
  isRenderingVto,
}: PortraitVtoCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [thermalLoupe, setThermalLoupe] = useState<boolean>(false);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [wearHorizon, setWearHorizon] = useState<"fresh" | "4h">("fresh");
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Support both live clash inspection AND preserved clash-vs-match visual proof after 1-click swap
  const activeClashProduct =
    verdict.status !== "dermal_verified" && counterpartProduct
      ? primaryProduct
      : preservedClashPair?.clashProduct;
  const activeMatchProduct =
    verdict.status !== "dermal_verified" && counterpartProduct
      ? counterpartProduct
      : preservedClashPair?.matchProduct || primaryProduct;
  const hasClashComparison = Boolean(activeClashProduct && activeMatchProduct);
  const displayedClashRiskPct =
    verdict.status !== "dermal_verified"
      ? verdict.returnRiskPct
      : preservedClashPair?.clashReturnRiskPct ?? 48;

  const updateSplitFromClientX = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(8, Math.min(92, Math.round(pct))));
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSplitPct((p) => Math.max(8, p - 4));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSplitPct((p) => Math.min(92, p + 4));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSplitPct(12);
    } else if (e.key === "End") {
      e.preventDefault();
      setSplitPct(88);
    }
  };

  const severityStroke =
    selectedMetric.severity === "optimal"
      ? "#2F6853"
      : selectedMetric.severity === "mild"
      ? "#B97524"
      : "#C83A3A";

  const moistureVal =
    report.metrics.find((m) => m.action === "moisture")?.rawScore ?? 70;
  const oilVal =
    report.metrics.find((m) => m.action === "oiliness")?.rawScore ?? 70;

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
              aria-pressed={showZones}
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
              aria-pressed={thermalLoupe}
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
          <div className="flex flex-wrap items-center gap-1.5">
            {/* T+0h Fresh vs T+4h Barrier Wear Forecast Toggle */}
            <div
              role="group"
              aria-label="Wear time simulation horizon"
              className="inline-flex rounded-lg border border-[#E5DDD0] bg-[#FAF7F2] p-0.5 font-telemetry text-[10px]"
            >
              <button
                type="button"
                onClick={() => setWearHorizon("fresh")}
                className={`rounded-md px-2 py-0.5 font-medium transition ${
                  wearHorizon === "fresh"
                    ? "bg-white text-[#171412] shadow-2xs"
                    : "text-[#5F5850] hover:text-[#171412]"
                }`}
              >
                T+0h Fresh
              </button>
              <button
                type="button"
                onClick={() => setWearHorizon("4h")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition ${
                  wearHorizon === "4h"
                    ? "bg-[#B85D43] text-white shadow-2xs"
                    : "text-[#5F5850] hover:text-[#171412]"
                }`}
              >
                <Clock className="h-2.5 w-2.5" />
                T+4h Wear
              </button>
            </div>

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
                : `Run Live ${primaryProduct.category === "apparel" ? "Cloth" : "Makeup"} VTO`}
            </button>
          </div>
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

            {/* Remapped Full-Portrait PNG Alpha Mask returned by YouCam Skin Analysis API */}
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
                    <circle
                      cx={spot.x}
                      cy={spot.y}
                      r="0.6"
                      fill="#FFFFFF"
                      stroke={severityStroke}
                      strokeWidth="0.3"
                    />
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
              <div className="rounded-lg border border-white/40 bg-[#171412]/82 px-2.5 py-1 text-[11px] text-white backdrop-blur-md">
                <span className="font-telemetry text-[10px] text-white/70">FITZPATRICK </span>
                <span className="font-semibold">{report.fitzpatrickType}</span>
                {report.itaDegrees !== undefined && (
                  <>
                    <span className="mx-1.5 text-white/30">·</span>
                    <span className="font-telemetry text-[10px] text-[#E6A48E]">
                      ITA° {report.itaDegrees}°
                    </span>
                  </>
                )}
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
                  <div className="text-sm font-semibold text-white">UI {selectedMetric.uiScore}</div>
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
            {/* RIGHT / FULL BASE LAYER: Calibrated Counterpart OR Primary Verified SKU */}
            <div className="absolute inset-0">
              <CosmeticLayer
                portraitUrl={portraitUrl}
                landmarks={landmarks}
                report={report}
                product={activeMatchProduct}
                vto={
                  verdict.status !== "dermal_verified" && counterpartProduct
                    ? counterpartVto
                    : primaryVto
                }
                isClashSide={false}
                wearHorizon={wearHorizon}
                instanceKey={`right-${activeMatchProduct.id}`}
              />
            </div>

            {/* LEFT CLIPPED LAYER: Naive Clash SKU (if clash/preserved) OR Bare Unretouched Skin */}
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
            >
              <CosmeticLayer
                portraitUrl={portraitUrl}
                landmarks={landmarks}
                report={report}
                product={hasClashComparison ? activeClashProduct : undefined}
                vto={
                  verdict.status !== "dermal_verified" && counterpartProduct
                    ? primaryVto
                    : null
                }
                isClashSide={hasClashComparison}
                wearHorizon={wearHorizon}
                instanceKey={`left-${activeClashProduct?.id || "bare"}`}
              />
            </div>

            {/* Vertical Accessible Keyboard + Pointer Split Divider Handle */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Split VTO comparison slider"
              aria-valuemin={8}
              aria-valuemax={92}
              aria-valuenow={splitPct}
              aria-valuetext={`${splitPct}% left comparison view`}
              onKeyDown={handleSliderKeyDown}
              className="absolute bottom-0 top-0 z-20 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.45)] focus:outline-none"
              style={{ left: `${splitPct}%` }}
            >
              <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5DDD0] bg-white text-[#171412] shadow-lg ring-offset-2 focus-within:ring-2 focus-within:ring-[#B85D43]">
                <SplitSquareHorizontal className="h-4 w-4 text-[#B85D43]" />
              </div>
            </div>

            {/* Left & Right Comparison Labels */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[44%] rounded-lg border border-white/30 bg-[#171412]/82 px-2.5 py-1.5 text-[11px] text-white backdrop-blur-md">
              <div className="font-telemetry text-[9px] uppercase tracking-wider text-rose-300">
                {hasClashComparison
                  ? `Clash · ${displayedClashRiskPct}% Return Risk`
                  : "Before VTO"}
              </div>
              <div className="truncate font-medium">
                {hasClashComparison && activeClashProduct
                  ? activeClashProduct.name
                  : "Bare Clinical Portrait"}
              </div>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[44%] rounded-lg border border-emerald-400/40 bg-[#132A22]/88 px-2.5 py-1.5 text-right text-[11px] text-white backdrop-blur-md">
              <div className="inline-flex items-center gap-1 font-telemetry text-[9px] uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-2.5 w-2.5" />
                {hasClashComparison ? "Dermal-Calibrated Match" : "Dermal-Verified VTO"}
              </div>
              <div className="truncate font-medium">{activeMatchProduct.name}</div>
            </div>

            {/* T+4h Barrier Wear Forecast Telemetry Callout */}
            {wearHorizon === "4h" && (
              <div className="pointer-events-none absolute bottom-11 left-3 right-3 z-10 rounded-xl border border-amber-300/60 bg-[#171412]/88 px-3 py-2 text-[11px] text-white backdrop-blur-md">
                <div className="flex items-center justify-between font-telemetry text-[9px] uppercase tracking-wider text-[#E6A48E]">
                  <span>T+4H BARRIER WEAR SIMULATION</span>
                  <span>
                    MOISTURE {moistureVal.toFixed(0)} · SEBUM {oilVal.toFixed(0)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-white/90">
                  {hasClashComparison
                    ? "Left shows 4h matte dehydration creasing, ostia settling & +0.5 shade T-zone oxidation; right preserves ceramide-satin integrity."
                    : "Ceramide & peptide emulsion maintains +94% finish stability at 4 hours without corneocyte flaking."}
                </p>
              </div>
            )}

            {/* Bottom Drag / Keyboard Hint */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/40 bg-[#171412]/78 px-3 py-1 font-telemetry text-[10px] text-white backdrop-blur-md">
              Drag or ←/→ keys ({splitPct}%) · {wearHorizon === "4h" ? "T+4h Wear" : "T+0h Fresh"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
