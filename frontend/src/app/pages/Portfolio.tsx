import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageCircleQuestion,
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
  generateHistoricalSnapshots,
  NewsArticle,
  PortfolioSnapshot,
} from "@/app/services/api";
import { AddTransactionModal } from "@/app/components/AddTransactionModal";
import { PortfolioPieChart } from "@/app/components/PortfolioPieChart";
import SourcesModal from "@/app/components/SourcesModal";
import { TransactionHistoryModal } from "@/app/components/TransactionHistoryModal";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Separator } from "@/app/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

const TOOLBOX_SUGGESTIONS = ["AAPL", "MSFT", "GOOGL", "NVDA", "UNH", "XOM", "AMD", "PANW"];
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

function formatSnapshotLabel(date: string, tf: (typeof CHART_TIMEFRAMES)[number]["id"]): string {
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
  const count = timeframe === "1D" ? 8 : timeframe === "1W" ? 7 : timeframe === "1Y" ? 12 : 24;
  const baseEnd = totalValue || totalCost || 1000;
  const baseStart = timeframe === "1D" ? baseEnd - dailyPnl : totalCost > 0 ? totalCost : baseEnd;
  const points: ChartPoint[] = [];

  for (let i = 0; i < count; i++) {
    const ratio = count === 1 ? 1 : i / (count - 1);
    const value = baseStart + (baseEnd - baseStart) * ratio;
    const pointDate = new Date(now);
    if (timeframe === "1D") pointDate.setHours(now.getHours() - (count - i));
    if (timeframe === "1W") pointDate.setDate(now.getDate() - (count - 1 - i));
    if (timeframe === "1Y") pointDate.setMonth(now.getMonth() - (count - 1 - i));
    if (timeframe === "MAX") pointDate.setMonth(now.getMonth() - (count - 1 - i) * 3);
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
  const [timeframe, setTimeframe] = useState<(typeof CHART_TIMEFRAMES)[number]>(CHART_TIMEFRAMES[1]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [transactionModal, setTransactionModal] = useState<{ ticker: string; name: string } | null>(
    null,
  );
  const [newsBySymbol, setNewsBySymbol] = useState<Record<string, NewsArticle[]>>({});
  const [loadingNews, setLoadingNews] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [toolboxCollapsed, setToolboxCollapsed] = useState(false);
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
    () => Array.from(new Set([...watchlistSymbols, searchSymbol].filter(Boolean))),
    [watchlistSymbols, searchSymbol],
  );
  const { quotes } = useStockQuotes(quoteSymbols);

  const totalCost = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.shares * holding.avgCost, 0),
    [holdings],
  );
  const totalReturnValue = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturnValue / totalCost) * 100 : 0;
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

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const loadSnapshots = async () => {
      setLoadingSnapshots(true);
      try {
        let data = await fetchPortfolioSnapshots(token, 3650);
        if (data.length === 0) {
          await generateHistoricalSnapshots(token).catch(() => undefined);
          data = await fetchPortfolioSnapshots(token, 3650);
        }
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
    const filtered = snapshots.filter((row) => new Date(`${row.snapshot_date}T00:00:00`) >= minDate);
    const effective = filtered.length > 1 ? filtered : snapshots;
    return effective.map((row) => ({
      date: row.snapshot_date,
      label: formatSnapshotLabel(row.snapshot_date, timeframe.id),
      value: row.total_value,
    }));
  }, [snapshots, timeframe, totalValue, totalCost, dailyPnl]);

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
          const aDate = a.news_published_at ? new Date(a.news_published_at).getTime() : 0;
          const bDate = b.news_published_at ? new Date(b.news_published_at).getTime() : 0;
          return bDate - aDate;
        }),
    [newsBySymbol],
  );
  const visibleNews = portfolioNews.slice(0, 4);

  const watchlistItems = watchlistSymbols.map((symbol) => ({
    symbol,
    price: quotes[symbol]?.price ?? 0,
    changePercent: quotes[symbol]?.changePercent ?? 0,
  }));

  const stockSearchCandidates = Array.from(
    new Set([...TOOLBOX_SUGGESTIONS, ...holdings.map((holding) => holding.symbol), ...watchlistSymbols]),
  );

  const screenerIdeas = useMemo(() => {
    const topSector = [...holdings]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((holding) => holding.sector);
    const isTechHeavy = topSector.filter((sector) => sector === "Technology").length >= 2;
    return [
      {
        symbol: "UNH",
        reason: isTechHeavy
          ? "Healthcare diversifier to reduce concentration risk."
          : "Defensive quality with resilient earnings profile.",
      },
      {
        symbol: "XOM",
        reason: "Macro hedge candidate if inflation and energy volatility rise.",
      },
      {
        symbol: "PANW",
        reason: "Growth candidate aligned with enterprise security spending momentum.",
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
            <p className="text-xs text-gray-500 uppercase tracking-wide">Portfolio Value</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              $
              {totalValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Daily PnL</p>
            <p className={`mt-2 text-2xl font-semibold ${dailyPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {dailyPnl >= 0 ? "+" : ""}$
              {Math.abs(dailyPnl).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Return</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                totalReturnValue >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {totalReturnValue >= 0 ? "+" : ""}
              {totalReturnPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Portfolio Trend</span>
            <div className="flex items-center gap-1">
              {CHART_TIMEFRAMES.map((tf) => (
                <Button
                  key={tf.id}
                  variant={timeframe.id === tf.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTimeframe(tf)}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            {loadingSnapshots && chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d1d5db" }}
                    interval="preserveStartEnd"
                    minTickGap={80}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d1d5db" }}
                    tickFormatter={(value) => `$${Math.round(value).toLocaleString()}`}
                    width={72}
                    tickCount={5}
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
        {!toolboxCollapsed && (
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStockSearch(e.target.value)}
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
                      <Button size="sm" variant="outline" onClick={() => addToWatchlist(searchSymbol)}>
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
                {holdings.length === 0 ? (
                  <p className="text-sm text-gray-500">No current holdings yet.</p>
                ) : (
                  holdings.map((holding) => (
                    <div
                      key={holding.symbol}
                      className="rounded-lg border border-gray-200 p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{holding.symbol}</p>
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
                  ))
                )}
              </TabsContent>

              <TabsContent value="screener" className="space-y-3">
                {screenerIdeas.map((idea) => (
                  <div key={idea.symbol} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{idea.symbol}</p>
                      <Badge variant="secondary">Auto</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{idea.reason}</p>
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
                      <Button size="sm" variant="outline" onClick={() => addToWatchlist(idea.symbol)}>
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
              </TabsContent>

              <TabsContent value="watchlist" className="space-y-3">
                {watchlistItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No watchlist symbols yet.</p>
                ) : (
                  watchlistItems.map((item) => (
                    <div
                      key={item.symbol}
                      className="rounded-lg border border-gray-200 p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.symbol}</p>
                        <p
                          className={`text-xs mt-1 ${
                            item.changePercent > 0
                              ? "text-green-600"
                              : item.changePercent < 0
                                ? "text-red-600"
                                : "text-gray-500"
                          }`}
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
                        <Button size="sm" variant="outline" onClick={() => removeFromWatchlist(item.symbol)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Sparkles className="w-5 h-5" />
              News Themes & Sentiment
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => setShowSources(true)}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Sources
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingNews && visibleNews.length === 0 ? (
              <p className="text-sm text-gray-600">Analyzing portfolio news...</p>
            ) : visibleNews.length > 0 ? (
              visibleNews.map((item) => (
                <div
                  key={`${item.id || item.news_url}-${item.stock_ticker}`}
                  className="w-full text-left p-3 rounded-lg bg-white border border-blue-500/20 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <Badge variant="outline" className="text-xs">
                      {item.stock_ticker || "Portfolio"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Why it matters: this update affects exposure and near-term decision framing.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        sendPrompt(
                          `Analyze this news for my holdings: ${item.title} (${item.stock_ticker || "portfolio"})`,
                          { submit: true },
                        )
                      }
                    >
                      <MessageCircleQuestion className="w-3 h-3 mr-1" />
                      Ask
                    </Button>
                    <a
                      href={item.news_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Source
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-white border border-blue-500/20 p-3 text-sm text-gray-700 space-y-2">
                <p>No live news loaded yet.</p>
                <p>
                  Add or refresh holdings to generate AI themes and sentiment tied to your current
                  portfolio.
                </p>
              </div>
            )}
            {portfolioNews.length > 4 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSources(true)}>
                More
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertTriangle className="w-5 h-5" />
              Risks, Rule Triggers & Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {holdings.length > 0 ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-yellow-900">Rule</span>
                    <Badge variant="destructive" className="border-0">Attention</Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className="h-2 rounded-full bg-red-500"
                      style={{ width: `${Math.min(100, Math.max(0, holdings[0]?.allocation || 0))}%` }}
                    />
                  </div>
                  <p className="text-xs text-yellow-700">Position Concentration Breach</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() =>
                      sendPrompt(
                        "Explain the Position Concentration Breach alert and what I should do about it.",
                        { submit: true },
                      )
                    }
                  >
                    Ask
                  </Button>
                </div>
                <Separator className="bg-yellow-200" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-yellow-900">Portfolio</span>
                    <Badge className="bg-amber-100 text-amber-800 border-0">Monitor</Badge>
                  </div>
                  <p className="text-xs text-yellow-700">Tech sector exposure exceeds 55% of total portfolio</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() =>
                      sendPrompt(
                        "Explain the sector overweight alert for Tech and what I should do about it.",
                        { submit: true },
                      )
                    }
                  >
                    Ask
                  </Button>
                </div>
                <Separator className="bg-yellow-200" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-yellow-900">Macro</span>
                    <Badge className="bg-blue-100 text-blue-800 border-0">Info</Badge>
                  </div>
                  <p className="text-xs text-yellow-700">VIX elevated above 20 — heightened market volatility</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() =>
                      sendPrompt(
                        "Explain the elevated VIX macro alert and how it impacts my portfolio strategy.",
                        { submit: true },
                      )
                    }
                  >
                    Ask
                  </Button>
                </div>
                <Separator className="bg-yellow-200" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-yellow-900">Earnings</span>
                    <Badge className="bg-purple-100 text-purple-800 border-0">Upcoming</Badge>
                  </div>
                  <p className="text-xs text-yellow-700">Earnings reports upcoming for held positions this week</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() =>
                      sendPrompt(
                        "Explain the upcoming earnings exposure alert and what I should prepare for.",
                        { submit: true },
                      )
                    }
                  >
                    Ask
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-white border border-yellow-300 p-3 text-sm text-gray-700">
                No alerts yet. Add holdings and rules in Thesis to enable live triggers.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PortfolioPieChart holdings={holdings} />

      {transactionModal && (
        <TransactionHistoryModal
          open={!!transactionModal}
          onOpenChange={(open) => !open && setTransactionModal(null)}
          ticker={transactionModal.ticker}
          companyName={transactionModal.name}
          currentPrice={holdings.find((h) => h.symbol === transactionModal.ticker)?.currentPrice ?? 0}
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

      <SourcesModal open={showSources} loading={loadingNews} sources={newsBySymbol} onClose={() => setShowSources(false)} />
    </div>
  );
}
