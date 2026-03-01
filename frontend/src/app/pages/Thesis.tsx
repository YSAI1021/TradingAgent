import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useCopilot } from "@/app/context/CopilotContext";
import { useAuth } from "@/app/context/AuthContext";
import { Slider } from "@/app/components/ui/slider";
import {
  createThesisEquity,
  deleteThesisEquity,
  fetchUserRules,
  fetchDashboardStats,
  fetchDecisionEvents,
  fetchThesisEquities,
  createUserRule,
  updateUserRule,
  deleteUserRule,
  seedDecisionEvents,
  DashboardStats,
  DecisionEvent,
  ThesisBucket,
  ThesisEquity,
  updateThesisEquity,
} from "@/app/services/api";

const BUCKETS = ["Equities", "Real Estate", "Crypto"] as const;
type BucketKey = (typeof BUCKETS)[number];

const SYMBOL_OPTIONS_BY_BUCKET: Record<BucketKey, Array<{ symbol: string; company: string }>> = {
  Equities: [
    { symbol: "AAPL", company: "Apple Inc." },
    { symbol: "MSFT", company: "Microsoft Corp." },
    { symbol: "GOOGL", company: "Alphabet Inc." },
    { symbol: "NVDA", company: "NVIDIA Corp." },
    { symbol: "UNH", company: "UnitedHealth Group" },
    { symbol: "XOM", company: "Exxon Mobil" },
    { symbol: "TSLA", company: "Tesla Inc." },
    { symbol: "AMZN", company: "Amazon.com Inc." },
    { symbol: "META", company: "Meta Platforms" },
    { symbol: "JPM", company: "JPMorgan Chase" },
    { symbol: "AMD", company: "Advanced Micro Devices" },
  ],
  "Real Estate": [
    { symbol: "VNQ", company: "Vanguard Real Estate ETF" },
    { symbol: "O", company: "Realty Income Corp." },
    { symbol: "PLD", company: "Prologis Inc." },
    { symbol: "AMT", company: "American Tower Corp." },
    { symbol: "SPG", company: "Simon Property Group" },
    { symbol: "REIT", company: "Real Estate (tracked via VNQ)" },
  ],
  Crypto: [
    { symbol: "BTC", company: "Bitcoin" },
    { symbol: "ETH", company: "Ethereum" },
    { symbol: "SOL", company: "Solana" },
  ],
};
const SYMBOL_BUCKET_LOOKUP = new Map<string, BucketKey>();
Object.entries(SYMBOL_OPTIONS_BY_BUCKET).forEach(([bucket, items]) => {
  items.forEach((item) => SYMBOL_BUCKET_LOOKUP.set(item.symbol, bucket as BucketKey));
});

type RuleCategory = "Macro" | "Earnings" | "Risk" | "Behavior";
type RuleItem = {
  id: number;
  category: RuleCategory;
  condition: string;
  action: string;
  status: "Active" | "Triggered";
};

type EquityThesisItem = {
  id: number;
  symbol: string;
  company: string;
  allocation: string;
  stopLoss: string;
  targetPrice: string;
  thesis: string;
  validity: string;
};

const INITIAL_EQUITIES_BY_BUCKET: Record<BucketKey, EquityThesisItem[]> = {
  Equities: [
    {
      id: 1,
      symbol: "AAPL",
      company: "Apple Inc.",
      allocation: "18%",
      stopLoss: "230",
      targetPrice: "320",
      thesis:
        "Services growth and ecosystem retention continue to support quality compounding.",
      validity: "10 MO left",
    },
    {
      id: 2,
      symbol: "MSFT",
      company: "Microsoft Corp.",
      allocation: "20%",
      stopLoss: "380",
      targetPrice: "520",
      thesis:
        "Cloud and enterprise AI monetization remain the core durable growth engine.",
      validity: "12 MO left",
    },
    {
      id: 3,
      symbol: "XOM",
      company: "Exxon Mobil",
      allocation: "8%",
      stopLoss: "95",
      targetPrice: "140",
      thesis: "Cash flow and capital discipline support downside resilience in energy cycles.",
      validity: "Review in 4 MO",
    },
  ],
  "Real Estate": [
    {
      id: 4,
      symbol: "O",
      company: "Realty Income",
      allocation: "6%",
      stopLoss: "45",
      targetPrice: "70",
      thesis: "Income and defensiveness with monthly dividend stability.",
      validity: "Perpetual",
    },
  ],
  Crypto: [
    {
      id: 5,
      symbol: "BTC",
      company: "Bitcoin",
      allocation: "3%",
      stopLoss: "52000",
      targetPrice: "95000",
      thesis: "Long-duration optionality with strict position-size guardrails.",
      validity: "Review quarterly",
    },
  ],
};

