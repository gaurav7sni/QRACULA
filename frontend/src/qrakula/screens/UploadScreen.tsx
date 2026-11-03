import { Button } from "@/components/ui/button";
import { decodeQRImage } from "../qrRecognition";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedImage } from "../QrakulaApp";
import { HalloweenAtmosphere } from "../effects/HalloweenAtmosphere";
import { parseWebUrl } from "../urlInput";
import hangingBat from "@/assets/qrakula/hanging-bat.png.asset.json";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface Props {
  image: SelectedImage | null;
  onImageSelected: (image: SelectedImage) => void;
  onImageCleared: () => void;
  onAnalyze: () => void;
  onBack: () => void;
  onUrlAnalyze: (url: string) => void;
}

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "That file type is not supported. Please use a PNG, JPG, JPEG or WEBP image.";
  }
  if (file.size > MAX_BYTES) {
    return "That image is larger than 10 MB. Please choose a smaller photo or screenshot.";
  }
  return null;
}

export function UploadScreen({ image, onImageSelected, onImageCleared, onAnalyze, onBack, onUrlAnalyze }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  // Always stop the camera when this screen unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const acceptFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return; // cancelled selection
      const problem = validateFile(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setIsReading(true);
      try {
        const payload = await decodeQRImage(file);
        if (!payload) {
          setError("This image doesn't contain a readable QR code. Please upload a clear QR code image.");
          return;
        }
        const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        onImageSelected({
          file,
          url,
          name: file.name,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
          payload,
        });
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setError("That file could not be read as an image.");
      };
        probe.src = url;
      } catch {
        setError("We couldn't read this image. Please try a clear photo or screenshot of a QR code.");
      } finally {
        setIsReading(false);
      }
    },
    [onImageSelected],
  );

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera capture. Please upload an image instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCameraError(
        "Camera access was denied or is unavailable. Camera capture needs your permission and usually requires HTTPS or localhost. You can upload an image instead.",
      );
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-capture-${Date.now()}.png`, { type: "image/png" });
      stopCamera();
      acceptFile(file);
    }, "image/png");
  };

  return (
    <section className="qr-screen qr-upload" aria-labelledby="qr-upload-title">
      <HalloweenAtmosphere />
      <img className="qr-hanging-bat" src={hangingBat.url} alt="" aria-hidden="true" />
      <header className="qr-topbar">
        <Button variant="ghost" type="button" className="qr-btn qr-btn-ghost" onClick={onBack}>
          ← BACK
        </Button>
        <p className="qr-wordmark qr-wordmark-sm">
          QRacula
          <span>SCANNER TERMINAL</span>
        </p>
        <p className="qr-step">01 / 03 — PROVIDE QR IMAGE</p>
      </header>

      <div className="qr-upload-body">
        <h2 id="qr-upload-title">WHAT ARE WE INSPECTING?</h2>
        <p className="qr-muted">QR image or link · Demo reports only</p>

        <form className="qr-url-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          const url = parseWebUrl(urlInput);
          if (!url) {
            setUrlError("Enter a full http:// or https:// link without spaces.");
            return;
          }
          setUrlError(null);
          onUrlAnalyze(url.href);
        }}>
          <label htmlFor="qr-url-input">Paste a link</label>
          <div className="qr-url-row">
            <input id="qr-url-input" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com" value={urlInput} onChange={(event) => { setUrlInput(event.target.value); setUrlError(null); }} aria-invalid={Boolean(urlError)} aria-describedby={urlError ? "qr-url-error" : undefined} />
            <Button type="submit" variant="ghost" className="qr-btn qr-btn-primary" disabled={isReading}>SCAN LINK</Button>
          </div>
          {urlError && <p id="qr-url-error" className="qr-error" role="alert">{urlError}</p>}
        </form>

        <div className="qr-input-grid">
          {/* Option A: upload */}
          <Button variant="ghost" type="button"
            className={`qr-dropzone ${isDragging ? "is-dragging" : ""}`}
            aria-busy={isReading}
            aria-label="Upload a QR code image"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
          >
            <svg viewBox="0 0 24 24" className="qr-icon" aria-hidden="true">
              <path
                d="M12 16V4m0 0 4 4m-4-4L8 8M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <strong>UPLOAD IMAGE</strong>
            <span>PNG · JPG · WEBP</span>
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="qr-visually-hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {/* Option B: camera */}
          <Button variant="ghost" type="button" className="qr-dropzone qr-camera-btn" onClick={openCamera}>
            <svg viewBox="0 0 24 24" className="qr-icon" aria-hidden="true">
              <path
                d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <strong>TAKE PHOTO</strong>
            <span>Use your device camera</span>
          </Button>
        </div>
        <p className="qr-file-limit qr-muted">Images up to 10 MB</p>

        {isReading && <p className="qr-muted" role="status">Reading your QR code…</p>}
        {error && (
          <p className="qr-error" role="alert">
            {error}
          </p>
        )}
        {cameraError && (
          <p className="qr-error" role="alert">
            {cameraError}
          </p>
        )}

        {/* Preview */}
        {image && <div className="qr-preview">
          {image ? (
            <>
              <img src={image.url} alt="Selected QR code preview" />
              <div className="qr-preview-meta">
                <p className="qr-mono">{image.name}</p>
                <p className="qr-mono qr-muted">
                  {image.width} × {image.height}px
                </p>
                <Button variant="ghost" type="button" className="qr-btn qr-btn-ghost" onClick={onImageCleared}>
                  REMOVE
                </Button>
              </div>
            </>
          ) : (
            <div className="qr-preview-empty">
              <svg viewBox="0 0 24 24" className="qr-icon" aria-hidden="true">
                <path
                  d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM17 17h3v3h-3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
              <p>Your QR image will appear here.</p>
            </div>
          )}
        </div>}

        <Button variant="ghost" type="button" className="qr-btn qr-btn-primary" onClick={onAnalyze} disabled={!image || isReading}>
          ANALYZE QR CODE
        </Button>
      </div>

      {/* Camera modal */}
      {cameraOpen && (
        <div className="qr-camera-overlay" role="dialog" aria-modal="true" aria-label="Camera capture">
          <div className="qr-camera-modal">
            <video ref={videoRef} playsInline muted />
            <div className="qr-camera-actions">
              <Button variant="ghost" type="button" className="qr-btn qr-btn-primary" onClick={capturePhoto}>
                CAPTURE
              </Button>
              <Button variant="ghost" type="button" className="qr-btn qr-btn-ghost" onClick={stopCamera}>
                CANCEL
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
