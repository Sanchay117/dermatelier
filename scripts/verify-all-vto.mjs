#!/usr/bin/env node
/**
 * DermAtelier — Live S2S v2.0 Makeup VTO + AI Clothes VTO Verifier
 * Usage:
 *   npm run verify:vto
 *   npm run verify:vto -- --makeup-only
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const apiKey = (process.env.YOUCAM_API_KEY || "").trim();
const baseUrl = (process.env.YOUCAM_API_BASE_URL || "https://yce-api-01.makeupar.com").replace(/\/$/, "");
const makeupOnly = process.argv.includes("--makeup-only");

if (!apiKey) {
  console.log("Set YOUCAM_API_KEY in .env to verify live VTO endpoints.");
  process.exit(0);
}

async function uploadFile(buffer, fileName, serviceSlug) {
  const candidates = [`/s2s/v2.0/file/${serviceSlug}`, `/s2s/v2.0/file`];
  let initJson = null;
  for (const ep of candidates) {
    const res = await fetch(`${baseUrl}${ep}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ content_type: "image/jpeg", file_name: fileName, file_size: buffer.byteLength }],
      }),
    });
    const txt = await res.text();
    if (res.ok) {
      initJson = JSON.parse(txt);
      console.log(`  ✓ Init ${ep} -> HTTP ${res.status}`);
      break;
    }
  }
  if (!initJson) throw new Error(`File upload init failed for ${serviceSlug}`);
  const fileNode = initJson?.data?.files?.[0] || initJson?.data;
  const reqSpec = Array.isArray(fileNode.requests) ? fileNode.requests[0] : fileNode.requests;
  const putHeaders = {};
  let hasCt = false;
  for (const [k, v] of Object.entries(reqSpec.headers || {})) {
    putHeaders[k] = v;
    if (k.toLowerCase() === "content-type") hasCt = true;
  }
  if (!hasCt) putHeaders["Content-Type"] = "image/jpeg";
  const putRes = await fetch(reqSpec.url, {
    method: reqSpec.method || "PUT",
    headers: putHeaders,
    body: new Uint8Array(buffer),
  });
  if (!putRes.ok) throw new Error(`S3 PUT failed: ${putRes.status}`);
  return fileNode.file_id;
}

async function poll(taskPath) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${baseUrl}${taskPath}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    const status = json?.data?.task_status;
    console.log(`  [poll ${i + 1}] ${taskPath} -> ${status}`);
    if (status === "success") return json.data;
    if (status === "error") throw new Error(JSON.stringify(json.data));
  }
  throw new Error("Poll timeout");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const rawPortrait = fs.readFileSync(path.join(projectRoot, "public/demo/persona-ananya.jpg"));
const faceRoi = await sharp(rawPortrait)
  .extract({
    left: Math.round(896 * 0.275),
    top: Math.round(1200 * 0.055),
    width: Math.round(896 * 0.45),
    height: Math.round(896 * 0.45 * 1.18),
  })
  .resize(768, 906)
  .jpeg({ quality: 92 })
  .toBuffer();

console.log("\n=== 1. Testing Makeup VTO (/s2s/v2.0/task/makeup-vto) ===");
const makeupFileId = await uploadFile(faceRoi, "ananya_face.jpg", "makeup-vto");

const makeupPayload = {
  src_file_id: makeupFileId,
  version: "1.0",
  effects: [
    {
      category: "foundation",
      palettes: [
        {
          color: "#BA8759",
          colorIntensity: 68,
          coverageIntensity: 52,
          glowIntensity: 64,
        },
      ],
    },
    {
      category: "lip_color",
      shape: { name: "original" },
      style: { type: "full" },
      palettes: [{ color: "#9E4747", texture: "satin", colorIntensity: 76 }],
    },
    {
      category: "blush",
      pattern: { name: "2colors6" },
      palettes: [{ color: "#C66D5E", texture: "matte", colorIntensity: 28 }],
    },
  ],
};

const mRes = await fetch(`${baseUrl}/s2s/v2.0/task/makeup-vto`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(makeupPayload),
});
const mTxt = await mRes.text();
if (!mRes.ok) {
  throw new Error(`Makeup VTO HTTP ${mRes.status}: ${mTxt}`);
}
const makeupTaskId = JSON.parse(mTxt)?.data?.task_id;
const makeupOut = await poll(`/s2s/v2.0/task/makeup-vto/${encodeURIComponent(makeupTaskId)}`);
console.log("  ✓ Makeup VTO SUCCEEDED:", JSON.stringify(makeupOut.results).slice(0, 260));

if (!makeupOnly) {
  console.log("\n=== 2. Testing AI Clothes VTO (/s2s/v2.0/task/cloth) ===");
  const garmentBuf = fs.readFileSync(path.join(projectRoot, "public/demo/garment-emerald-silk.jpg"));
  const srcId = await uploadFile(rawPortrait, "ananya_body.jpg", "cloth");
  const refId = await uploadFile(garmentBuf, "emerald_silk.jpg", "cloth");
  const cRes = await fetch(`${baseUrl}/s2s/v2.0/task/cloth`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      src_file_id: srcId,
      ref_file_id: refId,
      garment_category: "upper_body",
    }),
  });
  const cTxt = await cRes.text();
  if (cRes.ok) {
    const taskId = JSON.parse(cTxt)?.data?.task_id;
    const out = await poll(`/s2s/v2.0/task/cloth/${encodeURIComponent(taskId)}`);
    console.log("  ✓ Cloth VTO SUCCEEDED:", JSON.stringify(out.results).slice(0, 300));
  }
}
