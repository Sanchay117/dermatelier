"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";
import {
  DERMATELIER_CATALOG,
  getProductById,
  resolveShadeForFitzpatrick,
} from "@/lib/youcam/catalog";
import { evaluateProductCompatibility } from "@/lib/youcam/dermal-engine";
import { STUDIO_PERSONAS } from "@/lib/youcam/presets";
import type { CartAuditResult, SkinAnalysisReport } from "@/lib/youcam/types";

interface MerchantRoiViewProps {
  report: SkinAnalysisReport;
  cartAudit: CartAuditResult;
  onJumpToShopperVto?: (productId: string) => void;
}

export function MerchantRoiView({
  report,
  cartAudit,
  onJumpToShopperVto,
}: MerchantRoiViewProps) {
  const [copied, setCopied] = useState(false);
  const [monthlyOrders, setMonthlyOrders] = useState<number>(25000);
  const [avgOrderValue, setAvgOrderValue] = useState<number>(118);
  const [writeOffPct, setWriteOffPct] = useState<number>(62);

  // Interactive Live Shopify PDP Buy-Box Simulator state
  const [simulatedPdpSkuId, setSimulatedPdpSkuId] = useState<string>(
    "complexion-matte-fluid-105"
  );
  const [pdpAddedToast, setPdpAddedToast] = useState<boolean>(false);

  const baselineReturnRate = 0.442;
  const governedReturnRate = 0.114;
  const reverseLogisticsFactor = writeOffPct / 100;

  const monthlySavedUsd = Math.round(
    monthlyOrders *
      avgOrderValue *
      (baselineReturnRate - governedReturnRate) *
      reverseLogisticsFactor
  );
  const estimatedApiSpendUsd = Math.max(180, Math.round(monthlyOrders * 0.045));
  const roiMultiple = Math.round(monthlySavedUsd / estimatedApiSpendUsd);

  // Dynamically compute SKU × Fitzpatrick II / IV / VI Compatibility Matrix using the real dermal engine
  const dynamicMatrix = useMemo(() => {
    const vtoSkus = DERMATELIER_CATALOG.filter((p) => p.category !== "skincare_active");
    return vtoSkus.map((product) => {
      const cohortScores = STUDIO_PERSONAS.map((persona) => {
        const verdict = evaluateProductCompatibility(
          persona.presetReport,
          product,
          DERMATELIER_CATALOG
        );
        return {
          personaId: persona.id,
          shortName: persona.name.split(" ")[0],
          fitzpatrick: persona.presetReport.fitzpatrickType,
          verdict,
        };
      });

      const activeShopperVerdict = evaluateProductCompatibility(
        report,
        product,
        DERMATELIER_CATALOG
      );
      const counterpart = product.calibratedCounterpartId
        ? getProductById(product.calibratedCounterpartId)
        : undefined;

      return {
        product,
        cohortScores,
        activeShopperVerdict,
        counterpart,
      };
    });
  }, [report]);

  // Simulated Shopify PDP SKU evaluation
  const pdpProduct = useMemo(
    () => getProductById(simulatedPdpSkuId) || DERMATELIER_CATALOG[0],
    [simulatedPdpSkuId]
  );
  const pdpVerdict = useMemo(
    () => evaluateProductCompatibility(report, pdpProduct, DERMATELIER_CATALOG),
    [report, pdpProduct]
  );
  const pdpCounterpart = useMemo(
    () =>
      pdpVerdict.recommendedCounterpartId
        ? getProductById(pdpVerdict.recommendedCounterpartId)
        : undefined,
    [pdpVerdict]
  );
  const pdpCalibratedHex = useMemo(
    () => resolveShadeForFitzpatrick(pdpProduct, report.fitzpatrickType),
    [pdpProduct, report.fitzpatrickType]
  );

  const embedSnippet = `<script
  src="https://cdn.dermatelier.io/youcam-return-shield.v2.js"
  data-merchant-id="shopify_atelier_live"
  data-youcam-services="skin-analysis,makeup-vto,cloth"
  data-barrier-cart-guard="strict"
  async
></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusPill = (
    status: "dermal_verified" | "caution_prep_needed" | "dermal_clash",
    score: number
  ) => {
    if (status === "dermal_verified") {
      return (
        <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-telemetry text-[10px] font-semibold text-emerald-800">
          {score} · Match
        </span>
      );
    }
    if (status === "caution_prep_needed") {
      return (
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-telemetry text-[10px] font-semibold text-amber-800">
          {score} · Prep
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-telemetry text-[10px] font-semibold text-rose-800">
        {score} · Clash
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive ROI Banner + Unit Economics Simulator */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-white p-6 shadow-xs">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDD0] bg-[#FAF7F2] px-3 py-1 font-telemetry text-[11px] font-medium text-[#B85D43]">
              B2B2C RETAIL TELEMETRY · POWERED BY YOUCAM S2S API v2.0
            </div>
            <h2 className="mt-2 font-editorial text-3xl font-semibold text-[#171412]">
              Turn Opened-Cosmetic & Apparel Returns Into Dermal-Verified Conversions
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5F5850]">
              Opened cosmetics cannot be restocked—costing beauty & fashion retailers{" "}
              <strong className="text-[#171412]">{writeOffPct}% of gross item value</strong> per
              return. DermAtelier intercepts mismatched finishes, titanium-ash shade casts, and
              barrier-wrecking active stacks <em>before</em> checkout using Perfect Corp&apos;s
              YouCam Skin AI + Makeup VTO + Clothes VTO suite.
            </p>
          </div>

          {/* Interactive Merchant Unit Economics Controls */}
          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] p-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="font-telemetry text-[10px] font-semibold uppercase tracking-wider text-[#5F5850]">
                Interactive Storefront Economics
              </span>
              <span className="rounded-full bg-[#2F6853]/12 px-2 py-0.5 font-telemetry text-[10px] font-semibold text-[#2F6853]">
                {roiMultiple}× Net API ROI
              </span>
            </div>

            <div className="mt-3 space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between font-telemetry text-[11px] text-[#171412]">
                  <span>Monthly Orders</span>
                  <strong>{monthlyOrders.toLocaleString()}</strong>
                </div>
                <input
                  type="range"
                  min={2500}
                  max={100000}
                  step={2500}
                  value={monthlyOrders}
                  onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                  aria-label="Monthly orders"
                  className="mt-1 w-full accent-[#B85D43]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between font-telemetry text-[11px] text-[#171412]">
                    <span>Avg Order (AOV)</span>
                    <strong>${avgOrderValue}</strong>
                  </div>
                  <input
                    type="range"
                    min={65}
                    max={240}
                    step={5}
                    value={avgOrderValue}
                    onChange={(e) => setAvgOrderValue(Number(e.target.value))}
                    aria-label="Average order value"
                    className="mt-1 w-full accent-[#B85D43]"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-telemetry text-[11px] text-[#171412]">
                    <span>Return Write-Off</span>
                    <strong>{writeOffPct}%</strong>
                  </div>
                  <input
                    type="range"
                    min={35}
                    max={85}
                    step={1}
                    value={writeOffPct}
                    onChange={(e) => setWriteOffPct(Number(e.target.value))}
                    aria-label="Opened return write-off percentage"
                    className="mt-1 w-full accent-[#B85D43]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#E5DDD0] pt-2.5 font-telemetry text-xs">
              <span className="text-[#5F5850]">Preserved Net Margin:</span>
              <strong className="text-sm text-[#2F6853]">
                ${monthlySavedUsd.toLocaleString()}/mo (${Math.round((monthlySavedUsd * 12) / 1000).toLocaleString()}k/yr)
              </strong>
            </div>
          </div>
        </div>

        {/* 4 Core KPI Tiles */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2]/60 p-4">
            <div className="font-telemetry text-[11px] uppercase text-[#5F5850]">
              Category Return Rate
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-editorial text-3xl font-bold text-[#2F6853]">11.4%</span>
              <span className="text-xs text-[#5F5850] line-through">44.2%</span>
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#2F6853]">
              <ArrowDownRight className="h-3.5 w-3.5" />
              74.2% reduction in shade/finish returns
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2]/60 p-4">
            <div className="font-telemetry text-[11px] uppercase text-[#5F5850]">
              PDP-to-Checkout Conversion
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-editorial text-3xl font-bold text-[#171412]">+34.8%</span>
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#2F6853]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Split-VTO & T+4h wear proof removes doubt
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2]/60 p-4">
            <div className="font-telemetry text-[11px] uppercase text-[#5F5850]">
              Barrier-Prep AOV Lift
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-editorial text-3xl font-bold text-[#B85D43]">+$38.40</span>
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#5F5850]">
              <TrendingUp className="h-3.5 w-3.5 text-[#B85D43]" />
              Automated ceramide/azelaic regimen attach
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2]/60 p-4">
            <div className="font-telemetry text-[11px] uppercase text-[#5F5850]">
              Active Session Cart Shield
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-editorial text-3xl font-bold text-[#171412]">
                {cartAudit.barrierSafetyScore}/100
              </span>
              <span className="font-telemetry text-xs text-[#2F6853]">
                (${cartAudit.estimatedSavedReturnUsd.toFixed(0)} saved)
              </span>
            </div>
            <div className="mt-1.5 text-xs text-[#5F5850]">
              Live shopper: {report.subjectName} (Fitz. {report.fitzpatrickType})
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic SKU × Fitzpatrick Cohort Matrix + Live Interactive Shopify Buy-Box Simulator */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT: Live Computed SKU × Fitzpatrick II / IV / VI Dermal Compatibility Matrix */}
        <div className="rounded-2xl border border-[#E5DDD0] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-editorial text-2xl font-semibold text-[#171412]">
                Live SKU × Fitzpatrick II–VI Dermal Telemetry Matrix
              </h3>
              <p className="text-xs text-[#5F5850]">
                Computed live via <code className="font-telemetry text-[11px]">evaluateProductCompatibility()</code>{" "}
                across Fitzpatrick II (Claire), IV (Ananya), VI (Zuri), and active shopper{" "}
                <strong>{report.subjectName}</strong>. Click any row to test in the PDP Buy-Box →
              </p>
            </div>
            <ShieldAlert className="h-5 w-5 shrink-0 text-[#B85D43]" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DDD0] font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
                  <th className="pb-2.5 pr-2">SKU / Product</th>
                  <th className="pb-2.5 px-2">Claire (II)</th>
                  <th className="pb-2.5 px-2">Ananya (IV)</th>
                  <th className="pb-2.5 px-2">Zuri (VI)</th>
                  <th className="pb-2.5 pl-2 text-right">Return Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD0]/70">
                {dynamicMatrix.map(({ product, cohortScores, activeShopperVerdict, counterpart }) => {
                  const isSelectedPdp = product.id === pdpProduct.id;
                  return (
                    <tr
                      key={product.id}
                      onClick={() => {
                        setSimulatedPdpSkuId(product.id);
                        setPdpAddedToast(false);
                      }}
                      className={`cursor-pointer align-middle transition ${
                        isSelectedPdp ? "bg-[#FAF7F2]" : "hover:bg-[#FAF7F2]/50"
                      }`}
                    >
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                            style={{ backgroundColor: product.swatchHex }}
                          />
                          <div>
                            <div className="font-telemetry text-[10px] text-[#B85D43]">
                              {product.sku} ·{" "}
                              {product.category === "apparel" ? "Cloth VTO" : "Makeup VTO"}
                            </div>
                            <div className="font-semibold text-[#171412]">{product.name}</div>
                          </div>
                        </div>
                      </td>
                      {cohortScores.map((c) => (
                        <td key={c.personaId} className="py-2.5 px-2 whitespace-nowrap">
                          {renderStatusPill(c.verdict.status, c.verdict.compatibilityScore)}
                        </td>
                      ))}
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap font-telemetry text-[11px]">
                        {counterpart ? (
                          <span>
                            <span className="text-rose-700 line-through">
                              {activeShopperVerdict.returnRiskPct}%
                            </span>
                            <span className="mx-1 text-[#5F5850]">→</span>
                            <span className="font-semibold text-emerald-800">
                              {counterpart.baselineReturnRatePct}%
                            </span>
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-800">
                            {activeShopperVerdict.returnRiskPct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Live Interactive Storefront PDP Buy-Box Simulator + 1-Line Embed Snippet */}
        <div className="space-y-5 lg:col-span-5">
          {/* Live Interactive Shopify PDP Buy-Box Widget Preview */}
          <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <div>
                <div className="font-telemetry text-[10px] font-semibold uppercase tracking-wider text-[#B85D43]">
                  LIVE SHOPIFY PDP WIDGET SIMULATOR
                </div>
                <h3 className="font-editorial text-xl font-semibold text-[#171412]">
                  Embedded Buy-Box Experience
                </h3>
              </div>
              <span className="rounded-full border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-0.5 font-telemetry text-[10px] text-[#5F5850]">
                {report.subjectName.split(" ")[0]} · Fitz. {report.fitzpatrickType}
              </span>
            </div>

            {/* Simulated Merchant Product Header */}
            <div className="mt-3.5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-11 w-11 shrink-0 rounded-xl border border-black/15 shadow-inner"
                  style={{ backgroundColor: pdpCalibratedHex }}
                />
                <div>
                  <div className="font-telemetry text-[10px] uppercase text-[#5F5850]">
                    {pdpProduct.brand} · {pdpProduct.sku}
                  </div>
                  <div className="text-sm font-semibold text-[#171412]">{pdpProduct.name}</div>
                  <div className="text-[11px] text-[#5F5850]">{pdpProduct.subtitle}</div>
                </div>
              </div>
              <div className="font-editorial text-xl font-bold text-[#171412]">
                ${pdpProduct.priceUsd}
              </div>
            </div>

            {/* Injected DermAtelier Pre-Checkout Widget Badge */}
            <div
              className={`mt-3.5 rounded-xl border p-3.5 text-xs transition ${
                pdpVerdict.status === "dermal_verified"
                  ? "border-emerald-300 bg-emerald-50/55"
                  : pdpVerdict.status === "caution_prep_needed"
                  ? "border-amber-300 bg-amber-50/55"
                  : "border-rose-300 bg-rose-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-telemetry text-[10px] font-semibold uppercase">
                  {pdpVerdict.status === "dermal_verified" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      YouCam Dermal-Verified ({pdpVerdict.compatibilityScore}/100)
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        pdpVerdict.status === "caution_prep_needed"
                          ? "text-amber-900"
                          : "text-rose-900"
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Return Hazard ({pdpVerdict.returnRiskPct}% Risk) · Fit{" "}
                      {pdpVerdict.compatibilityScore}/100
                    </span>
                  )}
                </span>
                <span className="font-telemetry text-[10px] text-[#5F5850]">
                  Shade {pdpCalibratedHex}
                </span>
              </div>

              <p className="mt-1.5 text-[11px] leading-snug text-[#171412]">
                {pdpVerdict.clashReasons[0] || pdpVerdict.positiveSignals[0]}
              </p>

              {pdpCounterpart && pdpVerdict.status !== "dermal_verified" && (
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-white px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="font-telemetry text-[9px] font-semibold uppercase text-emerald-800">
                      1-Click Dermal Counterpart
                    </div>
                    <div className="truncate text-[11px] font-semibold text-[#171412]">
                      {pdpCounterpart.name} (${pdpCounterpart.priceUsd})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSimulatedPdpSkuId(pdpCounterpart.id);
                      setPdpAddedToast(false);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#2F6853] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#171412]"
                  >
                    <Wand2 className="h-3 w-3" />
                    Swap SKU
                  </button>
                </div>
              )}
            </div>

            {/* Simulated Merchant Buy Buttons */}
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPdpAddedToast(true);
                  setTimeout(() => setPdpAddedToast(false), 2200);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#171412] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#2F6853]"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                {pdpAddedToast ? "Verified Order Logged ✓" : `Buy Now · $${pdpProduct.priceUsd}`}
              </button>
              {onJumpToShopperVto && (
                <button
                  type="button"
                  onClick={() => onJumpToShopperVto(pdpProduct.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#171412] bg-[#FAF7F2] px-3 py-2.5 text-xs font-semibold text-[#171412] transition hover:bg-[#E5DDD0]/60"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#B85D43]" />
                  Open in Split-VTO
                </button>
              )}
            </div>
          </div>

          {/* Headless / Shopify 1-Line SDK Snippet */}
          <div className="rounded-2xl border border-[#E5DDD0] bg-[#171412] p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 font-telemetry text-xs text-[#E6A48E]">
                <Code2 className="h-4 w-4" />
                SHOPIFY & HEADLESS SDK DROP-IN
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 font-telemetry text-[11px] text-white transition hover:bg-white/20"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy Snippet"}
              </button>
            </div>

            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-3 font-telemetry text-[11px] leading-relaxed text-emerald-300">
              {embedSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
