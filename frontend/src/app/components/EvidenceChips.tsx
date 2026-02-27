import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/utils";

export type EvidenceConfidence = "High" | "Medium" | "Low";

export interface EvidenceChipItem {
  source: string;
  evidence: string;
  confidence: EvidenceConfidence;
  url?: string | null;
}

const confidenceStyles: Record<EvidenceConfidence, string> = {
  High: "bg-emerald-100 text-emerald-800 border-0",
  Medium: "bg-amber-100 text-amber-800 border-0",
  Low: "bg-rose-100 text-rose-800 border-0",
};

interface EvidenceChipsProps {
  items: EvidenceChipItem[];
  className?: string;
  title?: string;
  showConfidence?: boolean;
}

export function EvidenceChips({
  items,
  className,
  title = "Evidence Chips",
  showConfidence = true,
}: EvidenceChipsProps) {
  if (!items.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => {
          const content = (
            <>
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-2 text-[11px]">
                  {item.source}
                </Badge>
                {showConfidence ? (
                  <Badge
                    className={cn(
                      "h-5 px-2 text-[11px]",
                      confidenceStyles[item.confidence],
                    )}
                  >
                    {item.confidence}
                  </Badge>
                ) : null}
              </div>
              <p className="max-w-xs text-[11px] leading-relaxed text-gray-600">
                {item.evidence}
              </p>
            </>
          );

          const className = cn(
            "rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs transition-colors",
            item.url ? "hover:bg-gray-50" : "",
          );

          if (item.url) {
            return (
              <a
                key={`${item.source}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {content}
              </a>
            );
          }

          return (
            <div key={`${item.source}-${index}`} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
