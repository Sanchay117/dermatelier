#!/usr/bin/env node
/**
 * DermAtelier — Live YouCam S2S API v2.0 Smoke Verifier (1 API Unit)
 * Usage:
 *   YOUCAM_API_KEY=your_key npm run verify:youcam
 */
import fs from "node:fs";
import path from "node:path";

const apiKey = (process.env.YOUCAM_API_KEY || "").trim();
const baseUrl = (process.env.YOUCAM_API_BASE_URL || "https://yce-api-01.makeupar.com").replace(/\/$/, "");

if (!apiKey) {
  console.log("ℹ️  YOUCAM_API_KEY is not set in environment or .env.");
  console.log("   DermAtelier runs out-of-the-box in 0-unit Studio Preset & Deterministic CV mode.");
  console.log("   To verify a live 1-unit S2S v2.0 call against Perfect Corp:");
  console.log("   1. Copy .env.example to .env and paste YOUCAM_API_KEY=...");
  console.log("   2. Run: npm run verify:youcam");
  process.exit(0);
}

const samplePath = path.join(process.cwd(), "public/demo/persona-ananya.jpg");
const bytes = fs.readFileSync(samplePath);

console.log(`→ Initializing YouCam S2S v2.0 File Upload (${bytes.byteLength} bytes) at ${baseUrl}...`);

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
        file_name: "persona-ananya.jpg",
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
          file_name: "persona-ananya.jpg",
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

console.log(`✓ Received file_id: ${fileId}`);
const putRes = await fetch(reqSpec.url, {
  method: reqSpec.method || "PUT",
  headers: { "Content-Type": "image/jpeg", ...(reqSpec.headers || {}) },
  body: new Uint8Array(bytes),
});
if (!putRes.ok) {
  console.error(`✗ S3 PUT failed: HTTP ${putRes.status}`);
  process.exit(1);
}
console.log("✓ Uploaded portrait binary to presigned S3 URL");

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
    console.log("✓ Live YouCam Skin Analysis Succeeded!");
    console.log(JSON.stringify(pollJson.data.results, null, 2).slice(0, 1200));
    process.exit(0);
  }
  if (status === "error") {
    console.error("✗ Task returned error:", JSON.stringify(pollJson, null, 2));
    process.exit(1);
  }
}
