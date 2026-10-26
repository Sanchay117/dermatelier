"use client";

import React, { useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, Terminal, X } from "lucide-react";
import type { UnitShieldLedger, YouCamApiTrace } from "@/lib/youcam/types";

interface UnitShieldDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: UnitShieldLedger | null;
  latestTraces: YouCamApiTrace[];
  sessionApiKey: string;
  onSaveSessionApiKey: (key: string) => void;
}

export function UnitShieldDrawer({
  isOpen,
  onClose,
  ledger,
  latestTraces,
  sessionApiKey,
  onSaveSessionApiKey,
}: UnitShieldDrawerProps) {
  const [draftKey, setDraftKey] = useState(sessionApiKey);
  const [savedToast, setSavedToast] = useState(false);

  if (!isOpen) return null;

  const totalUnits = ledger?.totalRedeemedUnits ?? 1000;
  const usedUnits = ledger?.unitsUsed ?? 0;
  const savedUnits = ledger?.unitsSavedByCache ?? 0;
  const remainingUnits = ledger?.unitsRemaining ?? totalUnits;
  const keyActive = Boolean(ledger?.apiKeyConfigured || sessionApiKey.trim().length > 8);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSessionApiKey(draftKey.trim());
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-[#E5DDD0] bg-[#FAF7F2] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DDD0] bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171412] text-white">
              <ShieldCheck className="h-4 w-4 text-[#E6A48E]" />
            </div>
            <div>
              <h3 className="font-editorial text-xl font-semibold text-[#171412]">
                YouCam 1,000-Unit Shield & S2S Inspector
              </h3>
              <p className="font-telemetry text-[11px] text-[#5F5850]">
                yce-api-01.makeupar.com · SHA-256 Deduplication Vault
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#5F5850] hover:bg-[#F3EDE3] hover:text-[#171412]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* 1,000-Unit Balance Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#E5DDD0] bg-white p-3.5">
              <div className="font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
                Units Remaining
              </div>
              <div className="mt-1 font-telemetry text-2xl font-semibold text-[#171412]">
                {remainingUnits}
                <span className="text-xs font-normal text-[#5F5850]"> / {totalUnits}</span>
              </div>
              <div className="mt-1 text-[11px] text-[#2F6853]">
                Cap: {ledger?.maxBudgetUnits ?? 150} session max
              </div>
            </div>

            <div className="rounded-xl border border-[#E5DDD0] bg-white p-3.5">
              <div className="font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
                Live Units Spent
              </div>
              <div className="mt-1 font-telemetry text-2xl font-semibold text-[#B85D43]">
                {usedUnits}
              </div>
              <div className="mt-1 text-[11px] text-[#5F5850]">
                {ledger?.liveApiCalls ?? 0} S2S v2.0 tasks
              </div>
            </div>

            <div className="rounded-xl border border-[#E5DDD0] bg-white p-3.5">
              <div className="font-telemetry text-[10px] uppercase tracking-wider text-[#5F5850]">
                Saved by SHA-256
              </div>
              <div className="mt-1 font-telemetry text-2xl font-semibold text-[#2F6853]">
                +{savedUnits}
              </div>
              <div className="mt-1 text-[11px] text-[#5F5850]">
                {ledger?.cacheHits ?? 0} zero-cost hits
              </div>
            </div>
          </div>

          {/* API Key Input / Status */}
          <form onSubmit={handleSave} className="rounded-xl border border-[#E5DDD0] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#171412]">
                <KeyRound className="h-3.5 w-3.5 text-[#B85D43]" />
                YouCam Bearer API Key (`YOUCAM_API_KEY`)
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 font-telemetry text-[10px] font-medium ${
                  keyActive
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {ledger?.apiKeyConfigured
                  ? "Loaded from .env"
                  : sessionApiKey.trim().length > 8
                  ? "Active in Session Header"
                  : "Studio Preset Mode (0 Units)"}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5F5850]">
              Set <code className="rounded bg-[#F3EDE3] px-1 py-0.5 text-[11px]">YOUCAM_API_KEY</code> in{" "}
              <code className="rounded bg-[#F3EDE3] px-1 py-0.5 text-[11px]">.env</code> or paste your
              redeemed key below to execute live <code className="text-[11px]">/s2s/v2.0/task/*</code> calls.
              Every result + S3 mask is persisted locally by SHA-256 so repeated runs cost 0 units.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={
                  ledger?.apiKeyConfigured
                    ? "Configured in server .env (optional override)…"
                    : "Paste Bearer API key from yce.makeupar.com…"
                }
                className="flex-1 rounded-lg border border-[#E5DDD0] bg-[#FAF7F2] px-3 py-2 font-telemetry text-xs text-[#171412] outline-none focus:border-[#171412]"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#171412] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#B85D43]"
              >
                {savedToast ? "Saved!" : "Apply Key"}
              </button>
            </div>
          </form>

          {/* Live S2S v2.0 Step-by-Step Protocol Trace */}
          <div className="rounded-xl border border-[#E5DDD0] bg-[#171412] p-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2 font-telemetry text-xs font-semibold">
                <Terminal className="h-3.5 w-3.5 text-[#E6A48E]" />
                YouCam S2S v2.0 Asynchronous Task Trace
              </div>
              <span className="font-telemetry text-[10px] text-white/55">
                File API → Presigned PUT → Task → Poll
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {latestTraces.map((trace) => (
                <div
                  key={trace.traceId}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-3 font-telemetry text-[11px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#E6A48E]">
                      {trace.service.toUpperCase()} · {trace.mode}
                    </span>
                    <span className="text-[10px] text-white/65">
                      {trace.unitsConsumed} unit(s) · {trace.totalDurationMs}ms
                    </span>
                  </div>
                  {trace.taskId && (
                    <div className="mt-1 truncate text-[10px] text-white/55">
                      task_id: {trace.taskId}
                    </div>
                  )}
                  <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                    {trace.steps.map((step, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[10px]">
                        <div className="truncate text-white/85">
                          <span className="mr-1.5 rounded bg-white/10 px-1 py-0.5 text-[9px] text-emerald-300">
                            {step.method}
                          </span>
                          {step.step}
                        </div>
                        <span className="shrink-0 text-white/55">
                          {step.status} · {step.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>
              Presigned S3 mask & VTO URLs are persisted into <code className="font-telemetry text-[11px]">.youcam-cache/assets</code> so cached demos never expire.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
