/** Only ordinary web links can be submitted or opened. Never execute QR schemes. */
export function parseWebUrl(value: string): URL | null {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    if (!url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function progressIntensity(progress: number): number {
  return 0.25 + Math.min(100, Math.max(0, progress)) * 0.0075;
}