import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/utils";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchOnboardingProfile,
  OnboardingProfile,
  saveOnboardingProfile,
} from "@/app/services/api";

const INVESTOR_TYPES = [
  {
    label: "Still learning",
    icon: "🌱",
    description: "Building confidence and improving decision habits.",
  },
  {
    label: "Self-directed",
    icon: "📈",
    description: "Running your own process with moderate conviction.",
  },
  {
    label: "Active trader",
    icon: "⚡",
    description: "Higher-frequency decisions and tighter risk controls.",
  },
] as const;

const ASSET_TYPES = [
  "Stocks",
  "ETFs",
  "Bonds",
  "Real Estate",
  "Crypto",
  "Commodities",
  "Cash",
] as const;

const RISK_TOLERANCE_OPTIONS = ["Capital preservation", "Balanced growth", "Aggressive growth"] as const;
const DECISION_HORIZON_OPTIONS = ["Hours", "Days", "Weeks", "Months+"] as const;
const MARKET_FOCUS_OPTIONS = ["Macro trends", "Earnings events", "Valuation", "Momentum"] as const;

const BASELINE_OPTIONS = [
  { key: "panicSelling", label: "I tend to panic-sell during sharp drawdowns." },
  { key: "reactiveChecking", label: "I check positions too frequently when volatility rises." },
  { key: "shortDecisionWindow", label: "I often decide too quickly under pressure." },
  { key: "overConcentration", label: "I let winners grow beyond my target size." },
] as const;

type BaselineKey = (typeof BASELINE_OPTIONS)[number]["key"];
const ONBOARDING_PROFILE_STORAGE_KEY = "onboarding_profile";

