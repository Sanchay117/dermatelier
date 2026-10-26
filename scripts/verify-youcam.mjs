#!/usr/bin/env node
/**
 * DermAtelier — Live YouCam S2S API v2.0 Smoke Verifier (1 API Unit)
 * Uses sharp Dual-Framing Face-ROI cropper so upper-body 3:4 portraits satisfy
 * YouCam's >60% face-width requirement while preserving upper-torso Cloth VTO framing.
 *
 * Usage:
 *   npm run verify:youcam
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const apiKey = (process.env.YOUCAM_API_KEY || "").trim();
const baseUrl = (process.env.YOUCAM_API_BASE_URL || "https://yce-api-01.makeupar.com").replace(/\/$/, "");

if (!apiKey) {
  console.log("ℹ️  YOUCAM_API_KEY is not set in environment or .env.");
  console.log("   Copy .env.example to .env, set YOUCAM_API_KEY, and run: npm run verify:youcam");
  process.exit(0);
}

const samplePath = path.join(process.cwd(), "public/demo/persona-ananya.jpg");
const rawPortrait = fs.readFileSync(samplePath);
const meta = await sharp(rawPortrait).metadata();
const fullW = meta.width || 896;
const fullH = meta.height || 1200;

// Dual-Framing Face Macro ROI (~72% face width)
const cropW = Math.round(fullW * 0.45);
const cropH = Math.round(cropW * 1.18);
const left = Math.round((fullW - cropW) / 2);
const top = Math.round(fullH * 0.055);

const bytes = await sharp(rawPortrait)
  .extract({ left, top, width: cropW, height: cropH })
  .resize(768, 906)
  .jpeg({ quality: 92 })
  .toBuffer();

console.log(
  `→ Prepared Dual-Framing Face Macro ROI (${cropW}×${cropH} → 768×906, ${bytes.byteLength} bytes) for ${baseUrl}...`
);

let fileInitRes = await fetch(`${baseUrl}/s2s/v2.0/file/skin-analysis`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    files: [
      {
        content_type: "image/jpeg",
        file_name: "persona-ananya-face-roi.jpg",
        file_size: bytes.byteLength,
      },
    ],
  }),
});

if (fileInitRes.status === 404) {
  fileInitRes = await fetch(`${baseUrl}/s2s/v2.0/file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: [
        {
          content_type: "image/jpeg",
          file_name: "persona-ananya-face-roi.jpg",
          file_size: bytes.byteLength,
        },
      ],
    }),
  });
}

const fileInitJson = await fileInitRes.json();
if (!fileInitRes.ok) {
  console.error("✗ File API failed:", JSON.stringify(fileInitJson, null, 2));
  process.exit(1);
}

const fileNode = fileInitJson?.data?.files?.[0] || fileInitJson?.data;
const fileId = fileNode?.file_id;
const reqSpec = Array.isArray(fileNode?.requests) ? fileNode.requests[0] : fileNode?.requests;

const putHeaders = {};
let hasCt = false;
for (const [k, v] of Object.entries(reqSpec.headers || {})) {
  putHeaders[k] = v;
  if (k.toLowerCase() === "content-type") hasCt = true;
}
if (!hasCt) putHeaders["Content-Type"] = "image/jpeg";

console.log(`✓ Received file_id: ${fileId}`);
const putRes = await fetch(reqSpec.url, {
  method: reqSpec.method || "PUT",
  headers: putHeaders,
  body: new Uint8Array(bytes),
});
if (!putRes.ok) {
  console.error(`✗ S3 PUT failed: HTTP ${putRes.status}`);
  process.exit(1);
}
console.log("✓ Uploaded macro face ROI binary to presigned S3 URL");

const taskRes = await fetch(`${baseUrl}/s2s/v2.0/task/skin-analysis`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    src_file_id: fileId,
    dst_actions: ["wrinkle", "pore", "texture", "acne"],
    format: "json",
  }),
});
const taskJson = await taskRes.json();
if (!taskRes.ok) {
  console.error("✗ Task creation failed:", JSON.stringify(taskJson, null, 2));
  process.exit(1);
}

const taskId = taskJson?.data?.task_id;
console.log(`✓ Created Skin Analysis Task: ${taskId} — polling status...`);

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const pollRes = await fetch(`${baseUrl}/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const pollJson = await pollRes.json();
  const status = pollJson?.data?.task_status;
  console.log(`  [poll ${i + 1}] status = ${status}`);
  if (status === "success") {
    console.log("✓ LIVE YouCam S2S v2.0 Skin Analysis SUCCEEDED!");
    console.log(JSON.stringify(pollJson.data.results, null, 2).slice(0, 1600));
    process.exit(0);
  }
  if (status === "error") {
    console.error("✗ Task returned error:", JSON.stringify(pollJson, null, 2));
    process.exit(1);
  }
}
