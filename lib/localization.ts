export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "kn", name: "Kannada" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "ml", name: "Malayalam" },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"]
export type DetectionPrediction = "SAFE" | "SUSPICIOUS" | "SCAM"
export type ExplanationIndicator =
  | "urgency"
  | "otp"
  | "url"
  | "kyc"
  | "money"
  | "prize"
  | "impersonation"
  | "qr"

const KANNADA_SCRIPT_RE = /[\u0C80-\u0CFF]/
const LATIN_LETTER_RE = /[A-Za-z]/

export function getMessageLanguage(
  message: string,
  selectedLanguage: LanguageCode,
): LanguageCode {
  if (KANNADA_SCRIPT_RE.test(message)) return "kn"
  if (LATIN_LETTER_RE.test(message)) return "en"
  return selectedLanguage
}

export const SPEECH_LOCALES: Record<LanguageCode, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
  ta: "ta-IN",
  ml: "ml-IN",
}

interface DetectionCopy {
  result: Record<DetectionPrediction, string>
  riskLevel: string
  riskScore: string
  warning: Record<"SAFE" | "SUSPICIOUS" | "SCAM", string>
  explanation: Record<DetectionPrediction, string>
  verified: string
  whyButton: string
  speakExplanation: string
  detectedTitle: Record<"SUSPICIOUS" | "SCAM", string>
  indicators: Record<ExplanationIndicator, string>
  whyFallback: Record<"SUSPICIOUS" | "SCAM", string>
}

