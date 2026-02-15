import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";
import { fetchPosts, fetchNews, ingestNews, Post, NewsArticle } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Plus,
  Search,
  Pencil,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { AddTransactionModal } from "@/app/components/AddTransactionModal";
import AddWatchlistModal from "@/app/components/AddWatchlistModal";

export function StockList() {
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const { token } = useAuth();
  const { holdings: currentHoldingsData, totalValue: portfolioTotal } =
    usePortfolio();
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

  // Load custom watchlist and mode from localStorage
  const [customWatchlist, setCustomWatchlist] = useState<string[]>([]);
  const [watchlistMode, setWatchlistMode] = useState<"auto" | "custom">("auto");
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const [newsStatus, setNewsStatus] = useState("");
  const [newsCache, setNewsCache] = useState<Record<string, NewsArticle[]>>({});
  const [hoverNews, setHoverNews] = useState<{ ticker: string | null; items: NewsArticle[] }>({ ticker: null, items: [] });
  const [showWatchlistPeek, setShowWatchlistPeek] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("customWatchlist");
      const savedMode = localStorage.getItem("watchlistMode");
      if (saved) setCustomWatchlist(JSON.parse(saved));
      if (savedMode === "auto" || savedMode === "custom") setWatchlistMode(savedMode as "auto" | "custom");
    } catch (e) {
      console.warn("Failed to load custom watchlist", e);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchPosts(100, 0);
        setPosts(data || []);
      } catch (err) {
        console.error("Failed to load posts for auto watchlist", err);
      }
    };
    load();
  }, []);

  const autoStockList = useMemo(() => {
    const defaultStocks = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
    if (!posts || posts.length === 0) return defaultStocks;
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      if (p.stock_ticker) counts[p.stock_ticker] = (counts[p.stock_ticker] || 0) + 1;
    });
    const uniques = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const combined = [...uniques];
    defaultStocks.forEach((s) => { if (!combined.includes(s)) combined.push(s); });
    return combined.slice(0, 10);
  }, [posts]);

  const stockListSymbols = useMemo(() => {
    if (watchlistMode === "custom") return customWatchlist;
    return autoStockList;
  }, [watchlistMode, customWatchlist, autoStockList]);

  const handleAddStock = (ticker: string) => {
    const symbol = ticker.toUpperCase().trim();
    if (!symbol) return;
    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      alert("Invalid stock ticker format (1-5 uppercase letters)");
      return;
    }
    if (customWatchlist.includes(symbol)) {
      // already present
      return;
    }
    const updated = [...customWatchlist, symbol];
    setCustomWatchlist(updated);
    localStorage.setItem("customWatchlist", JSON.stringify(updated));
    // keep edit mode active
    setIsEditMode(true);
    setShowAddModal(false);
  };

  const handleSyncNews = async () => {
    if (isFetchingNews) return;
    const tickersToSync = stockListSymbols.slice(0, 6);
    if (tickersToSync.length === 0) {
      setNewsStatus("No tickers in your watchlist yet.");
      return;
    }
    setIsFetchingNews(true);
    setNewsStatus(`Pulling headlines for ${tickersToSync.join(', ')}...`);
    try {
      // ingestNews requires auth token
      await ingestNews(token || '', tickersToSync);
      setNewsStatus(`News synced`);
      // invalidate cached news for these tickers
      setNewsCache((prev) => {
        const next = { ...prev };
        tickersToSync.forEach((t) => delete next[t]);
        return next;
      });
    } catch (err) {
      console.error('Failed to sync news', err);
      setNewsStatus('Failed to fetch news. Please try again.');
    } finally {
      setIsFetchingNews(false);
      setTimeout(() => setNewsStatus(''), 3000);
    }
  };

  const loadHoverNews = async (ticker?: string) => {
    if (!ticker) return;
    if (newsCache[ticker]) {
      setHoverNews({ ticker, items: newsCache[ticker] });
      return;
    }
    try {
      const items = await fetchNews(ticker);
      const top = Array.isArray(items) ? items.slice(0, 3) : [];
      setNewsCache((prev) => ({ ...prev, [ticker]: top }));
      setHoverNews({ ticker, items: top });
    } catch (err) {
      console.error('Failed to load hover news for', ticker, err);
    }
  };

  const handleMouseEnterTicker = (ticker: string) => {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      loadHoverNews(ticker);
    }, 250);
  };

  const handleMouseLeaveTicker = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // small delay before clearing so panel can be hovered
    setTimeout(() => setHoverNews({ ticker: null, items: [] }), 150);
  };

  const handleRemoveStock = (ticker: string) => {
    const updated = customWatchlist.filter((t) => t !== ticker);
    setCustomWatchlist(updated);
    localStorage.setItem("customWatchlist", JSON.stringify(updated));
  };

  const handleToggleMode = (mode: "auto" | "custom") => {
    setWatchlistMode(mode);
    localStorage.setItem("watchlistMode", mode);
    setIsEditMode(false);
    setShowAddModal(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Stocks</h1>
            <p className="text-gray-500 mt-1">Your holdings and watchlist</p>
          </div>
          <Button
            onClick={() => {
              setWatchlistMode("custom");
              setIsEditMode(true);
              setShowAddModal(true);
            }}
          >
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddTransactionOpen(true)}
                >
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
                          <p className="font-semibold text-gray-900">
                            {stock.symbol}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {stock.sector}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{stock.name}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {stock.shares} shares
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">
                          Position Value
                        </p>
                        <p className="font-semibold text-gray-900">
                          $
                          {(stock.value ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          ${(stock.price ?? 0).toFixed(2)}
                        </p>
                        <div
                          className={`flex items-center gap-1 text-sm ${(stock.change ?? 0) > 0 ? "text-green-600" : (stock.change ?? 0) < 0 ? "text-red-600" : "text-gray-500"}`}
                        >
                          {(stock.change ?? 0) > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (stock.change ?? 0) < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : (
                            <Minus className="w-3 h-3" />
                          )}
                          {(stock.change ?? 0) > 0 ? "+" : ""}
                          {(stock.change ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    Total Holdings Value
                  </span>
                  <span className="text-lg font-semibold text-gray-900">
                    $
                    {portfolioTotal.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
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
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 rounded ${watchlistMode === 'auto' ? 'bg-gray-100' : 'bg-white'}`}
                    onClick={() => handleToggleMode('auto')}
                  >
                    Auto
                  </button>
                  <button
                    className={`px-3 py-1 rounded ${watchlistMode === 'custom' ? 'bg-gray-100' : 'bg-white'}`}
                    onClick={() => handleToggleMode('custom')}
                  >
                    Custom
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncNews}
                    className="px-3 py-1 rounded bg-white"
                    disabled={isFetchingNews}
                  >
                    {isFetchingNews ? 'Syncing...' : 'Sync watchlist news'}
                  </button>
                  <button
                    onClick={() => setShowWatchlistPeek((s) => !s)}
                    className="px-3 py-1 rounded bg-white"
                  >
                    {showWatchlistPeek ? 'Hide Watchlist' : 'Quick Watchlist'}
                  </button>
                </div>
                {watchlistMode === 'custom' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const next = !isEditMode;
                        setIsEditMode(next);
                        // When entering edit mode, show the add input by default
                        setShowAddStock(next);
                      }}
                      className={`px-3 py-1 rounded ${isEditMode ? 'bg-green-100' : 'bg-white'}`}
                    >
                      ✎ Edit
                    </button>
                    {isEditMode && (
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="px-3 py-1 rounded bg-white"
                      >
                        + Add Stock
                      </button>
                    )}
                  </div>
                )}
              </div>
              

              <div className="space-y-3">
                {stockListSymbols.length === 0 ? (
                  <p className="text-sm text-gray-500">No stocks to display</p>
                ) : (
                  stockListSymbols.map((symbol) => {
                    const meta = watchlist.find((w) => w.symbol === symbol);
                    const name = meta?.name || symbol;
                    const sector = meta?.sector || 'Unknown';
                    const price = quotes[symbol]?.price ?? 0;
                    const change = quotes[symbol]?.changePercent ?? 0;

                    return (
                      <Link
                        key={symbol}
                        to={`/stock/${symbol}`}
                        className="relative flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                        onMouseEnter={() => handleMouseEnterTicker(symbol)}
                        onMouseLeave={handleMouseLeaveTicker}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900">{symbol}</p>
                              <Badge variant="outline" className="text-xs">{sector}</Badge>
                            </div>
                            <p className="text-sm text-gray-500">{name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">${price.toFixed(2)}</p>
                            <div className={`flex items-center gap-1 text-sm ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                              {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {change > 0 ? '+' : ''}{change.toFixed(2)}%
                            </div>
                          </div>
                          {watchlistMode === 'custom' && isEditMode ? (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveStock(symbol); }}
                              className="px-2 py-1 rounded bg-red-50 text-red-600"
                              title="Remove from watchlist"
                            >
                              ×
                            </button>
                          ) : null}
                          {watchlistMode !== 'custom' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // toggle favorite: add to custom watchlist and switch to custom mode
                                const exists = customWatchlist.includes(symbol);
                                if (exists) {
                                  handleRemoveStock(symbol);
                                } else {
                                  const updated = [...customWatchlist, symbol];
                                  setCustomWatchlist(updated);
                                  localStorage.setItem("customWatchlist", JSON.stringify(updated));
                                  setWatchlistMode('custom');
                                  setIsEditMode(true);
                                }
                              }}
                            >
                              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            </Button>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Transaction Modal */}
      {token && (
        <AddTransactionModal
          open={addTransactionOpen}
          onOpenChange={setAddTransactionOpen}
          onSuccess={() => {
            setAddTransactionOpen(false);
            window.location.reload();
          }}
          token={token}
        />
      )}
      {showWatchlistPeek && stockListSymbols.length > 0 && (
        <div className={`fixed right-6 top-24 z-40 w-56 rounded-lg bg-white p-3 shadow-lg`}>
          <div className="mb-2 font-semibold">Quick Watchlist</div>
          <div className="flex flex-wrap gap-2">
            {stockListSymbols.map((t) => (
              <button
                key={t}
                className={`px-2 py-1 rounded border text-sm ${hoverNews.ticker === t ? 'bg-gray-100' : ''}`}
                onClick={() => (window.location.href = `/stock/${t}`)}
                onMouseEnter={() => handleMouseEnterTicker(t)}
                onMouseLeave={handleMouseLeaveTicker}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {hoverNews.ticker && hoverNews.items.length > 0 && (
        <div className="fixed right-80 top-24 z-50 w-96 rounded-lg bg-white p-3 shadow-lg">
          <div className="mb-2 font-semibold">News for ${hoverNews.ticker}</div>
          <div className="space-y-2">
            {hoverNews.items.map((item) => (
              <a key={item.id || item.news_url} href={item.news_url} target="_blank" rel="noreferrer" className="block">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-gray-500">{item.news_source} • {item.news_published_at ? new Date(item.news_published_at).toLocaleDateString() : ''}</div>
              </a>
            ))}
          </div>
        </div>
      )}
      {/* Add Watchlist Modal */}
      <AddWatchlistModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={async (symbol: string) => handleAddStock(symbol)}
      />
    </div>
  );
}
