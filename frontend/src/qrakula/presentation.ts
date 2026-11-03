export function progressStage(progress: number): "early" | "middle" | "final" {
  if (progress >= 80) return "final";
  if (progress >= 40) return "middle";
  return "early";
}

export function riskTheme(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 30) return "medium";
  return "low";
}