const COPY: Record<LanguageCode, DetectionCopy> = {
  en: {
    result: { SAFE: "Safe", SUSPICIOUS: "Suspicious", SCAM: "Scam" },
    riskLevel: "Risk level",
    riskScore: "Risk score",
    warning: { SAFE: "Safe message", SUSPICIOUS: "Suspicious activity alert", SCAM: "Scam alert" },
    explanation: {
      SAFE: "Trinetra AI did not find suspicious patterns in this message.",
      SUSPICIOUS: "Trinetra AI found patterns that may indicate a risky request.",
      SCAM: "Trinetra AI detected patterns that may indicate a scam.",
    },
    verified: "Verified by Trinetra AI",
    whyButton: "Why?",
    speakExplanation: "Speak Explanation",
    detectedTitle: { SUSPICIOUS: "Suspicious Detected", SCAM: "Scam Detected" },
    indicators: {
      urgency: "The message creates urgency.",
      otp: "It asks for an OTP, PIN, or password.",
      url: "It contains a suspicious link.",
      kyc: "It asks the user to verify their account.",
      money: "It asks for money or a payment.",
      prize: "It claims a prize, lottery win, or reward.",
      impersonation: "It appears to impersonate a trusted person or organization.",
      qr: "It contains a QR code or payment payload.",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI flagged this specific message as suspicious. No extra pattern details were returned for this text.",
      SCAM: "Trinetra AI flagged this specific message as a scam. No extra pattern details were returned for this text.",
    },
  },
  hi: {
    result: { SAFE: "सुरक्षित", SUSPICIOUS: "संदिग्ध", SCAM: "घोटाला" },
    riskLevel: "जोखिम स्तर",
    riskScore: "जोखिम स्कोर",
    warning: { SAFE: "सुरक्षित संदेश", SUSPICIOUS: "संदिग्ध गतिविधि चेतावनी", SCAM: "घोटाला चेतावनी" },
    explanation: {
      SAFE: "Trinetra AI को इस संदेश में संदिग्ध पैटर्न नहीं मिले।",
      SUSPICIOUS: "Trinetra AI को ऐसे पैटर्न मिले जो जोखिम भरे अनुरोध का संकेत दे सकते हैं।",
      SCAM: "Trinetra AI ने ऐसे पैटर्न पाए जो घोटाले का संकेत दे सकते हैं।",
    },
    verified: "Trinetra AI द्वारा सत्यापित",
    whyButton: "क्यों?",
    speakExplanation: "व्याख्या सुनें",
    detectedTitle: { SUSPICIOUS: "संदिग्ध संदेश मिला", SCAM: "घोटाला पाया गया" },
    indicators: {
      urgency: "यह संदेश जल्दबाजी पैदा करता है।",
      otp: "यह OTP, PIN या पासवर्ड मांगता है।",
      url: "इसमें एक संदिग्ध लिंक है।",
      kyc: "यह उपयोगकर्ता से खाता सत्यापित करने को कहता है।",
      money: "यह पैसे या भुगतान मांगता है।",
      prize: "यह पुरस्कार, लॉटरी या इनाम का दावा करता है।",
      impersonation: "यह किसी विश्वसनीय व्यक्ति या संस्था का रूप धारण करता हुआ लगता है।",
      qr: "इसमें QR कोड या भुगतान जानकारी है।",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI ने इस संदेश को संदिग्ध चिह्नित किया। इस पाठ के लिए अतिरिक्त पैटर्न विवरण नहीं मिला।",
      SCAM: "Trinetra AI ने इस संदेश को घोटाला चिह्नित किया। इस पाठ के लिए अतिरिक्त पैटर्न विवरण नहीं मिला।",
    },
  },
  kn: {
    result: { SAFE: "ಸುರಕ್ಷಿತ", SUSPICIOUS: "ಅನುಮಾನಾಸ್ಪದ", SCAM: "ವಂಚನೆ" },
    riskLevel: "ಅಪಾಯದ ಮಟ್ಟ",
    riskScore: "ಅಪಾಯದ ಸ್ಕೋರ್",
    warning: { SAFE: "ಸುರಕ್ಷಿತ ಸಂದೇಶ", SUSPICIOUS: "ಅನುಮಾನಾಸ್ಪದ ಚಟುವಟಿಕೆ ಎಚ್ಚರಿಕೆ", SCAM: "ವಂಚನೆ ಎಚ್ಚರಿಕೆ" },
    explanation: {
      SAFE: "ಈ ಸಂದೇಶದಲ್ಲಿ ಅನುಮಾನಾಸ್ಪದ ಮಾದರಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ ಎಂದು Trinetra AI ತಿಳಿಸಿದೆ.",
      SUSPICIOUS: "ಅಪಾಯಕಾರಿ ವಿನಂತಿಯನ್ನು ಸೂಚಿಸಬಹುದಾದ ಮಾದರಿಗಳನ್ನು Trinetra AI ಕಂಡುಹಿಡಿದಿದೆ.",
      SCAM: "ವಂಚನೆಯನ್ನು ಸೂಚಿಸಬಹುದಾದ ಮಾದರಿಗಳನ್ನು Trinetra AI ಕಂಡುಹಿಡಿದಿದೆ.",
    },
    verified: "Trinetra AI ಮೂಲಕ ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    whyButton: "ಯಾಕೆ?",
    speakExplanation: "ವಿವರಣೆಯನ್ನು ಕೇಳಿ",
    detectedTitle: { SUSPICIOUS: "ಅನುಮಾನಾಸ್ಪದ ಸಂದೇಶ ಪತ್ತೆಯಾಗಿದೆ", SCAM: "ವಂಚನೆ ಪತ್ತೆಯಾಗಿದೆ" },
    indicators: {
      urgency: "ಈ ಸಂದೇಶವು ತುರ್ತು ಭಾವನೆ ಉಂಟುಮಾಡುತ್ತದೆ.",
      otp: "ಇದು OTP, PIN ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ಕೇಳುತ್ತದೆ.",
      url: "ಇದರಲ್ಲಿ ಅನುಮಾನಾಸ್ಪದ ಲಿಂಕ್ ಇದೆ.",
      kyc: "ಇದು ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಕೇಳುತ್ತದೆ.",
      money: "ಇದು ಹಣ ಅಥವಾ ಪಾವತಿ ಕೇಳುತ್ತದೆ.",
      prize: "ಇದು ಬಹುಮಾನ, ಲಾಟರಿ ಅಥವಾ ಇನಾಮಿನ ಹಕ್ಕು ಮಾಡುತ್ತದೆ.",
      impersonation: "ಇದು ನಂಬಿಕಸ್ಥ ವ್ಯಕ್ತಿ ಅಥವಾ ಸಂಸ್ಥೆಯಂತೆ ನಟಿಸುತ್ತಿರುವಂತೆ ಕಾಣುತ್ತದೆ.",
      qr: "ಇದರಲ್ಲಿ QR ಕೋಡ್ ಅಥವಾ ಪಾವತಿ ಮಾಹಿತಿ ಇದೆ.",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI ಈ ನಿರ್ದಿಷ್ಟ ಸಂದೇಶವನ್ನು ಅನುಮಾನಾಸ್ಪದ ಎಂದು ಗುರುತಿಸಿದೆ. ಹೆಚ್ಚಿನ ಮಾದರಿ ವಿವರಗಳು ಸಿಗಲಿಲ್ಲ.",
      SCAM: "Trinetra AI ಈ ನಿರ್ದಿಷ್ಟ ಸಂದೇಶವನ್ನು ವಂಚನೆ ಎಂದು ಗುರುತಿಸಿದೆ. ಹೆಚ್ಚಿನ ಮಾದರಿ ವಿವರಗಳು ಸಿಗಲಿಲ್ಲ.",
    },
  },
  te: {
    result: { SAFE: "సురక్షితం", SUSPICIOUS: "అనుమానాస్పదం", SCAM: "మోసం" },
    riskLevel: "ప్రమాద స్థాయి",
    riskScore: "ప్రమాద స్కోర్",
    warning: { SAFE: "సురక్షిత సందేశం", SUSPICIOUS: "అనుమానాస్పద కార్యకలాప హెచ్చరిక", SCAM: "మోసం హెచ్చరిక" },
    explanation: {
      SAFE: "ఈ సందేశంలో అనుమానాస్పద నమూనాలు కనిపించలేదని Trinetra AI గుర్తించింది.",
      SUSPICIOUS: "ప్రమాదకరమైన అభ్యర్థనను సూచించే నమూనాలను Trinetra AI గుర్తించింది.",
      SCAM: "మోసాన్ని సూచించే నమూనాలను Trinetra AI గుర్తించింది.",
    },
    verified: "Trinetra AI ద్వారా ధృవీకరించబడింది",
    whyButton: "ఎందుకు?",
    speakExplanation: "వివరణను వినండి",
    detectedTitle: { SUSPICIOUS: "అనుమానాస్పద సందేశం కనిపించింది", SCAM: "మోసం కనిపించింది" },
    indicators: {
      urgency: "ఈ సందేశం అత్యవసరతను కలిగిస్తుంది.",
      otp: "ఇది OTP, PIN లేదా పాస్‌వర్డ్ అడుగుతుంది.",
      url: "ఇందులో అనుమానాస్పద లింక్ ఉంది.",
      kyc: "ఇది ఖాతాను ధృవీకరించమని అడుగుతుంది.",
      money: "ఇది డబ్బు లేదా చెల్లింపు అడుగుతుంది.",
      prize: "ఇది బహుమతి, లాటరీ లేదా రివార్డ్ క్లెయిమ్ చేస్తుంది.",
      impersonation: "ఇది నమ్మకమైన వ్యక్తి లేదా సంస్థలా నటిస్తున్నట్లు కనిపిస్తుంది.",
      qr: "ఇందులో QR కోడ్ లేదా చెల్లింపు సమాచారం ఉంది.",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI ఈ సందేశాన్ని అనుమానాస్పదంగా గుర్తించింది. అదనపు నమూనా వివరాలు రాలేదు.",
      SCAM: "Trinetra AI ఈ సందేశాన్ని మోసంగా గుర్తించింది. అదనపు నమూనా వివరాలు రాలేదు.",
    },
  },
  ta: {
    result: { SAFE: "பாதுகாப்பானது", SUSPICIOUS: "சந்தேகத்திற்குரியது", SCAM: "மோசடி" },
    riskLevel: "ஆபத்து நிலை",
    riskScore: "ஆபத்து மதிப்பெண்",
    warning: { SAFE: "பாதுகாப்பான செய்தி", SUSPICIOUS: "சந்தேகமான செயல்பாட்டு எச்சரிக்கை", SCAM: "மோசடி எச்சரிக்கை" },
    explanation: {
      SAFE: "இந்தச் செய்தியில் சந்தேகத்திற்குரிய வடிவங்கள் இல்லை என Trinetra AI கண்டறிந்தது.",
      SUSPICIOUS: "ஆபத்தான கோரிக்கையைக் குறிக்கக்கூடிய வடிவங்களை Trinetra AI கண்டறிந்தது.",
      SCAM: "மோசடியைக் குறிக்கக்கூடிய வடிவங்களை Trinetra AI கண்டறிந்தது.",
    },
    verified: "Trinetra AI மூலம் சரிபார்க்கப்பட்டது",
    whyButton: "ஏன்?",
    speakExplanation: "விளக்கத்தைக் கேளுங்கள்",
    detectedTitle: { SUSPICIOUS: "சந்தேகமான செய்தி கண்டறியப்பட்டது", SCAM: "மோசடி கண்டறியப்பட்டது" },
    indicators: {
      urgency: "இந்தச் செய்தி அவசரத்தை உருவாக்குகிறது.",
      otp: "இது OTP, PIN அல்லது கடவுச்சொல்லைக் கேட்கிறது.",
      url: "இதில் சந்தேகத்திற்குரிய இணைப்பு உள்ளது.",
      kyc: "இது கணக்கைச் சரிபார்க்கச் சொல்கிறது.",
      money: "இது பணம் அல்லது கட்டணம் கேட்கிறது.",
      prize: "இது பரிசு, லாட்டரி அல்லது வெகுமதியைக் கூறுகிறது.",
      impersonation: "இது நம்பகமான நபர் அல்லது நிறுவனத்தைப் போல நடிப்பதாகத் தெரிகிறது.",
      qr: "இதில் QR குறியீடு அல்லது கட்டணத் தகவல் உள்ளது.",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI இந்தச் செய்தியை சந்தேகமானதாகக் குறித்தது. கூடுதல் வடிவ விவரங்கள் வரவில்லை.",
      SCAM: "Trinetra AI இந்தச் செய்தியை மோசடியாகக் குறித்தது. கூடுதல் வடிவ விவரங்கள் வரவில்லை.",
    },
  },
  ml: {
    result: { SAFE: "സുരക്ഷിതം", SUSPICIOUS: "സംശയാസ്പദം", SCAM: "തട്ടിപ്പ്" },
    riskLevel: "അപകട നില",
    riskScore: "അപകട സ്കോർ",
    warning: { SAFE: "സുരക്ഷിത സന്ദേശം", SUSPICIOUS: "സംശയാസ്പദ പ്രവർത്തന മുന്നറിയിപ്പ്", SCAM: "തട്ടിപ്പ് മുന്നറിയിപ്പ്" },
    explanation: {
      SAFE: "ഈ സന്ദേശത്തിൽ സംശയാസ്പദമായ രീതികൾ കണ്ടെത്തിയില്ലെന്ന് Trinetra AI അറിയിച്ചു.",
      SUSPICIOUS: "അപകടകരമായ അഭ്യർത്ഥന സൂചിപ്പിക്കുന്ന രീതികൾ Trinetra AI കണ്ടെത്തി.",
      SCAM: "തട്ടിപ്പ് സൂചിപ്പിക്കുന്ന രീതികൾ Trinetra AI കണ്ടെത്തി.",
    },
    verified: "Trinetra AI പരിശോധിച്ചു",
    whyButton: "എന്തുകൊണ്ട്?",
    speakExplanation: "വിശദീകരണം കേൾക്കുക",
    detectedTitle: { SUSPICIOUS: "സംശയാസ്പദ സന്ദേശം കണ്ടെത്തി", SCAM: "തട്ടിപ്പ് കണ്ടെത്തി" },
    indicators: {
      urgency: "ഈ സന്ദേശം അടിയന്തിരത ഉണ്ടാക്കുന്നു.",
      otp: "ഇത് OTP, PIN അല്ലെങ്കിൽ പാസ്‌വേഡ് ചോദിക്കുന്നു.",
      url: "ഇതിൽ സംശയാസ്പദമായ ലിങ്ക് ഉണ്ട്.",
      kyc: "ഇത് അക്കൗണ്ട് സ്ഥിരീകരിക്കാൻ ആവശ്യപ്പെടുന്നു.",
      money: "ഇത് പണം അല്ലെങ്കിൽ പേയ്‌മെന്റ് ചോദിക്കുന്നു.",
      prize: "ഇത് സമ്മാനം, ലോട്ടറി അല്ലെങ്കിൽ റിവാർഡ് അവകാശപ്പെടുന്നു.",
      impersonation: "ഇത് വിശ്വസ്ത വ്യക്തിയോ സ്ഥാപനമോ ആയി നടിക്കുന്നതായി തോന്നുന്നു.",
      qr: "ഇതിൽ QR കോഡ് അല്ലെങ്കിൽ പേയ്‌മെന്റ് വിവരങ്ങൾ ഉണ്ട്.",
    },
    whyFallback: {
      SUSPICIOUS: "Trinetra AI ഈ സന്ദേശത്തെ സംശയാസ്പദമായി അടയാളപ്പെടുത്തി. അധിക പാറ്റേൺ വിവരങ്ങൾ ലഭിച്ചില്ല.",
      SCAM: "Trinetra AI ഈ സന്ദേശത്തെ തട്ടിപ്പായി അടയാളപ്പെടുത്തി. അധിക പാറ്റേൺ വിവരങ്ങൾ ലഭിച്ചില്ല.",
    },
  },
}

export function getDetectionCopy(language: LanguageCode): DetectionCopy {
  return COPY[language] ?? COPY.en
}

export function getSpeechAlert(
  language: LanguageCode,
  prediction: DetectionPrediction,
): string {
  const copy = getDetectionCopy(language)
  return `${copy.warning[prediction]}. ${copy.result[prediction]}.`
}
