import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  AlertCircle,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  EvidenceChips,
  type EvidenceChipItem,
} from "@/app/components/EvidenceChips";
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

type StockChartPoint = {
  timestamp: number;
  close: number;
};

type StockChartResponse = {
  points: StockChartPoint[];
  previousClose?: number | null;
};

type NewsArticle = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  news_url?: string;
  news_source?: string;
  news_published_at?: string;
  sentiment?: string;
  sentiment_confidence?: number;
};

type SentimentBucket = "bullish" | "bearish" | "neutral";

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
];

async function fetchStockChart(
  symbol: string,
  range: string,
  interval: string,
): Promise<StockChartResponse> {
  const query = new URLSearchParams({ range, interval }).toString();
  const response = await fetch(
    `/api/stock/chart/${encodeURIComponent(symbol)}?${query}`,
  );
  if (!response.ok) {
    throw new Error(`Chart API error (${response.status})`);
  }
  const payload = await response.json();
  return {
    points: Array.isArray(payload?.points) ? payload.points : [],
    previousClose:
      typeof payload?.previousClose === "number" ? payload.previousClose : null,
  };
}

async function fetchNews(ticker?: string): Promise<NewsArticle[]> {
  const query = ticker ? `?stock_ticker=${encodeURIComponent(ticker)}` : "";
  const response = await fetch(`/api/news${query}`);
  if (!response.ok) {
    throw new Error(`News API error (${response.status})`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

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

function resolveConfidenceLabel(value?: number | null): "High" | "Medium" | "Low" {
  if (typeof value !== "number") return "Low";
  if (value >= 0.75) return "High";
  if (value >= 0.5) return "Medium";
  return "Low";
}

function resolvePublishedTime(item: NewsArticle): number {
  const raw = item.news_published_at || item.created_at || "";
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? 0 : ts;
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
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(
    TIMEFRAMES[2],
  );
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [showNewsDetails, setShowNewsDetails] = useState(false);

  const { quotes } = useStockQuotes([normalizedSymbol]);
  const quote = quotes[normalizedSymbol];
  const { holdings, totalValue } = usePortfolio();
  const holding = holdings.find((h) => h.symbol === normalizedSymbol) ?? null;

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

  const loadNews = async () => {
    setLoadingNews(true);
    setNewsError(null);
    try {
      const items = await fetchNews(normalizedSymbol);
      setNews(Array.isArray(items) ? items : []);
    } catch (error) {
      setNewsError(
        error instanceof Error ? error.message : "Failed to load news feed",
      );
      setNews([]);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    loadChartData();
  }, [normalizedSymbol, timeframe.id]);

  useEffect(() => {
    void loadNews();
  }, [normalizedSymbol]);

  useEffect(() => {
    setShowNewsDetails(false);
  }, [normalizedSymbol]);

  const lastChartPrice =
    chartData.length > 0 ? chartData[chartData.length - 1].close : null;
  const currentPrice = quote?.price ?? lastChartPrice ?? holding?.avgCost ?? null;
  const periodChangePercent =
    chartData.length >= 2
      ? ((chartData[chartData.length - 1].close - chartData[0].close) /
          chartData[0].close) *
        100
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
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    return { open, close, high, low };
  }, [chartData]);

  const allocationPct =
    holding && totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
  const unrealizedPnl =
    holding && typeof currentPrice === "number"
      ? (currentPrice - holding.avgCost) * holding.shares
      : null;
  const unrealizedPnlPct =
    holding && typeof currentPrice === "number" && holding.avgCost > 0
      ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100
      : null;
  const onePctStockMoveValue = holding ? holding.value * 0.01 : null;
  const onePctPortfolioMovePct =
    holding && totalValue > 0 ? allocationPct / 100 : null;

  const newsBySentiment = useMemo(() => {
    const groups: Record<SentimentBucket, NewsArticle[]> = {
      bullish: [],
      bearish: [],
      neutral: [],
    };

    news.forEach((item) => {
      groups[resolveSentimentBucket(item)].push(item);
    });

    return groups;
  }, [news]);

  const newsSourceChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: EvidenceChipItem[] = [];

    const sorted = [...news].sort(
      (a, b) => resolvePublishedTime(b) - resolvePublishedTime(a),
    );

    for (const item of sorted) {
      const dedupeKey =
        item.news_url || item.title || String(item.id || item.created_at || "");
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const source = item.news_source?.trim() || "News";
      const title = (item.title || "Source reference").replace(/\s+/g, " ").trim();
      const evidence = title.length > 110 ? `${title.slice(0, 107)}...` : title;

      chips.push({
        source,
        evidence,
        confidence: resolveConfidenceLabel(item.sentiment_confidence),
        url: item.news_url || null,
      });

      if (chips.length >= 8) break;
    }

    return chips;
  }, [news]);

  const analystNotes = useMemo(() => {
    const trendLabel =
      periodChangePercent > 1
        ? "Positive trend"
        : periodChangePercent < -1
          ? "Negative trend"
          : "Range-bound trend";
    const newsBiasScore =
      newsBySentiment.bullish.length - newsBySentiment.bearish.length;
    const newsBiasLabel =
      newsBiasScore > 0
        ? "News flow leans bullish"
        : newsBiasScore < 0
          ? "News flow leans bearish"
          : "News flow is mixed";
    const concentrationRisk =
      allocationPct >= 35 ? "High" : allocationPct >= 20 ? "Medium" : "Low";

    const notes = [
      `Price trend (${timeframe.label}): ${trendLabel} (${periodChangePercent.toFixed(2)}%).`,
      `News sentiment: ${newsBySentiment.bullish.length} bullish, ${newsBySentiment.bearish.length} bearish, ${newsBySentiment.neutral.length} neutral.`,
      holding
        ? `Portfolio exposure: ${allocationPct.toFixed(2)}% (${concentrationRisk} concentration).`
        : "This symbol is not currently in your portfolio.",
    ];

    if (unrealizedPnl != null && unrealizedPnlPct != null) {
      notes.push(
        `Unrealized P/L: ${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)} (${unrealizedPnlPct.toFixed(2)}%).`,
      );
    }

    return { notes, trendLabel, newsBiasLabel, concentrationRisk };
  }, [
    periodChangePercent,
    newsBySentiment,
    holding,
    allocationPct,
    timeframe.label,
    unrealizedPnl,
    unrealizedPnlPct,
  ]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">{normalizedSymbol}</h1>
        <p className="text-gray-500 mt-1">Live market data and position context</p>
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
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f0f0f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(
                      0,
                      Math.floor((Math.max(chartData.length, 1) - 1) / 4),
                    )}
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

      <Card className="border-indigo-200 bg-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <Sparkles className="w-5 h-5" />
            AI Analyst Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-white text-indigo-900 border border-indigo-200">
              {analystNotes.trendLabel}
            </Badge>
            <Badge className="bg-white text-indigo-900 border border-indigo-200">
              {analystNotes.newsBiasLabel}
            </Badge>
            {holding ? (
              <Badge className="bg-white text-indigo-900 border border-indigo-200">
                Exposure {allocationPct.toFixed(2)}% · {analystNotes.concentrationRisk} risk
              </Badge>
            ) : (
              <Badge className="bg-white text-indigo-900 border border-indigo-200">
                No position
              </Badge>
            )}
          </div>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            {analystNotes.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            Built from live chart, holdings, and news sentiment tags (with keyword fallback).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertCircle className="w-5 h-5" />
              Symbol Position Impact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {holding ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-yellow-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Direct exposure</p>
                    <p className="font-medium text-gray-900">
                      {allocationPct.toFixed(2)}% of portfolio
                    </p>
                  </div>
                  <div className="rounded border border-yellow-200 bg-white p-3">
                    <p className="text-xs text-gray-500">1% stock move impact</p>
                    <p className="font-medium text-gray-900">
                      {onePctStockMoveValue != null
                        ? `~$${onePctStockMoveValue.toFixed(2)}`
                        : "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {onePctPortfolioMovePct != null
                        ? `~${onePctPortfolioMovePct.toFixed(2)}% portfolio move`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Shares</span>
                  <span className="font-medium text-gray-900">{holding.shares}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Position value</span>
                  <span className="font-medium text-gray-900">
                    ${holding.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Portfolio allocation</span>
                  <Badge className="bg-yellow-100 text-yellow-900 border-yellow-300">
                    {allocationPct.toFixed(2)}%
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded border border-yellow-200">
                  <span className="text-sm text-gray-700">Unrealized P/L</span>
                  <span
                    className={`font-medium ${
                      (unrealizedPnl ?? 0) >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {unrealizedPnl == null
                      ? "—"
                      : `${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}${
                          unrealizedPnlPct != null
                            ? ` (${unrealizedPnlPct >= 0 ? "+" : ""}${unrealizedPnlPct.toFixed(2)}%)`
                            : ""
                        }`}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-700">
                This symbol is not in your current holdings.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <FileText className="w-5 h-5" />
              Symbol News Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingNews ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading news...
              </div>
            ) : newsError ? (
              <p className="text-sm text-red-600">{newsError}</p>
            ) : news.length === 0 ? (
              <p className="text-sm text-gray-700">
                No news posts found for {normalizedSymbol}.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border border-green-200 bg-green-50 px-2 py-1 text-green-800">
                    Bullish: {newsBySentiment.bullish.length}
                  </div>
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
                    Bearish: {newsBySentiment.bearish.length}
                  </div>
                  <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    Neutral: {newsBySentiment.neutral.length}
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  Showing {newsSourceChips.length} source chips for quick scan.
                  Open deep-dive for full headline breakdown.
                </p>

                <EvidenceChips
                  items={newsSourceChips}
                  title="Source Chips"
                  showConfidence={false}
                />

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewsDetails((prev) => !prev)}
                  >
                    {showNewsDetails ? "Hide deep-dive" : "Dive into sources"}
                  </Button>
                </div>

                {showNewsDetails && (
                  <div className="space-y-3 border-t border-blue-200 pt-3">
                    {(["bullish", "bearish", "neutral"] as const).map((bucket) => {
                      const items = newsBySentiment[bucket].slice(0, 4);
                      const title =
                        bucket === "bullish"
                          ? "Bullish Catalysts"
                          : bucket === "bearish"
                            ? "Bearish Risks"
                            : "Neutral Updates";
                      const titleColor =
                        bucket === "bullish"
                          ? "text-green-700"
                          : bucket === "bearish"
                            ? "text-red-700"
                            : "text-gray-700";

                      return (
                        <div key={bucket} className="space-y-2">
                          <p className={`text-xs font-semibold uppercase ${titleColor}`}>
                            {title}
                          </p>
                          {items.length === 0 ? (
                            <p className="text-xs text-gray-500">
                              No {bucket} items for this symbol.
                            </p>
                          ) : (
                            items.map((item) => (
                              <a
                                key={`${bucket}-${item.id}`}
                                href={item.news_url || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded border border-blue-200 bg-white p-2 hover:bg-blue-100/40 transition-colors"
                              >
                                <p className="text-sm font-medium text-gray-900">
                                  {item.title}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {item.news_source || "News"} ·{" "}
                                  {item.news_published_at
                                    ? new Date(item.news_published_at).toLocaleString()
                                    : new Date(item.created_at).toLocaleString()}
                                </p>
                              </a>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
            <p className="font-medium text-gray-900">
              {chartStats ? `$${chartStats.open.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">High</p>
            <p className="font-medium text-gray-900">
              {chartStats ? `$${chartStats.high.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Low</p>
            <p className="font-medium text-gray-900">
              {chartStats ? `$${chartStats.low.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="p-3 rounded border bg-gray-50">
            <p className="text-xs text-gray-500">Close</p>
            <p className="font-medium text-gray-900">
              {chartStats ? `$${chartStats.close.toFixed(2)}` : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
