import { useEffect, useRef, useState } from "react";
import bat0 from "@/assets/qrakula/bat-0.png.asset.json";
import bat1 from "@/assets/qrakula/bat-1.png.asset.json";
import bat2 from "@/assets/qrakula/bat-2.png.asset.json";
import bat3 from "@/assets/qrakula/bat-3.png.asset.json";
import bat4 from "@/assets/qrakula/bat-4.png.asset.json";
import bat5 from "@/assets/qrakula/bat-5.png.asset.json";

const BAT_IMAGES = [bat0.url, bat1.url, bat2.url, bat3.url, bat4.url, bat5.url];

interface BatSpec {
  src: string;
  size: number;
  offsetY: number;
  phase: number;
  speed: number;
  flapDuration: number;
}

interface Flock {
  id: number;
  startX: number;
  startY: number;
  direction: 1 | -1;
  amplitude: number;
  frequency: number;
  durationMs: number;
  bats: BatSpec[];
}

const MIN_SPAWN_GAP_MS = 1400;
const MAX_FLOCKS = 3;

function makeFlock(id: number): Flock {
  const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const count = 3 + Math.floor(Math.random() * 4); // 3–6 bats
  const bats: BatSpec[] = Array.from({ length: count }, () => ({
    src: BAT_IMAGES[Math.floor(Math.random() * BAT_IMAGES.length)] ?? bat0.url,
    size: 22 + Math.random() * 42,
    offsetY: (Math.random() - 0.5) * 140,
    phase: Math.random() * Math.PI * 2,
    speed: 0.85 + Math.random() * 0.3,
    flapDuration: 0.28 + Math.random() * 0.22,
  }));
  return {
    id,
    startX: direction === 1 ? -15 : 115,
    startY: 12 + Math.random() * 45, // viewport-height percentage
    direction,
    amplitude: 30 + Math.random() * 60,
    frequency: 1.4 + Math.random() * 1.6,
    durationMs: 4000 + Math.random() * 3000, // 4–7 s
    bats,
  };
}

/**
 * Spawns a flock of bats on user activity (any click). Bats fly along curved
 * sine-wave paths as a loose group, flap their wings, then exit and fade.
 * Non-interactive, throttled, and disabled under prefers-reduced-motion.
 */
export function BatFlock() {
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const lastSpawn = useRef(0);
  const idRef = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastSpawn.current < MIN_SPAWN_GAP_MS) return;
      lastSpawn.current = now;

      const flock = makeFlock(idRef.current++);
      setFlocks((prev) => [...prev.slice(-(MAX_FLOCKS - 1)), flock]);

      const timer = window.setTimeout(() => {
        setFlocks((prev) => prev.filter((f) => f.id !== flock.id));
      }, flock.durationMs + 400);
      timers.current.push(timer);
    };

    window.addEventListener("click", onActivity, { passive: true });
    return () => {
      window.removeEventListener("click", onActivity);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div className="qr-bat-layer" aria-hidden="true">
      {flocks.map((flock) => (
        <div
          key={flock.id}
          className="qr-flock"
          style={
            {
              "--start-x": `${flock.startX}vw`,
              "--start-y": `${flock.startY}vh`,
              "--dir": flock.direction,
              "--amp": `${flock.amplitude}px`,
              "--freq": flock.frequency,
              "--dur": `${flock.durationMs}ms`,
            } as React.CSSProperties
          }
        >
          {flock.bats.map((bat, i) => (
            <img
              key={i}
              src={bat.src}
              alt=""
              className="qr-flock-bat"
              style={
                {
                  width: bat.size,
                  "--offset-y": `${bat.offsetY}px`,
                  "--phase": bat.phase,
                  "--speed": bat.speed,
                  "--flap": `${bat.flapDuration}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
