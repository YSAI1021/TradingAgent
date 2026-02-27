import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import {
  fetchNews,
  fetchStockChart,
  fetchStockPrice,
  type NewsArticle,
  type StockPrice,
} from "@/app/services/api";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Loader2,
  Building2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import SourcesModal from "@/app/components/SourcesModal";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TIMEFRAMES = [
  { id: "1D", range: "1d", interval: "5m", label: "1D" },
  { id: "5D", range: "5d", interval: "15m", label: "5D" },
  { id: "1M", range: "1mo", interval: "1d", label: "1M" },
  { id: "6M", range: "6mo", interval: "1d", label: "6M" },
  { id: "YTD", range: "ytd", interval: "1d", label: "YTD" },
  { id: "1Y", range: "1y", interval: "1d", label: "1Y" },
  { id: "5Y", range: "5y", interval: "1wk", label: "5Y" },
  { id: "Max", range: "max", interval: "1mo", label: "Max" },
] as const;

type ChartDataPoint = {
  timestamp: number;
  date: string;
  time: string;
  close: number;
  change: number;
  changePercent: number;
};

type SentimentBucket = "bullish" | "bearish" | "neutral";

type ThemeSummary = {
  name: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  articles: number;
};

const POSITIVE_KEYWORDS = [
  "beat",
  "beats",
  "surge",
  "rally",
  "rise",
  "growth",
  "profit",
  "upgrade",
  "record",
  "outperform",
  "strong",
  "bullish",
  "buyback",
  "partnership",
  "launch",
];

const NEGATIVE_KEYWORDS = [
  "miss",
  "misses",
  "drop",
  "fall",
  "decline",
  "loss",
  "downgrade",
  "lawsuit",
  "probe",
  "recall",
  "cut",
  "bearish",
  "warning",
  "layoff",
  "delay",
];

const THEME_RULES: Array<{ name: string; keywords: string[] }> = [
  { name: "Earnings Momentum", keywords: ["earnings", "revenue", "guidance", "quarter", "eps", "profit"] },
  { name: "Product & AI Execution", keywords: ["ai", "chip", "product", "launch", "model", "cloud"] },
  { name: "Demand & Customer Trends", keywords: ["demand", "sales", "customer", "orders", "adoption"] },
  { name: "Regulation & Policy", keywords: ["regulation", "antitrust", "policy", "government", "compliance"] },
  { name: "Supply Chain & Operations", keywords: ["supply", "factory", "capacity", "shipment", "logistics"] },
  { name: "Capital & Balance Sheet", keywords: ["buyback", "debt", "cash", "dividend", "financing"] },
];

function inferSentimentFromText(text: string): SentimentBucket {
  const normalized = text.toLowerCase();
  let score = 0;

  POSITIVE_KEYWORDS.forEach((word) => {
    if (normalized.includes(word)) score += 1;
  });
  NEGATIVE_KEYWORDS.forEach((word) => {
    if (normalized.includes(word)) score -= 1;
  });

  if (score > 0) return "bullish";
  if (score < 0) return "bearish";
  return "neutral";
}

function resolveSentimentBucket(item: NewsArticle): SentimentBucket {
  const raw = String(item.sentiment || "").toLowerCase();
  if (raw === "bullish" || raw === "positive") return "bullish";
  if (raw === "bearish" || raw === "negative") return "bearish";
  if (raw === "neutral") return "neutral";
  return inferSentimentFromText(`${item.title || ""} ${item.content || ""}`);
}

function resolvePublishedTime(item: NewsArticle): number {
  const raw = item.news_published_at || item.created_at || "";
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? 0 : ts;
}

function inferTheme(item: NewsArticle): string {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  for (const rule of THEME_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.name;
    }
  }
  return "Market Context";
}

