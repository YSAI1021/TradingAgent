import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { TRANSACTION_HISTORY } from "@/app/data/transactions";

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
  const transactions = TRANSACTION_HISTORY[ticker] ?? [];

  const totalInvested = transactions.reduce(
    (sum, t) => sum + t.shares * t.purchasePrice,
    0
  );
  const currentValue = transactions.reduce(
    (sum, t) => sum + t.shares * currentPrice,
    0
  );
  const overallGainLoss =
    totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticker} Transaction History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">{companyName}</p>

          <div className=" rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-6 gap-4 px-4 py-3 text-xs font-medium text-gray-500 bg-gray-50 border-b">
              <div>Date</div>
              <div>Type</div>
              <div className="text-right">Shares</div>
              <div className="text-right">Purchase</div>
              <div className="text-right">Current</div>
              <div className="text-right">Gain/Loss</div>
            </div>
            {transactions.map((txn) => {
              const gainLoss =
                txn.purchasePrice > 0
                  ? ((currentPrice - txn.purchasePrice) / txn.purchasePrice) * 100
                  : 0;
              return (
                <div
                  key={txn.id}
                  className="grid grid-cols-6 gap-4 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-gray-50"
                >
                  <div>{txn.date}</div>
                  <div>{txn.type}</div>
                  <div className="text-right">{txn.shares}</div>
                  <div className="text-right">${txn.purchasePrice.toFixed(2)}</div>
                  <div className="text-right">${currentPrice.toFixed(2)}</div>
                  <div
                    className={`text-right font-medium ${
                      gainLoss >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {gainLoss >= 0 ? "+" : ""}
                    {gainLoss.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Investment</span>
              <span className="font-medium text-gray-900">
                ${totalInvested.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Value</span>
              <span className="font-medium text-gray-900">
                ${currentValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t">
              <span className="text-gray-600">Overall Gain/Loss</span>
              <span
                className={`font-semibold ${
                  overallGainLoss >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {overallGainLoss >= 0 ? "+" : ""}
                {overallGainLoss.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
