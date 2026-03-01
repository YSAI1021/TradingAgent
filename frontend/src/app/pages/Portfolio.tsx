import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/app/context/AuthContext";
import { useCopilot } from "@/app/context/CopilotContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import {
  fetchNews,
  fetchPortfolioSnapshots,
  fetchMarketBenchmark,
  generateHistoricalSnapshots,
  NewsArticle,
  PortfolioSnapshot,
} from "@/app/services/api";
import { AddTransactionModal } from "@/app/components/AddTransactionModal";
import SourcesModal from "@/app/components/SourcesModal";
import { TransactionHistoryModal } from "@/app/components/TransactionHistoryModal";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Separator } from "@/app/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";

const TOOLBOX_SUGGESTIONS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "NVDA",
  "UNH",
  "XOM",
  "AMD",
  "PANW",
];
const WATCHLIST_STORAGE_KEY = "customWatchlist";

const CHART_TIMEFRAMES = [
  { id: "1D", label: "1D", days: 1 },
  { id: "1W", label: "1W", days: 7 },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "MAX", label: "MAX", days: 3650 },
] as const;

type ChartPoint = {
  date: string;
  label: string;
  value: number;
};

function formatSnapshotLabel(
  date: string,
  tf: (typeof CHART_TIMEFRAMES)[number]["id"],
): string {
  const d = new Date(`${date}T00:00:00`);
  if (tf === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (tf === "1W") return d.toLocaleDateString("en-US", { weekday: "short" });
  if (tf === "1Y") return d.toLocaleDateString("en-US", { month: "short" });
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function buildFallbackChart(
  timeframe: (typeof CHART_TIMEFRAMES)[number]["id"],
  totalValue: number,
  totalCost: number,
  dailyPnl: number,
): ChartPoint[] {
  const now = new Date();
  const count =
    timeframe === "1D"
      ? 8
      : timeframe === "1W"
        ? 7
        : timeframe === "1Y"
          ? 12
          : 24;
  const baseEnd = totalValue || totalCost || 1000;
  const baseStart =
    timeframe === "1D"
      ? baseEnd - dailyPnl
      : totalCost > 0
        ? totalCost
        : baseEnd;
  const points: ChartPoint[] = [];

  for (let i = 0; i < count; i++) {
    const ratio = count === 1 ? 1 : i / (count - 1);
    const value = baseStart + (baseEnd - baseStart) * ratio;
    const pointDate = new Date(now);
    if (timeframe === "1D") pointDate.setHours(now.getHours() - (count - i));
    if (timeframe === "1W") pointDate.setDate(now.getDate() - (count - 1 - i));
    if (timeframe === "1Y")
      pointDate.setMonth(now.getMonth() - (count - 1 - i));
    if (timeframe === "MAX")
      pointDate.setMonth(now.getMonth() - (count - 1 - i) * 3);
    const date = pointDate.toISOString().slice(0, 10);
    points.push({
      date,
      label: formatSnapshotLabel(date, timeframe),
      value,
    });
  }

  return points;
}

export function Portfolio() {
  const { token } = useAuth();
  const { sendPrompt } = useCopilot();
  const { holdings, totalValue } = usePortfolio();
  const [timeframe, setTimeframe] = useState<(typeof CHART_TIMEFRAMES)[number]>(
    CHART_TIMEFRAMES[1],
  );
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [transactionModal, setTransactionModal] = useState<{
    ticker: string;
    name: string;
  } | null>(null);
  const [newsBySymbol, setNewsBySymbol] = useState<
    Record<string, NewsArticle[]>
  >({});
  const [loadingNews, setLoadingNews] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [toolboxCollapsed, setToolboxCollapsed] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [newsCollapsed, setNewsCollapsed] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);
  const [holdingsFilter, setHoldingsFilter] = useState("");
  const [screenerFilter, setScreenerFilter] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (saved) setWatchlistSymbols(JSON.parse(saved));
    } catch {
      setWatchlistSymbols([]);
    }
  }, []);

  const searchSymbol = stockSearch.trim().toUpperCase();
  const quoteSymbols = useMemo(
    () =>
      Array.from(new Set([...watchlistSymbols, searchSymbol].filter(Boolean))),
    [watchlistSymbols, searchSymbol],
  );
  const { quotes } = useStockQuotes(quoteSymbols);

  const totalCost = useMemo(
    () =>
      holdings.reduce(
        (sum, holding) => sum + holding.shares * holding.avgCost,
        0,
      ),
    [holdings],
  );
  const totalReturnValue = totalValue - totalCost;
  const totalReturnPct =
    totalCost > 0 ? (totalReturnValue / totalCost) * 100 : 0;
  const dailyPnl = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const prevClose =
          holding.changePercent !== 0
            ? holding.currentPrice / (1 + holding.changePercent / 100)
            : holding.currentPrice;
        return sum + holding.shares * (holding.currentPrice - prevClose);
      }, 0),
    [holdings],
  );

  const dailyPnlPct = useMemo(() => {
    const previousTotal = totalValue - dailyPnl;
    if (!isFinite(previousTotal) || previousTotal === 0) return 0;
    return (dailyPnl / previousTotal) * 100;
  }, [dailyPnl, totalValue]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const loadSnapshots = async () => {
      setLoadingSnapshots(true);
      try {
        // Always regenerate when holdings exist so adding/removing a holding
        // immediately updates the chart with the full corrected history.
        if (holdings.length > 0) {
          await generateHistoricalSnapshots(token).catch(() => undefined);
        }
        const data = await fetchPortfolioSnapshots(token, 3650);
        if (mounted) setSnapshots(data);
      } catch (error) {
        console.error("Failed to load portfolio snapshots:", error);
        if (mounted) setSnapshots([]);
      } finally {
        if (mounted) setLoadingSnapshots(false);
      }
    };
    void loadSnapshots();
    return () => {
      mounted = false;
    };
  }, [token, holdings.length]);

  useEffect(() => {
    const tickers = holdings.map((holding) => holding.symbol).slice(0, 8);
    if (tickers.length === 0) {
      setNewsBySymbol({});
      return;
    }
    setLoadingNews(true);
    Promise.all(
      tickers.map(async (ticker) => {
        try {
          const items = await fetchNews(ticker);
          return [ticker, Array.isArray(items) ? items : []] as const;
        } catch {
          return [ticker, []] as const;
        }
      }),
    )
      .then((rows) => setNewsBySymbol(Object.fromEntries(rows)))
      .finally(() => setLoadingNews(false));
  }, [holdings]);

  const chartData = useMemo(() => {
    if (!snapshots.length) {
      return buildFallbackChart(timeframe.id, totalValue, totalCost, dailyPnl);
    }
    const latest = snapshots[snapshots.length - 1];
    const latestDate = new Date(`${latest.snapshot_date}T00:00:00`);
    const minDate = new Date(latestDate);
    minDate.setDate(minDate.getDate() - timeframe.days);
    const filtered = snapshots.filter(
      (row) => new Date(`${row.snapshot_date}T00:00:00`) >= minDate,
    );
    const effective = filtered.length > 1 ? filtered : snapshots;
    return effective.map((row) => ({
      date: row.snapshot_date,
      label: formatSnapshotLabel(row.snapshot_date, timeframe.id),
      value: row.total_value,
    }));
  }, [snapshots, timeframe, totalValue, totalCost, dailyPnl]);

  const chartMinValue =
    chartData && chartData.length
      ? Math.min(...chartData.map((d) => d.value))
      : 0;
  const chartMaxValue =
    chartData && chartData.length
      ? Math.max(...chartData.map((d) => d.value))
      : 0;

  const chartXTicks = useMemo(() => {
    if (!chartData || chartData.length <= 2) return [];
    // Use inner points by index (never first/last), deduplicated, ~4 evenly sampled
    const inner = chartData.slice(1, -1);
    const seen = new Set<string>();
    const unique = inner
      .map((d) => d.label)
      .filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    if (unique.length <= 4) return unique;
    const step = (unique.length - 1) / 3;
    return [0, 1, 2, 3].map((i) => unique[Math.round(i * step)]);
  }, [chartData]);

  const chartYTicks = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const tickCount = 5;
    if (chartMinValue === chartMaxValue) return [];
    const step = (chartMaxValue - chartMinValue) / (tickCount - 1);
    const ticks: number[] = [];
    for (let i = 0; i < tickCount; i++)
      ticks.push(Math.round(chartMinValue + step * i));
    return ticks.filter(
      (t) => t !== Math.round(chartMinValue) && t !== Math.round(chartMaxValue),
    );
  }, [chartData, chartMinValue, chartMaxValue]);
  const [benchmarkPct, setBenchmarkPct] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    if (!snapshots || snapshots.length < 2) {
      setBenchmarkPct(null);
      return;
    }

    const firstDate = new Date(snapshots[0].snapshot_date);
    const lastDate = new Date(snapshots[snapshots.length - 1].snapshot_date);
    const days = Math.max(
      30,
      Math.ceil(
        (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    let mounted = true;
    fetchMarketBenchmark(days)
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data) && data.length > 0) {
          const last = data[data.length - 1];
          setBenchmarkPct(typeof last.return === "number" ? last.return : null);
        } else {
          setBenchmarkPct(null);
        }
      })
      .catch(() => {
        if (mounted) setBenchmarkPct(null);
      });

    return () => {
      mounted = false;
    };
  }, [token, snapshots]);

  const portfolioNews = useMemo(
    () =>
      Object.entries(newsBySymbol)
        .flatMap(([ticker, items]) =>
          items.map((item) => ({
            ...item,
            stock_ticker: item.stock_ticker || ticker,
          })),
        )
        .sort((a, b) => {
          const aDate = a.news_published_at
            ? new Date(a.news_published_at).getTime()
            : 0;
          const bDate = b.news_published_at
            ? new Date(b.news_published_at).getTime()
            : 0;
          return bDate - aDate;
        }),
    [newsBySymbol],
  );
  const visibleNews = portfolioNews.slice(0, 4);

  const holdingSymbols = useMemo(
    () => holdings.map((h) => h.symbol),
    [holdings],
  );

  const { quotes: holdingsQuotes } = useStockQuotes(holdingSymbols);

  // useNavigate at component level — safe, no hook violations
  const navigate = useNavigate();

  // Recharts Treemap spreads data fields directly as props (not inside payload)
  function CustomizedTreemapContent({ x, y, width, height, name, symbol, changePercent, allocation, value }: any) {
    const change = typeof changePercent === "number" ? changePercent : 0;
    const fill = change > 0 ? "#10b981" : change < 0 ? "#ef4444" : "#9ca3af";
    const cx = x + width / 2;
    const cy = y + height / 2;
    const base = Math.min(width, height);
    // Company name font: scales with tile, capped
    const nameFontSize = Math.max(10, Math.min(36, Math.floor(base * 0.22)));
    // Ticker + percent font: smaller
    const subFontSize = Math.max(9, Math.min(20, Math.floor(base * 0.14)));
    return (
      <g onClick={() => symbol && navigate(`/stock/${symbol}`)} style={{ cursor: symbol ? "pointer" : "default" }}>
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} />
        {width > 30 && height > 20 && (
          <>
            {/* Ticker name (big) */}
            <text
              x={cx}
              y={height > 60 ? cy - subFontSize * 0.8 : cy}
              fill="#fff"
              fontSize={nameFontSize}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {symbol}
            </text>
            {/* Live change percent (below ticker) */}
            {height > 60 && (
              <text
                x={cx}
                y={cy + nameFontSize * 0.9}
                fill="#ffffffcc"
                fontSize={subFontSize}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {typeof change === "number" ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : ""}
              </text>
            )}

          </>
        )}
      </g>
    );
  }

  function TreemapTooltip({ active, payload }: any) {
    if (!active || !payload || !payload.length) return null;
    const node = payload[0].payload || payload[0];
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-gray-900">{node.symbol}</p>
        <p className="text-gray-600">{node.name}</p>
        <p className="mt-1">${(node.value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ({(typeof node.allocation === "number" ? node.allocation : 0).toFixed(1)}%)</p>
      </div>
    );
  }

  const watchlistItems = useMemo(
    () =>
      watchlistSymbols
        .filter((s) => !holdingSymbols.includes(s))
        .map((symbol) => ({
          symbol,
          price: quotes[symbol]?.price ?? 0,
          changePercent: quotes[symbol]?.changePercent ?? 0,
        })),
    [watchlistSymbols, quotes, holdingSymbols],
  );

  const stockSearchCandidates = Array.from(
    new Set([
      ...TOOLBOX_SUGGESTIONS,
      ...holdings.map((holding) => holding.symbol),
      ...watchlistSymbols,
    ]),
  );

  const screenerIdeas = useMemo(() => {
    const topSector = [...holdings]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((holding) => holding.sector);
    const isTechHeavy =
      topSector.filter((sector) => sector === "Technology").length >= 2;
    const base = [
      {
        symbol: "UNH",
        reason: isTechHeavy
          ? "Healthcare diversifier to reduce concentration risk."
          : "Defensive quality with resilient earnings profile.",
      },
      {
        symbol: "XOM",
        reason:
          "Macro hedge candidate if inflation and energy volatility rise.",
      },
      {
        symbol: "PANW",
        reason:
          "Growth candidate aligned with enterprise security spending momentum.",
      },
    ];

    // exclude any symbols already in holdings or in the watchlist
    const exclude = new Set<string>([...holdingSymbols, ...watchlistSymbols]);
    return base.filter((item) => !exclude.has(item.symbol));
  }, [holdings, holdingSymbols, watchlistSymbols]);

  const alertItems = useMemo(() => {
    return [
      {
        id: "concentration",
        title: "Position Concentration Breach",
        badgeText: "RULE",
        // red
        badgeClass: "bg-red-100 text-red-800",
        time: "Now",
        description:
          "NVDA exceeds 25% max position rule (currently 28.5%). Consider trimming ~$4,200.",
        progress: 28.5,
        askPrompt:
          "Explain this position concentration breach for NVDA and suggest next steps.",
      },
      {
        id: "tariff",
        title: "Tech Sector Tariff Risk",
        badgeText: "MACRO",
        // blue
        badgeClass: "bg-blue-100 text-blue-800",
        time: "1h ago",
        description:
          "New tariff proposals target semiconductor imports. 67% of portfolio exposed.",
        askPrompt:
          "Explain the impact of new tariff proposals on semiconductor exposure and my portfolio.",
      },
      {
        id: "trailing",
        title: "Trailing Stop Approaching",
        badgeText: "RULE",
        // red
        badgeClass: "bg-red-100 text-red-800",
        time: "3h ago",
        description:
          "TSLA within 3.2% of your 15% trailing stop level.",
        askPrompt: "Explain trailing stop alert for TSLA and suggest actions.",
      },
      {
        id: "earnings_week",
        title: "Earnings Week Alert",
        badgeText: "EARNINGS",
        // purple (use purple for earnings)
        badgeClass: "bg-purple-100 text-purple-800",
        time: "5h ago",
        description:
          "MSFT and GOOG report next week. Combined 22.4% of portfolio at risk.",
        askPrompt: "Summarize earnings exposure and suggested precautions.",
      },
    ];
  }, [holdings]);

  const addToWatchlist = (symbol: string) => {
    const cleaned = symbol.trim().toUpperCase();
    if (!cleaned || !/^[A-Z]{1,5}$/.test(cleaned)) return;
    if (watchlistSymbols.includes(cleaned)) return;
    const next = [...watchlistSymbols, cleaned];
    setWatchlistSymbols(next);
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
  };

  const removeFromWatchlist = (symbol: string) => {
    const next = watchlistSymbols.filter((value) => value !== symbol);
    setWatchlistSymbols(next);
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Value
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              $
              {totalValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="mt-1 text-sm text-gray-500">All positions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Daily PnL
            </p>
            <p className="mt-2 text-2xl font-semibold text-black">
              {dailyPnl < 0 ? "-" : ""}$
              {Math.abs(dailyPnl).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p
              className={`mt-1 text-sm ${dailyPnlPct >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {dailyPnlPct >= 0 ? "+" : ""}
              {Number(dailyPnlPct).toFixed(2)}% today
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Return
            </p>
            <p className="mt-2 text-2xl font-semibold text-black">
              {totalReturnValue >= 0 ? "+" : ""}
              {totalReturnPct.toFixed(2)}%
            </p>
            <p
              className={`mt-1 text-sm ${benchmarkPct === null ? "text-gray-500" : "text-green-600"}`}
            >
              {"vs S&P "}
              {benchmarkPct === null
                ? "—"
                : `${benchmarkPct >= 0 ? "+" : ""}${Number(benchmarkPct).toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Period Change</span>
            <div className="flex items-center gap-1">
              {CHART_TIMEFRAMES.map((tf) => (
                <Button
                  key={tf.id}
                  variant={!showMap && timeframe.id === tf.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setTimeframe(tf);
                    setShowMap(false);
                  }}
                >
                  {tf.label}
                </Button>
              ))}
              <Button
                key="map"
                variant={showMap ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setShowMap((p) => !p);
                }}
              >
                MAP
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showMap ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height={320}>
                <Treemap
                  data={
                    (() => {
                      if (!holdings || holdings.length === 0) {
                        return [
                          { symbol: "NVDA", name: "NVIDIA Corporation", size: 28.5, allocation: 28.5, changePercent: 1.23, value: 25650 },
                          { symbol: "MSFT", name: "Microsoft Corporation", size: 12.4, allocation: 12.4, changePercent: -0.45, value: 11160 },
                          { symbol: "AAPL", name: "Apple Inc.", size: 9.8, allocation: 9.8, changePercent: 0.72, value: 8820 },
                          { symbol: "AMZN", name: "Amazon.com, Inc.", size: 8.2, allocation: 8.2, changePercent: -1.02, value: 7380 },
                          { symbol: "GOOGL", name: "Alphabet Inc.", size: 7.5, allocation: 7.5, changePercent: 0.5, value: 6750 },
                          { symbol: "META", name: "Meta Platforms, Inc.", size: 6.0, allocation: 6.0, changePercent: 2.1, value: 5400 },
                          { symbol: "TSLA", name: "Tesla, Inc.", size: 5.6, allocation: 5.6, changePercent: -0.8, value: 5040 },
                          { symbol: "UNH", name: "UnitedHealth Group Incorporated", size: 4.7, allocation: 4.7, changePercent: 0.3, value: 4230 },
                          { symbol: "XOM", name: "Exxon Mobil Corporation", size: 3.9, allocation: 3.9, changePercent: -0.2, value: 3510 },
                          { symbol: "JPM", name: "JPMorgan Chase & Co.", size: 2.4, allocation: 2.4, changePercent: 0.15, value: 2160 },
                        ];
                      }
                      const total = Math.max(1, totalValue || holdings.reduce((s, h) => s + h.value, 0));
                      return holdings
                        .slice()
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 10)
                        .map((h) => ({
                          symbol: h.symbol,
                          name: h.name ?? h.symbol,
                          size: h.allocation ?? (total > 0 ? (h.value / total) * 100 : 0),
                          allocation: h.allocation ?? (total > 0 ? (h.value / total) * 100 : 0),
                          changePercent: holdingsQuotes?.[h.symbol]?.changePercent ?? h.changePercent ?? 0,
                          value: h.value,
                        }));
                    })()
                  }
                  dataKey="size"
                  ratio={4 / 3}
                  stroke="#ffffff"
                  content={<CustomizedTreemapContent />}
                >
                  <Tooltip content={<TreemapTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[320px]">
              {loadingSnapshots ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Loading chart...
                </div>
              ) : !snapshots.length ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  No portfolio history yet. Data will appear after your first recorded snapshot.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={{ stroke: "#d1d5db" }}
                      minTickGap={80}
                      {...(chartXTicks.length > 0 ? { ticks: chartXTicks } : {})}
                      tickFormatter={(value) => String(value)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={{ stroke: "#d1d5db" }}
                      {...(chartYTicks.length > 0 ? { ticks: chartYTicks } : {})}
                      tickFormatter={(value) => {
                        const n = Math.round(Number(value));
                        if (
                          n === Math.round(chartMinValue) ||
                          n === Math.round(chartMaxValue)
                        )
                          return "";
                        return `$${n.toLocaleString()}`;
                      }}
                      width={72}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                        "Portfolio",
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={totalReturnValue >= 0 ? "#16a34a" : "#dc2626"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Investment Toolbox</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToolboxCollapsed((prev) => !prev)}
              className="h-7 px-2 text-xs"
            >
              {toolboxCollapsed ? (
                <>
                  Expand
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </>
              ) : (
                <>
                  Collapse
                  <ChevronUp className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="search" className="space-y-4">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="search">Stock Search</TabsTrigger>
              <TabsTrigger value="holdings">Current Holdings</TabsTrigger>
              <TabsTrigger value="screener">Screener</TabsTrigger>
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  list="toolbox-symbols"
                  value={stockSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setStockSearch(e.target.value)
                  }
                  placeholder="Search ticker (e.g. NVDA)"
                  className="pl-9"
                />
                <datalist id="toolbox-symbols">
                  {stockSearchCandidates.map((symbol) => (
                    <option key={symbol} value={symbol} />
                  ))}
                </datalist>
              </div>
              {searchSymbol && /^[A-Z]{1,5}$/.test(searchSymbol) && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="font-semibold text-gray-900">{searchSymbol}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {quotes[searchSymbol]?.price
                      ? `$${quotes[searchSymbol].price.toFixed(2)}`
                      : "Live price loading..."}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddSymbol(searchSymbol);
                        setAddTransactionOpen(true);
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addToWatchlist(searchSymbol)}
                    >
                      Watch
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        sendPrompt(
                          `Run a deep analysis on ${searchSymbol} and whether it fits my portfolio thesis.`,
                          { submit: true },
                        )
                      }
                    >
                      Ask
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="holdings" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={holdingsFilter}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setHoldingsFilter(e.target.value)
                  }
                  placeholder="Filter holdings"
                  className="pl-9"
                />
              </div>

              {!toolboxCollapsed && (
                <>
                  {holdings
                    .filter((h) =>
                      holdingsFilter.trim()
                        ? h.symbol.includes(
                            holdingsFilter.trim().toUpperCase(),
                          ) ||
                          h.name
                            ?.toLowerCase()
                            .includes(holdingsFilter.trim().toLowerCase())
                        : true,
                    )
                    .map((holding) => (
                      <div
                        key={holding.symbol}
                        className="rounded-lg border border-gray-200 p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {holding.symbol}
                          </p>
                          <p className="text-xs text-gray-500">
                            {holding.shares} shares · {holding.sector}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              sendPrompt(
                                `Give me an updated analysis on ${holding.symbol} based on my current portfolio.`,
                                { submit: true },
                              )
                            }
                          >
                            Ask
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setTransactionModal({
                                ticker: holding.symbol,
                                name: holding.name,
                              })
                            }
                          >
                            History
                          </Button>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="screener" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={screenerFilter}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setScreenerFilter(e.target.value)
                  }
                  placeholder="Filter screener"
                  className="pl-9"
                />
              </div>

              {!toolboxCollapsed && (
                <>
                  {screenerIdeas
                    .filter((idea) =>
                      screenerFilter.trim()
                        ? idea.symbol.includes(
                            screenerFilter.trim().toUpperCase(),
                          ) ||
                          idea.reason
                            .toLowerCase()
                            .includes(screenerFilter.trim().toLowerCase())
                        : true,
                    )
                    .map((idea) => (
                      <div
                        key={idea.symbol}
                        className="rounded-lg border border-gray-200 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">
                            {idea.symbol}
                          </p>
                          <Badge variant="secondary">Auto</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {idea.reason}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddSymbol(idea.symbol);
                              setAddTransactionOpen(true);
                            }}
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addToWatchlist(idea.symbol)}
                          >
                            Watch
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              sendPrompt(
                                `Should I add ${idea.symbol} to my portfolio given current holdings and thesis?`,
                                { submit: true },
                              )
                            }
                          >
                            Ask
                          </Button>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="watchlist" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={watchlistFilter}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setWatchlistFilter(e.target.value)
                  }
                  placeholder="Filter watchlist"
                  className="pl-9"
                />
              </div>

              {!toolboxCollapsed && (
                <>
                  {watchlistItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No watchlist symbols yet.
                    </p>
                  ) : (
                    watchlistItems
                      .filter((item) =>
                        watchlistFilter.trim()
                          ? item.symbol.includes(
                              watchlistFilter.trim().toUpperCase(),
                            )
                          : true,
                      )
                      .map((item) => (
                        <div
                          key={item.symbol}
                          className="rounded-lg border border-gray-200 p-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.symbol}
                            </p>
                            <p
                              className={`text-xs mt-1 ${item.changePercent > 0 ? "text-green-600" : item.changePercent < 0 ? "text-red-600" : "text-gray-500"}`}
                            >
                              {item.changePercent > 0 ? "+" : ""}
                              {item.changePercent.toFixed(2)}%
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                sendPrompt(
                                  `Give me a full analysis on ${item.symbol} and how it relates to my portfolio.`,
                                  { submit: true },
                                )
                              }
                            >
                              Ask
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeFromWatchlist(item.symbol)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Sparkles className="w-5 h-5" />
              News Themes & Sentiment
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setNewsCollapsed((p) => !p)}
                >
                  {newsCollapsed ? (
                    <>
                      Expand
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </>
                  ) : (
                    <>
                      Collapse
                      <ChevronUp className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowSources(true)}
                >
                  More
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingNews && visibleNews.length === 0 ? (
              <p className="text-sm text-gray-600">
                Analyzing portfolio news...
              </p>
            ) : visibleNews.length > 0 ? (
              (newsCollapsed ? visibleNews.slice(0, 1) : visibleNews).map((item) => (
                  <div
                    key={`${item.id || item.news_url}-${item.stock_ticker}`}
                    className="w-full rounded-lg bg-white border border-blue-500/20 transition-colors flex"
                  >
                    {/* Left side - opens external URL */}
                    <a
                      href={item.news_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 p-3 hover:bg-gray-50 cursor-pointer rounded-l-lg border-r border-gray-100 no-underline"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Badge
                          className={`text-[10px] border-0 ${
                            item.sentiment === "bullish"
                              ? "bg-green-100 text-green-800"
                              : item.sentiment === "bearish"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {item.sentiment === "bullish"
                            ? "Bullish"
                            : item.sentiment === "bearish"
                              ? "Bearish"
                              : "Neutral"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {item.stock_ticker || "Portfolio"}
                        </Badge>
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {item.news_source || "Source"} • {item.news_published_at
                          ? (() => {
                              const diff = Date.now() - new Date(item.news_published_at).getTime();
                              const hours = Math.floor(diff / 3600000);
                              if (hours < 1) return "just now";
                              if (hours < 24) return `${hours}h ago`;
                              return `${Math.floor(hours / 24)}d ago`;
                            })()
                          : ""}
                      </p>
                    </a>
                    {/* Right side - sends to Copilot */}
                    <div
                      className="flex-1 p-3 hover:bg-blue-50 cursor-pointer rounded-r-lg"
                      onClick={() =>
                        sendPrompt(
                          `Analyze this news for my holdings: ${item.title} (${item.stock_ticker || "portfolio"})`,
                          { submit: true },
                        )
                      }
                    >
                      <p className="text-xs font-medium text-blue-800 mb-1">AI Sentiment Analysis</p>
                      <p className="text-xs text-gray-600">
                        Why it matters: this update affects exposure and near-term
                        decision framing.
                      </p>
                    </div>
                  </div>
                ))
            ) : (
              <div className="rounded-lg bg-white border border-blue-500/20 p-3 text-sm text-gray-700 space-y-2">
                <p>No live news loaded yet.</p>
                <p>
                  Add or refresh holdings to generate AI themes and sentiment
                  tied to your current portfolio.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertTriangle className="w-5 h-5" />
              Risks, Rule Triggers & Alerts
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setAlertsCollapsed((p) => !p)}
                >
                  {alertsCollapsed ? (
                    <>
                      Expand
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </>
                  ) : (
                    <>
                      Collapse
                      <ChevronUp className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {holdings.length > 0 ? (
              <div className="space-y-3">
                {(alertsCollapsed ? alertItems.slice(0, 1) : alertItems).map((it) => (
                  <div
                    key={it.id}
                    className="w-full rounded-lg bg-white border border-yellow-200/30 p-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-yellow-900">
                            {it.title}
                          </span>
                          <Badge className={`${it.badgeClass} border-0`}>
                            {it.badgeText}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() =>
                            sendPrompt(it.askPrompt, { submit: true })
                          }
                        >
                          Ask
                        </Button>
                      </div>

                      <p className="text-xs text-yellow-700">
                        {it.description}
                      </p>

                      {/* progress bar removed per request */}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-white border border-yellow-300 p-3 text-sm text-gray-700">
                No alerts yet. Add holdings and rules in Thesis to enable live
                triggers.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portfolio chart moved into Period Change card */}

      {transactionModal && (
        <TransactionHistoryModal
          open={!!transactionModal}
          onOpenChange={(open) => !open && setTransactionModal(null)}
          ticker={transactionModal.ticker}
          companyName={transactionModal.name}
          currentPrice={
            holdings.find((h) => h.symbol === transactionModal.ticker)
              ?.currentPrice ?? 0
          }
        />
      )}

      {token && (
        <AddTransactionModal
          open={addTransactionOpen}
          onOpenChange={setAddTransactionOpen}
          onSuccess={() => window.dispatchEvent(new Event("portfolio:refresh"))}
          token={token}
          defaultSymbol={addSymbol}
        />
      )}

      <SourcesModal
        open={showSources}
        loading={loadingNews}
        sources={newsBySymbol}
        onClose={() => setShowSources(false)}
      />
    </div>
  );
}
