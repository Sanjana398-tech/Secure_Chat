import Link from "next/link"
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  FileImage,
  Link2,
  LockKeyhole,
  MessageSquareText,
  Mic2,
  QrCode,
  Radar,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WalletCards,
  Waves,
} from "lucide-react"

const channels = [
  { label: "SMS", icon: MessageSquareText, position: "channel-sms" },
  { label: "URL", icon: Link2, position: "channel-url" },
  { label: "UPI", icon: WalletCards, position: "channel-upi" },
  { label: "QR", icon: QrCode, position: "channel-qr" },
  { label: "VOICE", icon: Mic2, position: "channel-voice" },
  { label: "SCREENSHOT", icon: FileImage, position: "channel-screenshot" },
]

const features = [
  {
    title: "SMS Scam Detection",
    description: "Read the intent behind messages before urgency becomes action.",
    icon: MessageSquareText,
    accent: "cyan",
  },
  {
    title: "Malicious URL Detection",
    description: "Inspect links for phishing signals and dangerous destinations.",
    icon: Link2,
    accent: "blue",
  },
  {
    title: "UPI Fraud Detection",
    description: "Assess payment requests for patterns that deserve a second look.",
    icon: WalletCards,
    accent: "violet",
  },
  {
    title: "QR Scam Detection",
    description: "Decode QR payloads and surface hidden payment risk.",
    icon: QrCode,
    accent: "cyan",
  },
  {
    title: "Voice Scam Detection",
    description: "Transcribe voice notes and scan their meaning for red flags.",
    icon: Mic2,
    accent: "blue",
  },
  {
    title: "Screenshot Scam Detection",
    description: "Turn visual evidence into an explainable security signal.",
    icon: FileImage,
    accent: "violet",
  },
]

const steps = [
  {
    number: "01",
    title: "SCAN",
    description: "Analyze the incoming message, URL, transaction, QR, voice, or screenshot.",
    icon: ScanLine,
  },
  {
    number: "02",
    title: "ANALYZE",
    description: "AI analyzes the content and identifies suspicious patterns.",
    icon: BrainCircuit,
  },
  {
    number: "03",
    title: "ALERT",
    description: "Receive a clear Safe, Suspicious, or Scam result with an understandable alert.",
    icon: ShieldCheck,
  },
]

