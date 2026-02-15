import { NewsArticle } from "@/app/services/api";
import { Button } from "@/app/components/ui/button";

type Props = {
  open: boolean;
  loading: boolean;
  sources: Record<string, NewsArticle[]>;
  onClose: () => void;
};

export default function SourcesModal({ open, loading, sources, onClose }: Props) {
  if (!open) return null;

  const tickers = Object.keys(sources || {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Sources</h3>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading sources...</div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-auto">
            {tickers.length === 0 && <div className="text-sm text-gray-500">No sources available.</div>}
            {tickers.map((t) => (
              <div key={t} className="border-b pb-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{t}</h4>
                  <span className="text-xs text-gray-500">{(sources[t] || []).length} articles</span>
                </div>
                <div className="space-y-2">
                  {(sources[t] || []).map((a) => (
                    <a key={a.id || a.news_url} href={a.news_url} target="_blank" rel="noreferrer" className="block hover:bg-gray-50 p-2 rounded">
                      <div className="text-sm font-semibold">{a.title}</div>
                      <div className="text-xs text-gray-500">{a.news_source} • {a.news_published_at ? new Date(a.news_published_at).toLocaleString() : ''}</div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
