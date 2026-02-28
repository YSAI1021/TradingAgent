import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { ChevronDown, ChevronUp, Plus, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { useCopilot } from "@/app/context/CopilotContext";
import { useAuth } from "@/app/context/AuthContext";
import {
  createThesisEquity,
  deleteThesisEquity,
  fetchDashboardStats,
  fetchThesisEquities,
  seedDecisionEvents,
  DashboardStats,
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
  thesis: string;
  validity: string;
};

const INITIAL_RULES: RuleItem[] = [
  {
    id: 1,
    category: "Risk",
    condition: "VIX > 20",
    action: "Pause new buys for 24h and reassess",
    status: "Active",
  },
  {
    id: 2,
    category: "Risk",
    condition: "Single position > 25%",
    action: "Trim to target size over next 2 sessions",
    status: "Triggered",
  },
];

const INITIAL_EQUITIES_BY_BUCKET: Record<BucketKey, EquityThesisItem[]> = {
  Equities: [
    {
      id: 1,
      symbol: "AAPL",
      company: "Apple Inc.",
      allocation: "18%",
      thesis:
        "Services growth and ecosystem retention continue to support quality compounding.",
      validity: "10 MO left",
    },
    {
      id: 2,
      symbol: "MSFT",
      company: "Microsoft Corp.",
      allocation: "20%",
      thesis:
        "Cloud and enterprise AI monetization remain the core durable growth engine.",
      validity: "12 MO left",
    },
    {
      id: 3,
      symbol: "XOM",
      company: "Exxon Mobil",
      allocation: "8%",
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
  thesis: string;
  validity: string;
};

const EMPTY_EQUITY_DRAFT: EquityDraft = {
  id: null,
  symbol: "",
  company: "",
  allocation: "",
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
      allocation: row.allocation,
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

  const [rules, setRules] = useState<RuleItem[]>(INITIAL_RULES);
  const [newCondition, setNewCondition] = useState("");
  const [newAction, setNewAction] = useState("");
  const [conditionPreset, setConditionPreset] = useState("");
  const [actionPreset, setActionPreset] = useState("");
  const [addRuleOpen, setAddRuleOpen] = useState(false);

  const [selectedBucket, setSelectedBucket] = useState<BucketKey>("Equities");
  const [equitiesByBucket, setEquitiesByBucket] = useState<Record<BucketKey, EquityThesisItem[]>>(
    INITIAL_EQUITIES_BY_BUCKET,
  );
  const [equitiesLoading, setEquitiesLoading] = useState(false);
  const [equitySaving, setEquitySaving] = useState(false);
  const [equityError, setEquityError] = useState("");
  const [equityDialogOpen, setEquityDialogOpen] = useState(false);
  const [equityDraft, setEquityDraft] = useState<EquityDraft>(EMPTY_EQUITY_DRAFT);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

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
      setStatsLoading(true);
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
      } finally {
        if (mounted) setStatsLoading(false);
      }
    };

    void loadStats();
    return () => { mounted = false; };
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

  const addRule = () => {
    const condition = newCondition.trim();
    const action = newAction.trim();
    if (!condition || !action) return;

    setRules((prev) => [
      {
        id: Date.now(),
        category: classifyRuleCategory(condition, action),
        condition,
        action,
        status: "Active",
      },
      ...prev,
    ]);
    setNewCondition("");
    setNewAction("");
    setConditionPreset("");
    setActionPreset("");
    setAddRuleOpen(false);
  };

  const handleAddRuleDialogChange = (open: boolean) => {
    setAddRuleOpen(open);
    if (!open) {
      setConditionPreset("");
      setActionPreset("");
    }
  };

  const openNewEquityDialog = () => {
    setEquityDraft(EMPTY_EQUITY_DRAFT);
    setEquityDialogOpen(true);
  };

  const handleEquitySymbolChange = (value: string) => {
    const nextSymbol = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const matched = symbolSuggestions.find((item) => item.symbol === nextSymbol);
    setEquityDraft((prev) => {
      const prevSymbol = prev.symbol.trim().toUpperCase();
      const prevCompany = prev.company.trim();
      const shouldAutofillCompany =
        !prevCompany || prevCompany.toUpperCase() === prevSymbol || prevCompany === prev.symbol;
      return {
        ...prev,
        symbol: nextSymbol,
        company: shouldAutofillCompany && matched?.company ? matched.company : prev.company,
      };
    });
  };

  const openEditEquityDialog = (item: EquityThesisItem) => {
    setEquityDraft({
      id: item.id,
      symbol: item.symbol,
      company: item.company,
      allocation: item.allocation,
      thesis: item.thesis,
      validity: item.validity,
    });
    setEquityDialogOpen(true);
  };

  const saveEquity = async () => {
    const symbol = equityDraft.symbol.trim().toUpperCase();
    const company = equityDraft.company.trim();
    const allocation = equityDraft.allocation.trim();
    const thesis = equityDraft.thesis.trim();
    const validity = equityDraft.validity.trim();
    if (!symbol || !company || !allocation || !thesis || !validity) {
      setEquityError("Please complete Symbol, Company, Allocation, Thesis, and Validity before saving.");
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

  const timelineItems = [
    {
      date: "Feb 14, 2026",
      title: "Market dropped 6.2% and Rule #1 triggered",
      detail: "You paused for 48 hours and avoided emotional selling. Position recovered 4% next week.",
    },
    {
      date: "Feb 03, 2026",
      title: "Override detected on high-beta name",
      detail: "You sold before your stop condition. This was followed by a rebound that invalidated the exit.",
    },
    {
      date: "Jan 15, 2026",
      title: "Concentration alert fired",
      detail: "You moved from 28% to 24% in a single position and returned to policy range.",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            Review Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {reviewCards.map((card) => (
              <button
                key={card.title}
                type="button"
                className="rounded-lg border border-blue-200 bg-white p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => sendPrompt(card.prompt, { submit: true })}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{card.title}</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{card.value}</p>
                <p className="mt-1 text-sm text-gray-600">{card.subtitle}</p>
                <p className="mt-3 text-xs text-blue-600 font-medium">Click to ask Copilot</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active Rules</span>
            <Button size="sm" onClick={() => setAddRuleOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Rule
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
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
                <p className="text-xs text-gray-500 mt-1">Category: {rule.category}</p>
              </div>
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
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Equities</span>
            <Button size="sm" onClick={openNewEquityDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </CardTitle>
        </CardHeader>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Decision Timeline</span>
            <Button variant="ghost" size="sm" onClick={() => setTimelineExpanded((prev) => !prev)}>
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
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />
              {timelineItems.map((item) => (
                <div key={item.date} className="relative pb-4 last:pb-0">
                  <div className="absolute -left-[22px] top-2 h-3 w-3 rounded-full border-2 border-blue-600 bg-white" />
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{item.date}</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">{item.title}</p>
                    <p className="text-sm text-gray-700 mt-1">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={addRuleOpen} onOpenChange={handleAddRuleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs text-gray-600 mb-1">Guided IF condition (optional)</p>
              <Select
                value={conditionPreset || undefined}
                onValueChange={(value) => {
                  setConditionPreset(value);
                  setNewCondition(value);
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
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Guided THEN action (optional)</p>
              <Select
                value={actionPreset || undefined}
                onValueChange={(value) => {
                  setActionPreset(value);
                  setNewAction(value);
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
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="IF condition"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
            />
            <Input
              placeholder="THEN action"
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
            />
            <p className="text-xs text-gray-500">Category is auto-classified from your condition and action.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRuleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addRule}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={equityDialogOpen} onOpenChange={setEquityDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{equityDraft.id == null ? "Add Equity Thesis" : "Edit Equity Thesis"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Symbol"
                list="thesis-symbol-options"
                value={equityDraft.symbol}
                onChange={(e) => handleEquitySymbolChange(e.target.value)}
              />
              <datalist id="thesis-symbol-options">
                {symbolSuggestions.map((item) => (
                  <option key={item.symbol} value={item.symbol} label={`${item.symbol} - ${item.company}`} />
                ))}
              </datalist>
              <Input
                placeholder="Company"
                value={equityDraft.company}
                onChange={(e) => setEquityDraft((prev) => ({ ...prev, company: e.target.value }))}
                className="sm:col-span-2"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Allocation (e.g. 12%)"
                value={equityDraft.allocation}
                onChange={(e) => setEquityDraft((prev) => ({ ...prev, allocation: e.target.value }))}
              />
              <Input
                placeholder="Validity (e.g. 6 MO left)"
                value={equityDraft.validity}
                onChange={(e) => setEquityDraft((prev) => ({ ...prev, validity: e.target.value }))}
              />
            </div>
            <Textarea
              placeholder="Core strategic thesis"
              value={equityDraft.thesis}
              onChange={(e) => setEquityDraft((prev) => ({ ...prev, thesis: e.target.value }))}
              className="min-h-[120px]"
            />
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
