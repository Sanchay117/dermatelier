"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";

interface WebcamCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureDataUrl: (dataUrl: string, label: string) => void;
}

export function WebcamCaptureModal({
  isOpen,
  onClose,
  onCaptureDataUrl,
}: WebcamCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setCameraError(null);
      return;
    }

    let cancelled = false;
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 1280 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `${err.message} — You can still upload any portrait JPEG/PNG below.`
            : "Camera permission unavailable — upload a portrait JPEG/PNG below."
        );
      }
    }
    initCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const snapWebcamFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const targetW = 896;
    const targetH = 1152;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;
    const scale = Math.max(targetW / vw, targetH / vh);
    const sw = targetW / scale;
    const sh = targetH / scale;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    // Mirror horizontally for natural selfie orientation
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onCaptureDataUrl(dataUrl, "Live Webcam Selfie");
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1152;
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
        onCaptureDataUrl(resizedDataUrl, file.name.replace(/\.[^.]+$/, ""));
        onClose();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#E5DDD0] bg-[#FAF7F2] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
          <div>
            <h3 className="font-editorial text-xl font-semibold text-[#171412]">
              Clinical Portrait Capture
            </h3>
            <p className="text-xs text-[#5F5850]">
              Auto-formatted to YouCam S2S v2.0 optimal framing (JPEG ≤ 1152px)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#5F5850] hover:bg-[#E5DDD0]/50 hover:text-[#171412]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-[#E5DDD0] bg-[#171412]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
            {/* Dermatological Oval Framing Guide */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="h-[52%] w-[56%] rounded-full border-2 border-dashed border-white/65 shadow-[0_0_0_9999px_rgba(23,20,18,0.28)]" />
              <span className="mt-3 rounded-full bg-black/60 px-3 py-1 font-telemetry text-[10px] text-white/90">
                Center face & shoulders in even lighting
              </span>
            </div>
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#171412]/90 p-6 text-center text-xs text-white/85">
                {cameraError}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!cameraReady}
              onClick={snapWebcamFrame}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#171412] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#B85D43] disabled:opacity-40"
            >
              <Camera className="h-4 w-4" />
              Capture Selfie
            </button>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#171412] bg-white px-4 py-2.5 text-xs font-semibold text-[#171412] transition hover:bg-[#F3EDE3]">
              <Upload className="h-4 w-4" />
              Upload Portrait
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
