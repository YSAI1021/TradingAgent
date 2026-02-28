import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { fetchNews, NewsArticle } from "@/app/services/api";
import SourcesModal from "@/app/components/SourcesModal";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";

const ENV_API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) || "").trim();
const IS_LOCAL_BROWSER =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const API_BASE_URL = ENV_API_BASE_URL || (IS_LOCAL_BROWSER ? "http://localhost:3000" : "");

const TIMEFRAMES = [
  { id: "1D", range: "1d", interval: "5m" },
  { id: "5D", range: "5d", interval: "15m" },
  { id: "1M", range: "1mo", interval: "1d" },
  { id: "6M", range: "6mo", interval: "1d" },
  { id: "YTD", range: "ytd", interval: "1d" },
  { id: "1Y", range: "1y", interval: "1d" },
  { id: "5Y", range: "5y", interval: "1wk" },
  { id: "MAX", range: "max", interval: "1mo" },
] as const;

type ChartDataPoint = {
  timestamp: number;
  label: string;
  close: number;
};

const STOCK_META: Record<string, { name: string; sector: string }> = {
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  MSFT: { name: "Microsoft Corp.", sector: "Technology" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
  NVDA: { name: "NVIDIA Corp.", sector: "Technology" },
  META: { name: "Meta Platforms", sector: "Technology" },
  TSLA: { name: "Tesla Inc.", sector: "Auto" },
  AMZN: { name: "Amazon.com", sector: "Consumer Discretionary" },
  JPM: { name: "JPMorgan Chase", sector: "Finance" },
  XOM: { name: "Exxon Mobil", sector: "Energy" },
  UNH: { name: "UnitedHealth Group", sector: "Healthcare" },
};

const FUNDAMENTALS: Record<
  string,
  { marketCap: string; peRatio: string; epsTtm: string; dividendYield: string }
> = {
  AAPL: { marketCap: "$2.9T", peRatio: "30.2", epsTtm: "$6.43", dividendYield: "0.52%" },
  MSFT: { marketCap: "$3.2T", peRatio: "36.7", epsTtm: "$12.44", dividendYield: "0.68%" },
  GOOGL: { marketCap: "$2.1T", peRatio: "27.5", epsTtm: "$6.92", dividendYield: "0.00%" },
  NVDA: { marketCap: "$2.8T", peRatio: "61.0", epsTtm: "$2.31", dividendYield: "0.03%" },
  XOM: { marketCap: "$490B", peRatio: "14.7", epsTtm: "$7.96", dividendYield: "3.35%" },
  UNH: { marketCap: "$470B", peRatio: "24.1", epsTtm: "$24.35", dividendYield: "1.42%" },
};

const COMPANY_OVERVIEW: Record<string, string> = {
  AAPL:
    "Apple remains a premium consumer technology platform with durable pricing power and recurring services revenue. The current thesis centers on ecosystem retention, services expansion, and AI-driven device upgrade cycles.",
  MSFT:
    "Microsoft is positioned as a scaled enterprise software and cloud platform. The primary thesis is sustained Azure growth plus monetization of AI copilots across productivity and developer workflows.",
  GOOGL:
    "Alphabet combines search monetization, cloud growth, and AI model deployment at global scale. The core debate is balancing ad resilience with regulatory pressure and AI capex intensity.",
  NVDA:
    "NVIDIA is the dominant compute platform in AI acceleration. The thesis is anchored in demand durability for data-center AI infrastructure and software ecosystem lock-in.",
  XOM:
    "Exxon provides cash flow resilience in commodity cycles with disciplined capital returns. The thesis focuses on free-cash-flow consistency and downside hedge properties in diversified portfolios.",
  UNH:
    "UnitedHealth combines managed care scale with healthcare-services execution. The thesis emphasizes earnings stability and defensive characteristics during macro uncertainty.",
};

function formatXAxisLabel(timestamp: number, range: string): string {
  const date = new Date(timestamp * 1000);
  if (range === "1d" || range === "5d") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (range === "5y" || range === "max") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchChartData(
  symbol: string,
  range: string,
  interval: string,
): Promise<ChartDataPoint[]> {
  const params = new URLSearchParams({ range, interval });
  const response = await fetch(`${API_BASE_URL}/api/stock/chart/${symbol}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load chart data");
  }
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No chart data available");
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  return timestamps
    .map((timestamp: number, index: number) => {
      const close = closes[index];
      if (close == null) return null;
      return {
        timestamp,
        close,
        label: formatXAxisLabel(timestamp, range),
      };
    })
    .filter(Boolean) as ChartDataPoint[];
}

function buildThemes(news: NewsArticle[]) {
  const themeBuckets: Record<string, { bullish: number; bearish: number; neutral: number }> = {};
  const keywords = [
    { key: "Earnings & Guidance", match: /(earnings|guidance|revenue|quarter|q[1-4])/i },
    { key: "AI & Product Momentum", match: /(ai|cloud|chip|product|launch|model)/i },
    { key: "Regulation & Policy", match: /(regulat|antitrust|policy|lawsuit|investigation)/i },
    { key: "Supply Chain & Operations", match: /(supply|factory|shipment|production|inventory)/i },
  ];

  news.forEach((article) => {
    const matchedTheme =
      keywords.find((keyword) => keyword.match.test(article.title || ""))?.key || "Market Commentary";
    if (!themeBuckets[matchedTheme]) {
      themeBuckets[matchedTheme] = { bullish: 0, bearish: 0, neutral: 0 };
    }
    const sentiment = (article.sentiment || "neutral").toLowerCase();
    if (sentiment.includes("bull")) themeBuckets[matchedTheme].bullish += 1;
    else if (sentiment.includes("bear")) themeBuckets[matchedTheme].bearish += 1;
    else themeBuckets[matchedTheme].neutral += 1;
  });

  return Object.entries(themeBuckets)
    .map(([theme, counts]) => {
      const total = counts.bullish + counts.bearish + counts.neutral;
      const net = counts.bullish - counts.bearish;
      const sentiment = net > 0 ? "Positive" : net < 0 ? "Negative" : "Neutral";
      return { theme, sentiment, total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
}

export function Stock() {
  const { symbol: rawSymbol = "AAPL" } = useParams();
  const symbol = rawSymbol.toUpperCase();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(TIMEFRAMES[2]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartError, setChartError] = useState("");
  const [newsBySymbol, setNewsBySymbol] = useState<Record<string, NewsArticle[]>>({});
  const [loadingNews, setLoadingNews] = useState(true);
  const [showSources, setShowSources] = useState(false);

  const { quotes } = useStockQuotes([symbol]);
  const { holdings, totalValue } = usePortfolio();
  const meta = STOCK_META[symbol] || { name: symbol, sector: "Other" };
  const price = quotes[symbol]?.price ?? chartData[chartData.length - 1]?.close ?? 0;

  const periodChangePercent =
    chartData.length >= 2
      ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
      : quotes[symbol]?.changePercent ?? 0;

  useEffect(() => {
    setLoadingChart(true);
    setChartError("");
    fetchChartData(symbol, timeframe.range, timeframe.interval)
      .then((data) => setChartData(data))
      .catch((error: unknown) => {
        setChartError(error instanceof Error ? error.message : "Failed to load chart");
      })
      .finally(() => setLoadingChart(false));
  }, [symbol, timeframe]);

  const holdingSymbols = useMemo(
    () => Array.from(new Set(holdings.map((holding) => holding.symbol).filter(Boolean))).slice(0, 8),
    [holdings],
  );
  const newsUniverseSymbols = useMemo(
    () => (holdingSymbols.length > 0 ? holdingSymbols : [symbol]),
    [holdingSymbols, symbol],
  );
  const newsUniverseKey = useMemo(() => newsUniverseSymbols.join(","), [newsUniverseSymbols]);

  useEffect(() => {
    let mounted = true;
    const symbolsToQuery = newsUniverseKey ? newsUniverseKey.split(",").filter(Boolean) : [];
    if (symbolsToQuery.length === 0) {
      setNewsBySymbol({});
      setLoadingNews(false);
      return;
    }

    setLoadingNews(true);
    Promise.all(
      symbolsToQuery.map(async (ticker) => {
        try {
          const items = await fetchNews(ticker);
          return [ticker, Array.isArray(items) ? items : []] as const;
        } catch (error) {
          console.error("Failed to load stock news for", ticker, error);
          return [ticker, []] as const;
        }
      }),
    )
      .then((rows) => {
        if (!mounted) return;
        setNewsBySymbol(Object.fromEntries(rows));
      })
      .finally(() => {
        if (mounted) setLoadingNews(false);
      });

    return () => {
      mounted = false;
    };
  }, [newsUniverseKey]);

  const lineColor =
    chartData.length >= 2 && chartData[chartData.length - 1].close >= chartData[0].close
      ? "#16a34a"
      : "#dc2626";

  const companyOverview =
    COMPANY_OVERVIEW[symbol] ||
    `${meta.name} operates in the ${meta.sector} sector. This summary should be validated against the latest filings and earnings updates.`;

  const fundamentals =
    FUNDAMENTALS[symbol] || {
      marketCap: "—",
      peRatio: "—",
      epsTtm: "—",
      dividendYield: "—",
    };

  const holdingNews = useMemo(
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
  const themes = useMemo(() => buildThemes(holdingNews), [holdingNews]);

  const directHolding = holdings.find((holding) => holding.symbol === symbol);
  const directExposurePct = directHolding && totalValue > 0 ? (directHolding.value / totalValue) * 100 : 0;
  const sectorExposurePct =
    totalValue > 0
      ? (holdings
          .filter((holding) => holding.sector === meta.sector)
          .reduce((sum, holding) => sum + holding.value, 0) /
          totalValue) *
        100
      : 0;
  const correlatedNames = holdings
    .filter((holding) => holding.symbol !== symbol && holding.sector === meta.sector)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((holding) => holding.symbol);
  const correlationRisk =
    sectorExposurePct >= 55 ? "High" : sectorExposurePct >= 35 ? "Medium" : "Low";

  const newsSummary = (() => {
    if (loadingNews) return "Loading news themes for your holdings...";
    if (holdingNews.length === 0) return "No recent indexed news. Sync news to refresh themes.";
    const positiveCount = holdingNews.filter((item) =>
      (item.sentiment || "").toLowerCase().includes("bull"),
    ).length;
    const negativeCount = holdingNews.filter((item) =>
      (item.sentiment || "").toLowerCase().includes("bear"),
    ).length;
    if (positiveCount > negativeCount) {
      return "Recent coverage skews positive with earnings and product momentum as primary drivers.";
    }
    if (negativeCount > positiveCount) {
      return "Recent coverage skews cautious, with downside narratives outweighing positive catalysts.";
    }
    return "Coverage is mixed. Monitor incoming catalysts before making sizing changes.";
  })();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-semibold text-gray-900">{symbol}</h1>
        <p className="text-gray-500 mt-1">{meta.name}</p>
        <div className="mt-3 flex items-center gap-4">
          <span className="text-2xl font-semibold text-gray-900">${price.toFixed(2)}</span>
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
            {TIMEFRAMES.map((item) => (
              <Button
                key={item.id}
                variant={timeframe.id === item.id ? "default" : "ghost"}
                size="sm"
                className={
                  timeframe.id === item.id
                    ? "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
                    : "text-gray-600 hover:bg-gray-100"
                }
                onClick={() => setTimeframe(item)}
              >
                {item.id}
              </Button>
            ))}
          </div>
          <div className="h-[360px] w-full">
            {loadingChart ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading chart...
              </div>
            ) : chartError ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-red-600 text-sm">{chartError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setTimeframe({ ...timeframe })}>
                  Retry
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor((chartData.length - 1) / 4))}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    domain={["auto", "auto"]}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 leading-relaxed">{companyOverview}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Market Cap</p>
            <p className="text-lg font-semibold text-gray-900">{fundamentals.marketCap}</p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">P/E Ratio</p>
            <p className="text-lg font-semibold text-gray-900">{fundamentals.peRatio}</p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">EPS (TTM)</p>
            <p className="text-lg font-semibold text-gray-900">{fundamentals.epsTtm}</p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Dividend Yield</p>
            <p className="text-lg font-semibold text-gray-900">{fundamentals.dividendYield}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            AI News Themes & Sentiment
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
          <p className="text-xs text-blue-800/80">
            Tailored to your current holdings: {newsUniverseSymbols.join(", ")}
          </p>
          {themes.length === 0 ? (
            <div className="p-3 bg-white rounded-lg border border-blue-500/20 text-sm text-gray-600">
              <FileText className="w-4 h-4 inline-block mr-2" />
              No theme data yet. Sync or ingest news to populate this section.
            </div>
          ) : (
            themes.map((theme) => (
              <div key={theme.theme} className="p-3 bg-white rounded-lg border border-blue-500/20">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{theme.theme}</p>
                  <Badge
                    className={
                      theme.sentiment === "Positive"
                        ? "bg-green-100 text-green-800 border-0"
                        : theme.sentiment === "Negative"
                          ? "bg-red-100 text-red-800 border-0"
                          : "bg-gray-100 text-gray-700 border-0"
                    }
                  >
                    {theme.sentiment}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">{theme.total} articles analyzed</p>
              </div>
            ))
          )}
          <Separator className="bg-blue-200" />
          <div className="p-4 bg-white rounded-lg border border-blue-500/20 text-sm text-gray-700">
            <strong>Overall Sentiment Trend:</strong> {newsSummary}
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <AlertCircle className="w-5 h-5" />
            Impact on Your Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-purple-600/20">
            <span className="text-sm font-medium text-gray-700">Direct Exposure</span>
            <span className="text-sm text-gray-900">{directExposurePct.toFixed(1)}% of portfolio</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-purple-600/20">
            <span className="text-sm font-medium text-gray-700">Sector Exposure</span>
            <span className="text-sm text-gray-900">
              {sectorExposurePct.toFixed(1)}% in {meta.sector}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-purple-600/20">
            <span className="text-sm font-medium text-gray-700">Correlation Risk</span>
            <span className="text-sm text-gray-900">
              {correlationRisk}
              {correlatedNames.length > 0 ? ` with ${correlatedNames.join(", ")}` : ""}
            </span>
          </div>
          <Separator className="bg-purple-200" />
          <div className="p-4 bg-white rounded-lg border border-purple-600/20 text-sm text-gray-700">
            <strong>Portfolio Impact:</strong>{" "}
            {directExposurePct > 0
              ? `A 1% move in ${symbol} currently translates to about ${(directExposurePct / 100).toFixed(2)}% move in your portfolio.`
              : `${symbol} is not currently a direct holding, but it can still affect your portfolio through sector correlation and peer sentiment.`}
          </div>
        </CardContent>
      </Card>

      <SourcesModal
        open={showSources}
        loading={loadingNews}
        sources={newsBySymbol}
        onClose={() => setShowSources(false)}
      />
    </div>
  );
}
