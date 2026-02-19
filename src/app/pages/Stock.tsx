import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { TrendingUp, TrendingDown, Minus, Sparkles, AlertCircle, FileText, Loader2, Building2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { EvidenceChips } from "@/app/components/EvidenceChips";

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

function formatChartDate(timestamp: number, range: string): string {
  const d = new Date(timestamp * 1000);
  if (range === "1d" || range === "5d") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchChartData(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartDataPoint[]> {
  const params = new URLSearchParams({ range, interval });
  const apiUrl = `${YAHOO_CHART_BASE}/${symbol}?${params}`;

  // 1. Try Vite dev proxy (works when running npm run dev)
  const proxyUrl = `/api/chart/v8/finance/chart/${symbol}?${params}`;
  let res: Response;
  let usedProxy = true;

  try {
    res = await fetch(proxyUrl);
    if (!res.ok) {
      console.warn("[Chart] Proxy request failed:", res.status, res.statusText);
      throw new Error(`Proxy: ${res.status} ${res.statusText}`);
    }
  } catch (proxyErr) {
    console.warn("[Chart] Proxy fetch failed, trying CORS fallback:", proxyErr);
    usedProxy = false;
    // 2. Fallback: CORS proxy (works when proxy unavailable, e.g. production build)
    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
    res = await fetch(corsUrl);
  }

  const rawText = await res.text();
  console.log("[Chart] Response status:", res.status, "Used proxy:", usedProxy);

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    console.error("[Chart] Invalid JSON response:", rawText.slice(0, 500));
    throw new Error(`Invalid JSON (status ${res.status})`);
  }

  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
  if (!result) {
    console.error("[Chart] Unexpected data shape:", JSON.stringify(json).slice(0, 800));
    throw new Error("Invalid chart data structure");
  }

  const timestamps = (result as { timestamp?: number[] }).timestamp ?? [];
  const quotes = (result as { indicators?: { quote?: { close?: (number | null)[] }[] } }).indicators?.quote?.[0];
  const closes = quotes?.close ?? [];
  const previousClose = (result as { meta?: { previousClose?: number } }).meta?.previousClose ?? closes[0];

  const data: ChartDataPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    const change = close - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    data.push({
      timestamp: timestamps[i],
      date: formatChartDate(timestamps[i], range),
      time: formatTooltipDate(timestamps[i], range),
      close,
      change,
      changePercent,
    });
  }

  if (data.length === 0) {
    console.warn("[Chart] No data points parsed. timestamps:", timestamps.length, "closes:", closes.length);
    throw new Error("No chart data points");
  }

  return data;
}

function ChartTooltip({
  active,
  payload,
  label,
  range,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
  label?: string;
  range: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const isPositive = p.change >= 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs text-gray-500 mb-1">{p.time}</p>
      <p className="text-lg font-semibold text-gray-900">
        ${p.close.toFixed(2)}
      </p>
      <p
        className={`text-sm font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}
      >
        {isPositive ? "+" : ""}
        {p.change.toFixed(2)} ({isPositive ? "+" : ""}
        {p.changePercent.toFixed(2)}%)
      </p>
    </div>
  );
}

export function Stock() {
  const { symbol = "AAPL" } = useParams();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(TIMEFRAMES[2]); // 1M default
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChartData = () => {
    setLoading(true);
    setError(null);
    const range = timeframe.range;
    const interval = timeframe.interval;
    console.log("[Chart] Fetching", symbol, timeframe.id, "→", range, interval);
    fetchChartData(symbol, range, interval)
      .then((data) => {
        setChartData(data);
        console.log("[Chart] Loaded", data.length, "data points");
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        console.error("[Chart] Fetch error:", e);
      })
      .finally(() => setLoading(false));
  };

  const { quotes } = useStockQuotes([symbol]);
  const stockMeta: Record<string, { name: string; sector: string }> = {
    AAPL: { name: "Apple Inc.", sector: "Technology" },
    MSFT: { name: "Microsoft Corp.", sector: "Technology" },
    GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
    XOM: { name: "Exxon Mobil", sector: "Energy" },
    JPM: { name: "JPMorgan Chase", sector: "Finance" },
    NVDA: { name: "NVIDIA Corp.", sector: "Technology" },
    TSLA: { name: "Tesla Inc.", sector: "Auto" },
    META: { name: "Meta Platforms", sector: "Technology" },
    DIS: { name: "Walt Disney", sector: "Media" },
  };
  const meta = stockMeta[symbol as keyof typeof stockMeta] ?? { name: symbol, sector: "—" };
  const quote = quotes[symbol];
  const fallbackPrice: Record<string, number> = { AAPL: 228.52, MSFT: 415.5, GOOGL: 173.28, XOM: 118.45, JPM: 198.3, NVDA: 141.2, TSLA: 263.45, META: 585.3, DIS: 118.9 };
  const lastChartPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
  // Percentage change based on selected timeframe: (current - start) / start * 100
  const periodChangePercent =
    chartData.length >= 2
      ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
      : quote?.changePercent ?? 0;
  const stock = {
    ...meta,
    price: quote?.price ?? lastChartPrice ?? fallbackPrice[symbol] ?? 0,
    change: periodChangePercent,
  };

  useEffect(() => {
    loadChartData();
  }, [symbol, timeframe.id]);

  const lineColor =
    chartData.length >= 2
      ? chartData[chartData.length - 1].close >= chartData[0].close
        ? "#22c55e"
        : "#ef4444"
      : "#6b7280";

  const [companyOverviewOpen, setCompanyOverviewOpen] = useState(false);
  const companyOverviews: Record<string, { business: string; industry: string; products: string; marketPosition: string; recentDevelopments: string }> = {
    AAPL: {
      business: "Apple designs, manufactures, and sells consumer electronics, software, and services. The company's product lineup includes the iPhone, Mac, iPad, Apple Watch, and services like the App Store, Apple Music, and iCloud.",
      industry: "Technology / Consumer Electronics",
      products: "iPhone, Mac, iPad, Apple Watch, AirPods, Apple TV, Services (App Store, Apple Music, iCloud)",
      marketPosition: "World's largest company by market cap. Dominant in premium smartphone segment with strong ecosystem lock-in.",
      recentDevelopments: "Apple Intelligence AI integration across devices. Growing services revenue. Expansion in India and emerging markets.",
    },
    MSFT: {
      business: "Microsoft develops and licenses software, cloud services, and hardware. Core products include Windows, Office 365, Azure cloud, Xbox, and LinkedIn.",
      industry: "Technology / Software & Cloud",
      products: "Windows, Office 365, Azure, Teams, Dynamics 365, Xbox, GitHub, LinkedIn",
      marketPosition: "Leading cloud provider (Azure). Dominant in enterprise software and productivity tools.",
      recentDevelopments: "Copilot AI across product suite. Strong Azure growth. Gaming and Activision acquisition.",
    },
    GOOGL: {
      business: "Alphabet (Google) operates search, advertising, cloud, and consumer products. Core revenue comes from digital advertising and cloud services.",
      industry: "Technology / Internet & Advertising",
      products: "Google Search, YouTube, Google Cloud, Android, Chrome, Pixel devices",
      marketPosition: "Dominant in search and digital advertising. Major cloud player. Leading in AI research.",
      recentDevelopments: "Gemini AI integration. Cloud growth. Ongoing antitrust scrutiny.",
    },
    XOM: {
      business: "Exxon Mobil explores, produces, and refines oil and gas. Operates across upstream, downstream, and chemical segments globally.",
      industry: "Energy / Oil & Gas",
      products: "Crude oil, natural gas, refined fuels, lubricants, petrochemicals",
      marketPosition: "One of the largest integrated oil companies. Strong dividend history.",
      recentDevelopments: "Carbon capture investments. Guyana and Permian production growth.",
    },
    JPM: {
      business: "JPMorgan Chase provides banking, asset management, and investment services. Operates consumer, commercial, and investment banking.",
      industry: "Finance / Banking",
      products: "Consumer banking, credit cards, mortgages, investment banking, asset management",
      marketPosition: "Largest U.S. bank by assets. Leader in investment banking and trading.",
      recentDevelopments: "Strong net interest income. Wealth management growth. Fed stress test performance.",
    },
    NVDA: {
      business: "NVIDIA designs GPUs for gaming, data centers, and AI. Dominant in AI training chips and accelerated computing.",
      industry: "Technology / Semiconductors",
      products: "GeForce GPUs, Data Center GPUs (A100, H100), AI software, Omniverse",
      marketPosition: "Market leader in AI chips. Near-monopoly in data center AI accelerators.",
      recentDevelopments: "Record data center revenue. Blackwell chip ramp. AI infrastructure demand.",
    },
    TSLA: {
      business: "Tesla designs and manufactures electric vehicles, energy storage, and solar products. Also developing FSD and robotics.",
      industry: "Auto / Electric Vehicles",
      products: "Model S, 3, X, Y, Cybertruck, Megapack, Powerwall, Solar",
      marketPosition: "Largest EV maker by volume. Leader in battery tech and charging network.",
      recentDevelopments: "FSD rollout. Cybertruck production. Robotaxi ambitions.",
    },
    META: {
      business: "Meta Platforms operates social and communication apps including Facebook, Instagram, WhatsApp, and Reality Labs for VR/AR.",
      industry: "Technology / Social Media & Advertising",
      products: "Facebook, Instagram, WhatsApp, Messenger, Quest VR, Ray-Ban Meta",
      marketPosition: "Largest social media company. Leader in digital advertising reach.",
      recentDevelopments: "AI assistant rollout. Metaverse investments. Strong ad revenue recovery.",
    },
    DIS: {
      business: "Walt Disney operates media networks, theme parks, and streaming (Disney+, Hulu, ESPN+). Creates films, TV, and entertainment content.",
      industry: "Media / Entertainment",
      products: "Disney+, Hulu, ESPN+, Theme parks, studios, linear TV networks",
      marketPosition: "Leading entertainment conglomerate. Major streaming subscriber base.",
      recentDevelopments: "Streaming profitability focus. ESPN strategic options. Box office recovery.",
    },
  };
  const companyOverview = companyOverviews[symbol] ?? {
    business: `${meta.name} operates in the ${meta.sector} sector. Further details can be found in company filings and investor relations.`,
    industry: meta.sector,
    products: "Key products and services available in company reports.",
    marketPosition: "Market position varies by segment and geography.",
    recentDevelopments: "Check latest earnings and news for recent developments.",
  };

  const newsThemes = [
    { theme: "Strong Q4 Earnings", sentiment: "Positive", articles: 12 },
    { theme: "AI Integration", sentiment: "Positive", articles: 8 },
    { theme: "Supply Chain Concerns", sentiment: "Neutral", articles: 5 },
  ];

  const impactOnPortfolio = [
    { metric: "Direct Exposure", value: "35% of portfolio" },
    { metric: "Sector Exposure", value: "65% in Tech" },
    { metric: "Correlation Risk", value: "High with MSFT, GOOGL" },
  ];
  const stockEvidence = [
    {
      source: "Price Chart",
      evidence: `${symbol} has maintained positive momentum versus the start of the selected period.`,
      confidence: "Medium" as const,
    },
    {
      source: "RAG News Retrieval",
      evidence: "Theme analysis is based on recent retrieved news covering earnings, product, and supply-chain events.",
      confidence: "Medium" as const,
    },
    {
      source: "Portfolio Exposure",
      evidence: "This holding has high portfolio impact and strong correlation with your tech exposure.",
      confidence: "High" as const,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-semibold text-gray-900">{symbol}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompanyOverviewOpen(true)}
            className="ml-2"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Company Overview
          </Button>
        </div>
        <p className="text-gray-500">{stock.name}</p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-2xl font-semibold text-gray-900">${(stock.price ?? 0).toFixed(2)}</span>
          <span
            className={`flex items-center gap-1 text-lg ${
              (stock.change ?? 0) > 0 ? "text-green-600" : (stock.change ?? 0) < 0 ? "text-red-600" : "text-gray-500"
            }`}
          >
            {(stock.change ?? 0) > 0 ? <TrendingUp className="w-5 h-5" /> : (stock.change ?? 0) < 0 ? <TrendingDown className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
            {(stock.change ?? 0) > 0 ? "+" : ""}
            {(stock.change ?? 0).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Company Overview Modal */}
      <Dialog open={companyOverviewOpen} onOpenChange={setCompanyOverviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {symbol} — Company Overview
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">What the Company Does</h4>
              <p className="text-gray-700">{companyOverview.business}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Industry & Sector</h4>
              <p className="text-gray-700">{companyOverview.industry}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Key Products & Services</h4>
              <p className="text-gray-700">{companyOverview.products}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Market Position</h4>
              <p className="text-gray-700">{companyOverview.marketPosition}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Recent Developments</h4>
              <p className="text-gray-700">{companyOverview.recentDevelopments}</p>
            </div>
            <div className="pt-4 border-t">
              <EvidenceChips
                items={[
                  {
                    source: "Company Overview",
                    evidence: "Company overview is generated from sector, product, and recent development context.",
                    confidence: "Medium",
                  },
                ]}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price Chart - Google Finance style */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {/* Timeframe selector */}
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

          {/* Chart */}
          <div className="h-[400px] w-full">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span>Loading chart...</span>
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <p className="text-red-600 font-medium">{error}</p>
                <p className="text-xs text-gray-500 max-w-md">
                  API: query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=
                  {timeframe.range}&interval={timeframe.interval}
                </p>
                <Button variant="outline" size="sm" onClick={loadChartData}>
                  Retry
                </Button>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-500">
                No data available
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
                    interval={Math.max(0, Math.floor((chartData.length - 1) / 4))}
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
                    content={<ChartTooltip range={timeframe.range} />}
                    cursor={{ stroke: "#d1d5db", strokeDasharray: "4 4" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={lineColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI News Themes */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            AI Brief · Holdings Impact for {symbol}
            <Badge variant="outline" className="ml-auto bg-white/80">Gemini + RAG</Badge>
            <Badge variant="outline" className="bg-white/80">Evidence Mode</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {newsThemes.map((item, i) => (
              <div
                key={i}
                className="p-3 bg-white rounded-lg border border-blue-500/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{item.theme}</span>
                  <Badge
                    variant={item.sentiment === "Positive" ? "default" : "secondary"}
                    className={
                      item.sentiment === "Positive" ? "bg-green-100 text-green-800 border-0" : ""
                    }
                  >
                    {item.sentiment}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="w-4 h-4" />
                  <span>{item.articles} articles analyzed</span>
                </div>
              </div>
            ))}
            <Separator className="bg-blue-200" />
            <div className="p-4 bg-white rounded-lg border border-blue-500/20">
              <p className="text-sm text-gray-700">
                <strong>Overall Sentiment Trend:</strong> Positive momentum driven
                by strong earnings and AI product announcements. Watch for supply
                chain updates in coming weeks.
              </p>
            </div>
            <EvidenceChips items={stockEvidence} />
          </div>
        </CardContent>
      </Card>

      {/* Impact on Your Holdings */}
      <Card className="mb-6 border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <AlertCircle className="w-5 h-5" />
            Impact on Your Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {impactOnPortfolio.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-purple-600/20"
              >
                <span className="text-sm font-medium text-gray-700">
                  {item.metric}
                </span>
                <span className="text-sm text-gray-900">{item.value}</span>
              </div>
            ))}
            <Separator className="bg-purple-200" />
            <div className="p-4 bg-white rounded-lg border border-purple-600/20">
              <p className="text-sm text-gray-700">
                <strong>Portfolio Impact:</strong> This stock represents 35% of
                your portfolio. A 1% move in {symbol} translates to ~0.35%
                portfolio move. Consider the high correlation with other tech
                holdings.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="fundamentals">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fundamentals">Fundamentals</TabsTrigger>
              <TabsTrigger value="technical">Technical</TabsTrigger>
            </TabsList>
            <TabsContent value="fundamentals" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Market Cap</p>
                  <p className="text-xl font-semibold text-gray-900">$2.85T</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">P/E Ratio</p>
                  <p className="text-xl font-semibold text-gray-900">29.4</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">EPS (TTM)</p>
                  <p className="text-xl font-semibold text-gray-900">$6.20</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Dividend Yield</p>
                  <p className="text-xl font-semibold text-gray-900">0.52%</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="technical" className="space-y-4 mt-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-3">Key Technical Levels</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Resistance</span>
                    <span className="text-sm font-medium text-red-600">$190.00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Current</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${typeof stock.price === "number" ? stock.price.toFixed(2) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Support</span>
                    <span className="text-sm font-medium text-green-600">
                      $175.00
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
