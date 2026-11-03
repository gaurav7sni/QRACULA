import { describe, expect, it } from "vitest";
import { parseWebUrl } from "../qrakula/urlInput";

describe("Pasted URL and destination validation", () => {
  it("accepts a full HTTPS link and preserves its exact destination", () => {
    const value = "https://www.youtube.com/watch?v=abc123#video";
    expect(parseWebUrl(value)?.href).toBe(value);
    expect(parseWebUrl(value)?.host).toBe("www.youtube.com");
  });
  it("accepts HTTP links", () => {
    expect(parseWebUrl("http://example.com/path")?.href).toBe("http://example.com/path");
  });
  it("rejects invalid URL formats", () => {
    for (const value of ["", "not-a-url", "https://", "example.com", "https://example.com/a b"]) {
      expect(parseWebUrl(value)).toBeNull();
    }
  });
  it("never enables executable or non-web QR destinations", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://example.com"]) {
      expect(parseWebUrl(value)).toBeNull();
    }
  });
  it("rejects credential-bearing URLs that obscure the destination", () => {
    expect(parseWebUrl("https://youtube.com@evil.example/watch")).toBeNull();
  });
});