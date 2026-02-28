import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchPortfolioTransactions,
  deletePortfolioTransaction,
  PortfolioTransaction,
} from "@/app/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";

interface TransactionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  companyName: string;
  currentPrice: number;
}

export function TransactionHistoryModal({
  open,
  onOpenChange,
  ticker,
  companyName,
  currentPrice,
}: TransactionHistoryModalProps) {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (open && token) {
      loadTransactions();
    }
  }, [open, token]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const allTransactions = await fetchPortfolioTransactions(token!);
      // Filter transactions for this ticker
      const tickerTransactions = allTransactions.filter(
        (tx) => tx.symbol === ticker,
      );
      setTransactions(tickerTransactions);
    } catch (err) {
      console.error("Error loading transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    if (!window.confirm("Are you sure you want to delete this transaction?"))
      return;

    setDeleting(transactionId);
    try {
      await deletePortfolioTransaction(token!, transactionId);
      await loadTransactions();
      window.dispatchEvent(new Event("portfolio:refresh"));
    } catch (err) {
      console.error("Error deleting transaction:", err);
    } finally {
      setDeleting(null);
    }
  };

  // Calculate net position: buys add shares/cost, sells remove
  let netShares = 0;
  let totalCostBasis = 0;
  transactions.forEach((t) => {
    if (t.transaction_type === "buy") {
      netShares += t.shares;
      totalCostBasis += t.shares * t.price_per_share;
    } else {
      const avgCost = netShares > 0 ? totalCostBasis / netShares : 0;
      netShares -= t.shares;
      totalCostBasis -= t.shares * avgCost;
    }
  });
  const totalInvested = totalCostBasis > 0 ? totalCostBasis : 0;
  const currentValue = netShares * currentPrice;
  const overallGainLoss =
    totalInvested > 0
      ? ((currentValue - totalInvested) / totalInvested) * 100
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticker} Transaction History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">{companyName}</p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <p className="text-gray-600">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found for this stock
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-7 gap-2 px-4 py-3 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                  <div className="col-span-2">Date</div>
                  <div>Type</div>
                  <div className="text-right">Shares</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">Total</div>
                  <div className="text-right">Action</div>
                </div>
                {transactions.map((txn) => {
                  const totalCost = txn.shares * txn.price_per_share;
                  const transactionDate = new Date(txn.transaction_date);

                  return (
                    <div
                      key={txn.id}
                      className="grid grid-cols-7 gap-2 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-gray-50 items-center"
                    >
                      <div className="col-span-2">{transactionDate.toLocaleDateString()}</div>
                      <div className="capitalize">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            txn.transaction_type === "buy"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {txn.transaction_type}
                        </span>
                      </div>
                      <div className="text-right">{txn.shares}</div>
                      <div className="text-right">
                        ${txn.price_per_share.toFixed(2)}
                      </div>
                      <div className="text-right">${totalCost.toFixed(2)}</div>
                      <div className="text-right flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTransaction(txn.id)}
                          disabled={deleting === txn.id}
                          className="h-6 w-6 p-0"
                          title="Delete transaction"
                        >
                          {deleting === txn.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-red-600 hover:text-red-800" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Shares Bought</span>
                  <span className="font-medium text-gray-900">
                    {transactions
                      .filter((t) => t.transaction_type === "buy")
                      .reduce((sum, t) => sum + t.shares, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Shares Sold</span>
                  <span className="font-medium text-gray-900">
                    {transactions
                      .filter((t) => t.transaction_type === "sell")
                      .reduce((sum, t) => sum + t.shares, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Net Current Value</span>
                  <span className="font-medium text-gray-900">
                    $
                    {currentValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-gray-600">Total Gain/Loss</span>
                  <span
                    className={`font-semibold ${
                      currentValue - totalInvested >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {overallGainLoss >= 0 ? "+" : ""}
                    {overallGainLoss.toFixed(2)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
