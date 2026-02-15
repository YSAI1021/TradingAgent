import { useMemo, useRef, useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Sparkles,
  Plus,
  Edit,
  ExternalLink,
  Trash,
  Loader2,
} from "lucide-react";
import { Link } from "react-router";
import { Separator } from "@/app/components/ui/separator";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/app/components/ui/select";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchTheses,
  createThesis,
  updateThesis,
  deleteThesis,
  ThesisRecord,
  fetchStockPrice,
} from "@/app/services/api";

const THESIS_SYMBOLS = ["AAPL", "MSFT", "XOM"];

const BASE_THESES = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    thesis:
      "Strong ecosystem lock-in with recurring revenue from services. AI integration through Apple Intelligence will drive new upgrade cycle. Long-term play on wearables and AR/VR.",
    entry: 170.5,
    target: 200.0,
    stop: 155.0,
    tags: ["Ecosystem", "AI Integration", "Services Growth"],
    status: "on-track",
    lastUpdated: "2026-02-10",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    thesis:
      "Cloud leadership through Azure and enterprise dominance. Copilot AI integration across all products creating moat. GitHub, LinkedIn, and gaming provide diversification.",
    entry: 380.0,
    target: 450.0,
    stop: 350.0,
    tags: ["Cloud", "Portfolio Copilot", "Enterprise"],
    status: "on-track",
    lastUpdated: "2026-02-08",
  },
  {
    symbol: "XOM",
    name: "Exxon Mobil",
    thesis:
      "Energy transition hedge with strong dividend yield. Investments in carbon capture and clean energy while maintaining core oil/gas profitability. Geopolitical tensions support pricing.",
    entry: 110.0,
    target: 125.0,
    stop: 95.0,
    tags: ["Energy", "Dividends", "Transition"],
    status: "needs-review",
    lastUpdated: "2026-02-05",
  },
];

