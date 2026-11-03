/**
 * Connection to the QRacula backend (AWS Lambda Function URL).
 * Set VITE_API_URL to the Function URL (ends with "/").
 */

export type Verdict = "SAFE" | "SUSPICIOUS" | "DANGEROUS" | "INFO";

export interface Evidence {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  analyzedAt: string | null;
  stale: boolean;
}

export interface AnalysisResult {
  status: "complete";
  payloadType: string;
  verdict: Verdict;
  headline: string;
  reasons: string[];
  destination: { scanned: string; final: string | null; domain: string } | null;
  details?: Record<string, unknown>;
  aiExplanation: string | null;
  recommendation: string | null;
  explanationSource: "bedrock" | "template" | null;
  evidence: Evidence | null;
  checkedAt: string;
  cached: boolean;
  requestId: string;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

const RAW_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";
const BASE = RAW_BASE ? RAW_BASE.replace(/\/?$/, "/") : "";

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/**
 * Checks the text decoded from a QR code or a pasted link.
 * While the security check is still running the backend answers 202; we wait
 * and ask again, calling onPending so the screen can show it.
 */
export async function analyzePayload(
  payload: string,
  opts: { signal?: AbortSignal; onPending?: (attempt: number) => void } = {},
): Promise<AnalysisResult> {
  if (!BASE) throw new ApiError("not_configured", "The service address is not set. Please contact the site owner.");

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ApiError("network", "Could not reach the security service. Check your connection and try again.");
    }

    const data = await res.json().catch(() => null);
    if (res.status === 202) {
      opts.onPending?.(attempt);
      await wait(((data?.retryAfterSeconds as number) ?? 12) * 1000, opts.signal);
      continue;
    }
    if (!res.ok) {
      throw new ApiError(
        data?.error?.code ?? "server_error",
        data?.error?.message ?? "Something went wrong. Please try again.",
        res.status,
      );
    }
    return data as AnalysisResult;
  }
  throw new ApiError("timeout", "The check is taking too long. Please try again in a minute.");
}
