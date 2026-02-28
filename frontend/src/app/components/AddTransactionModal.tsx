import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  addPortfolioTransaction,
  fetchHistoricalClose,
  searchStockSymbols,
} from "@/app/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

interface AddTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  token: string;
  defaultSymbol?: string;
}

export function AddTransactionModal({
  open,
  onOpenChange,
  onSuccess,
  token,
  defaultSymbol = "",
}: AddTransactionModalProps) {
  const [symbol, setSymbol] = useState(defaultSymbol.toUpperCase());
  const [symbolQuery, setSymbolQuery] = useState(defaultSymbol);
  const [symbolSuggestions, setSymbolSuggestions] = useState<Array<{ symbol: string; name?: string; exchange?: string }>>([]);
  const [searchingSymbols, setSearchingSymbols] = useState(false);
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceHintDate, setPriceHintDate] = useState<string | null>(null);

  useEffect(() => {
    if (defaultSymbol) {
      setSymbol(defaultSymbol.toUpperCase());
      setSymbolQuery(defaultSymbol);
    }
  }, [defaultSymbol, open]);

  const handleSymbolChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setSymbol(upperValue);
    setSymbolQuery(value);
    setError("");

    // Auto-fetch price when symbol looks valid
    if (/^[A-Z0-9.\-=/]{1,10}$/.test(upperValue)) {
      fetchPriceForSymbol(upperValue, transactionDate);
    }
  };

  // Debounced symbol search for suggestions
  useEffect(() => {
    let cancelled = false;
    if (!symbolQuery || symbolQuery.length < 1) {
      setSymbolSuggestions([]);
      setSearchingSymbols(false);
      return;
    }
    setSearchingSymbols(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchStockSymbols(symbolQuery);
        if (cancelled) return;
        setSymbolSuggestions(results || []);
      } catch (err) {
        console.warn('Symbol search failed', err);
        setSymbolSuggestions([]);
      } finally {
        setSearchingSymbols(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [symbolQuery]);

  const fetchPriceForSymbol = async (sym: string, date: string) => {
    if (!sym) return;

    setFetchingPrice(true);
    try {
      const data = await fetchHistoricalClose(sym, date, token);
      if (typeof data?.close === "number") {
        setPricePerShare(data.close.toFixed(2));
        setPriceHintDate(data.actualDate || date);
      } else {
        setError(`Could not fetch close price for ${sym}. Please enter manually.`);
      }
    } catch (err) {
      console.error(`Error fetching close price for ${sym}:`, err);
      setPriceHintDate(null);
      setError("Could not fetch close price for selected date. Please enter manually.");
    } finally {
      setFetchingPrice(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!symbol || !/^[A-Z0-9.\-=/]{1,10}$/.test(symbol)) return;
    if (!transactionDate) return;
    void fetchPriceForSymbol(symbol, transactionDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionDate]);

  const handleSubmit = async () => {
    setError("");

    if (!symbol || !shares || !pricePerShare) {
      setError("Please fill in all required fields");
      return;
    }

    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      setError("Invalid stock symbol format");
      return;
    }

    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(pricePerShare);

    if (isNaN(sharesNum) || sharesNum <= 0) {
      setError("Shares must be a positive number");
      return;
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      setError("Price must be a positive number");
      return;
    }

    setLoading(true);
    try {
      await addPortfolioTransaction(token, {
        symbol,
        transaction_type: transactionType,
        shares: sharesNum,
        price_per_share: priceNum,
        transaction_date: transactionDate,
      });

      // Reset form
      setSymbol(defaultSymbol.toUpperCase());
      setTransactionType("buy");
      setShares("");
      setPricePerShare("");
      setTransactionDate(new Date().toISOString().split("T")[0]);
      setError("");

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error("Error adding transaction:", err);
      setError(
        err instanceof Error ? err.message : "Failed to add transaction",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="symbol">Stock Symbol *</Label>
            <Input
              id="symbol"
              placeholder="e.g., AAPL"
                value={symbolQuery}
                onChange={(e) => handleSymbolChange(e.target.value)}
                className="mt-1 uppercase"
                maxLength={10}
              disabled={!!defaultSymbol}
            />
              {/* Suggestions dropdown */}
              {((symbolSuggestions && symbolSuggestions.length > 0) || searchingSymbols) && !defaultSymbol && (
                <div className="mt-2 bg-white border rounded shadow-sm max-h-48 overflow-auto">
                  {searchingSymbols ? (
                    <div className="p-2 text-sm text-gray-500">Searching...</div>
                  ) : (
                    symbolSuggestions.map((s) => (
                      <button
                        key={s.symbol}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => {
                          const sym = s.symbol.toUpperCase();
                          setSymbol(sym);
                          setSymbolQuery(sym);
                          setSymbolSuggestions([]);
                          fetchPriceForSymbol(sym, transactionDate);
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <div className="font-medium">{s.symbol} {s.name ? <span className="text-gray-500">— {s.name}</span> : null}</div>
                        <div className="text-xs text-gray-400">{s.exchange || ''}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
          </div>

          <div>
            <Label htmlFor="type">Transaction Type *</Label>
            <Select
              value={transactionType}
              onValueChange={(v) => setTransactionType(v as "buy" | "sell")}
            >
              <SelectTrigger id="type" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="shares">Shares *</Label>
            <Input
              id="shares"
              type="number"
              placeholder="e.g., 10"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="mt-1"
              step="0.01"
              min="0"
            />
          </div>

          <div>
            <Label htmlFor="price">Price Per Share *</Label>
            <div className="flex gap-2">
              <Input
                id="price"
                type="number"
                placeholder="e.g., 150.50"
                value={pricePerShare}
                onChange={(e) => setPricePerShare(e.target.value)}
                className="mt-1 flex-1"
                step="0.01"
                min="0"
              />
              {fetchingPrice && (
                <div className="flex items-end mt-1">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                </div>
              )}
            </div>
            {priceHintDate ? (
              <p className="mt-1 text-xs text-gray-500">
                Auto-filled with closing price on {priceHintDate}.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="date">Transaction Date</Label>
            <Input
              id="date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Transaction"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
