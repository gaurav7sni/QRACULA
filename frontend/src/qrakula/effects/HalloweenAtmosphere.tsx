import bat from "@/assets/qrakula/bat-1.png.asset.json";
import mist from "@/assets/qrakula/mist-clouds.png.asset.json";

/** Decorative only; kept outside the content and interaction layers. */
export function HalloweenAtmosphere() {
  return (
    <div className="qr-halloween-atmosphere" aria-hidden="true">
      <div className="qr-page-mist" style={{ backgroundImage: `url("${mist.url}")` }} />
      <img className="qr-haunt-bat qr-haunt-bat-one" src={bat.url} alt="" />
      <img className="qr-haunt-bat qr-haunt-bat-two" src={bat.url} alt="" />
    </div>
  );
}