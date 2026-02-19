import { AlertCircle, CheckCircle, ChevronRight, Settings, X, Sparkles } from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { Link } from "react-router";
import { useState, useMemo } from "react";
import { Button } from "@/app/components/ui/button";
import { ActionWorkflow } from "@/app/components/ActionWorkflow";
import { EvidenceChips } from "@/app/components/EvidenceChips";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

export function Dashboard() {
  const [actionWorkflowOpen, setActionWorkflowOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{symbol: string, type: "success" | "warning" | "alert"} | null>(null);
  
  // Dashboard tiles visibility state
  const [visibleTiles, setVisibleTiles] = useState({
    topMovers: true,
    topMarketMovers: true,
    riskExposure: true,
    ruleTriggers: true,
  });
  
  const portfolioBrief = [
    {
      section: "Stock",
      what: "Tech stocks surged on strong earnings",
      why: "Your AAPL and MSFT holdings gained 3.2% and 1.8%",
      action: "success" as const,
    },
    {
      section: "Sector",
      what: "Energy sector showed volatility",
      why: "Your XOM position experienced -2.1% movement",
      action: "warning" as const,
    },
    {
      section: "Portfolio",
      what: "Portfolio concentration increased",
      why: "Tech now represents 65% of total holdings (up from 60%)",
      action: "alert" as const,
    },
  ];

  const riskBorderStyles = {
    success: "border-l-green-500",
    warning: "border-l-yellow-500",
    alert: "border-l-red-500",
  };

  const dashboardEvidence = [
    {
      source: "Portfolio Holdings",
      evidence: "AAPL and MSFT gains contributed most of today's portfolio move.",
      confidence: "High" as const,
    },
    {
      source: "Sector Exposure",
      evidence: "Tech allocation is around 65%, above the target band, increasing concentration risk.",
      confidence: "High" as const,
    },
    {
      source: "News Retrieval",
      evidence: "Earnings-related positive news was retrieved, while energy-sector coverage remains mixed.",
      confidence: "Medium" as const,
    },
  ];

  const { holdings, totalValue } = usePortfolio();

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
    [holdings]
  );

  // Top Market Movers: smaller-cap/volatile stocks with high gains (excludes user's holdings)
  const topMarketMovers = [
    { symbol: "SMCI", name: "Super Micro Computer", price: 892.45, change: 18.52 },
    { symbol: "RIOT", name: "Riot Platforms", price: 12.85, change: 16.73 },
    { symbol: "PLUG", name: "Plug Power Inc.", price: 4.92, change: 14.89 },
    { symbol: "UPST", name: "Upstart Holdings", price: 38.67, change: 13.21 },
    { symbol: "SOFI", name: "SoFi Technologies", price: 9.34, change: 11.45 },
  ];
  
  const riskExposure = [
    { category: "Tech Concentration", level: "High", value: 65 },
    { category: "Market Cap Diversity", level: "Medium", value: 45 },
    { category: "Sector Volatility", level: "Low", value: 25 },
  ];
  
  
  const toggleTile = (tile: keyof typeof visibleTiles) => {
    setVisibleTiles(prev => ({ ...prev, [tile]: !prev[tile] }));
  };
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">
              Your portfolio command center · Portfolio: ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedAction({ symbol: "PORTFOLIO", type: "success" });
                setActionWorkflowOpen(true);
              }}
            >
              View Weekly Digest
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Customize
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.topMovers}
                  onCheckedChange={() => toggleTile('topMovers')}
                >
                  Top Movers in My Portfolio
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.topMarketMovers}
                  onCheckedChange={() => toggleTile('topMarketMovers')}
                >
                  Top Market Movers
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.riskExposure}
                  onCheckedChange={() => toggleTile('riskExposure')}
                >
                  Risk Exposure
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleTiles.ruleTriggers}
                  onCheckedChange={() => toggleTile('ruleTriggers')}
                >
                  Rule Triggers & Alerts
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      
      {/* Today's Portfolio Brief - Always visible, not customizable */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            AI Brief · Portfolio Overview
            <Badge variant="outline" className="ml-auto bg-white/80">Last updated: 2 min ago</Badge>
            <Badge variant="outline" className="bg-white/80">Gemini + RAG</Badge>
            <Badge variant="outline" className="bg-white/80">Evidence Mode</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-blue-900">
          {portfolioBrief.map((item, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border border-blue-200 bg-white hover:border-blue-300 transition-colors border-l-4 ${riskBorderStyles[item.action]}`}
              >
                <p className="text-xs font-medium text-blue-700 mb-1 uppercase tracking-wide">
                  {item.section}
                </p>
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">{item.what}</h3>
                    <p className="text-sm text-gray-600 mb-2">Why it matters: {item.why}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {item.action === "success" && (
                        <>
                          <Badge variant="secondary" className="text-xs">AAPL</Badge>
                          <Badge variant="secondary" className="text-xs">MSFT</Badge>
                          <Badge variant="secondary" className="text-xs">Earnings Beat</Badge>
                        </>
                      )}
                      {item.action === "warning" && (
                        <>
                          <Badge variant="secondary" className="text-xs">XOM</Badge>
                          <Badge variant="secondary" className="text-xs">Energy Sector</Badge>
                        </>
                      )}
                      {item.action === "alert" && (
                        <>
                          <Badge variant="secondary" className="text-xs">Tech Holdings</Badge>
                          <Badge variant="secondary" className="text-xs">Diversification</Badge>
                        </>
                      )}
                    </div>
                </div>
              </div>
          ))}
          <Separator className="bg-blue-200" />
          <EvidenceChips items={dashboardEvidence} />
        </CardContent>
      </Card>
      
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
                  onClick={() => toggleTile('topMovers')}
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
                      <p className="font-medium text-gray-900">{stock.symbol}</p>
                      <p className="text-xs text-gray-500">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">${typeof stock.price === 'number' ? stock.price.toFixed(2) : stock.price}</p>
                        <div className={`flex items-center gap-1 text-sm font-medium ${(stock.change ?? 0) > 0 ? 'text-green-600' : (stock.change ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          <span className="inline-flex items-center gap-1">
                            {(stock.change ?? 0) > 0 ? '↗' : (stock.change ?? 0) < 0 ? '↘' : '−'}
                            {(stock.change ?? 0) > 0 ? '+' : ''}{(stock.change ?? 0).toFixed(2)}%
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
                  onClick={() => toggleTile('topMarketMovers')}
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
                      <p className="font-medium text-gray-900">{stock.symbol}</p>
                      <p className="text-xs text-gray-500">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">${stock.price.toFixed(2)}</p>
                        <div className={`flex items-center gap-1 text-sm font-medium ${stock.change > 0 ? 'text-green-600' : stock.change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          <span className="inline-flex items-center gap-1">
                            {stock.change > 0 ? '↗' : stock.change < 0 ? '↘' : '−'}
                            {stock.change > 0 ? '+' : ''}{stock.change.toFixed(2)}%
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
                  onClick={() => toggleTile('riskExposure')}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {riskExposure.map((risk, i) => {
                  const barColor =
                    risk.level === "High" ? "#ef4444" : risk.level === "Medium" ? "#f59e0b" : "#10b981";
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{risk.category}</span>
                        <span className="rounded px-3 py-1 text-xs font-medium bg-gray-100 text-black border-0">
                          {risk.level}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${risk.value}%`, backgroundColor: barColor }}
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
                onClick={() => toggleTile('ruleTriggers')}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">Concentration Alert</p>
                    <p className="text-sm text-gray-600">Tech sector exceeded 60% threshold</p>
                  </div>
                </div>
                <Link to="/portfolio">
                  <Badge variant="outline" className="cursor-pointer bg-white/95 text-gray-900 border-gray-300 hover:bg-gray-100">
                    View Details
                  </Badge>
                </Link>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900">Portfolio Target Met</p>
                    <p className="text-sm text-gray-600">Tech holdings achieved +15% growth target</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white/95 text-gray-900 border-gray-300 hover:bg-gray-100">
                  Consider Taking Profit
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Action Workflow */}
      {selectedAction && (
        <ActionWorkflow
          open={actionWorkflowOpen}
          onClose={() => {
            setActionWorkflowOpen(false);
            setSelectedAction(null);
          }}
          symbol={selectedAction.symbol}
          actionType={selectedAction.type}
        />
      )}
    </div>
  );
}
