import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import dracula from "@/assets/qrakula/dracula.png.asset.json";
import bloodMoon from "@/assets/qrakula/blood-moon.png.asset.json";
import mist from "@/assets/qrakula/mist-clouds.png.asset.json";
import bat0 from "@/assets/qrakula/bat-0.png.asset.json";
import bat1 from "@/assets/qrakula/bat-1.png.asset.json";
import bat2 from "@/assets/qrakula/bat-2.png.asset.json";

interface Props {
  onEnter: () => void;
  isTransitioning: boolean;
}

export function LandingScreen({ onEnter, isTransitioning }: Props) {
  const ref = useRef<HTMLElement>(null);

  // Subtle pointer parallax: layers drift at different depths.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <section ref={ref} className="qr-screen qr-landing" aria-labelledby="qr-landing-title">
      <div className="qr-moon" aria-hidden="true"><img src={bloodMoon.url} alt="" /></div>
      <div className="qr-mist qr-mist-back" style={{ backgroundImage: `url("${mist.url}")` }} aria-hidden="true" />
      <div className="qr-forest" aria-hidden="true" />
      <div className="qr-mist qr-mist-front" style={{ backgroundImage: `url("${mist.url}")` }} aria-hidden="true" />
      <img className="qr-ambient-bat qr-ambient-bat-a" src={bat0.url} alt="" aria-hidden="true" />
      <img className="qr-ambient-bat qr-ambient-bat-b" src={bat1.url} alt="" aria-hidden="true" />
      <img className="qr-ambient-bat qr-ambient-bat-c" src={bat2.url} alt="" aria-hidden="true" />
      <div className="qr-dracula-hero" aria-hidden="true"><img src={dracula.url} alt="" width={768} height={1024} /></div>
      {/* Team mark */}
      <a className="qr-team-badge qr-anim-1" href="#qr-landing-title" aria-label="Built by Team Vector Core">
        <img src="/images/vector-core-logo.png" alt="" />
        <span>
          <small>A PROJECT BY</small>
          VECTOR CORE
        </span>
      </a>

      {/* Copy */}
      <div className="qr-landing-copy">
        <p className="qr-wordmark qr-anim-1">QRacula<span>QR SECURITY ANALYSIS</span></p>
        <h1 id="qr-landing-title" className="qr-anim-2">NOT EVERY QR CODE<br />LEADS SOMEWHERE <em>SAFE.</em></h1>
        <p className="qr-landing-sub qr-anim-3">Inspect the destination before you take the risk.</p>
        <Button variant="ghost"
          type="button"
          className="qr-btn qr-btn-primary qr-anim-4"
          onClick={onEnter}
          disabled={isTransitioning}
        >
          ENTER THE SCANNER
        </Button>
        <p className="qr-landing-caption qr-anim-5">LOCAL QR READING / LIVE SECURITY CHECKS</p>
      </div>

      <div className="qr-bottomline qr-anim-5" aria-hidden="true">
        <span>01 — THE NIGHT WATCH</span>
        <span>VECTOR CORE · MMXXVI</span>
      </div>
    </section>
  );
}
