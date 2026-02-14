import { Link } from "react-router";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { TrendingUp, TrendingDown, Minus, Star, Plus, Search, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

export function StockList() {
  const { holdings: currentHoldingsData, totalValue: portfolioTotal } = usePortfolio();
  const currentHoldings = currentHoldingsData.map((h) => ({
    ...h,
    price: h.currentPrice,
    change: h.changePercent,
    value: h.value,
  }));
  const { quotes } = useStockQuotes(["AMD", "COIN", "PLTR", "SHOP", "SQ"]);
  const watchlistMeta = [
    { symbol: "AMD", name: "AMD Inc.", sector: "Technology" },
    { symbol: "COIN", name: "Coinbase", sector: "Technology" },
    { symbol: "PLTR", name: "Palantir Technologies", sector: "Technology" },
    { symbol: "SHOP", name: "Shopify Inc.", sector: "Technology" },
    { symbol: "SQ", name: "Block Inc.", sector: "Technology" },
  ];
  const watchlist = watchlistMeta.map((w) => ({
    ...w,
    price: quotes[w.symbol]?.price ?? 0,
    change: quotes[w.symbol]?.changePercent ?? 0,
  }));
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Stocks</h1>
            <p className="text-gray-500 mt-1">Your holdings and watchlist</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add to Watchlist
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search stocks by symbol or name..."
            className="pl-10"
          />
        </div>
      </div>
      
      <Tabs defaultValue="holdings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="holdings">Current Holdings</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        </TabsList>
        
        <TabsContent value="holdings">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Current Holdings</CardTitle>
                <Button variant="outline" size="sm">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Holdings
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {currentHoldings.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">{stock.symbol}</p>
                          <Badge variant="outline" className="text-xs">{stock.sector}</Badge>
                        </div>
                        <p className="text-sm text-gray-500">{stock.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{stock.shares} shares</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">Position Value</p>
                        <p className="font-semibold text-gray-900">${(stock.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">${(stock.price ?? 0).toFixed(2)}</p>
                        <div className={`flex items-center gap-1 text-sm ${(stock.change ?? 0) > 0 ? 'text-green-600' : (stock.change ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {(stock.change ?? 0) > 0 ? <TrendingUp className="w-3 h-3" /> : (stock.change ?? 0) < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {(stock.change ?? 0) > 0 ? '+' : ''}{(stock.change ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Total Holdings Value</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ${portfolioTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="watchlist">
          <Card>
            <CardHeader>
              <CardTitle>Watchlist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {watchlist.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">{stock.symbol}</p>
                          <Badge variant="outline" className="text-xs">{stock.sector}</Badge>
                        </div>
                        <p className="text-sm text-gray-500">{stock.name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">${(stock.price ?? 0).toFixed(2)}</p>
                        <div className={`flex items-center gap-1 text-sm ${(stock.change ?? 0) > 0 ? 'text-green-600' : (stock.change ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {(stock.change ?? 0) > 0 ? <TrendingUp className="w-3 h-3" /> : (stock.change ?? 0) < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {(stock.change ?? 0) > 0 ? '+' : ''}{(stock.change ?? 0).toFixed(2)}%
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          // Handle remove from watchlist
                        }}
                      >
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