export function Thesis() {
  const { quotes } = useStockQuotes(THESIS_SYMBOLS);
  const needsReviewCardRef = useRef<HTMLDivElement>(null);
  const { token, isAuthenticated } = useAuth();

  const [serverTheses, setServerTheses] = useState<ThesisRecord[] | null>(null);
  const [loadingTheses, setLoadingTheses] = useState(false);
  const [localTheses, setLocalTheses] = useState<ThesisRecord[] | null>(null);

  // Load theses from server for authenticated users
  const loadServerTheses = async () => {
    if (!isAuthenticated || !token) {
      setServerTheses(null);
      return;
    }
    setLoadingTheses(true);
    try {
      const list = await fetchTheses(token);
      setServerTheses(list || []);
    } catch (err) {
      console.error("Failed to load server theses", err);
      setServerTheses([]);
    } finally {
      setLoadingTheses(false);
    }
  };

  // Dialog state for create/edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ThesisRecord | null>(null);

  // Form fields
  const [formSymbol, setFormSymbol] = useState<string>(THESIS_SYMBOLS[0]);
  const [formName, setFormName] = useState<string>("");
  const [formThesis, setFormThesis] = useState<string>("");
  const [formEntry, setFormEntry] = useState<number | undefined>(undefined);
  const [formTarget, setFormTarget] = useState<number | undefined>(undefined);
  const [formStop, setFormStop] = useState<number | undefined>(undefined);
  const [formTags, setFormTags] = useState<string>("");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbolSuggestions, setSymbolSuggestions] = useState<any[]>([]);
  const [searchingSymbols, setSearchingSymbols] = useState(false);
  const [validatedSymbol, setValidatedSymbol] = useState<string | null>(null);
  const [fallbackPrices, setFallbackPrices] = useState<
    Record<string, number | null>
  >({});
  const [fetchingPrices, setFetchingPrices] = useState<Record<string, boolean>>({});
  const requestedPricesRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Scroll to symbol from hash (e.g. /thesis#AAPL) and briefly highlight
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (!hash) return;
      const symbol = decodeURIComponent(hash.replace("#", ""));
      if (!symbol) return;
      const el = document.getElementById(symbol);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight-flash");
      setTimeout(() => el.classList.remove("highlight-flash"), 2000);
    } catch (err) {
      // ignore
    }
  }, []);

  // When a symbol is validated (either clicked or exact-typed), fetch current price to pre-fill entry price
  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      if (!validatedSymbol) return;
      try {
        const res = await fetchStockPrice(validatedSymbol, token || undefined);
        if (cancelled) return;
        if (res && typeof res.price === "number") {
          // only auto-fill entry if the user hasn't provided one
          setFormEntry((prev) => (prev === undefined || prev === null ? res.price : prev));
        }
      } catch (err) {
        // ignore failures
      }
    };
    doFetch();
    return () => {
      cancelled = true;
    };
  }, [validatedSymbol, token]);

  // Debounced symbol search
  useEffect(() => {
    let cancelled = false;
    if (!symbolQuery || symbolQuery.length < 1) {
      setSymbolSuggestions([]);
      setValidatedSymbol(null);
      return;
    }
    setSearchingSymbols(true);
    const t = setTimeout(async () => {
      try {
        const results = await (await import("@/app/services/api")).searchStockSymbols(symbolQuery);
        if (cancelled) return;
        setSymbolSuggestions(results || []);
        const exact = (results || []).find((r: any) => r.symbol.toUpperCase() === symbolQuery.toUpperCase());
        setValidatedSymbol(exact ? exact.symbol : null);
      } catch (err) {
        console.warn("Symbol search failed", err);
        setSymbolSuggestions([]);
        setValidatedSymbol(null);
      } finally {
        setSearchingSymbols(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [symbolQuery]);

  // ensure server theses are loaded when auth/token changes
  useEffect(() => {
    if (isAuthenticated && token) loadServerTheses();
    else setServerTheses(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  const scrollToNeedsReview = () => {
    needsReviewCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    needsReviewCardRef.current?.classList.add("highlight-flash");
    setTimeout(() => {
      needsReviewCardRef.current?.classList.remove("highlight-flash");
    }, 2000);
  };
  const theses = useMemo(() => {
    let source: any[] = BASE_THESES;
    if (isAuthenticated) {
      if (serverTheses && serverTheses.length > 0)
        source = serverTheses as any[];
    } else if (localTheses && localTheses.length > 0) {
      source = localTheses as any[];
    }

    return source.map((t: any) => ({
      ...t,
      lastUpdated: t.lastUpdated || t.last_updated || t.last_updated_at || null,
      tags: t.tags || [],
      // current price prefers live quote; fallback to fetched last-close when available
      current:
        quotes[t.symbol] && typeof quotes[t.symbol].price === "number"
          ? quotes[t.symbol].price
          : (fallbackPrices[t.symbol] ?? null),
    }));
  }, [quotes, serverTheses, isAuthenticated, localTheses]);
  // Include fallbackPrices so `current` updates when last-close fallbacks arrive
  // (was previously omitted which caused `current` to remain null and progress to be uncomputed)

  // Fetch fallback (last-close) prices for symbols that lack live quotes
  useEffect(() => {
    let cancelled = false;
    const fetchMissing = async () => {
      const symbols = Array.from(new Set(theses.map((t: any) => t.symbol)));
      const toFetch = symbols.filter((s) => {
        const hasLive = quotes[s] && typeof quotes[s].price === "number";
        return !hasLive && !requestedPricesRef.current.has(s) && !(s in fallbackPrices);
      });
      if (toFetch.length === 0) return;

      // mark requested symbols to avoid re-requesting
      toFetch.forEach((s) => requestedPricesRef.current.add(s));
      setFetchingPrices((prev) => {
        const next = { ...prev };
        toFetch.forEach((s) => (next[s] = true));
        return next;
      });

        try {
          const results = await Promise.all(
            toFetch.map(async (s) => {
              try {
                const res = await fetchStockPrice(s, token || undefined);
                return {
                  s,
                  price: res && typeof res.price === "number" ? res.price : null,
                };
              } catch {
                return { s, price: null };
              }
            }),
          );
          if (isMountedRef.current) {
            setFallbackPrices((prev) => {
              const next = { ...prev };
              results.forEach(({ s, price }) => {
                next[s] = price;
              });
              return next;
            });
          }
        } catch (err) {
          if (isMountedRef.current) {
            setFallbackPrices((prev) => {
              const next = { ...prev };
              toFetch.forEach((s) => {
                if (!(s in next)) next[s] = null;
              });
              return next;
            });
          }
        } finally {
          // clear fetching state and requested set if still mounted (avoid setState on unmounted)
          if (isMountedRef.current) {
            setFetchingPrices((prev) => {
              const next = { ...prev };
              toFetch.forEach((s) => (next[s] = false));
              return next;
            });
            toFetch.forEach((s) => requestedPricesRef.current.delete(s));
          }
        }
    };
    fetchMissing();
    return () => {
      cancelled = true;
    };
    // intentionally omit fallbackPrices from deps to avoid churn; read it above
  }, [theses, quotes, token]);

  // Compute status for each thesis based on prices/targets/stops
  const thesesWithStatus = useMemo(() => {
    return theses.map((t: any) => {
      const currentRaw = t.current;
      const current = currentRaw == null ? null : Number(currentRaw);
      const entry =
        t.entry != null
          ? Number(t.entry)
          : current == null
            ? 0
            : Number(current);
      const target = t.target != null ? Number(t.target) : entry;
      const stop = t.stop != null ? Number(t.stop) : entry;

      let computedStatus = t.status || "on-track";

      // Achieved: reached or exceeded target (requires live current)
      if (current != null && !isNaN(target) && current >= target) {
        computedStatus = "achieved";
      }
      // Breached: handle stop values both below and above entry (requires live current)
      else if (
        current != null &&
        !isNaN(stop) &&
        (() => {
          const s = Number(stop);
          const e = Number(entry);
          if (s === e) return false; // equal stop is meaningless
          if (s > e) {
            // stop above entry -> treat as an upper threshold (breach when current >= stop)
            return current >= s;
          }
          // normal stop loss below entry -> breach when current <= stop
          return current <= s;
        })()
      ) {
        computedStatus = "breached";
      }

      // compute progress (nullable) and heuristics
      let progressPct: number | null = null;
      if (current != null) {
        if (target !== entry) {
          progressPct = ((current - entry) / (target - entry)) * 100;
        } else {
          progressPct = current >= target ? 100 : 0;
        }
      }

      const downsidePct = entry
        ? ((entry - (current ?? entry)) / entry) * 100
        : 0;
      const distanceToStopPct = stop
        ? (((current ?? entry) - stop) / stop) * 100
        : 1000;

      if (
        (progressPct !== null && progressPct < 0 && distanceToStopPct <= 10) ||
        downsidePct >= 20
      ) {
        computedStatus = "needs-review";
      } else if (computedStatus === undefined) {
        computedStatus = "on-track";
      }

      const progressBarPct =
        progressPct == null ? null : Math.min(100, Math.max(0, progressPct));

      return {
        ...t,
        status: computedStatus,
        progressPct,
        progressBarPct,
      };
    });
  }, [theses]);

  // Auto-persist computed thesis status to server when it changes (authenticated users)
  const updatingIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !token || !serverTheses) return;

    (async () => {
      const toUpdate: Array<{ id: number; status: string }> = [];
      for (const computed of thesesWithStatus) {
        const serverRecord = (serverTheses || []).find(
          (s) => s.symbol === computed.symbol,
        );
        if (!serverRecord || serverRecord.id == null) continue;
        const id = serverRecord.id as number;
        const serverStatus = serverRecord.status ?? null;
        if (
          serverStatus !== computed.status &&
          !updatingIdsRef.current.has(id)
        ) {
          toUpdate.push({ id, status: computed.status });
        }
      }

      if (toUpdate.length === 0) return;

      for (const u of toUpdate) {
        if (cancelled) return;
        if (updatingIdsRef.current.has(u.id)) continue;
        updatingIdsRef.current.add(u.id);
        try {
          await updateThesis(token, u.id, { status: u.status });
        } catch (err) {
          console.error("Failed to persist thesis status:", err);
        } finally {
          updatingIdsRef.current.delete(u.id);
        }
      }

      if (!cancelled) {
        try {
          await loadServerTheses();
        } catch (err) {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thesesWithStatus, serverTheses, isAuthenticated, token]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Thesis</h1>
            <p className="text-gray-500 mt-1">
              Your documented reasoning for each position
            </p>
          </div>
          <Button
            onClick={() => {
              // open create dialog
              setEditing(null);
              setFormSymbol(THESIS_SYMBOLS[0]);
              setFormName("");
              setFormThesis("");
              setFormEntry(undefined);
              setFormTarget(undefined);
              setFormStop(undefined);
              setFormTags("");
              setDialogOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Thesis
          </Button>
        </div>
      </div>

      {/* AI Insight - Thesis Health Check + Investment Discipline */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            Thesis Health Check
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Sources
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall Thesis Assessment */}
          <div className="p-4 bg-white rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700 mb-3">
              <strong>Overall Assessment:</strong> 2 of 3 theses remain on
              track. XOM requires attention due to recent price underperformance
              and changing energy sector dynamics.
            </p>
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 border-0">
                2 On Track
              </Badge>
              <Badge
                role="button"
                tabIndex={0}
                className="bg-yellow-100 text-yellow-800 border border-yellow-200 cursor-pointer hover:bg-yellow-200 transition-colors"
                onClick={scrollToNeedsReview}
                onKeyDown={(e) => e.key === "Enter" && scrollToNeedsReview()}
              >
                1 Needs Review
              </Badge>
            </div>
          </div>

          {/* AI Investment Discipline / Rule Adherence */}
          <div className="p-4 bg-white rounded-lg border border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-3">
              Rule Adherence Analysis
            </p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    Rule Adherence: 73%
                  </span>
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: "73%" }}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Compliance by Rule Type
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex justify-between">
                    <span>Stop-loss at -5%</span>
                    <Badge className="bg-green-100 text-green-800 text-xs border-0">
                      78%
                    </Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>No panic selling</span>
                    <Badge className="bg-yellow-100 text-yellow-800 text-xs border-0">
                      65%
                    </Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>Position sizing limits</span>
                    <Badge className="bg-green-100 text-green-800 text-xs border-0">
                      88%
                    </Badge>
                  </li>
                </ul>
              </div>

              <Separator />

              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "none",
                }}
              >
                <p className="text-sm font-semibold text-black mb-2">
                  Violations & Impact
                </p>
                <p className="text-sm text-gray-700">
                  3 times you violated your &quot;no panic selling&quot; rule,
                  resulting in an average 12% loss recovery missed. On Jan 15,
                  2026 and Feb 3, 2026, selling during dips led to missing
                  rebounds.
                </p>
              </div>

              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "rgba(251, 191, 36, 0.1)",
                  border: "none",
                }}
              >
                <p className="text-sm font-semibold text-black mb-2">
                  Pattern Recognition
                </p>
                <p className="text-sm text-gray-700">
                  You tend to break rules during high volatility periods. Rule
                  violations occurred on days when the VIX was above 20 in 4 of
                  5 cases.
                </p>
              </div>

              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  border: "none",
                }}
              >
                <p className="text-sm font-semibold text-black mb-2">
                  Actionable Recommendations
                </p>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>
                    • Consider setting automatic alerts for rule violations
                  </li>
                  <li>
                    • Add a &quot;cooling off&quot; period (e.g., 24h) before
                    selling during high volatility
                  </li>
                  <li>
                    • Review your stop-loss execution — 78% compliance is solid;
                    focus on panic-selling rule
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thesis Cards */}

      <Dialog open={dialogOpen} onOpenChange={(v) => setDialogOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit Thesis — ${editing.symbol}` : "Add New Thesis"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Search Symbol (shows only symbols found on Yahoo)
              </label>
              <Input
                value={symbolQuery}
                onChange={(e: any) => setSymbolQuery(e.target.value)}
                placeholder="Type symbol or company name"
              />
              {searchingSymbols && (
                <p className="text-xs text-gray-500 mt-1">Searching…</p>
              )}
              {symbolSuggestions.length > 0 && (
                <div className="border rounded mt-2 bg-white max-h-40 overflow-y-auto">
                  {symbolSuggestions.map((s) => (
                    <div
                      key={s.symbol}
                      className="p-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                      onClick={async () => {
                        setFormSymbol(s.symbol);
                        setFormName(s.name || "");
                        setSymbolQuery(s.symbol);
                        setSymbolSuggestions([]);
                        setValidatedSymbol(s.symbol);
                        try {
                          const price = await fetchStockPrice(
                            s.symbol,
                            token || undefined,
                          );
                          if (price && typeof price.price === "number")
                            setFormEntry(price.price);
                        } catch (err) {
                          // ignore
                        }
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {s.symbol}{" "}
                          <span className="text-xs text-gray-500">
                            {s.exchange}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{s.name}</div>
                      </div>
                      <div className="text-xs text-gray-400">Select</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Company Name
              </label>
              <Input
                value={formName}
                onChange={(e: any) => setFormName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Investment Thesis
              </label>
              <Textarea
                value={formThesis}
                onChange={(e: any) => setFormThesis(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Entry Price
                </label>
                <Input
                  type="number"
                  value={formEntry ?? ""}
                  onChange={(e: any) =>
                    setFormEntry(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Target Price
                </label>
                <Input
                  type="number"
                  value={formTarget ?? ""}
                  onChange={(e: any) =>
                    setFormTarget(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Stop Loss
                </label>
                <Input
                  type="number"
                  value={formStop ?? ""}
                  onChange={(e: any) =>
                    setFormStop(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Tags (comma separated)
              </label>
              <Input
                value={formTags}
                onChange={(e: any) => setFormTags(e.target.value)}
              />
            </div>

            {/* status is computed automatically; user cannot set it here */}
          </div>

          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const payload: ThesisRecord = {
                    symbol: formSymbol,
                    name: formName,
                    thesis: formThesis,
                    entry: formEntry,
                    target: formTarget,
                    stop: formStop,
                    tags: formTags
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  };

                  try {
                    // require validated symbol (must be selected from suggestions at least once)
                    if (
                      !validatedSymbol ||
                      validatedSymbol.toUpperCase() !== formSymbol.toUpperCase()
                    ) {
                      alert(
                        "Please pick a symbol from the search suggestions so we can confirm it exists on Yahoo.",
                      );
                      return;
                    }
                    if (isAuthenticated && token) {
                      if (editing && editing.id) {
                        await updateThesis(
                          token,
                          editing.id as number,
                          payload,
                        );
                        await loadServerTheses();
                      } else {
                        await createThesis(token, payload);
                        await loadServerTheses();
                      }
                    } else {
                      // local-only
                      const next = (localTheses || BASE_THESES.slice()).slice();
                      if (editing && editing.symbol) {
                        const idx = next.findIndex(
                          (x) => x.symbol === editing.symbol,
                        );
                        if (idx >= 0)
                          next[idx] = {
                            ...next[idx],
                            ...payload,
                            lastUpdated: new Date().toISOString(),
                          };
                      } else {
                        next.push({
                          ...payload,
                          lastUpdated: new Date().toISOString(),
                        } as any);
                      }
                      setLocalTheses(next as any);
                    }
                  } catch (err) {
                    console.error("Failed to save thesis", err);
                  } finally {
                    setDialogOpen(false);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-6">
        {thesesWithStatus.map((item) => {
          const progressPct: number | null = item.progressPct ?? null;
          const progressBarPct: number =
            item.progressBarPct != null ? item.progressBarPct : 0;

          return (
            <div
                  key={item.symbol}
                  id={item.symbol}
                  ref={
                    item.status === "needs-review" ? needsReviewCardRef : undefined
                  }
                  data-status={item.status}
                >
              <Card className="border border-gray-200 transition-all duration-300">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle>{item.symbol}</CardTitle>
                        <Badge variant="outline">{item.name}</Badge>
                        {item.status === "on-track" && (
                          <Badge className="bg-green-100 text-green-800 border-0">
                            ✓ On Track
                          </Badge>
                        )}
                        {item.status === "needs-review" && (
                          <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-200">
                            ⚠ Needs Review
                          </Badge>
                        )}
                        {item.status === "achieved" && (
                          <Badge className="bg-green-200 text-green-900 border-0">
                            ★ Achieved
                          </Badge>
                        )}
                        {item.status === "breached" && (
                          <Badge className="bg-red-100 text-red-800 border-0">
                            ✖ Breached
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Last updated: {item.lastUpdated}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // open edit dialog
                          setEditing(item as any);
                          setFormSymbol(item.symbol);
                          setFormName(item.name || "");
                          setFormThesis(item.thesis || "");
                          setFormEntry(item.entry);
                          setFormTarget(item.target);
                          setFormStop(item.stop);
                          setFormTags((item.tags || []).join(", "));
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!isAuthenticated || !token || !("id" in item)) {
                            // if not authenticated, just alert
                            if (
                              !confirm(
                                "You must be logged in to delete a saved thesis.",
                              )
                            )
                              return;
                          }
                          if (!confirm(`Delete thesis for ${item.symbol}?`))
                            return;
                          try {
                            if (isAuthenticated && token && item.id) {
                              await deleteThesis(token, item.id as number);
                              await loadServerTheses();
                            }
                          } catch (err) {
                            console.error("Failed to delete thesis", err);
                          }
                        }}
                      >
                        <Trash className="w-4 h-4 text-red-600" />
                      </Button>
                      <Link to={`/stock/${item.symbol}`}>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Thesis Statement */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Investment Thesis
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {item.thesis}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <Separator />

                  {/* Price Targets */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Entry Price</p>
                      <p className="text-lg font-semibold text-gray-900">
                        ${item.entry}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">
                        Current Price
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {item.current != null ? (
                          `$${Number(item.current).toFixed(2)}`
                        ) : typeof fallbackPrices[item.symbol] === "number" ? (
                          `$${Number(fallbackPrices[item.symbol]).toFixed(2)}`
                        ) : fetchingPrices[item.symbol] ? (
                          <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching…
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-700 mb-1">
                        Target Price
                      </p>
                      <p className="text-lg font-semibold text-green-900">
                        ${item.target}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-red-700 mb-1">Stop Loss</p>
                      <p className="text-lg font-semibold text-red-900">
                        ${item.stop}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">
                        Progress to Target
                      </p>
                      <p className="text-xs font-medium text-gray-700">
                        {progressPct != null
                          ? `${Math.round(Math.min(100, progressPct))}%`
                          : "—"}
                      </p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${progressBarPct}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
