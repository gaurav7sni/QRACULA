import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { decodeQRPixels } from "../qrakula/qrRecognition";
import { progressIntensity } from "../qrakula/urlInput";
import { parseWebUrl } from "../qrakula/urlInput";

describe("QR image recognition", () => {
  it("rejects an image with no QR code", () => {
    const pixels = new Uint8ClampedArray(128 * 128 * 4).fill(255);
    expect(decodeQRPixels(pixels, 128, 128)).toBeNull();
  });
  it("reads the actual YouTube link without visiting it", () => {
    const text = "https://www.youtube.com/watch?v=abc123";
    const qr = QRCode.create(text);
    const scale = 8;
    const width = (qr.modules.size + 8) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < qr.modules.size; y++) {
      for (let x = 0; x < qr.modules.size; x++) {
        if (!qr.modules.get(y, x)) continue;
        for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
          const offset = (((y + 4) * scale + py) * width + (x + 4) * scale + px) * 4;
          pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 0;
        }
      }
    }
    expect(decodeQRPixels(pixels, width, width)).toBe(text);
  });
});
describe("Progress glow and link safety", () => {
  it("increases red brightness continuously from dim at 0% to full at 100%", () => {
    expect([0, 25, 50, 75, 100].map(progressIntensity)).toEqual([0.25, 0.4375, 0.625, 0.8125, 1]);
  });
  it("only treats ordinary http(s) links as openable", () => {
    expect(parseWebUrl("https://example.com/a")?.hostname).toBe("example.com");
    expect(parseWebUrl("javascript:alert(1)")).toBeNull();
    expect(parseWebUrl("https://user:pw@example.com")).toBeNull();
  });
});
