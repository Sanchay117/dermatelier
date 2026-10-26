"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
  Zap,
} from "lucide-react";
import { DERMATELIER_CATALOG, getProductById } from "@/lib/youcam/catalog";
import { auditCartFormulations, evaluateProductCompatibility } from "@/lib/youcam/dermal-engine";
import { DEFAULT_LANDMARKS, STUDIO_PERSONAS } from "@/lib/youcam/presets";
import type {
  CatalogProduct,
  ProductCategory,
  SkinAnalysisReport,
  UnitShieldLedger,
  VtoRenderResult,
  YouCamApiTrace,
} from "@/lib/youcam/types";
import { MerchantRoiView } from "./MerchantRoiView";
import { PortraitVtoCanvas } from "./PortraitVtoCanvas";
import { UnitShieldDrawer } from "./UnitShieldDrawer";
import { WebcamCaptureModal } from "./WebcamCaptureModal";

type ActiveTab = "scan" | "vto" | "cart";
type TopPortalMode = "shopper" | "merchant";

export function DermAtelierApp() {
  const [portalMode, setPortalMode] = useState<TopPortalMode>("shopper");
  const [activeTab, setActiveTab] = useState<ActiveTab>("scan");

  // Subject & Skin Report State
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("ananya");
  const [customPortraitUrl, setCustomPortraitUrl] = useState<string | null>(null);
  const [report, setReport] = useState<SkinAnalysisReport>(STUDIO_PERSONAS[0].presetReport);
  const [selectedMetricAction, setSelectedMetricAction] = useState<string>("redness");
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // VTO State
  const [vtoFilter, setVtoFilter] = useState<"all" | "lip" | "complexion" | "apparel">("all");
  const [selectedProductId, setSelectedProductId] = useState<string>(
    STUDIO_PERSONAS[0].defaultNaiveProductId
  );
  const [preservedClashPair, setPreservedClashPair] = useState<{
    clashProduct: CatalogProduct;
    matchProduct: CatalogProduct;
    clashReturnRiskPct: number;
  } | null>(null);
  const [vtoCache, setVtoCache] = useState<Record<string, VtoRenderResult>>({});
  const [isRenderingVto, setIsRenderingVto] = useState<boolean>(false);

  // Accessibility Audio Concierge State (Web Speech API)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Cart & Checkout State (pre-populated with realistic shopper clash items so guardrails shine!)
  const [cartIds, setCartIds] = useState<string[]>([
    "lip-velvet-crimson-902",
    "apparel-chartreuse-polo",
    "skin-retinol-1",
    "skin-glycolic-peel-10",
  ]);
  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);

  // Modals, Ledger & Traces
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [sessionApiKey, setSessionApiKey] = useState<string>("");
  const [ledger, setLedger] = useState<UnitShieldLedger | null>(null);
  const [traces, setTraces] = useState<YouCamApiTrace[]>([STUDIO_PERSONAS[0].presetReport.trace]);
  const [bannerAlert, setBannerAlert] = useState<{ type: "info" | "error"; text: string } | null>(
    null
  );

  // Clean up Web Speech API on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleAudioBriefing = useCallback(
    (narrationText: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setBannerAlert({
          type: "info",
          text: "Browser SpeechSynthesis is unavailable in this environment.",
        });
        return;
      }
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(narrationText);
      utterance.rate = 1.02;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [isSpeaking]
  );

  // Load session API key & fetch initial Unit-Shield ledger
  const refreshLedger = useCallback(
    async (keyOverride?: string) => {
      try {
        const activeKey = keyOverride ?? sessionApiKey;
        const res = await fetch("/api/youcam/ledger", {
          headers: activeKey ? { "x-youcam-api-key": activeKey } : {},
        });
        const data = await res.json();
        if (data.ok && data.ledger) {
          setLedger(data.ledger);
        }
      } catch {
        // Non-blocking ledger refresh
      }
    },
    [sessionApiKey]
  );

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? sessionStorage.getItem("youcam_session_key") || "" : "";
    if (saved) setSessionApiKey(saved);
    refreshLedger(saved);
  }, [refreshLedger]);

  const handleSaveSessionKey = (key: string) => {
    setSessionApiKey(key);
    if (typeof window !== "undefined") {
      if (key) sessionStorage.setItem("youcam_session_key", key);
      else sessionStorage.removeItem("youcam_session_key");
    }
    refreshLedger(key);
  };

  const activePersona = useMemo(
    () => STUDIO_PERSONAS.find((p) => p.id === selectedPersonaId) || STUDIO_PERSONAS[0],
    [selectedPersonaId]
  );

  const portraitUrl = customPortraitUrl || activePersona.portraitUrl;
  const landmarks = customPortraitUrl ? DEFAULT_LANDMARKS : activePersona.landmarks;

  const selectedMetric = useMemo(
    () => report.metrics.find((m) => m.action === selectedMetricAction) || report.metrics[0],
    [report, selectedMetricAction]
  );

  // Switch between the 3 Studio Personas (instant 0-unit load)
  const selectStudioPersona = (personaId: string) => {
    const found = STUDIO_PERSONAS.find((p) => p.id === personaId);
    if (!found) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setCustomPortraitUrl(null);
    setSelectedPersonaId(personaId);
    setReport(found.presetReport);
    setSelectedMetricAction(found.presetReport.metrics[0].action);
    setSelectedProductId(found.defaultNaiveProductId);
    setPreservedClashPair(null);
    setBannerAlert(null);
    setTraces((prev) => [found.presetReport.trace, ...prev].slice(0, 12));
  };

  // Run Live YouCam S2S v2.0 Skin Analysis (1 Unit or 0 Units on SHA-256 Cache Hit)
  const triggerLiveSkinScan = async (overrideDataUrl?: string, overrideLabel?: string) => {
    setIsScanning(true);
    setBannerAlert(null);
    try {
      const payload = overrideDataUrl
        ? { imageDataUrl: overrideDataUrl, subjectName: overrideLabel, forceLive: true }
        : customPortraitUrl
        ? { imageDataUrl: customPortraitUrl, subjectName: report.subjectName, forceLive: true }
        : { personaId: selectedPersonaId, forceLive: true };

      const res = await fetch("/api/youcam/skin-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionApiKey ? { "x-youcam-api-key": sessionApiKey } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setBannerAlert({ type: "error", text: data.error || "Skin analysis failed" });
        return;
      }

      const nextReport = data.report as SkinAnalysisReport;
      setReport(nextReport);
      setSelectedMetricAction(nextReport.metrics[0]?.action || "moisture");
      if (data.ledger) setLedger(data.ledger);
      setTraces((prev) => [nextReport.trace, ...prev].slice(0, 12));

      if (nextReport.mode === "deterministic_cv" || nextReport.mode === "preset_studio") {
        setBannerAlert({
          type: "info",
          text: "Evaluated with local CIE L*a*b* / ITA° CV (0 units). Add YOUCAM_API_KEY in Unit-Shield or .env to execute live S2S v2.0 skin-analysis!",
        });
      } else if (nextReport.mode === "cached_youcam") {
        setBannerAlert({
          type: "info",
          text: "SHA-256 Unit-Shield Cache HIT — Authentic YouCam S2S v2.0 report loaded in <15ms with 0 extra units spent!",
        });
      } else {
        setBannerAlert({
          type: "info",
          text: `Live YouCam S2S v2.0 Skin Analysis complete (task ${nextReport.trace.taskId?.slice(0, 10)}…) · Cached via SHA-256!`,
        });
      }
    } catch (err) {
      setBannerAlert({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Network error contacting /api/youcam/skin-analysis",
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Webcam / File Portrait Capture
  const handleCustomCapture = (dataUrl: string, label: string) => {
    setCustomPortraitUrl(dataUrl);
    setPreservedClashPair(null);
    setVtoCache({});
    setActiveTab("scan");
    triggerLiveSkinScan(dataUrl, label);
  };

  // VTO Catalog & Compatibility Calculations
  const vtoProducts = useMemo(() => {
    return DERMATELIER_CATALOG.filter((p) => {
      if (p.category === "skincare_active") return false;
      if (vtoFilter === "all") return true;
      return p.category === vtoFilter;
    });
  }, [vtoFilter]);

  const primaryProduct: CatalogProduct = useMemo(
    () => getProductById(selectedProductId) || DERMATELIER_CATALOG[0],
    [selectedProductId]
  );

  const primaryVerdict = useMemo(
    () => evaluateProductCompatibility(report, primaryProduct, DERMATELIER_CATALOG),
    [report, primaryProduct]
  );

  const counterpartProduct = useMemo(
    () =>
      primaryVerdict.recommendedCounterpartId
        ? getProductById(primaryVerdict.recommendedCounterpartId)
        : undefined,
    [primaryVerdict]
  );

  const subjectKey = customPortraitUrl ? customPortraitUrl.slice(-24) : selectedPersonaId;
  const primaryVto = vtoCache[`${subjectKey}:${primaryProduct.id}`] || null;
  const counterpartVto = counterpartProduct
    ? vtoCache[`${subjectKey}:${counterpartProduct.id}`] || null
    : preservedClashPair
    ? vtoCache[`${subjectKey}:${preservedClashPair.clashProduct.id}`] || null
    : null;

  // Trigger Live YouCam S2S Makeup VTO or Cloth VTO
  const handleTriggerLiveVto = async () => {
    setIsRenderingVto(true);
    setBannerAlert(null);
    try {
      const res = await fetch("/api/youcam/vto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionApiKey ? { "x-youcam-api-key": sessionApiKey } : {}),
        },
        body: JSON.stringify({
          personaId: customPortraitUrl ? undefined : selectedPersonaId,
          imageDataUrl: customPortraitUrl || undefined,
          productId: primaryProduct.id,
          counterpartProductId:
            primaryVerdict.status !== "dermal_verified" ? counterpartProduct?.id : undefined,
          preferLiveApi: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setBannerAlert({ type: "error", text: data.error || "VTO failed" });
        return;
      }

      const nextCache: Record<string, VtoRenderResult> = {};
      if (data.primaryVto) {
        nextCache[`${subjectKey}:${primaryProduct.id}`] = data.primaryVto;
        setTraces((prev) => [data.primaryVto.trace, ...prev].slice(0, 12));
      }
      if (data.counterpartVto && counterpartProduct) {
        nextCache[`${subjectKey}:${counterpartProduct.id}`] = data.counterpartVto;
        setTraces((prev) => [data.counterpartVto.trace, ...prev].slice(0, 12));
      }
      setVtoCache((prev) => ({ ...prev, ...nextCache }));
      if (data.ledger) setLedger(data.ledger);

      if (data.primaryVto?.mode === "preset_studio") {
        setBannerAlert({
          type: "info",
          text: "Add your YOUCAM_API_KEY in Unit-Shield (top right) or .env to render generative S2S Makeup/Clothes VTO on yce-api-01.makeupar.com!",
        });
        setIsDrawerOpen(true);
      } else {
        setBannerAlert({
          type: "info",
          text: `YouCam ${
            primaryProduct.category === "apparel" ? "AI Clothes" : "AI Makeup"
          } VTO rendered (${data.primaryVto.mode})!`,
        });
      }
    } catch (err) {
      setBannerAlert({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to run VTO",
      });
    } finally {
      setIsRenderingVto(false);
    }
  };

  // Cart Helpers & Formulation Audit
  const cartAudit = useMemo(
    () => auditCartFormulations(report, cartIds, DERMATELIER_CATALOG),
    [report, cartIds]
  );

  const cartProducts = useMemo(
    () =>
      cartIds
        .map((id) => getProductById(id))
        .filter((p): p is CatalogProduct => Boolean(p)),
    [cartIds]
  );

  const addToCart = (id: string) => {
    setCheckoutSuccess(false);
    setCartIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeFromCart = (id: string) => {
    setCheckoutSuccess(false);
    setCartIds((prev) => prev.filter((item) => item !== id));
  };

  const applySmartSwap = (removeId: string, addId: string) => {
    setCheckoutSuccess(false);
    setCartIds((prev) => {
      const filtered = prev.filter((id) => id !== removeId);
      return filtered.includes(addId) ? filtered : [...filtered, addId];
    });
  };

  const resolveAllCartConflicts = () => {
    setCheckoutSuccess(false);
    let updated = [...cartIds];
    for (const conflict of cartAudit.conflicts) {
      updated = updated.filter((id) => id !== conflict.swapRemoveProductId);
      if (!updated.includes(conflict.swapAddProductId)) {
        updated.push(conflict.swapAddProductId);
      }
    }
    if (!updated.includes("skin-ceramide-barrier")) {
      updated.push("skin-ceramide-barrier");
    }
    setCartIds(updated);
  };

  const downloadDermalPassport = () => {
    const passportPayload = {
      passportId: `DA-${report.reportId.slice(-6).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      platform: "DermAtelier × Perfect Corp YouCam S2S v2.0",
      shopperBiometrics: {
        subjectName: report.subjectName,
        fitzpatrickType: report.fitzpatrickType,
        itaDegrees: report.itaDegrees ?? null,
        cieLab: report.cieLab ?? null,
        undertone: report.undertone,
        undertoneLabel: report.undertoneLabel,
        hexSkinTone: report.hexSkinTone,
        barrierIntegrityScore: report.barrierIntegrityScore,
        overallUiScore: report.overallUiScore,
        overallRawScore: report.overallRawScore,
        skinAge: report.skinAge,
      },
      youcamTelemetryTrace: {
        mode: report.mode,
        service: report.trace.service,
        taskId: report.trace.taskId || null,
        cacheKey: report.trace.cacheKey,
        concernsEvaluated: report.metrics.map((m) => ({
          action: m.action,
          uiScore: m.uiScore,
          rawScore: m.rawScore,
          severity: m.severity,
        })),
      },
      verifiedRegimenOrder: {
        barrierSafetyScore: cartAudit.barrierSafetyScore,
        predictedReturnProbabilityPct: cartAudit.estimatedCartReturnRiskPct,
        estimatedReverseLogisticsSavedUsd: cartAudit.estimatedSavedReturnUsd,
        items: cartProducts.map((p) => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          cadenceRole: p.clinicalRole || "vto_wear_now",
          priceUsd: p.priceUsd,
        })),
      },
    };

    const blob = new Blob([JSON.stringify(passportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dermatelier-passport-${report.subjectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cartTotalUsd = cartProducts.reduce((sum, p) => sum + p.priceUsd, 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ======================== STICKY EDITORIAL HEADER ======================== */}
      <header className="sticky top-0 z-30 border-b border-[#E5DDD0] bg-[#FAF7F2]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171412] text-white shadow-xs">
              <Sparkles className="h-4 w-4 text-[#E6A48E]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-editorial text-2xl font-semibold tracking-tight text-[#171412]">
                  DermAtelier
                </span>
                <span className="hidden rounded-full border border-[#E5DDD0] bg-white px-2 py-0.5 font-telemetry text-[10px] font-medium text-[#B85D43] sm:inline-block">
                  YouCam S2S v2.0
                </span>
              </div>
              <p className="text-[11px] text-[#5F5850]">
                Clinical Skin Telemetry × Dermal-Governed Virtual Try-On & Barrier Checkout
              </p>
            </div>
          </div>

          {/* Center Portal Mode Switcher */}
          <div className="flex items-center rounded-xl border border-[#E5DDD0] bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setPortalMode("shopper")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                portalMode === "shopper"
                  ? "bg-[#171412] text-white"
                  : "text-[#5F5850] hover:text-[#171412]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Shopper Atelier
            </button>
            <button
              type="button"
              onClick={() => setPortalMode("merchant")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                portalMode === "merchant"
                  ? "bg-[#171412] text-white"
                  : "text-[#5F5850] hover:text-[#171412]"
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              Merchant Return-Shield ROI
            </button>
          </div>

          {/* Right Unit-Shield & Cart Trigger */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5DDD0] bg-white px-3 py-1.5 text-xs font-medium text-[#171412] shadow-2xs transition hover:border-[#171412]"
            >
              <ShieldCheck className="h-4 w-4 text-[#2F6853]" />
              <span className="font-telemetry text-[11px]">
                {ledger?.unitsRemaining ?? 1000} Units
              </span>
              {(ledger?.unitsSavedByCache ?? 0) > 0 && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-telemetry text-[10px] font-semibold text-emerald-800">
                  +{ledger?.unitsSavedByCache} saved
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setPortalMode("shopper");
                setActiveTab("cart");
              }}
              className="relative inline-flex items-center gap-1.5 rounded-xl bg-[#171412] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#B85D43]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Atelier Bag ({cartIds.length})</span>
              {cartAudit.conflicts.length > 0 && (
                <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 font-telemetry text-[10px] font-bold text-white">
                  {cartAudit.conflicts.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ======================== MAIN CONTENT CONTAINER ======================== */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
        {/* 5-Second Architecture Pipeline Ribbon for Judges & Shoppers */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E5DDD0] bg-white px-4 py-2.5 text-xs shadow-2xs">
          <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FAF7F2] px-2 py-1 text-[#171412]">
              <span
                className={`h-2 w-2 rounded-full ${
                  report.mode === "live_youcam"
                    ? "bg-emerald-600"
                    : report.mode === "cached_youcam"
                    ? "bg-amber-600"
                    : "bg-[#B85D43]"
                }`}
              />
              <strong>① /task/skin-analysis</strong>
              <span className="text-[#5F5850]">
                (14 actions{report.itaDegrees !== undefined ? ` · ITA° ${report.itaDegrees}°` : ""})
              </span>
            </span>
            <span className="text-[#5F5850]">→</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF7F2] px-2 py-1 text-[#171412]">
              <strong>② /task/makeup-vto &amp; /task/cloth</strong>
              <span className="text-[#5F5850]">(Dual-ROI + T+4h Wear)</span>
            </span>
            <span className="text-[#5F5850]">→</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF7F2] px-2 py-1 text-[#171412]">
              <strong>③ Barrier Cart Guard</strong>
              <span
                className={
                  cartAudit.conflicts.length === 0 ? "text-emerald-700" : "text-rose-700"
                }
              >
                ({cartAudit.barrierSafetyScore}/100)
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-1 font-telemetry text-[10px] font-semibold text-[#171412] transition hover:border-[#171412]"
          >
            <Terminal className="h-3 w-3 text-[#B85D43]" />
            Inspect S2S HTTP Trace
          </button>
        </div>

        {bannerAlert && (
          <div
            className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs ${
              bannerAlert.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-[#E5DDD0] bg-white text-[#171412]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 shrink-0 text-[#B85D43]" />
              <span>{bannerAlert.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerAlert(null)}
              className="font-telemetry text-[10px] uppercase text-[#5F5850] hover:text-[#171412]"
            >
              Dismiss
            </button>
          </div>
        )}

        {portalMode === "merchant" ? (
          <MerchantRoiView
            report={report}
            cartAudit={cartAudit}
            onJumpToShopperVto={(productId) => {
              setSelectedProductId(productId);
              setPreservedClashPair(null);
              setPortalMode("shopper");
              setActiveTab("vto");
            }}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* ==================== LEFT COLUMN: CLINICAL PORTRAIT & SPLIT VTO ==================== */}
            <div className="space-y-4 lg:col-span-5">
              {/* Studio Persona & Live Camera Selector */}
              <div className="rounded-2xl border border-[#E5DDD0] bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between px-1 pb-2.5">
                  <span className="font-telemetry text-[10px] font-semibold uppercase tracking-wider text-[#5F5850]">
                    Select Shopper Twin or Live Selfie
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-semibold text-[#171412] transition hover:border-[#171412]"
                  >
                    <Camera className="h-3 w-3 text-[#B85D43]" />
                    Camera / Upload
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {STUDIO_PERSONAS.map((persona) => {
                    const isSelected = !customPortraitUrl && selectedPersonaId === persona.id;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => selectStudioPersona(persona.id)}
                        className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                          isSelected
                            ? "border-[#171412] bg-[#FAF7F2] ring-1 ring-[#171412]"
                            : "border-[#E5DDD0] bg-white hover:bg-[#FAF7F2]/60"
                        }`}
                      >
                        <img
                          src={persona.portraitUrl}
                          alt={persona.name}
                          className="h-10 w-8 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[#171412]">
                            {persona.name.split(" ")[0]}
                          </div>
                          <div className="truncate font-telemetry text-[9px] text-[#5F5850]">
                            Fitz. {persona.presetReport.fitzpatrickType}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Spatial Zone Heatmap & Split VTO Canvas */}
              <PortraitVtoCanvas
                portraitUrl={portraitUrl}
                landmarks={landmarks}
                report={report}
                activeStage={activeTab === "scan" ? "scan" : "vto"}
                selectedMetric={selectedMetric}
                isScanning={isScanning}
                primaryProduct={primaryProduct}
                counterpartProduct={counterpartProduct}
                verdict={primaryVerdict}
                preservedClashPair={preservedClashPair}
                primaryVto={primaryVto}
                counterpartVto={counterpartVto}
                onTriggerLiveVto={handleTriggerLiveVto}
                isRenderingVto={isRenderingVto}
              />

              {/* Live YouCam S2S v2.0 Scan Trigger Card */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5DDD0] bg-white p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-telemetry text-[10px] font-semibold uppercase tracking-wider text-[#B85D43]">
                    <Activity className="h-3 w-3" />
                    Source: {report.mode.replace("_", " ")}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#5F5850]">
                    Dual-ROI 768×906 face crop · SHA-256 cached re-scans cost 0 units
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => triggerLiveSkinScan()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#171412] bg-[#171412] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#B85D43] hover:border-[#B85D43] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
                  {isScanning ? "Scanning…" : "Run Live YouCam Scan"}
                </button>
              </div>
            </div>

            {/* ==================== RIGHT COLUMN: 3-STAGE CLINICAL WORKBENCH ==================== */}
            <div className="space-y-5 lg:col-span-7">
              {/* 3-Step Workflow Stepper */}
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[#E5DDD0] bg-white p-1.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("scan")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    activeTab === "scan"
                      ? "bg-[#171412] text-white"
                      : "text-[#5F5850] hover:bg-[#FAF7F2] hover:text-[#171412]"
                  }`}
                >
                  <span className="font-telemetry text-[10px] opacity-70">01</span>
                  <span>Skin Biometrics</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("vto")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    activeTab === "vto"
                      ? "bg-[#171412] text-white"
                      : "text-[#5F5850] hover:bg-[#FAF7F2] hover:text-[#171412]"
                  }`}
                >
                  <span className="font-telemetry text-[10px] opacity-70">02</span>
                  <span>Dermal-Governed VTO</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("cart")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    activeTab === "cart"
                      ? "bg-[#171412] text-white"
                      : "text-[#5F5850] hover:bg-[#FAF7F2] hover:text-[#171412]"
                  }`}
                >
                  <span className="font-telemetry text-[10px] opacity-70">03</span>
                  <span>Barrier Checkout</span>
                  {cartAudit.conflicts.length > 0 && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.2 font-telemetry text-[10px] text-white">
                      {cartAudit.conflicts.length}
                    </span>
                  )}
                </button>
              </div>

              {/* ===================== TAB 01: CLINICAL SKIN BIOMETRICS ===================== */}
              {activeTab === "scan" && (
                <div className="space-y-5">
                  {/* Clinical Executive Summary Card */}
                  <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-2xs">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5DDD0] pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-telemetry text-[10px] uppercase tracking-wider text-[#B85D43]">
                            YOUCAM SKIN AI · 14 DST_ACTIONS + CIE L*a*b* ITA°
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleAudioBriefing(
                                `Clinical briefing for ${report.subjectName}. Fitzpatrick type ${
                                  report.fitzpatrickType
                                }${
                                  report.itaDegrees !== undefined
                                    ? `, individual typology angle ${report.itaDegrees} degrees`
                                    : ""
                                }. Barrier integrity score ${
                                  report.barrierIntegrityScore
                                } out of 100. ${report.clinicalSummary}`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-0.5 font-telemetry text-[10px] font-medium text-[#171412] transition hover:border-[#171412]"
                          >
                            {isSpeaking ? (
                              <>
                                <VolumeX className="h-3 w-3 text-[#B85D43]" />
                                Stop Audio
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3 text-[#B85D43]" />
                                Audio Briefing
                              </>
                            )}
                          </button>
                        </div>
                        <h2 className="mt-1 font-editorial text-2xl font-semibold text-[#171412] sm:text-3xl">
                          {report.clinicalHeadline}
                        </h2>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] px-3.5 py-2 text-center">
                          <div className="font-telemetry text-[9px] uppercase text-[#5F5850]">
                            UI / RAW CV
                          </div>
                          <div className="font-telemetry text-lg font-bold text-[#171412]">
                            {report.overallUiScore}
                            <span className="text-xs font-normal text-[#B85D43]">
                              {" "}
                              / {report.overallRawScore}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] px-3.5 py-2 text-center">
                          <div className="font-telemetry text-[9px] uppercase text-[#5F5850]">
                            Barrier Shield
                          </div>
                          <div
                            className={`font-telemetry text-lg font-bold ${
                              report.barrierIntegrityScore >= 72
                                ? "text-[#2F6853]"
                                : "text-[#B97524]"
                            }`}
                          >
                            {report.barrierIntegrityScore}/100
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3.5 text-sm leading-relaxed text-[#5F5850]">
                      {report.clinicalSummary}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF7F2] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className="h-4 w-4 rounded-full border border-black/15 shadow-2xs"
                          style={{ backgroundColor: report.hexSkinTone }}
                        />
                        <span className="font-medium text-[#171412]">{report.undertoneLabel}</span>
                        <span className="font-telemetry text-[11px] text-[#5F5850]">
                          · {report.itaDegrees !== undefined ? `ITA° ${report.itaDegrees}° · ` : ""}
                          Melanin {report.melaninIndex} · Erythema {report.erythemaIndex}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveTab("vto")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#171412] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#B85D43]"
                      >
                        Launch Dermal-Governed VTO
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Interactive 14-Metric Matrix */}
                  <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-editorial text-xl font-semibold text-[#171412]">
                          Localized 14-Concern Telemetry Matrix
                        </h3>
                        <p className="text-xs text-[#5F5850]">
                          Click any parameter to inspect its remapped YouCam mask &amp; VTO finish
                          impact on the portrait
                        </p>
                      </div>
                      <span className="font-telemetry text-[10px] text-[#5F5850]">
                        Dual UI + RAW CV Scores
                      </span>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {report.metrics.map((m) => {
                        const isActive = m.action === selectedMetric.action;
                        const barColor =
                          m.rawScore >= 78
                            ? "bg-[#2F6853]"
                            : m.rawScore >= 64
                            ? "bg-[#B97524]"
                            : "bg-[#B85D43]";

                        return (
                          <button
                            key={m.action}
                            type="button"
                            onClick={() => setSelectedMetricAction(m.action)}
                            className={`rounded-xl border p-3 text-left transition ${
                              isActive
                                ? "border-[#171412] bg-[#FAF7F2] ring-1 ring-[#171412]"
                                : "border-[#E5DDD0] bg-white hover:border-[#B85D43]/50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#171412]">
                                {m.label}
                              </span>
                              <div className="font-telemetry text-[11px]">
                                <span className="font-semibold text-[#171412]">UI {m.uiScore}</span>
                                <span className="mx-1 text-[#5F5850]">·</span>
                                <span className="text-[#5F5850]">RAW {m.rawScore.toFixed(1)}</span>
                              </div>
                            </div>

                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5DDD0]/70">
                              <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{ width: `${Math.min(100, Math.max(12, m.rawScore))}%` }}
                              />
                            </div>

                            <div className="mt-1.5 flex items-center justify-between font-telemetry text-[10px] text-[#5F5850]">
                              <span className="truncate">{m.primaryZone}</span>
                              <span className="uppercase">{m.action}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== TAB 02: DERMAL-GOVERNED VTO STUDIO ===================== */}
              {activeTab === "vto" && (
                <div className="space-y-5">
                  {/* Live 3-Tier Dermal Compatibility Verdict Card */}
                  <div
                    className={`rounded-2xl border p-5 shadow-2xs ${
                      primaryVerdict.status === "dermal_verified"
                        ? "border-emerald-300 bg-emerald-50/40"
                        : primaryVerdict.status === "caution_prep_needed"
                        ? "border-amber-300 bg-amber-50/45"
                        : "border-rose-300 bg-rose-50/35"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 font-telemetry text-[10px] font-semibold uppercase tracking-wider">
                            {primaryVerdict.status === "dermal_verified" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                DERMAL-VERIFIED FOR {report.subjectName.toUpperCase()}
                              </span>
                            ) : primaryVerdict.status === "caution_prep_needed" ? (
                              <span className="inline-flex items-center gap-1 text-amber-900">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                BARRIER PREP RECOMMENDED BEFORE WEAR
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-800">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                PRE-CHECKOUT RETURN HAZARD INTERCEPTED
                              </span>
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              toggleAudioBriefing(
                                `${primaryProduct.name}. Compatibility score ${
                                  primaryVerdict.compatibilityScore
                                } out of 100, estimated return risk ${
                                  primaryVerdict.returnRiskPct
                                } percent. ${primaryVerdict.headline}. ${
                                  primaryVerdict.clashReasons[0] ||
                                  primaryVerdict.positiveSignals[0] ||
                                  ""
                                }`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-white/85 px-2 py-0.5 font-telemetry text-[10px] font-medium text-[#171412] hover:bg-white"
                          >
                            {isSpeaking ? (
                              <>
                                <VolumeX className="h-3 w-3 text-[#B85D43]" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3 text-[#B85D43]" />
                                Speak Verdict
                              </>
                            )}
                          </button>
                        </div>

                        <h3 className="mt-1 font-editorial text-2xl font-semibold text-[#171412]">
                          {primaryVerdict.headline}
                        </h3>
                      </div>

                      <div className="rounded-xl border border-black/10 bg-white px-3.5 py-2 text-right">
                        <div className="font-telemetry text-[10px] uppercase text-[#5F5850]">
                          Compatibility
                        </div>
                        <div className="font-telemetry text-xl font-bold text-[#171412]">
                          {primaryVerdict.compatibilityScore}/100
                        </div>
                      </div>
                    </div>

                    {/* Physics Diagnostics */}
                    <div className="mt-3 space-y-1.5 text-xs">
                      {primaryVerdict.clashReasons.map((reason, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 ${
                            primaryVerdict.status === "caution_prep_needed"
                              ? "text-amber-950"
                              : "text-rose-900"
                          }`}
                        >
                          <span
                            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                              primaryVerdict.status === "caution_prep_needed"
                                ? "bg-amber-600"
                                : "bg-rose-600"
                            }`}
                          />
                          <span>{reason}</span>
                        </div>
                      ))}
                      {primaryVerdict.positiveSignals.map((sig, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-emerald-900">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                          <span>{sig}</span>
                        </div>
                      ))}
                    </div>

                    {/* 1-Click Counterpart Upgrade Strip */}
                    {counterpartProduct && primaryVerdict.status !== "dermal_verified" ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-white p-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-9 w-9 shrink-0 rounded-lg border border-black/10 shadow-inner"
                            style={{ backgroundColor: counterpartProduct.swatchHex }}
                          />
                          <div>
                            <div className="font-telemetry text-[10px] font-semibold uppercase text-emerald-800">
                              Calibrated Match Shown on Right Side of Split Slider →
                            </div>
                            <div className="text-xs font-semibold text-[#171412]">
                              {counterpartProduct.name} · ${counterpartProduct.priceUsd} (
                              {counterpartProduct.baselineReturnRatePct}% return risk)
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setPreservedClashPair({
                              clashProduct: primaryProduct,
                              matchProduct: counterpartProduct,
                              clashReturnRiskPct: primaryVerdict.returnRiskPct,
                            });
                            setSelectedProductId(counterpartProduct.id);
                            applySmartSwap(primaryProduct.id, counterpartProduct.id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#2F6853] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#171412]"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Switch &amp; Add Dermal Match
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5F5850]">
                          <span>
                            Harmonized with Fitzpatrick {report.fitzpatrickType} &amp; Barrier{" "}
                            {report.barrierIntegrityScore}/100
                          </span>
                          {preservedClashPair && (
                            <button
                              type="button"
                              onClick={() => setPreservedClashPair(null)}
                              className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-telemetry text-[10px] font-medium text-emerald-800 hover:bg-emerald-50"
                            >
                              Comparing vs. {preservedClashPair.clashProduct.name.split(" ")[0]} (Reset)
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(primaryProduct.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#171412] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#B85D43]"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {cartIds.includes(primaryProduct.id)
                            ? "In Atelier Bag ✓"
                            : `Add Verified SKU ($${primaryProduct.priceUsd})`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* VTO Category Filter + Catalog Cards */}
                  <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-2xs">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["all", "All VTO SKUs"],
                            ["lip", "Lip Couture (Makeup VTO)"],
                            ["complexion", "Complexion (Makeup VTO)"],
                            ["apparel", "Apparel Drape (Cloth VTO)"],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setVtoFilter(key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              vtoFilter === key
                                ? "bg-[#171412] text-white"
                                : "bg-[#FAF7F2] text-[#5F5850] hover:text-[#171412]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {vtoProducts.map((product) => {
                        const v = evaluateProductCompatibility(
                          report,
                          product,
                          DERMATELIER_CATALOG
                        );
                        const isSelected = product.id === primaryProduct.id;
                        const inBag = cartIds.includes(product.id);

                        return (
                          <div
                            key={product.id}
                            onClick={() => {
                              setPreservedClashPair(null);
                              setSelectedProductId(product.id);
                            }}
                            className={`cursor-pointer rounded-xl border p-3.5 transition ${
                              isSelected
                                ? "border-[#171412] bg-[#FAF7F2] ring-1 ring-[#171412]"
                                : "border-[#E5DDD0] bg-white hover:border-[#B85D43]/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-center gap-2.5">
                                {product.garmentImageUrl ? (
                                  <img
                                    src={product.garmentImageUrl}
                                    alt={product.name}
                                    className="h-11 w-9 rounded-lg border border-black/10 object-cover"
                                  />
                                ) : (
                                  <span
                                    className="h-10 w-10 shrink-0 rounded-xl border border-black/10 shadow-inner"
                                    style={{ backgroundColor: product.swatchHex }}
                                  />
                                )}
                                <div>
                                  <div className="font-telemetry text-[10px] uppercase text-[#5F5850]">
                                    {product.brand} · {product.sku}
                                  </div>
                                  <div className="text-xs font-semibold text-[#171412]">
                                    {product.name}
                                  </div>
                                </div>
                              </div>
                              <span className="font-telemetry text-xs font-semibold text-[#171412]">
                                ${product.priceUsd}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] leading-snug text-[#5F5850]">
                              {product.subtitle}
                            </p>

                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E5DDD0]/70 pt-2.5">
                              <span
                                className={`rounded-md px-2 py-0.5 font-telemetry text-[10px] font-semibold ${
                                  v.status === "dermal_verified"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : v.status === "caution_prep_needed"
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-rose-50 text-rose-800"
                                }`}
                              >
                                {v.status === "dermal_verified"
                                  ? `${v.compatibilityScore}% Dermal Match`
                                  : v.status === "caution_prep_needed"
                                  ? `Prep Needed · ${v.returnRiskPct}% Risk`
                                  : `Clash · ${v.returnRiskPct}% Return Risk`}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCart(product.id);
                                }}
                                className="font-telemetry text-[11px] font-semibold text-[#171412] hover:text-[#B85D43]"
                              >
                                {inBag ? "In Bag ✓" : "+ Add"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== TAB 03: BARRIER-SAFE REGIMEN & CHECKOUT ===================== */}
              {activeTab === "cart" && (
                <div className="space-y-5">
                  {/* Biochemical & Dermal Audit Header */}
                  <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 font-telemetry text-[10px] font-semibold uppercase tracking-wider text-[#B85D43]">
                          <FlaskConical className="h-3.5 w-3.5" />
                          PRE-CHECKOUT BIOCHEMICAL &amp; VTO FORMULATION AUDIT
                        </div>
                        <h2 className="mt-1 font-editorial text-2xl font-semibold text-[#171412]">
                          {cartAudit.conflicts.length === 0
                            ? "100% Barrier-Verified Regimen & VTO Bag"
                            : `${cartAudit.conflicts.length} Dermal / Formulation Collisions Intercepted`}
                        </h2>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] px-3.5 py-2 text-center">
                          <div className="font-telemetry text-[9px] uppercase text-[#5F5850]">
                            Cart Safety
                          </div>
                          <div
                            className={`font-telemetry text-lg font-bold ${
                              cartAudit.barrierSafetyScore >= 80
                                ? "text-[#2F6853]"
                                : "text-rose-700"
                            }`}
                          >
                            {cartAudit.barrierSafetyScore}/100
                          </div>
                        </div>

                        <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] px-3.5 py-2 text-center">
                          <div className="font-telemetry text-[9px] uppercase text-[#5F5850]">
                            Return Risk
                          </div>
                          <div
                            className={`font-telemetry text-lg font-bold ${
                              cartAudit.estimatedCartReturnRiskPct <= 16
                                ? "text-[#2F6853]"
                                : "text-rose-700"
                            }`}
                          >
                            {cartAudit.estimatedCartReturnRiskPct}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Conflict Cards + 1-Click Auto-Calibrate */}
                    {cartAudit.conflicts.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-950">
                          <span className="font-medium">
                            Auto-replace clashing actives &amp; VTO shades for{" "}
                            {report.subjectName}&apos;s skin profile:
                          </span>
                          <button
                            type="button"
                            onClick={resolveAllCartConflicts}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#171412] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2F6853]"
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            1-Click Calibrate Entire Bag
                          </button>
                        </div>

                        {cartAudit.conflicts.map((conflict) => (
                          <div
                            key={conflict.id}
                            className="rounded-xl border border-rose-200 bg-[#FAF7F2]/80 p-3.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="text-xs font-semibold text-rose-900">
                                {conflict.title}
                              </div>
                              {conflict.dermalTrigger && (
                                <span className="rounded bg-rose-100 px-2 py-0.5 font-telemetry text-[10px] text-rose-900">
                                  {conflict.dermalTrigger}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-[#5F5850]">
                              {conflict.mechanism}
                            </p>
                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5DDD0] pt-2">
                              <span className="text-[11px] font-medium text-[#2F6853]">
                                Fix: {conflict.resolutionText}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  applySmartSwap(
                                    conflict.swapRemoveProductId,
                                    conflict.swapAddProductId
                                  )
                                }
                                className="rounded-lg border border-[#2F6853] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2F6853] transition hover:bg-[#2F6853] hover:text-white"
                              >
                                Apply Smart Swap
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span>
                          Zero pH/retinoid collisions or VTO undertone clashes! Estimated
                          reverse-logistics savings on this order:{" "}
                          <strong>${cartAudit.estimatedSavedReturnUsd.toFixed(2)}</strong>.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sequenced AM / PM / Wear-Now Clinical Bag */}
                  <div className="rounded-2xl border border-[#E5DDD0] bg-white p-5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DDD0] pb-3">
                      <h3 className="font-editorial text-xl font-semibold text-[#171412]">
                        Atelier Bag &amp; AM/PM Sequenced Protocol ({cartProducts.length} items)
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            "skin-ceramide-barrier",
                            "skin-niacinamide-zinc",
                            "skin-azelaic-centella",
                          ] as const
                        ).map((rxId) => {
                          if (cartIds.includes(rxId)) return null;
                          const rx = getProductById(rxId);
                          if (!rx) return null;
                          return (
                            <button
                              key={rxId}
                              type="button"
                              onClick={() => addToCart(rxId)}
                              className="rounded-lg border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-medium text-[#171412] hover:border-[#171412]"
                            >
                              + {rx.name.split(" ")[0]} Prep
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 divide-y divide-[#E5DDD0]/70">
                      {cartProducts.map((item) => {
                        const v = evaluateProductCompatibility(report, item, DERMATELIER_CATALOG);
                        const protocolTag =
                          item.clinicalRole === "am_protect"
                            ? "AM PROTECT"
                            : item.clinicalRole === "pm_renew"
                            ? "PM RENEW"
                            : item.clinicalRole === "am_pm_barrier"
                            ? "AM + PM BARRIER PREP"
                            : ("VTO WEAR NOW" as ProductCategory | string);

                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="h-9 w-9 shrink-0 rounded-lg border border-black/10"
                                style={{ backgroundColor: item.swatchHex }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="rounded border border-[#E5DDD0] bg-[#FAF7F2] px-1.5 py-0.5 font-telemetry text-[9px] font-semibold text-[#5F5850]">
                                    {protocolTag}
                                  </span>
                                  <span
                                    className={`font-telemetry text-[10px] font-medium ${
                                      v.status === "dermal_verified"
                                        ? "text-emerald-700"
                                        : v.status === "caution_prep_needed"
                                        ? "text-amber-700"
                                        : "text-rose-700"
                                    }`}
                                  >
                                    {v.compatibilityScore}/100 Fit
                                  </span>
                                </div>
                                <div className="mt-0.5 truncate text-xs font-semibold text-[#171412]">
                                  {item.name}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                              <span className="font-telemetry text-xs font-semibold text-[#171412]">
                                ${item.priceUsd}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.id)}
                                aria-label={`Remove ${item.name}`}
                                className="rounded-lg p-1 text-[#5F5850] hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Checkout Footer */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#FAF7F2] p-4">
                      <div>
                        <div className="font-telemetry text-[10px] uppercase text-[#5F5850]">
                          Dermal-Verified Order Total
                        </div>
                        <div className="font-editorial text-2xl font-bold text-[#171412]">
                          ${cartTotalUsd.toFixed(2)}{" "}
                          <span className="font-sans text-xs font-normal text-[#2F6853]">
                            · Includes AM/PM Personalized Regimen Passport
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={cartProducts.length === 0}
                        onClick={() => setCheckoutSuccess(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#171412] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#2F6853] disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                        Complete Dermal-Verified Checkout
                      </button>
                    </div>

                    {checkoutSuccess && (
                      <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">
                              Order Confirmed · Dermal Telemetry Passport Attached (#DA-
                              {report.reportId.slice(-6).toUpperCase()})
                            </div>
                            <p className="mt-1 text-emerald-900/85">
                              {report.subjectName}&apos;s YouCam Skin AI profile (Fitzpatrick{" "}
                              {report.fitzpatrickType}
                              {report.itaDegrees !== undefined
                                ? `, ITA° ${report.itaDegrees}°`
                                : ""}
                              , Barrier {report.barrierIntegrityScore}/100) and AM/PM cadence are
                              bound to this order—cutting predicted return risk to{" "}
                              {cartAudit.estimatedCartReturnRiskPct}%.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={downloadDermalPassport}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-700 bg-white px-3 py-2 font-telemetry text-[11px] font-semibold text-emerald-900 transition hover:bg-emerald-800 hover:text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download Telemetry Passport (.json)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals & Drawers */}
      <WebcamCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCaptureDataUrl={handleCustomCapture}
      />

      <UnitShieldDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        ledger={ledger}
        latestTraces={traces}
        sessionApiKey={sessionApiKey}
        onSaveSessionApiKey={handleSaveSessionKey}
      />
    </div>
  );
}
