import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ExecutionMode, LedgerEntry, UnitShieldLedger, YouCamApiTrace } from "./types";

function getCachePaths() {
  const root = process.env.YOUCAM_CACHE_DIR || path.join(process.cwd(), ".youcam-cache");
  return {
    root,
    entriesDir: path.join(root, "entries"),
    assetsDir: path.join(root, "assets"),
    ledgerPath: path.join(root, "ledger.json"),
  };
}

interface PersistedLedger {
  unitsUsed: number;
  unitsSavedByCache: number;
  liveApiCalls: number;
  cacheHits: number;
  entries: LedgerEntry[];
}

function ensureCacheDirs(): ReturnType<typeof getCachePaths> {
  const paths = getCachePaths();
  if (!fs.existsSync(paths.entriesDir)) {
    fs.mkdirSync(paths.entriesDir, { recursive: true });
  }
  if (!fs.existsSync(paths.assetsDir)) {
    fs.mkdirSync(paths.assetsDir, { recursive: true });
  }
  return paths;
}

export function sha256Buffer(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function buildYouCamCacheKey(
  service: string,
  imageHashes: string[],
  params: Record<string, unknown>
): string {
  const canonical = JSON.stringify({
    service,
    images: imageHashes,
    params: sortObjectKeys(params),
  });
  return sha256Buffer(canonical);
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function readCachedJson<T>(cacheKey: string): T | null {
  try {
    const { entriesDir } = ensureCacheDirs();
    const target = path.join(entriesDir, `${cacheKey}.json`);
    if (!fs.existsSync(target)) return null;
    const raw = fs.readFileSync(target, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCachedJson<T>(cacheKey: string, payload: T): void {
  const { entriesDir } = ensureCacheDirs();
  const target = path.join(entriesDir, `${cacheKey}.json`);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Downloads a temporary presigned S3 asset returned by YouCam API and stores it
 * as an immutable base64 data URL (or local cached asset) so presigned URLs never expire.
 */
export async function persistRemoteAssetAsDataUrl(url: string, fallbackMime = "image/png"): Promise<string> {
  if (url.startsWith("data:") || url.startsWith("/")) {
    return url;
  }
  const { assetsDir } = ensureCacheDirs();
  const urlHash = sha256Buffer(url).slice(0, 24);
  const cachedAssetMeta = path.join(assetsDir, `${urlHash}.txt`);
  if (fs.existsSync(cachedAssetMeta)) {
    return fs.readFileSync(cachedAssetMeta, "utf8");
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to persist YouCam result asset (${res.status})`);
  }
  const contentType = res.headers.get("content-type") || fallbackMime;
  const bytes = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
  fs.writeFileSync(cachedAssetMeta, dataUrl, "utf8");
  return dataUrl;
}

function loadPersistedLedger(): PersistedLedger {
  try {
    const { ledgerPath } = ensureCacheDirs();
    if (!fs.existsSync(ledgerPath)) {
      return { unitsUsed: 0, unitsSavedByCache: 0, liveApiCalls: 0, cacheHits: 0, entries: [] };
    }
    return JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as PersistedLedger;
  } catch {
    return { unitsUsed: 0, unitsSavedByCache: 0, liveApiCalls: 0, cacheHits: 0, entries: [] };
  }
}

function savePersistedLedger(data: PersistedLedger): void {
  const { ledgerPath } = ensureCacheDirs();
  fs.writeFileSync(ledgerPath, JSON.stringify(data, null, 2), "utf8");
}

export function getUnitShieldConfig(apiKeyOverride?: string) {
  const apiKey = (apiKeyOverride || process.env.YOUCAM_API_KEY || "").trim();
  const totalRedeemedUnits = Number(process.env.YOUCAM_TOTAL_REDEEMED_UNITS || 1000);
  const maxBudgetUnits = Number(process.env.YOUCAM_MAX_BUDGET_UNITS || 150);
  return {
    apiKey,
    apiKeyConfigured: apiKey.length > 8,
    totalRedeemedUnits,
    maxBudgetUnits,
  };
}

export function canSpendLiveUnits(unitsNeeded: number, apiKeyOverride?: string): {
  allowed: boolean;
  reason?: string;
} {
  const cfg = getUnitShieldConfig(apiKeyOverride);
  if (!cfg.apiKeyConfigured) {
    return { allowed: false, reason: "YOUCAM_API_KEY not configured" };
  }
  const ledger = loadPersistedLedger();
  if (ledger.unitsUsed + unitsNeeded > cfg.maxBudgetUnits) {
    return {
      allowed: false,
      reason: `Unit-Shield safety budget reached (${ledger.unitsUsed}/${cfg.maxBudgetUnits} units). Increase YOUCAM_MAX_BUDGET_UNITS in .env to spend more live units.`,
    };
  }
  return { allowed: true };
}

export function recordLedgerEvent(params: {
  service: YouCamApiTrace["service"];
  mode: ExecutionMode;
  cacheKey: string;
  unitsDelta: number;
  unitsSaved: number;
  taskId?: string;
  durationMs: number;
}): UnitShieldLedger {
  const ledger = loadPersistedLedger();
  ledger.unitsUsed += params.unitsDelta;
  ledger.unitsSavedByCache += params.unitsSaved;
  if (params.mode === "live_youcam") {
    ledger.liveApiCalls += 1;
  }
  if (params.mode === "cached_youcam") {
    ledger.cacheHits += 1;
  }
  const entry: LedgerEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    service: params.service,
    mode: params.mode,
    cacheKeyShort: params.cacheKey.slice(0, 12),
    unitsDelta: params.unitsDelta,
    unitsSaved: params.unitsSaved,
    taskId: params.taskId,
    durationMs: params.durationMs,
  };
  ledger.entries = [entry, ...ledger.entries].slice(0, 40);
  savePersistedLedger(ledger);
  return getUnitShieldLedger();
}

export function getUnitShieldLedger(apiKeyOverride?: string): UnitShieldLedger {
  const cfg = getUnitShieldConfig(apiKeyOverride);
  const ledger = loadPersistedLedger();
  return {
    apiKeyConfigured: cfg.apiKeyConfigured,
    totalRedeemedUnits: cfg.totalRedeemedUnits,
    maxBudgetUnits: cfg.maxBudgetUnits,
    unitsUsed: ledger.unitsUsed,
    unitsRemaining: Math.max(0, cfg.totalRedeemedUnits - ledger.unitsUsed),
    unitsSavedByCache: ledger.unitsSavedByCache,
    liveApiCalls: ledger.liveApiCalls,
    cacheHits: ledger.cacheHits,
    entries: ledger.entries,
  };
}