function formatChartDate(timestamp: number, range: string): string {
  const d = new Date(timestamp * 1000);
  if (range === "1d" || range === "5d") {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (range === "5y" || range === "max") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(timestamp: number, range: string): string {
  const d = new Date(timestamp * 1000);
  if (range === "1d" || range === "5d") {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBigNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatVolume(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toLocaleString("en-US");
}

async function fetchChartData(
  symbol: string,
  range: string,
  interval: string,
): Promise<ChartDataPoint[]> {
  const result = await fetchStockChart(symbol, range, interval);
  const previousClose = result.previousClose ?? result.points[0]?.close ?? 0;

  const rows: ChartDataPoint[] = [];
  for (const point of result.points || []) {
    const close = point.close;
    const change = close - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    rows.push({
      timestamp: point.timestamp,
      date: formatChartDate(point.timestamp, range),
      time: formatTooltipDate(point.timestamp, range),
      close,
      change,
      changePercent,
    });
  }

  if (rows.length === 0) throw new Error("No chart points available");
  return rows;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const isPositive = row.change >= 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs text-gray-500 mb-1">{row.time}</p>
      <p className="text-lg font-semibold text-gray-900">${row.close.toFixed(2)}</p>
      <p
        className={`text-sm font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}
      >
        {isPositive ? "+" : ""}
        {row.change.toFixed(2)} ({isPositive ? "+" : ""}
        {row.changePercent.toFixed(2)}%)
      </p>
    </div>
  );
}

export function Stock() {
  const { symbol = "AAPL" } = useParams();
  const normalizedSymbol = symbol.toUpperCase();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(TIMEFRAMES[2]);

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const [newsBySymbol, setNewsBySymbol] = useState<Record<string, NewsArticle[]>>({});
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [stockSnapshot, setStockSnapshot] = useState<StockPrice | null>(null);
  const [showSources, setShowSources] = useState(false);

  const { quotes } = useStockQuotes([normalizedSymbol]);
  const quote = quotes[normalizedSymbol];
  const { holdings, totalValue } = usePortfolio();
  const holding = holdings.find((h) => h.symbol === normalizedSymbol) ?? null;

  const relatedSymbols = useMemo(
    () =>
      Array.from(
        new Set([
          normalizedSymbol,
          ...holdings.map((h) => String(h.symbol || "").toUpperCase()),
        ]),
      )
        .filter(Boolean)
        .slice(0, 8),
    [normalizedSymbol, holdings],
  );

  const loadChartData = () => {
    setLoadingChart(true);
    setChartError(null);
    fetchChartData(normalizedSymbol, timeframe.range, timeframe.interval)
      .then((rows) => setChartData(rows))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setChartError(message);
      })
      .finally(() => setLoadingChart(false));
  };

  const loadSnapshot = async () => {
    try {
      const snapshot = await fetchStockPrice(normalizedSymbol);
      setStockSnapshot(snapshot);
    } catch {
      setStockSnapshot(null);
    }
  };

  const loadNews = async () => {
    setLoadingNews(true);
    setNewsError(null);

    try {
      const pairs = await Promise.all(
        relatedSymbols.map(async (sym) => {
          try {
            const items = await fetchNews(sym);
            return [sym, Array.isArray(items) ? items : []] as const;
          } catch {
            return [sym, []] as const;
          }
        }),
      );

      setNewsBySymbol(Object.fromEntries(pairs));
    } catch (error) {
      setNewsBySymbol({});
      setNewsError(error instanceof Error ? error.message : "Failed to load news");
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    loadChartData();
  }, [normalizedSymbol, timeframe.id]);

  useEffect(() => {
    void loadSnapshot();
  }, [normalizedSymbol]);

  useEffect(() => {
    void loadNews();
  }, [normalizedSymbol, relatedSymbols.join(",")]);

  const currentSymbolNews = useMemo(
    () => newsBySymbol[normalizedSymbol] || [],
    [newsBySymbol, normalizedSymbol],
  );

  const holdingsNews = useMemo(() => {
    const merged: NewsArticle[] = [];
    relatedSymbols.forEach((sym) => {
      const items = newsBySymbol[sym] || [];
      merged.push(...items);
    });

    const seen = new Set<string>();
    return merged
      .sort((a, b) => resolvePublishedTime(b) - resolvePublishedTime(a))
      .filter((item) => {
        const key = item.news_url || item.title || String(item.id || item.created_at || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [newsBySymbol, relatedSymbols]);

  const lastChartPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
  const currentPrice = quote?.price ?? lastChartPrice ?? holding?.avgCost ?? null;
  const periodChangePercent =
    chartData.length >= 2
      ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
      : quote?.changePercent ?? 0;

  const lineColor =
    chartData.length >= 2
      ? chartData[chartData.length - 1].close >= chartData[0].close
        ? "#22c55e"
        : "#ef4444"
      : "#6b7280";

  const chartStats = useMemo(() => {
    if (chartData.length === 0) return null;
    const prices = chartData.map((d) => d.close);
    return {
      open: prices[0],
      close: prices[prices.length - 1],
      high: Math.max(...prices),
      low: Math.min(...prices),
    };
  }, [chartData]);

  const allocationPct = holding && totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
  const unrealizedPnl =
    holding && typeof currentPrice === "number"
      ? (currentPrice - holding.avgCost) * holding.shares
      : null;

  const sectorExposure = useMemo(() => {
    if (!holding || totalValue <= 0) return 0;
    const sameSectorValue = holdings
      .filter((h) => h.sector === holding.sector)
      .reduce((sum, h) => sum + h.value, 0);
    return (sameSectorValue / totalValue) * 100;
  }, [holdings, holding, totalValue]);

  const correlatedPeers = useMemo(() => {
    if (!holding) return [];
    return holdings
      .filter((h) => h.symbol !== holding.symbol && h.sector === holding.sector)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((h) => h.symbol);
  }, [holdings, holding]);

  const themeSummary = useMemo<ThemeSummary[]>(() => {
    if (holdingsNews.length === 0) return [];

    const grouped = new Map<string, { count: number; score: number }>();
    for (const item of holdingsNews) {
      const theme = inferTheme(item);
      const sentiment = resolveSentimentBucket(item);
      const score = sentiment === "bullish" ? 1 : sentiment === "bearish" ? -1 : 0;
      const prev = grouped.get(theme) || { count: 0, score: 0 };
      grouped.set(theme, { count: prev.count + 1, score: prev.score + score });
    }

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        articles: value.count,
        sentiment: value.score > 0 ? "Positive" : value.score < 0 ? "Negative" : "Neutral",
      }))
      .sort((a, b) => b.articles - a.articles)
      .slice(0, 3);
  }, [holdingsNews]);

  const overallSentiment = useMemo(() => {
    if (holdingsNews.length === 0) {
      return `No recent holdings-specific news was found for ${normalizedSymbol}.`;
    }

    const bullish = holdingsNews.filter((n) => resolveSentimentBucket(n) === "bullish").length;
    const bearish = holdingsNews.filter((n) => resolveSentimentBucket(n) === "bearish").length;
    const neutral = holdingsNews.length - bullish - bearish;

    if (bullish > bearish) {
      return `Overall sentiment is positive (${bullish} bullish, ${bearish} bearish, ${neutral} neutral). Momentum is currently supportive for your holdings.`;
    }
    if (bearish > bullish) {
      return `Overall sentiment is cautious (${bullish} bullish, ${bearish} bearish, ${neutral} neutral). Watch near-term downside headlines closely.`;
    }
    return `Overall sentiment is mixed (${bullish} bullish, ${bearish} bearish, ${neutral} neutral). Keep position sizing and conviction aligned.`;
  }, [holdingsNews, normalizedSymbol]);

  const companyOverview = useMemo(() => {
    const fundamentals = stockSnapshot?.fundamentals;
    const marketCap = formatBigNumber(fundamentals?.marketCap);
    const trailingPe =
      typeof fundamentals?.trailingPE === "number"
        ? fundamentals.trailingPE.toFixed(2)
        : "—";
    const positionNote = holding
      ? `You currently hold ${holding.shares} shares (${allocationPct.toFixed(2)}% of portfolio).`
      : "This symbol is currently on your radar but not in your holdings.";

    const tone =
      currentSymbolNews.length === 0
        ? "Recent headline flow is limited."
        : `${currentSymbolNews.filter((n) => resolveSentimentBucket(n) === "bullish").length} bullish vs ${currentSymbolNews.filter((n) => resolveSentimentBucket(n) === "bearish").length} bearish headlines in the latest source set.`;

    return `${normalizedSymbol} is being tracked with a market cap of ${marketCap} and trailing P/E of ${trailingPe}. ${tone} ${positionNote}`;
  }, [stockSnapshot, holding, allocationPct, currentSymbolNews, normalizedSymbol]);

  const sourcesData = useMemo(() => {
    const grouped: Record<string, NewsArticle[]> = {};
    for (const sym of relatedSymbols) {
      const items = newsBySymbol[sym] || [];
      if (items.length > 0) grouped[sym] = items.slice(0, 8);
    }
    return grouped;
  }, [newsBySymbol, relatedSymbols]);

  const fundamentals = stockSnapshot?.fundamentals || null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">{normalizedSymbol}</h1>
        <p className="text-gray-500 mt-1">Stock detail with portfolio-aware AI summary</p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-2xl font-semibold text-gray-900">
            {typeof currentPrice === "number" ? `$${currentPrice.toFixed(2)}` : "—"}
          </span>
          <span
            className={`flex items-center gap-1 text-lg ${
              periodChangePercent > 0
                ? "text-green-600"
                : periodChangePercent < 0
                  ? "text-red-600"
                  : "text-gray-500"
            }`}
          >
            {periodChangePercent > 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : periodChangePercent < 0 ? (
              <TrendingDown className="w-5 h-5" />
            ) : (
              <Minus className="w-5 h-5" />
            )}
            {periodChangePercent > 0 ? "+" : ""}
            {periodChangePercent.toFixed(2)}%
          </span>
        </div>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Building2 className="w-5 h-5" />
            Company Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 leading-relaxed">{companyOverview}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-1 mb-4">
            {TIMEFRAMES.map((tf) => (
              <Button
                key={tf.id}
                variant={timeframe.id === tf.id ? "default" : "ghost"}
                size="sm"
                className={`h-8 px-3 text-xs font-medium ${
                  timeframe.id === tf.id
                    ? "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-transparent"
                }`}
                onClick={() => setTimeframe(tf)}
              >
                {tf.label}
              </Button>
            ))}
          </div>

          <div className="h-[400px] w-full">
            {loadingChart ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span>Loading chart...</span>
              </div>
            ) : chartError ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <p className="text-red-600 font-medium">{chartError}</p>
                <Button variant="outline" size="sm" onClick={loadChartData}>
                  Retry
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor((Math.max(chartData.length, 1) - 1) / 4))}
                    tickFormatter={(value, index) => (index === 0 ? "" : value)}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => String(Math.round(v))}
                    tickCount={4}
                    allowDecimals={false}
                    width={40}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: "#d1d5db", strokeDasharray: "4 4" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={lineColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Sparkles className="w-5 h-5" />
              AI News Themes &amp; Sentiment
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs ml-auto text-blue-900 hover:bg-blue-100"
                onClick={() => setShowSources(true)}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Sources
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingNews ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading sentiment themes...
              </div>
            ) : newsError ? (
              <p className="text-sm text-red-600">{newsError}</p>
            ) : themeSummary.length === 0 ? (
              <p className="text-sm text-gray-700">
                No recent source-backed themes were found for your holdings.
              </p>
            ) : (
              <div className="space-y-3">
                {themeSummary.map((theme) => (
                  <div
                    key={theme.name}
                    className="rounded-lg border border-blue-200 bg-white p-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{theme.name}</p>
                      <p className="text-sm text-gray-600">{theme.articles} articles analyzed</p>
                    </div>
                    <Badge
                      className={
                        theme.sentiment === "Positive"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : theme.sentiment === "Negative"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-gray-100 text-gray-700 border-gray-200"
                      }
                    >
                      {theme.sentiment}
                    </Badge>
                  </div>
                ))}

                <div className="rounded-lg border border-blue-200 bg-white p-3">
                  <p className="text-sm text-gray-700">{overallSentiment}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertCircle className="w-5 h-5" />
              Impact on Your Holdings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {holding ? (
              <>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Direct Exposure</span>
                  <span className="font-medium text-gray-900">{allocationPct.toFixed(2)}% of portfolio</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Sector Exposure</span>
                  <span className="font-medium text-gray-900">{sectorExposure.toFixed(2)}% in {holding.sector}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Correlation Risk</span>
                  <span className="font-medium text-gray-900">
                    {correlatedPeers.length > 0 ? `Elevated with ${correlatedPeers.join(", ")}` : "Contained"}
                  </span>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-white p-3">
                  <p className="text-sm text-gray-700">
                    {normalizedSymbol} represents <strong>{allocationPct.toFixed(2)}%</strong> of your portfolio.
                    A 1% move in this symbol maps to about <strong>{(allocationPct / 100).toFixed(2)}%</strong> portfolio move.
                    {unrealizedPnl != null
                      ? ` Current unrealized P/L is ${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}.`
                      : ""}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-700">
                You do not currently hold {normalizedSymbol}. Add it in Portfolio to track direct impact.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Data Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Open</p>
            <p className="font-medium text-gray-900">{chartStats ? `$${chartStats.open.toFixed(2)}` : "—"}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">High</p>
            <p className="font-medium text-gray-900">{chartStats ? `$${chartStats.high.toFixed(2)}` : "—"}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Low</p>
            <p className="font-medium text-gray-900">{chartStats ? `$${chartStats.low.toFixed(2)}` : "—"}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Close</p>
            <p className="font-medium text-gray-900">{chartStats ? `$${chartStats.close.toFixed(2)}` : "—"}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Market Cap</p>
            <p className="font-medium text-gray-900">{formatBigNumber(fundamentals?.marketCap)}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Trailing P/E</p>
            <p className="font-medium text-gray-900">
              {typeof fundamentals?.trailingPE === "number" ? fundamentals.trailingPE.toFixed(2) : "—"}
            </p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Forward P/E</p>
            <p className="font-medium text-gray-900">
              {typeof fundamentals?.forwardPE === "number" ? fundamentals.forwardPE.toFixed(2) : "—"}
            </p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Avg Daily Volume (3M)</p>
            <p className="font-medium text-gray-900">{formatVolume(fundamentals?.averageDailyVolume3Month)}</p>
          </div>
          <div className="p-3 rounded border bg-gray-50 md:col-span-2">
            <p className="text-xs text-gray-500">52-Week Range</p>
            <p className="font-medium text-gray-900">
              {typeof fundamentals?.fiftyTwoWeekLow === "number" && typeof fundamentals?.fiftyTwoWeekHigh === "number"
                ? `$${fundamentals.fiftyTwoWeekLow.toFixed(2)} - $${fundamentals.fiftyTwoWeekHigh.toFixed(2)}`
                : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <SourcesModal
        open={showSources}
        loading={loadingNews}
        sources={sourcesData}
        onClose={() => setShowSources(false)}
      />
    </div>
  );
}