export default function LandingPage() {
  return (
    <main className="landing-shell" id="home">
      <div className="landing-noise" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
      <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
      <div className="landing-particles" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
      </div>

      <nav className="landing-nav page-width" aria-label="Main navigation">
        <Link href="/" className="brand-lockup" aria-label="Trinetra AI home">
          <span className="brand-mark"><Radar size={19} strokeWidth={1.8} /></span>
          <span>TRINETRA <b>AI</b></span>
        </Link>
        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <Link href="/login" className="nav-login">Login <ArrowRight size={14} /></Link>
        </div>
        <Link href="/login" className="mobile-login" aria-label="Login"><LockKeyhole size={16} /></Link>
      </nav>

      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-pulse" /> ADVANCED MULTICHANNEL CYBERSECURITY</div>
          <h1>WELCOME TO <strong>TRINETRA AI</strong></h1>
          <p className="hero-tagline">Your Smart Third Eye Against Cyber Scams</p>
          <p className="hero-description">
            An intelligent cybersecurity system designed to detect, analyze, and alert users about potential cyber scams across multiple digital channels.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="primary-action"><LockKeyhole size={17} /> LOGIN <ArrowRight size={15} /></Link>
            <Link href="/register" className="secondary-action"><Sparkles size={17} /> CREATE ACCOUNT</Link>
          </div>
          <div className="hero-proof"><span>DETECT</span><i /> <span>ANALYZE</span><i /> <span>ALERT</span></div>
        </div>

        <div className="eye-stage" aria-label="Trinetra AI third eye visualization">
          <div className="stage-label stage-label-top"><span>TRINETRA CORE</span><b>ONLINE</b></div>
          <div className="eye-radar radar-outer" />
          <div className="eye-radar radar-middle" />
          <div className="eye-scan" />
          <div className="eye-halo" />
          <div className="third-eye">
            <div className="eye-lid eye-lid-top" />
            <div className="eye-lid eye-lid-bottom" />
            <div className="eye-socket">
              <div className="iris"><div className="pupil"><span /></div></div>
            </div>
          </div>
          <div className="eye-crosshair crosshair-x" /><div className="eye-crosshair crosshair-y" />
          <div className="stage-label stage-label-bottom"><span>THREAT SURFACE</span><b>6 CHANNELS</b></div>
          {channels.map(({ label, icon: Icon, position }) => (
            <div className={`channel-node ${position}`} key={label}>
              <span className="channel-icon"><Icon size={15} /></span><span>{label}</span>
            </div>
          ))}
          <div className="data-line data-line-one" /><div className="data-line data-line-two" /><div className="data-line data-line-three" />
        </div>
      </section>

      <div className="signal-strip page-width" aria-label="Security system status">
        <span><i className="status-dot" /> THREAT MONITORING ACTIVE</span><span>MODEL STATUS <b>READY</b></span><span>EXPLAINABLE INTELLIGENCE <b>ENABLED</b></span><span>LATENCY <b>18MS</b></span>
      </div>

      <section className="content-section page-width" id="features">
        <div className="section-heading"><div><span className="section-kicker">CAPABILITY MATRIX / 01</span><h2>ONE SYSTEM.<br /><em>MULTIPLE THREATS.</em></h2></div><p>One intelligent lens for the places where modern scams hide. Built to turn uncertain digital moments into clear, actionable awareness.</p></div>
        <div className="feature-grid">
          {features.map(({ title, description, icon: Icon, accent }, index) => (
            <article className={`feature-card accent-${accent}`} key={title}>
              <div className="card-top"><span className="card-index">0{index + 1}</span><Icon size={22} strokeWidth={1.5} /></div>
              <h3>{title}</h3><p>{description}</p><span className="card-arrow"><ArrowRight size={15} /></span>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="how-it-works">
        <div className="page-width">
          <div className="section-heading workflow-heading"><div><span className="section-kicker">THE SIGNAL PATH / 02</span><h2>FROM SIGNAL<br /><em>TO CLARITY.</em></h2></div><p>Trinetra AI makes every result legible. No black-box anxiety, just a clean path from incoming data to an alert you can understand.</p></div>
          <div className="steps-grid">
            {steps.map(({ number, title, description, icon: Icon }, index) => (
              <div className="step-item" key={number}><div className="step-number">{number}</div><div className="step-icon"><Icon size={23} /></div><h3>{title}</h3><p>{description}</p>{index < 2 && <ArrowRight className="step-connector" size={20} />}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-section page-width">
        <div className="trust-visual"><div className="trust-ring ring-one" /><div className="trust-ring ring-two" /><div className="trust-core"><Waves size={26} /><span>ALWAYS<br /><b>WATCHING</b></span></div></div>
        <div className="trust-copy"><span className="section-kicker">THE TRINETRA PROMISE / 03</span><h2>BUILT TO KEEP<br /><em>YOU AWARE.</em></h2><p>Security works better when it works with you. Trinetra AI brings threat intelligence into the moment, with context you can act on.</p><div className="trust-list">{["Multichannel detection", "Multilingual alerts", "Explainable AI", "Risk assessment", "Real-time alerts"].map((item) => <span key={item}><Check size={14} />{item}</span>)}</div></div>
      </section>

      <footer className="landing-footer page-width"><div className="footer-brand"><Link href="/" className="brand-lockup"><span className="brand-mark"><Radar size={19} strokeWidth={1.8} /></span><span>TRINETRA <b>AI</b></span></Link><p>Your Smart Third Eye Against Cyber Scams</p></div><div className="footer-center">DETECT <i /> ANALYZE <i /> ALERT</div><div className="footer-meta"><span>CYBER AWARENESS SYSTEM</span><span>© 2026 TRINETRA AI</span></div></footer>
      <a className="scroll-cue" href="#features"><span>EXPLORE SYSTEM</span><ChevronDown size={15} /></a>
    </main>
  )
}