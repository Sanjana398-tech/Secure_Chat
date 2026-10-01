export const TRINETRA_PROTECTED_PREDICTIONS = [
  "SCAM",
  "SPAM",
  "FAKE",
  "FRAUD",
  "FRAUDULENT",
  "UNSAFE",
  "MALICIOUS",
  "PHISHING",
  "SUSPICIOUS",
  "WARNING",
] as const

export function isTrinetraProtectedPrediction(prediction: string | null | undefined): boolean {
  const normalized = prediction?.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return Boolean(normalized && (TRINETRA_PROTECTED_PREDICTIONS as readonly string[]).includes(normalized))
}