type EquityDraft = {
  id: number | null;
  symbol: string;
  company: string;
  allocation: string;
  stopLoss: string;
  targetPrice: string;
  thesis: string;
  validity: string;
};

const EMPTY_EQUITY_DRAFT: EquityDraft = {
  id: null,
  symbol: "",
  company: "",
  allocation: "",
  stopLoss: "",
  targetPrice: "",
  thesis: "",
  validity: "",
};

const RULE_CONDITION_PRESETS = [
  "Single position > 25% of portfolio",
  "Tech sector exposure > 60%",
  "Portfolio drawdown > 5% in 1 week",
  "VIX > 20 and rising",
  "Earnings miss with guidance cut",
  "I override my risk rule twice in one week",
];

const RULE_ACTION_PRESETS = [
  "Pause new buys for 24 hours and reassess",
  "Trim oversized position back to target weight",
  "Reduce correlated risk across top positions",
  "Require a second review before any sell decision",
  "Log rationale before placing the next trade",
  "Set an alert and review in the next market close",
];

function classifyRuleCategory(condition: string, action: string): RuleCategory {
  const text = `${condition} ${action}`.toLowerCase();
  if (/earnings|guidance|quarter|q[1-4]|report/.test(text)) return "Earnings";
  if (/panic|emotion|discipline|override|fomo|hesitat/.test(text)) return "Behavior";
  if (/vix|inflation|macro|fed|rate|yield|oil|dollar/.test(text)) return "Macro";
  return "Risk";
}

function mapEquitiesToBuckets(rows: ThesisEquity[]): Record<BucketKey, EquityThesisItem[]> {
  const grouped: Record<BucketKey, EquityThesisItem[]> = {
    Equities: [],
    "Real Estate": [],
    Crypto: [],
  };

  rows.forEach((row) => {
    if (!BUCKETS.includes(row.bucket)) return;
    grouped[row.bucket].push({
      id: row.id,
      symbol: row.symbol,
      company: row.company,
      allocation: row.allocation || "",
      stopLoss: row.stopLoss || "",
      targetPrice: row.targetPrice || "",
      thesis: row.thesis,
      validity: row.validity,
    });
  });

  return grouped;
}

