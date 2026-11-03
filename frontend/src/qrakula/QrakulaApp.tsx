import { useCallback, useRef, useState } from "react";
import type { AnalysisResult } from "./api";
import { LandingScreen } from "./screens/LandingScreen";
import { UploadScreen } from "./screens/UploadScreen";
import { AnalyzingScreen } from "./screens/AnalyzingScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { BatFlock } from "./effects/BatFlock";
import "./qrakula.css";

export type Screen = "landing" | "upload" | "analyzing" | "results";

export interface SelectedImage {
  file: File;
  url: string;
  name: string;
  width: number;
  height: number;
  payload: string;
}

/**
 * Central application state for QRakula. All navigation goes through
 * goTo()/resetTo() so screens, timers and object URLs are cleaned up in one
 * place and duplicate scans are impossible.
 */
export function QrakulaApp() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const transitionTimer = useRef<number | null>(null);

  const clearImage = useCallback((img: SelectedImage | null) => {
    if (img) URL.revokeObjectURL(img.url);
  }, []);

  /** Dramatic curtain transition between screens (~800 ms). */
  const goTo = useCallback(
    (next: Screen) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setCurtain(true);
      transitionTimer.current = window.setTimeout(() => {
        setScreen(next);
        setCurtain(false);
        setIsTransitioning(false);
      }, 800);
    },
    [isTransitioning],
  );

  const handleEnter = useCallback(() => goTo("upload"), [goTo]);

  const handleAnalyze = useCallback(() => {
    if (!image || isTransitioning) return;
    setScreen("analyzing");
  }, [image, isTransitioning]);

  const handleAnalysisComplete = useCallback((r: AnalysisResult) => {
    setResult(r);
    setScreen("results");
  }, []);

  /** Full reset: image, result and transition state all cleared. */
  const resetTo = useCallback(
    (next: Screen) => {
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
      clearImage(image);
      setImage(null);
      setResult(null);
      setDirectUrl(null);
      setIsTransitioning(false);
      setCurtain(false);
      setScreen(next);
    },
    [image, clearImage],
  );

  return (
    <div className="qr-app">
      {screen === "landing" && <LandingScreen onEnter={handleEnter} isTransitioning={isTransitioning} />}

      {screen === "upload" && (
        <UploadScreen
          image={image}
          onImageSelected={(img) => {
            clearImage(image);
            setImage(img);
          }}
          onImageCleared={() => resetTo("upload")}
          onAnalyze={handleAnalyze}
          onBack={() => resetTo("landing")}
          onUrlAnalyze={(url) => {
            clearImage(image);
            setImage(null);
            setDirectUrl(url);
            setScreen("analyzing");
          }}
        />
      )}

      {screen === "analyzing" && (image || directUrl) && (
        <AnalyzingScreen
          payload={image?.payload ?? directUrl ?? ""}
          onComplete={handleAnalysisComplete}
          onBack={() => resetTo("upload")}
        />
      )}

      {screen === "results" && result && (
        <ResultsScreen
          result={result}
          onDone={() => resetTo("landing")}
        />
      )}

      <div className={`qr-curtain ${curtain ? "is-active" : ""}`} aria-hidden="true" />
      <BatFlock />
    </div>
  );
}
