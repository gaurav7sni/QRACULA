export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (import.meta.env.DEV) {
    console.error("[QRacula error]", error, context);
  }
}