export function Thesis() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { sendPrompt } = useCopilot();
  const { holdings: portfolioHoldings } = usePortfolio();

  const [rules, setRules] = useState<RuleItem[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [rulesExpanded, setRulesExpanded] = useState(true);

  const activeRulesCount = useMemo(
    () => rules.filter((r) => r.status === "Active").length,
    [rules],
  );
  const [newCondition, setNewCondition] = useState("");
  const [newAction, setNewAction] = useState("");
  const [conditionPreset, setConditionPreset] = useState("");
  const [actionPreset, setActionPreset] = useState("");
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [addRuleError, setAddRuleError] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  const RULE_OTHER_VALUE = "__other__";
  const RULE_MAX_CHARS = 200;

  const openEditRule = (rule: RuleItem) => {
    setEditingRuleId(rule.id);
    setAddRuleError("");

    if (RULE_CONDITION_PRESETS.includes(rule.condition)) {
      setConditionPreset(rule.condition);
      setNewCondition(rule.condition);
    } else {
      setConditionPreset(RULE_OTHER_VALUE);
      setNewCondition(rule.condition);
    }

    if (RULE_ACTION_PRESETS.includes(rule.action)) {
      setActionPreset(rule.action);
      setNewAction(rule.action);
    } else {
      setActionPreset(RULE_OTHER_VALUE);
      setNewAction(rule.action);
    }

    setAddRuleOpen(true);
  };

  const askAboutRule = (rule: RuleItem) => {
    const prompt = `Evaluate this trading rule for clarity, practicality, and risk management. Suggest a tighter version if needed.\n\nIF: ${rule.condition}\nTHEN: ${rule.action}`
    sendPrompt(prompt, { submit: true })
  }

  const askAboutAsset = (item: EquityThesisItem) => {
    const prompt = `Review this asset thesis and provide:\n- Key risks + what would invalidate it\n- Suggested improvements (more specific triggers/metrics)\n- Allocation sanity check\n- Whether my price triggers are sensible (stop loss / target)\n\nAsset: ${item.symbol} (${item.company})\nTarget Allocation: ${item.allocation || "—"}\nStop Loss: ${item.stopLoss || "—"}\nTarget Price: ${item.targetPrice || "—"}\nValidity: ${item.validity}\nThesis: ${item.thesis}`
    sendPrompt(prompt, { submit: true })
  }

  const askAboutDecisionEvent = (evt: DecisionEvent) => {
    const prompt = `Evaluate this decision timeline entry for discipline and rule adherence. Provide:\n- Was this disciplined? Why/why not\n- What rule/guardrail would you add or tighten\n- A short coaching note for next time\n\nEvent Type: ${evt.event_type}\nDate: ${evt.created_at}\nDescription: ${evt.description || "—"}`
    sendPrompt(prompt, { submit: true })
  }

  const deleteRule = async (ruleId: number) => {
    if (!confirm("Delete this rule?")) return;
    if (!token) return;
    try {
      await deleteUserRule(token, ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      if (editingRuleId === ruleId) {
        setEditingRuleId(null);
        setAddRuleOpen(false);
      }
    } catch (err) {
      // keep UI simple: surface a message in the add-rule error region if dialog is open
      const msg = err instanceof Error ? err.message : "Failed to delete rule";
      setAddRuleError(msg);
    }
  };

  const [selectedBucket, setSelectedBucket] = useState<BucketKey>("Equities");
  const [equitiesByBucket, setEquitiesByBucket] = useState<Record<BucketKey, EquityThesisItem[]>>(
    INITIAL_EQUITIES_BY_BUCKET,
  );
  const [equitiesLoading, setEquitiesLoading] = useState(false);
  const [equitySaving, setEquitySaving] = useState(false);
  const [equityError, setEquityError] = useState("");
  const [assetsExpanded, setAssetsExpanded] = useState(true);
  const [equityDialogOpen, setEquityDialogOpen] = useState(false);
  const [equityDraft, setEquityDraft] = useState<EquityDraft>(EMPTY_EQUITY_DRAFT);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [decisionEvents, setDecisionEvents] = useState<DecisionEvent[]>([]);
  const [decisionEventsLoading, setDecisionEventsLoading] = useState(false);
  const [decisionEventsError, setDecisionEventsError] = useState("");

  const thesisSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(equitiesByBucket)
            .flatMap((items) => items.map((item) => item.symbol))
            .filter(Boolean),
        ),
      ),
    [equitiesByBucket],
  );
  const { quotes } = useStockQuotes(thesisSymbols);
  const selectedEquities = equitiesByBucket[selectedBucket] || [];

  const symbolSuggestions = useMemo(() => {
    const merged = new Map<string, { symbol: string; company: string }>();
    (SYMBOL_OPTIONS_BY_BUCKET[selectedBucket] || []).forEach((item) => merged.set(item.symbol, item));
    selectedEquities.forEach(({ symbol, company }) => {
      if (!merged.has(symbol)) {
        merged.set(symbol, { symbol, company: company || symbol });
      }
    });
    return Array.from(merged.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [selectedBucket, selectedEquities]);

  const selectedDraftSymbol = equityDraft.symbol.trim().toUpperCase();
  const draftHolding = useMemo(
    () => portfolioHoldings.find((h) => h.symbol === selectedDraftSymbol),
    [portfolioHoldings, selectedDraftSymbol],
  );
  const draftPrice = draftHolding?.currentPrice ?? quotes[selectedDraftSymbol]?.price ?? null;
  const draftAllocationPct = draftHolding?.allocation ?? null;

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const addMonths = (base: Date, months: number) =>
    new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const getLogicBaseDate = () => {
    // Use a fixed start date for the "Logic Valid Until" slider: Mar 1, 2026.
    return new Date(2026, 2, 1);
  };
  const parseMonthsFromValidity = (value: string) => {
    const raw = String(value || "").trim();
    const mo = raw.match(/(\d+)\s*mo/i);
    if (mo) return clamp(parseInt(mo[1], 10) || 0, 0, 36);
    const ts = Date.parse(raw);
    if (!Number.isNaN(ts)) {
      const base = getLogicBaseDate();
      const end = new Date(ts);
      const months =
        (end.getFullYear() - base.getFullYear()) * 12 + (end.getMonth() - base.getMonth());
      return clamp(months || 0, 0, 36);
    }
    return 0;
  };

  const [expiryMonths, setExpiryMonths] = useState<number>(6);
  useEffect(() => {
    if (!equityDialogOpen) return;
    const months = parseMonthsFromValidity(equityDraft.validity);
    setExpiryMonths(months);
    // If the slider shows a computed date but `validity` is blank (new thesis),
    // prefill validity so Save works without forcing the user to touch the slider.
    if (!equityDraft.validity?.trim()) {
      const until = addMonths(getLogicBaseDate(), months);
      setEquityDraft((prev) => (prev.validity?.trim() ? prev : { ...prev, validity: formatDate(until) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityDialogOpen, equityDraft.id]);

  const reviewCards = useMemo(() => {
    const s = dashboardStats;
    if (!s) {
      return [
        { title: "Rule Adherence", value: "—", subtitle: "Loading...", prompt: "Analyze my rule adherence patterns and how to improve next week." },
        { title: "Overrides", value: "—", subtitle: "Loading...", prompt: "Why did I override my rules recently, and what guardrails should I add?" },
        { title: "Panic Pauses Used", value: "—", subtitle: "Loading...", prompt: "What does my panic-pause behavior say about my decision quality and bias?" },
      ];
    }
    return [
      {
        title: "Rule Adherence",
        value: `${s.ruleAdherence}%`,
        subtitle: `${s.honored} of ${s.totalDecisions} decisions honored your rules`,
        prompt: "Analyze my rule adherence patterns and how to improve next week.",
      },
      {
        title: "Overrides",
        value: String(s.overrides),
        subtitle: s.overrides === 1 ? "Occurred during a high-volatility session" : s.overrides > 0 ? "Occurred during high-volatility sessions" : "No overrides in the last 90 days",
        prompt: "Why did I override my rules recently, and what guardrails should I add?",
      },
      {
        title: "Panic Pauses Used",
        value: String(s.panicPauses),
        subtitle: s.panicPauses > 0 ? `Average cooling-off period: ${s.avgCoolingHours}h` : "No panic pauses in the last 90 days",
        prompt: "What does my panic-pause behavior say about my decision quality and bias?",
      },
    ];
  }, [dashboardStats]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;

    const loadStats = async () => {
      try {
        // Seed demo data on first visit (no-op if already seeded)
        await seedDecisionEvents(token).catch(() => {});
        const stats = await fetchDashboardStats(token);
        if (mounted) setDashboardStats(stats);
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
        // Fallback so cards don't stay on "Loading..." forever
        if (mounted) {
          setDashboardStats({
            ruleAdherence: 0,
            totalDecisions: 0,
            honored: 0,
            overrides: 0,
            panicPauses: 0,
            avgCoolingHours: 0,
          });
        }
      }
    };

    void loadStats();
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !timelineExpanded) return;
    let mounted = true;

    const loadEvents = async () => {
      setDecisionEventsLoading(true);
      setDecisionEventsError("");
      try {
        const rows = await fetchDecisionEvents(token, 50);
        if (!mounted) return;
        setDecisionEvents(rows || []);
      } catch (err) {
        if (!mounted) return;
        setDecisionEventsError(err instanceof Error ? err.message : "Failed to load decision events");
        setDecisionEvents([]);
      } finally {
        if (mounted) setDecisionEventsLoading(false);
      }
    };

    void loadEvents();
    return () => {
      mounted = false;
    };
  }, [token, timelineExpanded]);

  useEffect(() => {
    if (!token) {
      setRules([]);
      setRulesError("");
      return;
    }
    let mounted = true;
    const loadRules = async () => {
      setRulesLoading(true);
      setRulesError("");
      try {
        const rows = await fetchUserRules(token);
        if (!mounted) return;
        setRules(
          (rows || []).map((r) => ({
            id: r.id,
            category: classifyRuleCategory(r.condition, r.action),
            condition: r.condition,
            action: r.action,
            status: r.status,
          })),
        );
      } catch (err) {
        if (!mounted) return;
        setRulesError(err instanceof Error ? err.message : "Failed to load rules");
        setRules([]);
      } finally {
        if (mounted) setRulesLoading(false);
      }
    };
    void loadRules();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;

    const loadEquities = async () => {
      setEquitiesLoading(true);
      setEquityError("");
      try {
        let rows = await fetchThesisEquities(token);
        if (rows.length === 0) {
          const seedTasks: Promise<ThesisEquity>[] = [];
          BUCKETS.forEach((bucket) => {
            (INITIAL_EQUITIES_BY_BUCKET[bucket] || []).forEach((item) => {
              seedTasks.push(
                createThesisEquity(token, {
                  bucket: bucket as ThesisBucket,
                  symbol: item.symbol,
                  company: item.company,
                  allocation: item.allocation,
                  stopLoss: item.stopLoss,
                  targetPrice: item.targetPrice,
                  thesis: item.thesis,
                  validity: item.validity,
                }),
              );
            });
          });
          if (seedTasks.length > 0) {
            await Promise.all(seedTasks);
            rows = await fetchThesisEquities(token);
          }
        }

        if (!mounted) return;
        setEquitiesByBucket(mapEquitiesToBuckets(rows));
      } catch (err) {
        if (!mounted) return;
        setEquityError(err instanceof Error ? err.message : "Failed to load thesis equities");
      } finally {
        if (mounted) setEquitiesLoading(false);
      }
    };

    void loadEquities();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("startRule") === "1") {
      setAddRuleOpen(true);
      params.delete("startRule");
      const nextSearch = params.toString();
      navigate(`/thesis${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
    }
  }, [location.search, navigate]);

  const [ruleSaving, setRuleSaving] = useState(false);

  const addRule = async () => {
    const condition = newCondition.trim();
    const action = newAction.trim();
    if (!conditionPreset || !actionPreset || !condition || !action) {
      setAddRuleError("Please select both a condition and an action.");
      return;
    }
    if (condition.length > RULE_MAX_CHARS || action.length > RULE_MAX_CHARS) {
      setAddRuleError(`Keep each field under ${RULE_MAX_CHARS} characters.`);
      return;
    }
    if (!token) {
      setAddRuleError("Please log in to save rules.");
      return;
    }

    setRuleSaving(true);
    setAddRuleError("");
    try {
      if (editingRuleId != null) {
        const saved = await updateUserRule(token, editingRuleId, {
          condition,
          action,
          status: "Active",
        });
        setRules((prev) =>
          prev.map((r) =>
            r.id === editingRuleId
              ? {
                  ...r,
                  category: classifyRuleCategory(saved.condition, saved.action),
                  condition: saved.condition,
                  action: saved.action,
                  status: saved.status,
                }
              : r,
          ),
        );
      } else {
        const saved = await createUserRule(token, { condition, action, status: "Active" });
        setRules((prev) => [
          {
            id: saved.id,
            category: classifyRuleCategory(saved.condition, saved.action),
            condition: saved.condition,
            action: saved.action,
            status: saved.status,
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setAddRuleError(err instanceof Error ? err.message : "Failed to save rule");
      return;
    } finally {
      setRuleSaving(false);
    }
    setNewCondition("");
    setNewAction("");
    setConditionPreset("");
    setActionPreset("");
    setAddRuleError("");
    setEditingRuleId(null);
    setAddRuleOpen(false);
  };

  const handleAddRuleDialogChange = (open: boolean) => {
    setAddRuleOpen(open);
    if (!open) {
      setConditionPreset("");
      setActionPreset("");
      setNewCondition("");
      setNewAction("");
      setAddRuleError("");
      setEditingRuleId(null);
    }
  };

  const openNewEquityDialog = () => {
    setEquityDraft(EMPTY_EQUITY_DRAFT);
    setEquityError("");
    setEquityDialogOpen(true);
  };

  const handleEquitySymbolChange = (value: string) => {
    const nextSymbol = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const matched = symbolSuggestions.find((item) => item.symbol === nextSymbol);
    setEquityDraft((prev) => {
      const prevCompany = prev.company.trim();
      return {
        ...prev,
        symbol: nextSymbol,
        // Keep company always in sync with selected symbol when we have a known mapping.
        company: matched?.company ? matched.company : prevCompany ? prev.company : nextSymbol,
      };
    });
  };

  const openEditEquityDialog = (item: EquityThesisItem) => {
    setEquityDraft({
      id: item.id,
      symbol: item.symbol,
      company: item.company,
      allocation: item.allocation,
      stopLoss: item.stopLoss,
      targetPrice: item.targetPrice,
      thesis: item.thesis,
      validity: item.validity,
    });
    setEquityError("");
    setEquityDialogOpen(true);
  };

  const saveEquity = async () => {
    const symbol = equityDraft.symbol.trim().toUpperCase();
    const company = equityDraft.company.trim();
    const allocationRaw = equityDraft.allocation.trim();
    const allocation =
      allocationRaw && !allocationRaw.endsWith("%") ? `${allocationRaw}%` : allocationRaw;
    const stopLoss = equityDraft.stopLoss.trim();
    const targetPrice = equityDraft.targetPrice.trim();
    const thesis = equityDraft.thesis.trim();
    const validity = equityDraft.validity.trim();
    if (!symbol || !company || !allocation || !stopLoss || !targetPrice || !thesis || !validity) {
      setEquityError("Please complete Symbol, Company, Allocation, Stop Loss, Target Price, Thesis, and Validity before saving.");
      return;
    }
    const knownBucket = SYMBOL_BUCKET_LOOKUP.get(symbol);
    if (knownBucket && knownBucket !== selectedBucket) {
      setEquityError(`Symbol ${symbol} belongs to ${knownBucket}. Please switch bucket or choose another symbol.`);
      return;
    }
    if (!token) {
      setEquityError("Please log in to save thesis equity.");
      return;
    }

    setEquitySaving(true);
    setEquityError("");
    try {
      const payload = {
        bucket: selectedBucket as ThesisBucket,
        symbol,
        company,
        allocation,
        stopLoss,
        targetPrice,
        thesis,
        validity,
      };

      const saved =
        equityDraft.id == null
          ? await createThesisEquity(token, payload)
          : await updateThesisEquity(token, equityDraft.id, payload);

      setEquitiesByBucket((prev) => {
        const rows = [...(prev[selectedBucket] || [])];
        const mapped: EquityThesisItem = {
          id: saved.id,
          symbol: saved.symbol,
          company: saved.company,
          allocation: saved.allocation,
          stopLoss: saved.stopLoss,
          targetPrice: saved.targetPrice,
          thesis: saved.thesis,
          validity: saved.validity,
        };
        if (equityDraft.id == null) {
          rows.unshift(mapped);
        } else {
          const idx = rows.findIndex((row) => row.id === equityDraft.id);
          if (idx >= 0) rows[idx] = mapped;
        }
        return { ...prev, [selectedBucket]: rows };
      });

      setEquityDialogOpen(false);
      setEquityDraft(EMPTY_EQUITY_DRAFT);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save thesis equity";
      setEquityError(msg);
      if (/session expired|invalid|access token required|user account not found/i.test(msg)) {
        navigate("/login");
      }
    } finally {
      setEquitySaving(false);
    }
  };

  const deleteEquity = async (id: number) => {
    if (!token) {
      setEquityError("Please log in to delete thesis equity.");
      return;
    }
    setEquitySaving(true);
    setEquityError("");
    try {
      await deleteThesisEquity(token, id);
      setEquitiesByBucket((prev) => ({
        ...prev,
        [selectedBucket]: (prev[selectedBucket] || []).filter((row) => row.id !== id),
      }));
    } catch (err) {
      setEquityError(err instanceof Error ? err.message : "Failed to delete thesis equity");
    } finally {
      setEquitySaving(false);
    }
  };

  const formatTimelineDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

  const splitTitleDetail = (desc: string | null) => {
    const raw = (desc || "").trim();
    if (!raw) return { title: "Decision event", detail: "—" };
    const parts = raw.split("—").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { title: parts[0], detail: parts.slice(1).join(" — ") };
    return { title: raw.length > 70 ? `${raw.slice(0, 70)}…` : raw, detail: raw };
  };

  const eventTypeLabel = (t: DecisionEvent["event_type"]) => {
    if (t === "rule_honored") return "Rule followed";
    if (t === "rule_override") return "Rule overridden";
    return "Panic pause";
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviewCards.map((card) => (
          <Card key={card.title} className="h-full hover:shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-blue-500 rounded-xl">
            <CardContent className="pt-5 h-full flex flex-col">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{card.title}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="mt-1 text-sm text-gray-600">{card.subtitle}</p>

              <div className="mt-auto pt-4 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => sendPrompt(card.prompt, { submit: true })}
                >
                  Ask
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Rules</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span
                  className={`h-2 w-2 rounded-full ${
                    rulesLoading ? "bg-gray-300" : activeRulesCount > 0 ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                <span>
                  {rulesLoading
                    ? "Loading…"
                    : `${activeRulesCount} rule${activeRulesCount === 1 ? "" : "s"} active`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingRuleId(null);
                  setConditionPreset("");
                  setActionPreset("");
                  setNewCondition("");
                  setNewAction("");
                  setAddRuleError("");
                  setAddRuleOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Rule
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => setRulesExpanded((v) => !v)}
              >
                {rulesExpanded ? (
                  <>
                    Collapse
                    <ChevronUp className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Expand
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {rulesExpanded ? <CardContent className="space-y-2">
          {rulesError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {rulesError}
            </div>
          ) : null}
          {rulesLoading ? <p className="text-sm text-gray-500">Loading rules...</p> : null}
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  IF <span className="text-blue-700">{rule.condition}</span> THEN{" "}
                  <span className="text-gray-700">{rule.action}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => askAboutRule(rule)}
                  title="Ask Copilot"
                >
                  Ask
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditRule(rule)}
                  title="Edit rule"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700"
                  onClick={() => deleteRule(rule.id)}
                  title="Delete rule"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Badge
                  className={
                    rule.status === "Triggered"
                      ? "bg-amber-100 text-amber-800 border-0"
                      : "bg-green-100 text-green-800 border-0"
                  }
                >
                  {rule.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent> : null}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Assets</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openNewEquityDialog}>
                <Plus className="w-4 h-4 mr-1" />
                Add Thesis
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => setAssetsExpanded((v) => !v)}
              >
                {assetsExpanded ? (
                  <>
                    Collapse
                    <ChevronUp className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Expand
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {assetsExpanded ? (
        <CardContent className="space-y-4">
          {equityError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {equityError}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {BUCKETS.map((bucket) => (
              <Button
                key={bucket}
                size="sm"
                variant={selectedBucket === bucket ? "secondary" : "outline"}
                onClick={() => setSelectedBucket(bucket)}
              >
                {bucket}
              </Button>
            ))}
          </div>

          <div className="space-y-3">
            {equitiesLoading && <p className="text-sm text-gray-500">Loading thesis equities...</p>}
            {!equitiesLoading && selectedEquities.length === 0 && (
              <p className="text-sm text-gray-500">No thesis equities yet in this bucket.</p>
            )}
            {selectedEquities.map((item) => (
              <div key={`${selectedBucket}-${item.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{item.symbol}</p>
                    <p className="text-sm text-gray-500">{item.company}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{item.allocation}</p>
                    <p className="text-xs text-gray-500">
                      Stop: ${item.stopLoss || "—"} · Target: ${item.targetPrice || "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {quotes[item.symbol]?.price
                        ? `$${quotes[item.symbol]?.price.toFixed(2)}`
                        : "Price loading..."}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-700">{item.thesis}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">Validity: {item.validity}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => askAboutAsset(item)}
                    >
                      Ask
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditEquityDialog(item)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void deleteEquity(item.id)}
                      disabled={equitySaving}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span>Decision Timeline</span>
            </div>
            <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => setTimelineExpanded((prev) => !prev)}>
              {timelineExpanded ? (
                <>
                  Collapse
                  <ChevronUp className="w-4 h-4 ml-1" />
                </>
              ) : (
                <>
                  Expand
                  <ChevronDown className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        {timelineExpanded && (
          <CardContent className="space-y-4">
            {decisionEventsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {decisionEventsError}
              </div>
            ) : null}

            {decisionEventsLoading ? (
              <p className="text-sm text-gray-500">Loading timeline…</p>
            ) : decisionEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No decision events yet.</p>
            ) : (
              <div className="relative pl-7">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
                {decisionEvents.map((evt) => {
                  const isDisciplined = evt.event_type !== "rule_override";
                  const { title, detail } = splitTitleDetail(evt.description);
                  return (
                    <div key={evt.id} className="relative pb-5 last:pb-0">
                      <div
                        className={`absolute -left-[2px] top-3 h-3 w-3 rounded-full border-2 ${
                          isDisciplined ? "border-emerald-600" : "border-amber-600"
                        } bg-white`}
                      />
                      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {formatTimelineDate(evt.created_at)}
                        </p>
                        <p className="mt-2 text-base font-semibold text-gray-900">{title}</p>
                        <p className="mt-1 text-sm text-gray-600">{detail}</p>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              className={
                                isDisciplined
                                  ? "bg-emerald-100 text-emerald-800 border-0"
                                  : "bg-amber-100 text-amber-800 border-0"
                              }
                            >
                              {isDisciplined ? "Disciplined" : "Undisciplined"}
                            </Badge>
                            <Badge className="bg-gray-100 text-gray-700 border-0">
                              {eventTypeLabel(evt.event_type)}
                            </Badge>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => askAboutDecisionEvent(evt)}
                          >
                            Ask
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={addRuleOpen} onOpenChange={handleAddRuleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRuleId != null ? "Edit Rule" : "Add Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs text-gray-600 mb-1">Guided IF condition</p>
              <Select
                value={conditionPreset || undefined}
                onValueChange={(value) => {
                  setConditionPreset(value);
                  setAddRuleError("");
                  if (value === RULE_OTHER_VALUE) {
                    setNewCondition("");
                  } else {
                    setNewCondition(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a condition template" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_CONDITION_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                  <SelectItem value={RULE_OTHER_VALUE}>Other…</SelectItem>
                </SelectContent>
              </Select>
              {conditionPreset === RULE_OTHER_VALUE ? (
                <div className="mt-2 space-y-1">
                  <Input
                    placeholder={`Write a short condition (max ${RULE_MAX_CHARS} chars)`}
                    value={newCondition}
                    maxLength={RULE_MAX_CHARS}
                    onChange={(e) => setNewCondition(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    {newCondition.length}/{RULE_MAX_CHARS}
                  </p>
                </div>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Guided THEN action</p>
              <Select
                value={actionPreset || undefined}
                onValueChange={(value) => {
                  setActionPreset(value);
                  setAddRuleError("");
                  if (value === RULE_OTHER_VALUE) {
                    setNewAction("");
                  } else {
                    setNewAction(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an action template" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_ACTION_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                  <SelectItem value={RULE_OTHER_VALUE}>Other…</SelectItem>
                </SelectContent>
              </Select>
              {actionPreset === RULE_OTHER_VALUE ? (
                <div className="mt-2 space-y-1">
                  <Input
                    placeholder={`Write a short action (max ${RULE_MAX_CHARS} chars)`}
                    value={newAction}
                    maxLength={RULE_MAX_CHARS}
                    onChange={(e) => setNewAction(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    {newAction.length}/{RULE_MAX_CHARS}
                  </p>
                </div>
              ) : null}
            </div>
            {addRuleError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {addRuleError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRuleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addRule}
              disabled={
                ruleSaving ||
                !conditionPreset ||
                !actionPreset ||
                !newCondition.trim() ||
                !newAction.trim() ||
                newCondition.trim().length > RULE_MAX_CHARS ||
                newAction.trim().length > RULE_MAX_CHARS
              }
            >
              {ruleSaving ? "Saving..." : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={equityDialogOpen} onOpenChange={setEquityDialogOpen}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[1000px] gap-6 rounded-2xl p-10 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle>
              {equityDraft.id == null
                ? selectedDraftSymbol
                  ? `Add ${selectedDraftSymbol} Thesis`
                  : "Add Thesis"
                : selectedDraftSymbol
                  ? `Edit ${selectedDraftSymbol} Thesis`
                  : "Edit Thesis"}
            </DialogTitle>
            {selectedDraftSymbol ? (
              <p className="text-sm text-gray-500">
                Editing: {equityDraft.company?.trim() || selectedDraftSymbol}{" "}
                <span className="text-green-600 font-medium">
                  · Current Price:{" "}
                  {draftPrice != null
                    ? `$${draftPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </p>
            ) : null}
          </DialogHeader>

          {equityError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {equityError}
            </div>
          ) : null}

          <div className="grid gap-8 py-4 lg:grid-cols-2">
            {/* Left: Investment Conviction */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Investment Conviction
              </p>
              <Textarea
                placeholder="Core strategic thesis"
                value={equityDraft.thesis}
                onChange={(e) => setEquityDraft((prev) => ({ ...prev, thesis: e.target.value }))}
                className="min-h-[320px] text-base leading-relaxed"
              />
            </div>

            {/* Right: Details */}
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Asset</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={equityDraft.symbol || undefined}
                    onValueChange={(value) => handleEquitySymbolChange(value)}
                    disabled={equityDraft.id != null}
                  >
                    <SelectTrigger className="h-12 w-full !py-1 !text-base md:!text-base">
                      <SelectValue placeholder="Symbol" />
                    </SelectTrigger>
                    <SelectContent>
                      {symbolSuggestions.map((item) => (
                        <SelectItem key={item.symbol} value={item.symbol}>
                          {item.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Company"
                    value={equityDraft.company}
                    onChange={(e) => setEquityDraft((prev) => ({ ...prev, company: e.target.value }))}
                    readOnly={Boolean(equityDraft.symbol.trim())}
                    className="h-12 w-full !text-base md:!text-base read-only:opacity-100 read-only:cursor-default"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Target Allocation</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Input
                      placeholder="Target"
                      value={equityDraft.allocation}
                      onChange={(e) => setEquityDraft((prev) => ({ ...prev, allocation: e.target.value }))}
                      className="h-12 text-base pr-8"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      %
                    </span>
                  </div>
                  <Input
                    placeholder="Current %"
                    value={draftAllocationPct != null ? `${draftAllocationPct.toFixed(1)}%` : "—"}
                    disabled
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Actionable Price Triggers
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Input
                      placeholder="Stop Loss"
                      value={equityDraft.stopLoss}
                      onChange={(e) => setEquityDraft((prev) => ({ ...prev, stopLoss: e.target.value }))}
                      className="h-12 text-base pl-8"
                    />
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="Target Price"
                      value={equityDraft.targetPrice}
                      onChange={(e) => setEquityDraft((prev) => ({ ...prev, targetPrice: e.target.value }))}
                      className="h-12 text-base pl-8"
                    />
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Thesis Timeline &amp; Expiry
                </p>
                <div className="space-y-3">
                  <Slider
                    className="[&_[data-slot=slider-range]]:bg-blue-600 [&_[data-slot=slider-thumb]]:bg-blue-600 [&_[data-slot=slider-thumb]]:ring-blue-200/60"
                    min={0}
                    max={36}
                    step={1}
                    value={[expiryMonths]}
                    onValueChange={(v) => {
                      const m = clamp(v?.[0] ?? 0, 0, 36);
                      setExpiryMonths(m);
                      const until = addMonths(getLogicBaseDate(), m);
                      setEquityDraft((prev) => ({ ...prev, validity: formatDate(until) }));
                    }}
                  />
                  <p className="text-sm font-semibold text-blue-600">
                    Logic Valid Until:{" "}
                    {equityDraft.validity?.trim()
                      ? equityDraft.validity
                      : formatDate(addMonths(getLogicBaseDate(), expiryMonths))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEquityDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEquity()} disabled={equitySaving}>
              {equitySaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
