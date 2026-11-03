import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import bat from "@/assets/qrakula/bat-0.png.asset.json";
import { analyzePayload, ApiError, type AnalysisResult } from "../api";
import { HalloweenAtmosphere } from "../effects/HalloweenAtmosphere";

interface Props {
  payload: string;
  onComplete: (result: AnalysisResult) => void;
  onBack: () => void;
}

/**
 * Sends the decoded QR text to the backend and shows real progress:
 * "Sending" → "Checking security sources" → "Still scanning" (while the
 * backend waits on the security service). Errors are shown with a retry.
 */
export function AnalyzingScreen({ payload, onComplete, onBack }: Props) {
  const [stage, setStage] = useState("Sending link");
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    doneRef.current = false;
    setError(null);
    setStage("Checking security sources");

    analyzePayload(payload, {
      signal: controller.signal,
      onPending: (n) => setStage(n === 0 ? "Checking security sources" : "Still scanning, almost there"),
    })
      .then((result) => {
        if (doneRef.current) return;
        doneRef.current = true;
        onComplete(result);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong. Please try again."));
      });

    return () => controller.abort();
  }, [payload, attempt, onComplete]);

  useEffect(() => {
    if (error) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [error, attempt]);

  return (
    <div className="qr-analyzing-overlay" role="status" aria-label="Analysis in progress">
      <HalloweenAtmosphere />
      <div className="qr-analyzing-modal">
        <span className="qr-badge">SECURITY CHECK</span>
        <div className="qr-scan-bat" aria-hidden="true" style={{ maskImage: `url("${bat.url}")` }} />
        {error ? (
          <>
            <h2>COULD NOT CHECK</h2>
            <p className="qr-muted" role="alert">{error.message}</p>
            <div className="qr-results-actions">
              <Button className="qr-btn qr-btn-primary" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
              <Button variant="ghost" className="qr-btn" onClick={onBack}>Back</Button>
            </div>
          </>
        ) : (
          <>
            <h2>ANALYZING…</h2>
            <p className="qr-muted">Checking this link against security sources. This can take up to a minute.</p>
            <div className="qr-progress" aria-hidden="true">
              <div className="qr-progress-fill qr-progress-red qr-progress-pulse" style={{ width: "100%" }} />
            </div>
            <p className="qr-mono qr-progress-stage">{stage} · {elapsed}s</p>
          </>
        )}
      </div>
    </div>
  );
}
