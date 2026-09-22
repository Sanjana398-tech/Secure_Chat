/**
 * Message-specific XAI explanations for Trinetra AI flags.
 *
 * Detection (SAFE / SUSPICIOUS / SCAM) is unchanged. This module only explains
 * a flagged message from:
 *   1. Signals/reasons Trinetra actually returned
 *   2. Indicators that are observably present in this message
 *
 * It does not claim DistilBERT used a given feature unless that signal
 * was returned by Trinetra.
 */

import type { Message } from "@/types"
import {
  getDetectionCopy,
  type DetectionPrediction,
  type ExplanationIndicator,
  type LanguageCode,
} from "@/lib/localization"

const URL_RE =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly)\/[^\s<>"']+/i

const PATTERNS: Record<ExplanationIndicator, RegExp> = {
  urgency:
    /\b(urgent|urgently|immediately|asap|right now|act now|last chance|final warning|expire|expires|deadline|account (will be )?block|suspended|within \d+\s*(hours?|minutes?|hrs?)|legal action|arrest|cyber[- ]?crime|do not ignore|hurry)\b|तुरंत|जल्दी|ब्लॉक|निलंबित|गिरफ्तार|ತುರ್ತು|ತಕ್ಷಣ|ನಿಲ್ಲಿಸಲಾಗುವುದು|అత్యవసరం|వెంటనే|బ్లాక్|உடனடி|உடனே|தடுக்கப்படும்|ഉടൻ|അടിയന്തിരം|ബ്ലോക്ക്/i,
  otp:
    /\b(otp|one[- ]time (password|pin)|cvv|pin\b|password|passcode|secret code|verification code)\b|ओटीपी|ओtp|पासवर्ड|पिन|ಒಟಿಪಿ|ಪಾಸ್‌ವರ್ಡ್|ఒటిపి|పాస్‌వర్డ్|ஓடிபி|கடவுச்சொல்|ഒടിപി|പാസ്‌വേഡ്/i,
  url: URL_RE,
  kyc:
    /\b(kyc|know your customer|verify (your )?account|account verification|update kyc|complete kyc|aadhaar|aadhar|pan card|re-?kyc)\b|केवाईसी|खाता सत्यापन|खाता वेरिफाई|ಕೆವೈಸಿ|ఖాతా ధృవీకరణ|கணக்கு சரிபார்ப்பு|അക്കൗണ്ട് സ്ഥിരീകരണം/i,
  money:
    /\b(pay now|send money|transfer|upi|bank (account|details)|neft|imps|gift card|recharge|paytm|gpay|phonepe|₹|rs\.?\s*\d+|send ₹)\b|पैसे भेज|भुगतान|यूपीआई|ಹಣ ಕಳುಹಿಸಿ|చెల్లింపు|பணம் அனுப்பு|പണം അയയ്ക്കുക/i,
  prize:
    /\b(congratulat|you (have )?won|winner|lottery|jackpot|prize|reward|lucky draw|free gift|claim (your )?(prize|reward))\b|लॉटरी|इनाम|पुरस्कार|जीत गए|ಲಾಟರಿ|బహుమతి|லாட்டரி|പുരസ്കാരം/i,
  impersonation:
    /\b(income tax|it department|rbi|reserve bank|cyber (cell|crime)|customs|police|digital arrest|bank (officer|official|manager)|from (sbi|hdfc|icici|axis)|whatsapp (team|support)|google (team|support)|amazon (support|security)|i am (calling )?from)\b|डिजिटल अरेस्ट|आयकर|पुलिस|ಪೊಲೀಸ್|పోలీసు|காவல்துறை|പോലീസ്/i,
  qr: /\bqr(\s*code)?\b|यूपीआई क्यूआर/i,
}

const REASON_HINTS: Record<ExplanationIndicator, RegExp> = {
  urgency: /urgenc|threat|pressure|deadline|suspend|block|arrest|immediate/i,
  otp: /\botp\b|password|pin|cvv|credential|secret code/i,
  url: /\burl\b|link|phishing|domain|http/i,
  kyc: /\bkyc\b|verif(y|ication)|aadhaar|aadhar|account update/i,
  money: /money|payment|upi|transfer|bank|amount/i,
  prize: /prize|lottery|reward|jackpot|winner|congratulat/i,
  impersonation: /impersonat|official|police|bank officer|government|authority/i,
  qr: /\bqr\b/,
}

const INDICATOR_ORDER: ExplanationIndicator[] = [
  "urgency",
  "otp",
  "url",
  "kyc",
  "money",
  "prize",
  "impersonation",
  "qr",
]

function classifyReason(reason: string): ExplanationIndicator | null {
  for (const key of INDICATOR_ORDER) {
    if (REASON_HINTS[key].test(reason) || PATTERNS[key].test(reason)) return key
  }
  return null
}

function messageText(message: Message): string {
  return [
    message.content,
    message.trinetraOcrText,
    message.trinetraTranscription,
    message.paymentNote,
    message.trinetraQrContent,
    message.paymentUpiId,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
}

export function collectFlaggedIndicators(message: Message): {
  indicators: ExplanationIndicator[]
  extraReasons: string[]
} {
  const found = new Set<ExplanationIndicator>()
  const extraReasons: string[] = []
  const text = messageText(message)

  for (const key of INDICATOR_ORDER) {
    if (PATTERNS[key].test(text)) found.add(key)
  }

  if (
    message.trinetraDetectedUrls.length > 0 ||
    message.messageType === "url" ||
    URL_RE.test(message.content)
  ) {
    found.add("url")
  }

  if (message.messageType === "payment" || message.paymentAmount != null || message.paymentUpiId) {
    found.add("money")
  }

  if (message.trinetraQrContent) found.add("qr")

  for (const reason of message.trinetraReasons) {
    const classified = classifyReason(reason)
    if (classified) {
      found.add(classified)
    } else if (reason.trim()) {
      extraReasons.push(reason.trim())
    }
  }

  return {
    indicators: INDICATOR_ORDER.filter((key) => found.has(key)),
    extraReasons: [...new Set(extraReasons)],
  }
}

export function getFlaggedExplanation(
  message: Message,
  language: LanguageCode,
  prediction: Extract<DetectionPrediction, "SUSPICIOUS" | "SCAM">,
): { lines: string[]; speechText: string } {
  const copy = getDetectionCopy(language)
  const { indicators, extraReasons } = collectFlaggedIndicators(message)
  const lines = [
    ...indicators.map((key) => copy.indicators[key]),
    ...extraReasons,
  ]

  if (lines.length === 0) {
    lines.push(copy.whyFallback[prediction])
  }

  const speechText = `${copy.detectedTitle[prediction]}. ${lines.join(" ")}`
  return { lines, speechText }
}
