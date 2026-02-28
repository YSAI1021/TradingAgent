import {
  AlertCircle,
  CheckCircle,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Settings,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useEffect, useRef } from "react";
import { fetchPosts, fetchNews, fetchUserSetting, saveUserSetting, fetchTheses } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import SourcesModal from "@/app/components/SourcesModal";
import { useStockQuotes, fetchPeriodChangePercent } from "@/app/hooks/useStockQuotes";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { Link } from "react-router";
import { useState, useMemo } from "react";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

export function Dashboard() {
  const [visibleCounter, setVisibleCounter] = useState(0);
  const hiddenAtRef = useRef<number | null>(null);

  // Dashboard tiles visibility state (persisted in localStorage or DB for logged-in users)
  const { token, isAuthenticated } = useAuth();

  const [visibleTiles, setVisibleTiles] = useState(() => {
    try {
      const raw = localStorage.getItem("dashboard_visible_tiles");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore parse errors
    }
    return {
      topMovers: true,
      topMarketMovers: true,
      riskExposure: true,
      ruleTriggers: true,
      portfolioBrief: true,
    };
  });

  // Load persisted settings from server for authenticated users
  useEffect(() => {
    let mounted = true;
    if (isAuthenticated && token) {
      (async () => {
        try {
          const res = await fetchUserSetting(token, 'dashboard_visible_tiles');
          if (!mounted) return;
          // server returns either { key, value } or a full map; handle both
          let parsed: any = null;
          if (res && typeof res === 'object') {
            if ('value' in res) parsed = res.value;
            else parsed = res;
          }
          if (parsed) setVisibleTiles(parsed);
        } catch (err) {
          console.warn('Failed to load dashboard settings from server', err);
        }
      })()
    }
    return () => { mounted = false }
  }, [isAuthenticated, token]);

  // Refresh dashboard data when tab becomes visible
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        // always reload when returning to the tab to guarantee fresh data
        setVisibleCounter((c) => c + 1);
        try {
          window.location.reload();
        } catch (e) {
          // if reload is blocked, the counter will still trigger refreshes
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const { holdings, totalValue } = usePortfolio();

  // Load theses from server (for Rule Triggers)
  const [serverTheses, setServerTheses] = useState<any[] | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!isAuthenticated || !token) {
      setServerTheses(null);
      return;
    }
    (async () => {
      try {
        const list = await fetchTheses(token);
        if (!mounted) return;
        setServerTheses(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn("Failed to load theses for dashboard", err);
        if (mounted) setServerTheses([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, token, visibleCounter]);

  const hasConcentrationFromTheses = (serverTheses || []).some((t) => t && (t.status === "needs-review" || t.status === "breached"));
  const hasTargetMetFromTheses = (serverTheses || []).some((t) => t && t.status === "achieved");

  // Top Movers in My Portfolio: user's best 5 holdings by today's performance (highest first)
  const topMovers = useMemo(
    () =>
      [...holdings]
        .map((h) => ({
          symbol: h.symbol,
          name: h.name,
          price: h.currentPrice,
          change: h.changePercent ?? 0,
        }))
        .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
        .slice(0, 5),
    [holdings],
  );

  const portfolioBrief = useMemo(() => {
    if (!holdings || holdings.length === 0) {
      return [
        {
          section: "Portfolio",
          what: "No holdings detected",
          why: "Add transactions to build your portfolio",
          action: "warning" as const,
          tags: ["No holdings"],
        },
      ];
    }

    // Top stock movement (from holdings / topMovers)
    const topHolding = [...holdings].sort((a, b) => b.value - a.value)[0];
    const topMover = topMovers && topMovers.length > 0 ? topMovers[0] : null;
    const stockWhat = topMover
      ? `${topMover.symbol} moved ${topMover.change?.toFixed(2)}% today`
      : `${topHolding.symbol} performance update`;
    const stockWhy = topMover
      ? `Your ${topMover.symbol} holding changed by ${topMover.change?.toFixed(2)}% today.`
      : `Top holding: ${topHolding.symbol} (${topHolding.shares} shares)`;

    // Sector exposure
    const sectorTotals: Record<string, number> = {};
    holdings.forEach((h) => {
      sectorTotals[h.sector] = (sectorTotals[h.sector] || 0) + h.value;
    });
    const sectors = Object.keys(sectorTotals);
    const topSector = sectors.length
      ? sectors.sort((a, b) => sectorTotals[b] - sectorTotals[a])[0]
      : null;
    const sectorPct = topSector
      ? ((sectorTotals[topSector] / totalValue) * 100).toFixed(0)
      : "0";

    // Concentration / portfolio summary
    const largestAllocation = holdings
      .reduce((max, h) => Math.max(max, h.allocation || 0), 0)
      .toFixed(0);

    return [
      {
        section: "Stock",
        what: stockWhat,
        why: stockWhy,
        action: topMover && (topMover.change ?? 0) > 0 ? "success" : "warning",
        tags: [
          topMover?.symbol || topHolding.symbol,
          topMover && (topMover.change ?? 0) >= 0 ? "Up move" : "Down move",
          "Daily movement",
        ],
      },
      {
        section: "Sector",
        what: topSector
          ? `${topSector} exposure at ${sectorPct}%`
          : "Sector exposure info",
        why: topSector
          ? `Your ${topSector} holdings represent ${sectorPct}% of portfolio`
          : "No sector data",
        action: topSector && Number(sectorPct) > 50 ? "alert" : "warning",
        tags: topSector
          ? [topSector, `${sectorPct}% exposure`, "Sector concentration"]
          : ["Sector data unavailable"],
      },
      {
        section: "Portfolio",
        what: `Largest holding allocation: ${largestAllocation}%`,
        why: `Consider diversifying if a single holding exceeds your target allocation.`,
        action: Number(largestAllocation) > 50 ? "alert" : "success",
        tags: [
          topHolding.symbol,
          `${largestAllocation}% allocation`,
          "Concentration check",
        ],
      },
    ];
  }, [holdings, totalValue, topMovers]);

  const weeklyRecap = useMemo(() => {
    if (!holdings.length) {
      return {
        recap: "No portfolio data yet for weekly recap.",
        action: "Add holdings to unlock weekly action guidance.",
      };
    }

    const weightedMove = holdings.reduce(
      (sum, h) => sum + (h.allocation / 100) * (h.changePercent || 0),
      0,
    );
    const topRisk = [...holdings].sort((a, b) => b.allocation - a.allocation)[0];
    const action =
      topRisk && topRisk.allocation >= 35
        ? `Take action: review concentration in ${topRisk.symbol} (${topRisk.allocation.toFixed(1)}% allocation).`
        : "No urgent rebalance action. Keep monitoring your top positions.";

    return {
      recap: `Weekly recap: estimated portfolio move ${weightedMove >= 0 ? "+" : ""}${weightedMove.toFixed(2)}% based on weighted holdings performance.`,
      action,
    };
  }, [holdings]);

  const [showSources, setShowSources] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesData, setSourcesData] = useState<Record<string, any[]>>({});

  const loadSourcesForBrief = async () => {
    const tickers = Array.from(
      new Set([
        ...(holdings || []).map((h: any) => h.symbol),
      ]),
    )
      .filter(Boolean)
      .slice(0, 6);
    if (tickers.length === 0) {
      setSourcesData({});
      setShowSources(true);
      return;
    }
    setSourcesLoading(true);
    const results: Record<string, any[]> = {};
    try {
      await Promise.all(
        tickers.map(async (t) => {
          try {
            const items = await fetchNews(t);
            results[t] = Array.isArray(items) ? items.slice(0, 5) : [];
          } catch (err) {
            results[t] = [];
          }
        }),
      );
      setSourcesData(results);
      setShowSources(true);
    } catch (err) {
      console.error("Failed to load sources", err);
      setSourcesData(results);
      setShowSources(true);
    } finally {
      setSourcesLoading(false);
    }
  };

  const riskBorderStyles = {
    success: "border-l-green-500",
    warning: "border-l-yellow-500",
    alert: "border-l-red-500",
  };
  // Top Market Movers: derive candidates from recent posts + small-cap list, fetch quotes and compute top movers
  const [recentPosts, setRecentPosts] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchPosts(100, 0);
        if (mounted) setRecentPosts(data || []);
      } catch (err) {
        console.error("Failed to load posts for market movers", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visibleCounter]);

  const autoCandidates = useMemo(() => {
    const counts: Record<string, number> = {};
    recentPosts.forEach((p) => {
      if (p.stock_ticker)
        counts[p.stock_ticker] = (counts[p.stock_ticker] || 0) + 1;
    });
    const sorted = Object.keys(counts).sort(
      (a, b) => (counts[b] || 0) - (counts[a] || 0),
    );
    return sorted.slice(0, 10);
  }, [recentPosts]);

  const seedVolatile = [
    "SMCI",
    "RIOT",
    "PLUG",
    "UPST",
    "SOFI",
    "TSLA",
    "NVDA",
    "AMD",
  ];
  const candidateSymbols = Array.from(
    new Set([...autoCandidates, ...seedVolatile]),
  );
  const { quotes: candidateQuotes } = useStockQuotes(candidateSymbols);
  const [candidatePeriodChanges, setCandidatePeriodChanges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (!candidateSymbols || candidateSymbols.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(
          candidateSymbols.map((s) => fetchPeriodChangePercent(s)),
        );
        if (cancelled) return;
        const map: Record<string, number> = {};
        candidateSymbols.forEach((s, i) => {
          const v = results[i];
          if (typeof v === "number") map[s] = v;
        });
        setCandidatePeriodChanges(map);
      } catch (err) {
        if (!cancelled) setCandidatePeriodChanges({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateSymbols.join(","), visibleCounter]);

  const topMarketMovers = useMemo(() => {
    const holdingSymbols = new Set(holdings.map((h) => h.symbol));
    const list = Object.values(candidateQuotes)
      .filter((q) => q && !holdingSymbols.has(q.symbol))
      .map((q) => ({
        symbol: q.symbol,
        name: q.symbol,
        price: q.price,
        change: candidatePeriodChanges[q.symbol] ?? q.changePercent ?? 0,
      }))
      .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
      .slice(0, 5);
    // Fallback to seed list if quotes not ready
    if (list.length === 0)
      return seedVolatile
        .slice(0, 5)
        .map((s) => ({ symbol: s, name: s, price: 0, change: 0 }));
    return list;
  }, [candidateQuotes, holdings]);

  const riskExposure = [
    { category: "Tech Concentration", level: "High", value: 65 },
    { category: "Market Cap Diversity", level: "Medium", value: 45 },
    { category: "Sector Volatility", level: "Low", value: 25 },
  ];

  const toggleTile = async (tile: keyof typeof visibleTiles) => {
    setVisibleTiles((prev) => {
      const next = { ...prev, [tile]: !prev[tile] };
      try {
        localStorage.setItem("dashboard_visible_tiles", JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });

    // Persist to server when authenticated
    try {
      if (isAuthenticated && token) {
        const raw = localStorage.getItem('dashboard_visible_tiles');
        const payload = raw ? JSON.parse(raw) : null;
        if (payload) await saveUserSetting(token, 'dashboard_visible_tiles', payload);
      }
    } catch (err) {
      console.warn('Failed to save dashboard settings to server', err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">
              Your portfolio command center · Portfolio: $
              {totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Custom
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.topMovers}
                  onCheckedChange={() => toggleTile("topMovers")}
                >
                  Top Movers in My Portfolio
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.topMarketMovers}
                  onCheckedChange={() => toggleTile("topMarketMovers")}
                >
                  Top Market Movers
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.riskExposure}
                  onCheckedChange={() => toggleTile("riskExposure")}
                >
                  Risk Exposure
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.ruleTriggers}
                  onCheckedChange={() => toggleTile("ruleTriggers")}
                >
                  Rule Triggers & Alerts
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.portfolioBrief}
                  onCheckedChange={() => toggleTile("portfolioBrief")}
                >
                  Today's Portfolio Brief
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Today's Portfolio Brief - user can toggle visibility via Customize */}
      {visibleTiles.portfolioBrief && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Sparkles className="w-5 h-5" />
              Today's Portfolio Brief
              <Badge variant="outline" className="ml-auto bg-white/80">
                Last updated: 2 min ago
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs ml-2 text-blue-900 hover:bg-blue-100"
                onClick={() => loadSourcesForBrief()}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Sources
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-blue-900">
            <div className="rounded-lg border border-blue-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900">{weeklyRecap.recap}</p>
              <p className="mt-1 text-sm text-gray-700">{weeklyRecap.action}</p>
            </div>
            {portfolioBrief.map((item, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border border-blue-200 bg-white hover:border-blue-300 transition-colors border-l-4 ${riskBorderStyles[item.action]}`}
              >
                <p className="text-xs font-medium text-blue-700 mb-1 uppercase tracking-wide">
                  {item.section}
                </p>
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">
                    {item.what}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Why it matters: {item.why}
                  </p>
                  {Array.isArray(item.tags) && item.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {item.tags.map((tag: string, tagIndex: number) => (
                        <Badge key={`${item.section}-${tagIndex}`} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Top Movers in My Portfolio */}
        {visibleTiles.topMovers && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Top Movers in My Portfolio</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleTile("topMovers")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topMovers.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {stock.symbol}
                      </p>
                      <p className="text-xs text-gray-500">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          $
                          {typeof stock.price === "number"
                            ? stock.price.toFixed(2)
                            : stock.price}
                        </p>
                        <div
                          className={`flex items-center gap-1 text-sm font-medium ${(stock.change ?? 0) > 0 ? "text-green-600" : (stock.change ?? 0) < 0 ? "text-red-600" : "text-gray-500"}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {(stock.change ?? 0) > 0
                              ? "↗"
                              : (stock.change ?? 0) < 0
                                ? "↘"
                                : "−"}
                            {(stock.change ?? 0) > 0 ? "+" : ""}
                            {(stock.change ?? 0).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Market Movers */}
        {visibleTiles.topMarketMovers && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Top Market Movers</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleTile("topMarketMovers")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topMarketMovers.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {stock.symbol}
                      </p>
                      <p className="text-xs text-gray-500">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          ${stock.price.toFixed(2)}
                        </p>
                        <div
                          className={`flex items-center gap-1 text-sm font-medium ${stock.change > 0 ? "text-green-600" : stock.change < 0 ? "text-red-600" : "text-gray-500"}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {stock.change > 0
                              ? "↗"
                              : stock.change < 0
                                ? "↘"
                                : "−"}
                            {stock.change > 0 ? "+" : ""}
                            {stock.change.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risk Exposure */}
        {visibleTiles.riskExposure && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Risk Exposure</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleTile("riskExposure")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {riskExposure.map((risk, i) => {
                  const barColor =
                    risk.level === "High"
                      ? "#ef4444"
                      : risk.level === "Medium"
                        ? "#f59e0b"
                        : "#10b981";
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {risk.category}
                        </span>
                        <span className="rounded px-3 py-1 text-xs font-medium bg-gray-100 text-black border-0">
                          {risk.level}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${risk.value}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rule Triggers */}
      {visibleTiles.ruleTriggers && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Rule Triggers & Alerts</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleTile("ruleTriggers")}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(!hasConcentrationFromTheses && !hasTargetMetFromTheses) ? (
                <div className="p-4 rounded-lg bg-white border border-gray-200 text-sm text-gray-600">
                  No active rule triggers.
                </div>
              ) : (
                <>
                  {hasConcentrationFromTheses && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-gray-900">Concentration Alert</p>
                          <p className="text-sm text-gray-600">One or more theses require review or have been breached</p>
                        </div>
                      </div>
                      <Link
                        to={`/thesis${(() => {
                          const first = (serverTheses || []).find(
                            (t: any) =>
                              t && (t.status === "needs-review" || t.status === "breached"),
                          );
                          return first?.symbol ? `#${encodeURIComponent(first.symbol)}` : "";
                        })()}`}
                      >
                        <Badge variant="outline" className="cursor-pointer bg-white/95 text-gray-900 border-gray-300 hover:bg-gray-100">View Details</Badge>
                      </Link>
                    </div>
                  )}

                  {hasTargetMetFromTheses && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">Portfolio Target Met</p>
                          <p className="text-sm text-gray-600">One or more theses have reached their target</p>
                        </div>
                      </div>
                      <Link
                        to={`/thesis${(() => {
                          const first = (serverTheses || []).find(
                            (t: any) => t && t.status === "achieved",
                          );
                          return first?.symbol ? `#${encodeURIComponent(first.symbol)}` : "";
                        })()}`}
                      >
                        <Button variant="outline" size="sm">View in Thesis</Button>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <SourcesModal
        open={showSources}
        loading={sourcesLoading}
        sources={sourcesData}
        onClose={() => setShowSources(false)}
      />
    </div>
  );
}
