import { useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Sparkles, Plus, Edit, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { Separator } from "@/app/components/ui/separator";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";

const THESIS_SYMBOLS = ["AAPL", "MSFT", "XOM"];

const BASE_THESES = [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      thesis: "Strong ecosystem lock-in with recurring revenue from services. AI integration through Apple Intelligence will drive new upgrade cycle. Long-term play on wearables and AR/VR.",
      entry: 170.50,
      target: 200.00,
      stop: 155.00,
      tags: ["Ecosystem", "AI Integration", "Services Growth"],
      status: "on-track",
      lastUpdated: "2026-02-10"
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corp.",
      thesis: "Cloud leadership through Azure and enterprise dominance. Copilot AI integration across all products creating moat. GitHub, LinkedIn, and gaming provide diversification.",
      entry: 380.00,
      target: 450.00,
      stop: 350.00,
      tags: ["Cloud", "Portfolio Copilot", "Enterprise"],
      status: "on-track",
      lastUpdated: "2026-02-08"
    },
    {
      symbol: "XOM",
      name: "Exxon Mobil",
      thesis: "Energy transition hedge with strong dividend yield. Investments in carbon capture and clean energy while maintaining core oil/gas profitability. Geopolitical tensions support pricing.",
      entry: 110.00,
      target: 125.00,
      stop: 95.00,
      tags: ["Energy", "Dividends", "Transition"],
      status: "needs-review",
      lastUpdated: "2026-02-05"
    }
  ];

export function Thesis() {
  const { quotes } = useStockQuotes(THESIS_SYMBOLS);
  const needsReviewCardRef = useRef<HTMLDivElement>(null);

  const scrollToNeedsReview = () => {
    needsReviewCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    needsReviewCardRef.current?.classList.add("highlight-flash");
    setTimeout(() => {
      needsReviewCardRef.current?.classList.remove("highlight-flash");
    }, 2000);
  };
  const theses = useMemo(
    () =>
      BASE_THESES.map((t) => ({
        ...t,
        current: quotes[t.symbol]?.price ?? t.entry,
      })),
    [quotes]
  );
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Thesis</h1>
            <p className="text-gray-500 mt-1">Your documented reasoning for each position</p>
          </div>
          <Button>
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
              <strong>Overall Assessment:</strong> 2 of 3 theses remain on track. XOM requires attention 
              due to recent price underperformance and changing energy sector dynamics.
            </p>
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 border-0">2 On Track</Badge>
              <Badge
                role="button"
                tabIndex={0}
                className="bg-yellow-100 text-yellow-800 border-0 cursor-pointer hover:bg-yellow-200 transition-colors"
                onClick={scrollToNeedsReview}
                onKeyDown={(e) => e.key === "Enter" && scrollToNeedsReview()}
              >
                1 Needs Review
              </Badge>
            </div>
          </div>

          {/* AI Investment Discipline / Rule Adherence */}
          <div className="p-4 bg-white rounded-lg border border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-3">Rule Adherence Analysis</p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">Rule Adherence: 73%</span>
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: "73%" }} />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">Compliance by Rule Type</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex justify-between">
                    <span>Stop-loss at -5%</span>
                    <Badge className="bg-green-100 text-green-800 text-xs border-0">78%</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>No panic selling</span>
                    <Badge className="bg-yellow-100 text-yellow-800 text-xs border-0">65%</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>Position sizing limits</span>
                    <Badge className="bg-green-100 text-green-800 text-xs border-0">88%</Badge>
                  </li>
                </ul>
              </div>

              <Separator />

              <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "none" }}>
                <p className="text-sm font-semibold text-black mb-2">Violations & Impact</p>
                <p className="text-sm text-gray-700">
                  3 times you violated your &quot;no panic selling&quot; rule, resulting in an average 12% loss recovery missed. 
                  On Jan 15, 2026 and Feb 3, 2026, selling during dips led to missing rebounds.
                </p>
              </div>

              <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(251, 191, 36, 0.1)", border: "none" }}>
                <p className="text-sm font-semibold text-black mb-2">Pattern Recognition</p>
                <p className="text-sm text-gray-700">
                  You tend to break rules during high volatility periods. Rule violations occurred on days when the VIX was above 20 in 4 of 5 cases.
                </p>
              </div>

              <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", border: "none" }}>
                <p className="text-sm font-semibold text-black mb-2">Actionable Recommendations</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Consider setting automatic alerts for rule violations</li>
                  <li>• Add a &quot;cooling off&quot; period (e.g., 24h) before selling during high volatility</li>
                  <li>• Review your stop-loss execution — 78% compliance is solid; focus on panic-selling rule</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Thesis Cards */}
      <div className="space-y-6">
        {theses.map((item) => (
          <div
            key={item.symbol}
            ref={item.status === "needs-review" ? needsReviewCardRef : undefined}
            data-status={item.status}
          >
          <Card className="border border-gray-200 transition-all duration-300">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle>{item.symbol}</CardTitle>
                    <Badge variant="outline">{item.name}</Badge>
                    {item.status === 'on-track' && (
                      <Badge className="bg-green-100 text-green-800 border-0">✓ On Track</Badge>
                    )}
                    {item.status === 'needs-review' && (
                      <Badge className="bg-yellow-100 text-yellow-800 border-0">⚠ Needs Review</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">Last updated: {item.lastUpdated}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4" />
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
                <p className="text-sm font-medium text-gray-700 mb-2">Investment Thesis</p>
                <p className="text-sm text-gray-600 leading-relaxed">{item.thesis}</p>
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
                  <p className="text-lg font-semibold text-gray-900">${item.entry}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Current Price</p>
                  <p className="text-lg font-semibold text-gray-900">${Number(item.current).toFixed(2)}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-700 mb-1">Target Price</p>
                  <p className="text-lg font-semibold text-green-900">${item.target}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-xs text-red-700 mb-1">Stop Loss</p>
                  <p className="text-lg font-semibold text-red-900">${item.stop}</p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Progress to Target</p>
                  <p className="text-xs font-medium text-gray-700">
                    {(((item.current - item.entry) / (item.target - item.entry)) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ 
                      width: `${Math.min(100, Math.max(0, ((item.current - item.entry) / (item.target - item.entry)) * 100))}%` 
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
