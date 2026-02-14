import { useState } from "react";
import { Sparkles, TrendingUp, AlertTriangle, Target, ExternalLink, Pencil } from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { PortfolioPieChart } from "@/app/components/PortfolioPieChart";
import { TransactionHistoryModal } from "@/app/components/TransactionHistoryModal";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { Button } from "@/app/components/ui/button";

function formatLastUpdate(ts: number | null): string {
  if (!ts) return "Loading...";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function Portfolio() {
  const { holdings, totalValue, lastUpdatedAt } = usePortfolio();
  const [transactionModal, setTransactionModal] = useState<{ ticker: string; name: string } | null>(null);
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Portfolio</h1>
          <p className="text-gray-500 mt-1">
            Total Value: ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            {lastUpdatedAt && (
              <span className="ml-2 text-xs">· Last updated: {formatLastUpdate(lastUpdatedAt)}</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="self-start sm:self-center">
          <Pencil className="w-4 h-4 mr-2" />
          Edit Holdings
        </Button>
      </div>
      
      {/* AI Weekly Recap */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            AI Weekly Recap
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
        <CardContent className="text-blue-900">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="font-medium">Portfolio up 5.2% this week</p>
            </div>
            
            <div className="p-4 rounded-lg bg-white border border-blue-500/20 mt-4">
              <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">Insight</p>
              <p className="text-sm leading-relaxed text-gray-700 mb-3">
                Driven by strong tech earnings and energy recovery. Your portfolio 
                outperformed S&P 500 by 2.1% this week. Consider rebalancing tech 
                allocation which has grown to 65% of total holdings.
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>12 articles analyzed</span>
                <span>•</span>
                <span>5 earnings reports reviewed</span>
              </div>
            </div>
            
            <Separator className="bg-blue-200" />
            
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Key Drivers</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="bg-white">Tech: +7.1%</Badge>
                  <Badge variant="secondary" className="bg-white">Finance: +2.3%</Badge>
                  <Badge variant="secondary" className="bg-white">Energy: -1.2%</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Portfolio Allocation + Concentration Alerts - side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <PortfolioPieChart holdings={holdings} />
        
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertTriangle className="w-5 h-5" />
              Concentration Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-yellow-900">Tech Sector</span>
                  <Badge variant="destructive" className="border-0">High Risk</Badge>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                  <div className="h-2 rounded-full bg-red-500" style={{ width: "65%" }} />
                </div>
                <p className="text-xs text-yellow-700">65% of portfolio (Target: 40-50%)</p>
              </div>
              
              <Separator className="bg-yellow-200" />
              
              <div className="p-4 rounded-lg bg-white border border-blue-500/20 mt-4">
                <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">Recommendation</p>
                <p className="text-sm leading-relaxed text-stone-600">
                  Consider taking some profits from AAPL or MSFT 
                  and diversifying into healthcare or consumer goods sectors.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-7 gap-4 px-4 py-2 text-xs font-medium text-gray-500 border-b">
              <div className="col-span-2">Symbol</div>
              <div className="text-right">Shares</div>
              <div className="text-right">Avg Cost</div>
              <div className="text-right">Current</div>
              <div className="text-right">Gain/Loss</div>
              <div className="text-right">Allocation</div>
            </div>
            
            {/* Rows */}
            {holdings.map((holding) => {
              const totalCost = holding.shares * holding.avgCost;
              const currentValue = holding.value;
              const gainLoss = currentValue - totalCost;
              const gainLossPercent = (gainLoss / totalCost) * 100;
              
              return (
                <button
                  key={holding.symbol}
                  type="button"
                  onClick={() => setTransactionModal({ ticker: holding.symbol, name: holding.name })}
                  className="w-full grid grid-cols-7 gap-4 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left cursor-pointer"
                >
                  <div className="col-span-2">
                    <p className="font-medium text-gray-900">{holding.symbol}</p>
                    <p className="text-xs text-gray-500">{holding.name}</p>
                  </div>
                  <div className="text-right text-sm text-gray-900">{holding.shares}</div>
                  <div className="text-right text-sm text-gray-900">${holding.avgCost.toFixed(2)}</div>
                  <div className="text-right text-sm text-gray-900">${holding.currentPrice.toFixed(2)}</div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainLoss >= 0 ? '+' : ''}${gainLoss.toFixed(2)}
                    </p>
                    <p className={`text-xs ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainLoss >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${holding.allocation}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">{holding.allocation.toFixed(1)}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          
          <Separator className="my-4" />
          
          {/* Total */}
          <div className="px-4 py-2 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Total Portfolio Value</span>
              <span className="text-xl font-semibold text-gray-900">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {transactionModal && (
        <TransactionHistoryModal
          open={!!transactionModal}
          onOpenChange={(open) => !open && setTransactionModal(null)}
          ticker={transactionModal.ticker}
          companyName={transactionModal.name}
          currentPrice={holdings.find((h) => h.symbol === transactionModal.ticker)?.currentPrice ?? 0}
        />
      )}
    </div>
  );
}