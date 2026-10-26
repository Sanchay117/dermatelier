"use client";

import React, { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Code2, Copy, ShieldAlert, TrendingUp } from "lucide-react";
import { DERMATELIER_CATALOG } from "@/lib/youcam/catalog";
import type { CartAuditResult, SkinAnalysisReport } from "@/lib/youcam/types";

interface MerchantRoiViewProps {
  report: SkinAnalysisReport;
  cartAudit: CartAuditResult;
}

const SKU_RETURN_HEATMAP = [
  {
    sku: "DA-CMP-105",
    name: "24H Clay Matte Foundation",
    naiveReturnPct: 54,
    governedReturnPct: 12,
    triggerMetric: "YouCam moisture < 62 & pore < 66",
    actionTaken: "Auto-routes dehydrated shoppers to Ceramide Serum Skin Tint (DA-CMP-210)",
  },
  {
    sku: "DA-LIP-902",
    name: "Ultra-Matte Blue-Crimson #902",
    naiveReturnPct: 48,
    governedReturnPct: 9,
    triggerMetric: "YouCam redness < 65 & warm_olive undertone",
    actionTaken: "Renders Split-VTO proof & swaps to Peptide Satin Rosewood #408",
  },
  {
    sku: "DA-APP-701",
    name: "Acidic Chartreuse Ribbed Polo",
    naiveReturnPct: 49,
    governedReturnPct: 13,
    triggerMetric: "Simultaneous yellow-green erythema contrast",
    actionTaken: "Executes `/s2s/v2.0/task/cloth` swap to Emerald-Pine Mulberry Silk",
  },
  {
    sku: "DA-RX-305",
    name: "10% Glycolic + 2% BHA Peel",
    naiveReturnPct: 41,
    governedReturnPct: 8,
    triggerMetric: "Co-carted with 1.0% Retinol on barrier < 66",
    actionTaken: "Blocks chemical strip collision; swaps to pH 5.5 Niacinamide + Azelaic",
  },
];

export function MerchantRoiView({ report, cartAudit }: MerchantRoiViewProps) {
  const [copied, setCopied] = useState(false);
  const [monthlyOrders, setMonthlyOrders] = useState<number>(25000);

  const avgOrderValue = 118;
  const baselineReturnRate = 0.442;
  const governedReturnRate = 0.114;
  const reverseLogisticsFactor = 0.62; // % of item value lost in opened beauty/apparel returns

  const monthlySavedUsd = Math.round(
    monthlyOrders *
      avgOrderValue *
      (baselineReturnRate - governedReturnRate) *
      reverseLogisticsFactor
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

  return (
    <div className="space-y-6">
      {/* Executive ROI Banner */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDD0] bg-[#FAF7F2] px-3 py-1 font-telemetry text-[11px] font-medium text-[#B85D43]">
              B2B2C RETAIL TELEMETRY · POWERED BY YOUCAM S2S API v2.0
            </div>
            <h2 className="mt-2 font-editorial text-3xl font-semibold text-[#171412]">
              Turn Opened-Cosmetic & Apparel Returns Into Dermal-Verified Conversions
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5F5850]">
              Opened cosmetics cannot be restocked—costing beauty & fashion retailers{" "}
              <strong className="text-[#171412]">62% of gross item value</strong> per return.
              DermAtelier intercepts mismatched finishes, undertones, and barrier-wrecking active
              stacks <em>before</em> checkout using Perfect Corp&apos;s YouCam Skin AI + VTO suite.
            </p>
          </div>

          <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] p-4">
            <label className="block font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
              Storefront Monthly Orders: {monthlyOrders.toLocaleString()}
            </label>
            <input
              type="range"
              min={2500}
              max={100000}
              step={2500}
              value={monthlyOrders}
              onChange={(e) => setMonthlyOrders(Number(e.target.value))}
              className="mt-2 w-56 accent-[#B85D43]"
            />
            <div className="mt-1 font-telemetry text-xs text-[#2F6853]">
              Est. Net Margin Preserved: <strong>${monthlySavedUsd.toLocaleString()}/mo</strong>
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
              Split-VTO visual proof eliminates hesitation
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
              Automated ceramide/niacinamide regimen attach
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
              Live shopper: {report.subjectName} (Fitzpatrick {report.fitzpatrickType})
            </div>
          </div>
        </div>
      </div>

      {/* SKU × YouCam Diagnostic Return Matrix + 1-Line Shopify Embed */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-[#E5DDD0] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-editorial text-2xl font-semibold text-[#171412]">
                SKU × YouCam Dermal Clash Matrix
              </h3>
              <p className="text-xs text-[#5F5850]">
                Pinpoints exact biological triggers driving post-purchase dissatisfaction across{" "}
                {DERMATELIER_CATALOG.length} active catalog SKUs
              </p>
            </div>
            <ShieldAlert className="h-5 w-5 text-[#B85D43]" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DDD0] font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
                  <th className="pb-2.5 pr-3">SKU / Product</th>
                  <th className="pb-2.5 px-3">YouCam Trigger</th>
                  <th className="pb-2.5 px-3">Return Drop</th>
                  <th className="pb-2.5 pl-3">Automated Guardrail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD0]/70">
                {SKU_RETURN_HEATMAP.map((row) => (
                  <tr key={row.sku} className="align-top">
                    <td className="py-3 pr-3">
                      <div className="font-telemetry text-[10px] text-[#B85D43]">{row.sku}</div>
                      <div className="font-medium text-[#171412]">{row.name}</div>
                    </td>
                    <td className="py-3 px-3 font-telemetry text-[11px] text-[#5F5850]">
                      {row.triggerMetric}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="text-rose-700 line-through">{row.naiveReturnPct}%</span>
                      <span className="mx-1 text-[#5F5850]">→</span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-telemetry font-semibold text-emerald-800">
                        {row.governedReturnPct}%
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-[#5F5850]">{row.actionTaken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Headless / Shopify 1-Line PDP Widget Embed */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5DDD0] bg-[#171412] p-6 text-white lg:col-span-5">
          <div>
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

            <h3 className="mt-2 font-editorial text-2xl font-semibold">
              Deploy on Any Product Detail Page in 60 Seconds
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              Injects the Dermal Pre-Flight badge onto beauty & apparel PDPs while routing all API
              keys through the server-side SHA-256 Unit-Shield proxy.
            </p>

            <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-3.5 font-telemetry text-[11px] leading-relaxed text-emerald-300">
              {embedSnippet}
            </pre>
          </div>

          <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.06] p-3.5">
            <div className="font-telemetry text-[10px] uppercase tracking-wider text-white/60">
              Live Merchant Telemetry Endpoint Architecture
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-center font-telemetry text-[10px]">
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[#E6A48E]">/skin-analysis</div>
                <div className="mt-0.5 text-white/75">14 dst_actions</div>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[#E6A48E]">/makeup-vto</div>
                <div className="mt-0.5 text-white/75">Finish-Calibrated</div>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[#E6A48E]">/task/cloth</div>
                <div className="mt-0.5 text-white/75">Undertone Drape</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
