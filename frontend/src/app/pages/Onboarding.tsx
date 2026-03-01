import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchOnboardingProfile,
  OnboardingProfile,
  saveOnboardingProfile,
} from "@/app/services/api";

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  bg: "#EDEAE4",
  bgCard: "#F5F3EF",
  greenDark: "#2C4A3E",
  greenMid: "#3D6355",
  greenLight: "#8AAF9F",
  greenPale: "#D4E4DC",
  textPrimary: "#1A1A1A",
  textSecondary: "#5C5C5C",
  textMuted: "#9A9A9A",
  border: "#D8D4CC",
  redFlag: "#C0572A",
} as const;

// ─── Step 1 data ──────────────────────────────────────────────────
const INVESTOR_TYPES = [
  { label: "Still learning", icon: "🌱", description: "Under 3 years. Building habits and understanding." },
  { label: "Self-directed", icon: "📊", description: "Experienced but prone to emotional decisions sometimes." },
  { label: "Active trader", icon: "⚡", description: "High frequency, complex strategies, need a discipline mirror." },
] as const;

// ─── Step 2 data ──────────────────────────────────────────────────
const ASSET_CLASSES = [
  { icon: "📈", label: "Stocks" },
  { icon: "🥇", label: "Gold & Precious Metals" },
  { icon: "₿", label: "Crypto" },
  { icon: "🏠", label: "Real Estate / REITs" },
  { icon: "🏦", label: "Bonds / Fixed Income" },
  { icon: "🌍", label: "ETFs / Index Funds" },
  { icon: "🧪", label: "Options / Derivatives" },
  { icon: "🌱", label: "Startup / Private Equity" },
  { icon: "💵", label: "Cash / Money Market" },
] as const;

const REVIEW_FREQ_OPTIONS = ["Daily", "A few times a week", "Weekly", "Monthly or less"] as const;
const HORIZON_OPTIONS = ["Under 1 year", "1–3 years", "3–10 years", "10+ years"] as const;
const STRATEGY_OPTIONS = [
  "Buy and hold (passive)",
  "Selective stock picking",
  "Active trading / timing",
  "Thematic / macro bets",
] as const;

// ─── Step 3 data ──────────────────────────────────────────────────
const MARKET_DROP_OPTIONS = [
  "Check my portfolio obsessively",
  "Panic and want to sell",
  "Feel anxious but hold",
  "See it as an opportunity",
] as const;
const ENEMY_OPTIONS = [
  "Fear of missing out",
  "Panic selling",
  "Overconfidence",
  "Not knowing when to sell",
] as const;
const TIMING_OPTIONS = [
  "In the moment",
  "After a few hours of thinking",
  "Over several days",
  "With a clear system",
] as const;

const ONBOARDING_PROFILE_STORAGE_KEY = "onboarding_profile";

