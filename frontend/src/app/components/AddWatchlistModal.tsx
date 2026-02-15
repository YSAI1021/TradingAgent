import { useState } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string) => Promise<void> | void;
};

export default function AddWatchlistModal({ open, onClose, onAdd }: Props) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const s = (symbol || "").trim().toUpperCase();
    if (!s) {
      toast.error("Please enter a ticker");
      return;
    }
    // allow '=', '/', numbers, letters, dots, hyphens (common Yahoo formats), up to 10 chars
    if (!/^[A-Z0-9.\-=/]{1,10}$/.test(s)) {
      toast.error("Invalid ticker");
      return;
    }
    setLoading(true);
    try {
      await onAdd(s);
      setSymbol("");
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add ticker");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Add to Watchlist</h3>
        <p className="mb-4 text-sm text-gray-600">
          Enter the stock ticker you want to add to your custom watchlist.
        </p>

        <input
          aria-label="Ticker"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. AAPL"
          className="w-full rounded border px-3 py-2 mb-2"
        />

        {/* toasts used for feedback */}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded px-4 py-2"
            onClick={() => {
              setSymbol("");
              setError(null);
              onClose();
            }}
            type="button"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={handleAdd}
            type="button"
            disabled={loading}
          >
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
