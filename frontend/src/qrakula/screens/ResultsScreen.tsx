import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ShieldCheck, ShieldAlert, ShieldX, Info, ArrowUpRight, RotateCcw } from "lucide-react";
import type { AnalysisResult, Verdict } from "../api";
import { parseWebUrl } from "../urlInput";
import { HalloweenAtmosphere } from "../effects/HalloweenAtmosphere";
import dracula from "@/assets/qrakula/dracula-face.png.asset.json";

interface Props { result: AnalysisResult; onDone: () => void; }

const TITLES: Record<Verdict, string> = {
  SAFE: "No known threat",
  SUSPICIOUS: "Be careful",
  DANGEROUS: "Dangerous",
  INFO: "Not a web link",
};

const ICONS = { SAFE: ShieldCheck, SUSPICIOUS: ShieldAlert, DANGEROUS: ShieldX, INFO: Info } as const;

export function ResultsScreen({ result, onDone }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const Icon = ICONS[result.verdict];
  const scanned = result.destination ? parseWebUrl(result.destination.scanned) : null;
  const finalHost = result.destination?.final ? safeHost(result.destination.final) : null;
  const isLink = result.verdict !== "INFO";

  return (
    <section className="qr-screen qr-results" data-risk={riskClass(result.verdict)} aria-labelledby="qr-results-title">
      <HalloweenAtmosphere />
      <header className="qr-topbar">
        <p className="qr-wordmark">QRacula<span>SECURITY REPORT</span></p>
        {result.cached && <span className="qr-badge">CACHED RESULT</span>}
      </header>

      <div className="qr-results-body qr-report-fade">
        <div className="qr-verdict-block">
          <div>
            <Icon className="qr-verdict-icon" aria-hidden="true" />
            <h2 id="qr-results-title" className="qr-result-heading">{TITLES[result.verdict]}</h2>
            <p className="qr-verdict-headline">{result.headline}</p>
          </div>
          {result.verdict === "DANGEROUS" && <img className="qr-result-dracula" src={dracula.url} alt="" aria-hidden="true" />}
        </div>

        {result.reasons.length > 0 && (
          <div className="qr-result-note">
            <h3>Why</h3>
            <ul>
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {isLink && result.destination && (
          <div className="qr-destination">
            <h3>Where it leads</h3>
            {finalHost && result.destination.final && finalHost !== safeHost(result.destination.scanned) && (
              <p className="qr-muted">The link ends on a different site:</p>
            )}
            <p className="qr-destination-host">{finalHost ?? result.destination.domain}</p>
            <p className="qr-mono qr-destination-text">{result.destination.final ?? result.destination.scanned}</p>
            {scanned && (
              <a
                className="qr-destination-link qr-mono"
                href={scanned.href}
                onClick={(event) => { event.preventDefault(); setConfirmOpen(true); }}
              >
                Open anyway<ArrowUpRight aria-hidden="true" />
              </a>
            )}
            <small>Opening a link is always your choice. Only continue if you trust the destination.</small>
          </div>
        )}

        {!isLink && result.details && (
          <div className="qr-destination">
            <h3>What the code contains</h3>
            <dl>
              {Object.entries(result.details)
                .filter(([, v]) => v !== "" && v !== false && v !== null && v !== undefined)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{labelFor(k)}</dt>
                    <dd className="qr-mono">{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        {result.recommendation && (
          <div className="qr-result-note">
            <h3>What should you do?</h3>
            <p>{result.recommendation}</p>
            {result.aiExplanation && <p className="qr-muted">{result.aiExplanation}</p>}
          </div>
        )}

        <details className="qr-details">
          <summary>Show technical details</summary>
          <dl>
            <div><dt>Content type</dt><dd>{result.payloadType}</dd></div>
            {result.evidence && (
              <>
                <div><dt>Engines flagged as malicious</dt><dd>{result.evidence.malicious}</dd></div>
                <div><dt>Engines flagged as suspicious</dt><dd>{result.evidence.suspicious}</dd></div>
                <div><dt>Engines that found no issue</dt><dd>{result.evidence.harmless}</dd></div>
                <div><dt>Last analysed</dt><dd>{result.evidence.analyzedAt ? new Date(result.evidence.analyzedAt).toLocaleString() : "Unknown"}</dd></div>
              </>
            )}
            <div><dt>Checked</dt><dd>{new Date(result.checkedAt).toLocaleString()}</dd></div>
            <div><dt>Reference</dt><dd className="qr-mono">{result.requestId}</dd></div>
          </dl>
          <p className="qr-muted">No security tool can guarantee that a link is safe. "No known threat" means none of the checked sources flagged it.</p>
        </details>

        <div className="qr-results-actions">
          <Button variant="ghost" className="qr-btn qr-btn-primary" onClick={onDone}>
            <RotateCcw size={16} />Scan another
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="qr-link-confirm">
          <AlertDialogTitle>Open this link?</AlertDialogTitle>
          <AlertDialogDescription>
            {result.verdict === "DANGEROUS"
              ? "This link was flagged as dangerous. Opening it could put your information at risk."
              : "This link has not been fully verified. Only continue if you trust where it leads."}
          </AlertDialogDescription>
          <p className="qr-mono qr-confirm-url">{scanned?.href}</p>
          <AlertDialogFooter>
            <AlertDialogCancel className="qr-btn">Stay here</AlertDialogCancel>
            <AlertDialogAction
              className="qr-btn qr-btn-primary"
              onClick={() => { if (scanned) window.open(scanned.href, "_blank", "noopener,noreferrer"); }}
            >
              Open anyway<ArrowUpRight size={16} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function riskClass(verdict: Verdict): "low" | "medium" | "high" {
  if (verdict === "DANGEROUS") return "high";
  if (verdict === "SUSPICIOUS") return "medium";
  return "low";
}

const LABELS: Record<string, string> = {
  ssid: "Network name",
  security: "Security",
  hidden: "Hidden network",
  hasPassword: "Password included",
  payeeName: "Payee name",
  payeeAddress: "Payee ID",
  amount: "Amount",
  currency: "Currency",
  name: "Name",
  organization: "Organisation",
  phone: "Phone",
  email: "Email",
  to: "To",
  subject: "Subject",
  phoneNumber: "Number",
  message: "Message",
  latitude: "Latitude",
  longitude: "Longitude",
  app: "App",
  text: "Text",
};

function labelFor(key: string): string {
  return LABELS[key] ?? key;
}