export function Onboarding() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [investorType, setInvestorType] = useState<string>("");
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState<string>("");
  const [decisionHorizon, setDecisionHorizon] = useState<string>("");
  const [marketFocus, setMarketFocus] = useState<string>("");
  const [baselineFlags, setBaselineFlags] = useState<BaselineKey[]>(["panicSelling", "shortDecisionWindow"]);
  const [investmentAnchor, setInvestmentAnchor] = useState("");

  useEffect(() => {
    const localRaw =
      typeof window !== "undefined" ? window.localStorage.getItem(ONBOARDING_PROFILE_STORAGE_KEY) : null;
    const applyProfile = (profile: Partial<OnboardingProfile>) => {
      setInvestorType(profile.investorType || "");
      setAssetTypes(Array.isArray(profile.assetTypes) ? profile.assetTypes : []);
      setRiskTolerance(profile.riskTolerance || "");
      setDecisionHorizon(profile.decisionHorizon || "");
      setMarketFocus(profile.marketFocus || "");
      setBaselineFlags(
        Array.isArray(profile.baselineFlags)
          ? (profile.baselineFlags as BaselineKey[])
          : ["panicSelling", "shortDecisionWindow"],
      );
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

  const next = () => setStep((prev) => Math.min(4, prev + 1));
  const skip = () => next();

  const toggleAssetType = (assetType: string) => {
    setAssetTypes((prev) =>
      prev.includes(assetType) ? prev.filter((item) => item !== assetType) : [...prev, assetType],
    );
  };

  const toggleBaselineFlag = (flag: BaselineKey) => {
    setBaselineFlags((prev) => (prev.includes(flag) ? prev.filter((item) => item !== flag) : [...prev, flag]));
  };

  const behavioralFlags = useMemo(() => {
    const flags: string[] = [];

    if (baselineFlags.includes("panicSelling")) flags.push("Panic Selling Risk");
    if (baselineFlags.includes("reactiveChecking")) flags.push("Reactive Checking");
    if (baselineFlags.includes("shortDecisionWindow")) flags.push("Short Decision Window");
    if (baselineFlags.includes("overConcentration")) flags.push("Concentration Drift");
    if (assetTypes.includes("Crypto")) flags.push("High Volatility Exposure");

    if (flags.length === 0) {
      flags.push("Balanced Decision Pattern");
    }

    return flags;
  }, [assetTypes, baselineFlags]);

  const generatedThesis = useMemo(() => {
    const investor = investorType || "self-directed";
    const assets = assetTypes.length > 0 ? assetTypes.join(", ") : "diversified assets";
    const risk = riskTolerance || "balanced growth";
    const horizon = decisionHorizon || "weeks";
    return `You are a ${investor} investor focused on ${assets}. Your default mode targets ${risk} with a ${horizon.toLowerCase()} decision horizon.`;
  }, [investorType, assetTypes, riskTolerance, decisionHorizon]);

  const blindSpots = useMemo(() => {
    const items: string[] = [];
    if (baselineFlags.includes("panicSelling")) items.push("Emotion-driven exits during volatility spikes");
    if (baselineFlags.includes("shortDecisionWindow")) items.push("Compressed decision windows without full context");
    if (baselineFlags.includes("overConcentration")) items.push("Position sizing drift beyond policy");
    if (items.length === 0) items.push("No major behavioral blind spots detected");
    return items;
  }, [baselineFlags]);

  const completeOnboarding = async () => {
    const profile: OnboardingProfile = {
      investorType,
      assetTypes,
      riskTolerance,
      decisionHorizon,
      marketFocus,
      baselineFlags,
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
      <div className="min-h-screen bg-gray-50 px-4 py-10 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading onboarding...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all ${
                index === step ? "w-8 bg-gray-900" : index < step ? "w-2 bg-gray-700" : "w-6 bg-gray-300"
              }`}
            />
          ))}
        </div>

        <Card>
          <CardContent className="p-8">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">Who are you as an investor?</h1>
                  <p className="text-gray-600 mt-2">No judgment — just context.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {INVESTOR_TYPES.map((type) => (
                    <button
                      key={type.label}
                      type="button"
                      className={cn(
                        "rounded-xl border px-4 py-5 text-sm text-left transition-colors shadow-sm",
                        investorType === type.label
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                      onClick={() => setInvestorType(type.label)}
                    >
                      <p className="text-xl mb-2">{type.icon}</p>
                      <p className="font-medium">{type.label}</p>
                      <p className={cn("mt-1 text-xs", investorType === type.label ? "text-gray-200" : "text-gray-500")}>
                        {type.description}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={next} size="sm" disabled={!investorType}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">What does your portfolio look like?</h1>
                  <p className="text-gray-600 mt-2">This shapes how we interpret your decisions.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ASSET_TYPES.map((asset) => (
                    <button
                      key={asset}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-3 text-sm text-left transition-colors",
                        assetTypes.includes(asset)
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                      onClick={() => toggleAssetType(asset)}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">Risk tolerance</p>
                  <div className="flex flex-wrap gap-2">
                    {RISK_TOLERANCE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          riskTolerance === option
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                        )}
                        onClick={() => setRiskTolerance(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">Decision horizon</p>
                  <div className="flex flex-wrap gap-2">
                    {DECISION_HORIZON_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          decisionHorizon === option
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                        )}
                        onClick={() => setDecisionHorizon(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">Primary market focus</p>
                  <div className="flex flex-wrap gap-2">
                    {MARKET_FOCUS_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          marketFocus === option
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                        )}
                        onClick={() => setMarketFocus(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-4">
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:text-gray-700"
                    onClick={skip}
                  >
                    Skip
                  </button>
                  <Button onClick={next} size="sm">
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">Your honest baseline</h1>
                  <p className="text-gray-600 mt-2">There are no wrong answers.</p>
                </div>
                <div className="space-y-3">
                  {BASELINE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-sm text-left transition-colors",
                        baselineFlags.includes(option.key)
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                      onClick={() => toggleBaselineFlag(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                  <textarea
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm min-h-[120px]"
                    placeholder="Optional: write your long-term investment anchor"
                    value={investmentAnchor}
                    onChange={(event) => setInvestmentAnchor(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-4">
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:text-gray-700"
                    onClick={skip}
                  >
                    Skip
                  </button>
                  <Button onClick={next} size="sm">
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">Your investment thesis is set.</h1>
                  <p className="text-gray-600 mt-2">
                    As you use My Investment Thesis, it will evolve with you.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    AI-Generated Thesis
                  </p>
                  <p className="text-sm text-gray-700">{generatedThesis}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Behavioral Flags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {behavioralFlags.map((flag) => (
                      <Badge key={flag} variant="secondary">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Potential Blind Spots
                  </p>
                  <div className="space-y-1">
                    {blindSpots.map((item) => (
                      <p key={item} className="text-sm text-gray-700">
                        • {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => void completeOnboarding()} size="sm" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Build My First Rule"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