// ─── Reusable pill-choice group ───────────────────────────────────
function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ width: "100%", marginBottom: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.textPrimary, marginBottom: 12 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const sel = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              style={{
                fontSize: 13.5,
                fontWeight: sel ? 500 : 400,
                color: sel ? "#fff" : C.textSecondary,
                background: sel ? C.greenDark : C.bgCard,
                border: `1.5px solid ${sel ? C.greenDark : C.border}`,
                borderRadius: 100,
                padding: "9px 18px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.18s",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Full-width pill primary button ───────────────────────────────
function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? C.greenLight : C.greenDark,
        color: "#fff",
        border: "none",
        borderRadius: 100,
        padding: "11px 28px",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function StepFooter({
  onContinue,
  onSkip,
  continueLabel = "Continue →",
  continueDisabled,
}: {
  onContinue: () => void;
  onSkip?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 20,
        marginTop: 8,
        width: "100%",
      }}
    >
      {onSkip && (
        <span
          onClick={onSkip}
          style={{
            fontSize: 13.5,
            color: C.textMuted,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Skip
        </span>
      )}
      <PrimaryButton
        label={continueLabel}
        onClick={onContinue}
        disabled={continueDisabled}
      />
    </div>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  // Step 1
  const [investorType, setInvestorType] = useState<string>("Self-directed");
  // Step 2
  const [assetTypes, setAssetTypes] = useState<string[]>(["Stocks"]);
  const [reviewFrequency, setReviewFrequency] = useState<string>("A few times a week");
  const [investmentHorizon, setInvestmentHorizon] = useState<string>("3–10 years");
  const [strategy, setStrategy] = useState<string>("Selective stock picking");
  // Step 3
  const [marketDropReaction, setMarketDropReaction] = useState<string>("Feel anxious but hold");
  const [biggestEnemy, setBiggestEnemy] = useState<string>("Panic selling");
  const [decisionTiming, setDecisionTiming] = useState<string>("After a few hours of thinking");
  const [investmentAnchor, setInvestmentAnchor] = useState("");

  useEffect(() => {
    const localRaw =
      typeof window !== "undefined" ? window.localStorage.getItem(ONBOARDING_PROFILE_STORAGE_KEY) : null;
    const applyProfile = (profile: Partial<OnboardingProfile>) => {
      setInvestorType(profile.investorType || "Self-directed");
      setAssetTypes(Array.isArray(profile.assetTypes) && profile.assetTypes.length > 0 ? profile.assetTypes : ["Stocks"]);
      // riskTolerance stored reviewFrequency, decisionHorizon stored investmentHorizon, marketFocus stored strategy
      setReviewFrequency(profile.riskTolerance || "A few times a week");
      setInvestmentHorizon(profile.decisionHorizon || "3–10 years");
      setStrategy(profile.marketFocus || "Selective stock picking");
      const flags = Array.isArray(profile.baselineFlags) ? profile.baselineFlags : [];
      setMarketDropReaction(flags[0] || "Feel anxious but hold");
      setBiggestEnemy(flags[1] || "Panic selling");
      setDecisionTiming(flags[2] || "After a few hours of thinking");
      setInvestmentAnchor(profile.investmentAnchor || "");
    };

    if (localRaw) {
      try {
        applyProfile(JSON.parse(localRaw) as Partial<OnboardingProfile>);
      } catch {
        // ignore local parse failure
      }
    }

    if (!token) {
      setLoadingProfile(false);
      return;
    }

    fetchOnboardingProfile(token)
      .then((profile) => {
        if (
          profile.investorType ||
          (profile.assetTypes && profile.assetTypes.length > 0) ||
          profile.investmentAnchor
        ) {
          applyProfile(profile);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch onboarding profile:", err);
      })
      .finally(() => setLoadingProfile(false));
  }, [token]);

  const toggleAsset = (label: string) => {
    setAssetTypes((prev) => (prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]));
  };

  const behavioralFlags = useMemo(() => {
    const flags: { text: string }[] = [];
    if (biggestEnemy) flags.push({ text: `Tendency: ${biggestEnemy.toLowerCase()}` });
    if (marketDropReaction) flags.push({ text: `Pattern: ${marketDropReaction.toLowerCase()} during volatility` });
    if (decisionTiming) flags.push({ text: `Decision style: ${decisionTiming.toLowerCase()}` });
    if (flags.length === 0) flags.push({ text: "No major behavioral flags detected" });
    return flags;
  }, [biggestEnemy, marketDropReaction, decisionTiming]);

  const generatedThesis = useMemo(() => {
    return {
      investor: investorType || "self-directed investor",
      assets: assetTypes.length > 0 ? assetTypes.join(", ") : "diversified assets",
      horizon: investmentHorizon || "medium-term",
      strat: strategy || "selective stock picking",
      enemy: biggestEnemy,
    };
  }, [investorType, assetTypes, investmentHorizon, strategy, biggestEnemy]);

  const completeOnboarding = async () => {
    const profile: OnboardingProfile = {
      investorType,
      assetTypes,
      // Map new fields back to existing API field names for backend compatibility
      riskTolerance: reviewFrequency,
      decisionHorizon: investmentHorizon,
      marketFocus: strategy,
      baselineFlags: [marketDropReaction, biggestEnemy, decisionTiming].filter(Boolean),
      investmentAnchor: investmentAnchor.trim(),
      completedAt: new Date().toISOString(),
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }

    setError("");
    if (token) {
      setSaving(true);
      try {
        await saveOnboardingProfile(token, profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sync onboarding profile");
      } finally {
        setSaving(false);
      }
    }

    navigate("/thesis?startRule=1");
  };

  if (loadingProfile) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.textSecondary }}>
          <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  // ─── shared progress dots ─────────────────────────────────────
  const dots = (
    <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: 8,
            borderRadius: 4,
            transition: "all 0.3s",
            width: i === step ? 28 : 8,
            background: i < step ? C.greenMid : i === step ? C.greenDark : C.border,
          }}
        />
      ))}
    </div>
  );

  const serif: CSSProperties = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 32,
    fontWeight: 500,
    color: C.textPrimary,
    textAlign: "center",
    lineHeight: 1.2,
    marginBottom: 12,
    letterSpacing: "-0.5px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', 'Inter', sans-serif",
        color: C.textPrimary,
      }}
    >
      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 60,
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.3px",
          }}
        >
          My Investment Thesis
        </span>
      </nav>

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "40px 24px 80px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {error && (
            <div
              style={{
                width: "100%",
                marginBottom: 16,
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                padding: "10px 14px",
                fontSize: 13,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          )}

          {/* ── STEP 1: Investor Type ─────────────────────────── */}
          {step === 1 && (
            <>
              {dots}
              <h1 style={serif}>Who are you as an investor?</h1>
              <p
                style={{
                  fontSize: 15,
                  color: C.textSecondary,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  marginBottom: 40,
                }}
              >
                This helps us calibrate your rules and guardrails.<br />No judgment — just context.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 14,
                  width: "100%",
                  marginBottom: 40,
                }}
              >
                {INVESTOR_TYPES.map((type) => {
                  const sel = investorType === type.label;
                  return (
                    <div
                      key={type.label}
                      onClick={() => setInvestorType(type.label)}
                      style={{
                        background: sel ? "#EBF2EE" : C.bgCard,
                        border: `1.5px solid ${sel ? C.greenDark : C.border}`,
                        borderRadius: 16,
                        padding: "28px 20px",
                        cursor: "pointer",
                        textAlign: "center",
                        boxShadow: sel
                          ? `0 0 0 2px ${C.greenDark}, 0 4px 20px rgba(44,74,62,0.12)`
                          : "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 14 }}>{type.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{type.label}</div>
                      <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>
                        {type.description}
                      </div>
                    </div>
                  );
                })}
              </div>

              <StepFooter onContinue={() => setStep(2)} onSkip={() => setStep(2)} />
            </>
          )}

          {/* ── STEP 2: Portfolio Profile ─────────────────────── */}
          {step === 2 && (
            <>
              {dots}
              <h1 style={serif}>What does your portfolio look like?</h1>
              <p
                style={{
                  fontSize: 15,
                  color: C.textSecondary,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  marginBottom: 40,
                }}
              >
                Select what you currently invest in or plan to.<br />This shapes how we interpret your decisions.
              </p>

              {/* Asset class label */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.textMuted,
                  textAlign: "left",
                  width: "100%",
                  marginBottom: 8,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Asset classes (select all that apply)
              </div>

              {/* Asset grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                  width: "100%",
                  marginBottom: 24,
                }}
              >
                {ASSET_CLASSES.map(({ icon, label }) => {
                  const sel = assetTypes.includes(label);
                  return (
                    <div
                      key={label}
                      onClick={() => toggleAsset(label)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        background: sel ? "#EBF2EE" : C.bgCard,
                        border: `1.5px solid ${sel ? C.greenDark : C.border}`,
                        borderRadius: 12,
                        padding: "18px 12px",
                        cursor: "pointer",
                        boxShadow: sel
                          ? `0 0 0 2px ${C.greenDark}, 0 4px 20px rgba(44,74,62,0.12)`
                          : "0 1px 3px rgba(0,0,0,0.06)",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: 22 }}>{icon}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, textAlign: "center" }}>{label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Divider */}
              <div style={{ width: "100%", height: 1, background: C.border, margin: "8px 0 24px" }} />

              <PillGroup
                label="How often do you review your portfolio?"
                options={REVIEW_FREQ_OPTIONS}
                value={reviewFrequency}
                onChange={setReviewFrequency}
              />
              <PillGroup
                label="What's your primary investment horizon?"
                options={HORIZON_OPTIONS}
                value={investmentHorizon}
                onChange={setInvestmentHorizon}
              />
              <PillGroup
                label="Which best describes your current strategy?"
                options={STRATEGY_OPTIONS}
                value={strategy}
                onChange={setStrategy}
              />

              <StepFooter onContinue={() => setStep(3)} onSkip={() => setStep(3)} />
            </>
          )}

          {/* ── STEP 3: Behavioral Baseline ───────────────────── */}
          {step === 3 && (
            <>
              {dots}
              <h1 style={serif}>Your honest baseline</h1>
              <p
                style={{
                  fontSize: 15,
                  color: C.textSecondary,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  marginBottom: 40,
                }}
              >
                Quick questions to build your behavioral profile.<br />There are no wrong answers.
              </p>

              <PillGroup
                label="When the market drops 15%, my gut reaction is usually…"
                options={MARKET_DROP_OPTIONS}
                value={marketDropReaction}
                onChange={setMarketDropReaction}
              />
              <PillGroup
                label="My biggest investing enemy is…"
                options={ENEMY_OPTIONS}
                value={biggestEnemy}
                onChange={setBiggestEnemy}
              />
              <PillGroup
                label="I typically make investment decisions…"
                options={TIMING_OPTIONS}
                value={decisionTiming}
                onChange={setDecisionTiming}
              />

              {/* Anchor textarea */}
              <div style={{ width: "100%", marginBottom: 32 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.textPrimary, marginBottom: 12 }}>
                  Write your investment anchor{" "}
                  <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
                </div>
                <textarea
                  value={investmentAnchor}
                  onChange={(e) => setInvestmentAnchor(e.target.value)}
                  placeholder="e.g. I'm a long-term investor. I believe in broad diversification and holding through volatility. I invest for 15+ years and I don't try to time the market."
                  style={{
                    width: "100%",
                    background: "#fff",
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 16,
                    padding: 20,
                    fontFamily: "inherit",
                    fontSize: 14.5,
                    color: C.textPrimary,
                    lineHeight: 1.7,
                    resize: "none",
                    minHeight: 160,
                    outline: "none",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>

              <StepFooter onContinue={() => setStep(4)} onSkip={() => setStep(4)} />
            </>
          )}

          {/* ── STEP 4: Thesis Summary ────────────────────────── */}
          {step === 4 && (
            <>
              {dots}
              <div style={{ fontSize: 48, marginBottom: 20 }}>🔒</div>
              <h1 style={serif}>Your investment thesis is set.</h1>
              <p
                style={{
                  fontSize: 15,
                  color: C.textSecondary,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  marginBottom: 40,
                }}
              >
                This is version 1.0 — a living document.<br />As you use My Investment Thesis, it will evolve with you.
              </p>

              {/* Investor Profile card */}
              <div style={{ width: "100%", marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.textMuted,
                    marginBottom: 10,
                  }}
                >
                  Your Investor Profile
                </div>
                <div
                  style={{
                    background: C.bgCard,
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 16,
                    padding: "20px 24px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>TYPE</div>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{investorType || "—"}</div>
                  </div>
                  {assetTypes.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>HOLDS</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {assetTypes.map((a) => {
                          const found = ASSET_CLASSES.find((ac) => ac.label === a);
                          return (
                            <span
                              key={a}
                              style={{
                                fontSize: 12.5,
                                fontWeight: 500,
                                padding: "5px 12px",
                                borderRadius: 100,
                                background: C.greenPale,
                                color: C.greenDark,
                              }}
                            >
                              {found ? `${found.icon} ${a}` : a}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(investmentHorizon || strategy) && (
                    <div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>HORIZON</div>
                      <div style={{ fontSize: 14.5 }}>
                        {[investmentHorizon, strategy].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Behavioral Flags card */}
              <div style={{ width: "100%", marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.textMuted,
                    marginBottom: 10,
                  }}
                >
                  Behavioral Flags Detected
                </div>
                <div
                  style={{
                    background: C.bgCard,
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 16,
                    padding: "20px 24px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {behavioralFlags.map((flag, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom:
                          i < behavioralFlags.length - 1 ? `1px solid ${C.border}` : "none",
                        fontSize: 14,
                        color: C.redFlag,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: C.redFlag,
                          flexShrink: 0,
                        }}
                      />
                      {flag.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Thesis preview card */}
              <div style={{ width: "100%", marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.textMuted,
                    marginBottom: 10,
                  }}
                >
                  Your Thesis — Draft v1.0
                </div>
                <div
                  style={{
                    background: "linear-gradient(135deg, #EBF2EE 0%, #F5F3EF 100%)",
                    border: `1.5px solid ${C.greenPale}`,
                    borderRadius: 16,
                    padding: "24px 24px 24px 28px",
                    fontSize: 14.5,
                    lineHeight: 1.8,
                    color: C.textPrimary,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Left accent border */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: 4,
                      height: "100%",
                      background: C.greenDark,
                      borderRadius: "4px 0 0 4px",
                    }}
                  />
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: C.greenDark,
                      background: C.greenPale,
                      borderRadius: 100,
                      padding: "3px 10px",
                      marginBottom: 12,
                    }}
                  >
                    📌 Living Document
                  </span>
                  <p>
                    I'm a <strong>{generatedThesis.investor}</strong> with a{" "}
                    <strong>{generatedThesis.horizon}</strong> horizon, primarily in{" "}
                    {generatedThesis.assets}. I practice{" "}
                    <strong>{generatedThesis.strat}</strong>
                    {reviewFrequency ? ` and review my portfolio ${reviewFrequency.toLowerCase()}` : ""}.
                  </p>
                  {generatedThesis.enemy && (
                    <>
                      <br />
                      <p>
                        My core belief is in long-term compounding, though I'm aware I'm prone to{" "}
                        <strong>{generatedThesis.enemy.toLowerCase()}</strong> and emotional
                        decision-making during market stress. I aim to build guardrails that slow me
                        down before acting.
                      </p>
                    </>
                  )}
                  {investmentAnchor && (
                    <>
                      <br />
                      <p
                        style={{
                          fontStyle: "italic",
                          color: C.textSecondary,
                          borderTop: `1px solid ${C.border}`,
                          paddingTop: 12,
                          fontSize: 14,
                        }}
                      >
                        "{investmentAnchor}"
                      </p>
                    </>
                  )}
                  <br />
                  <p style={{ fontSize: 13, color: C.textMuted }}>
                    This thesis will automatically update as Thesis observes your decisions over time.
                  </p>
                </div>
              </div>

              <StepFooter
                continueLabel={saving ? "Saving..." : "Build my first rule →"}
                onContinue={() => void completeOnboarding()}
                continueDisabled={saving}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
