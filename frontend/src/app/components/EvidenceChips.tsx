import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/utils";

export type EvidenceConfidence = "High" | "Medium" | "Low";

export interface EvidenceChipItem {
  source: string;
  evidence: string;
  confidence: EvidenceConfidence;
}

const confidenceStyles: Record<EvidenceConfidence, string> = {
  High: "bg-emerald-100 text-emerald-800 border-0",
  Medium: "bg-amber-100 text-amber-800 border-0",
  Low: "bg-rose-100 text-rose-800 border-0",
};

interface EvidenceChipsProps {
  items: EvidenceChipItem[];
  className?: string;
}

export function EvidenceChips({ items, className }: EvidenceChipsProps) {
  if (!items.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
        Evidence Chips
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div
            key={`${item.source}-${index}`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
          >
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline" className="h-5 px-2 text-[11px]">
                {item.source}
              </Badge>
              <Badge
                className={cn("h-5 px-2 text-[11px]", confidenceStyles[item.confidence])}
              >
                {item.confidence}
              </Badge>
            </div>
            <p className="max-w-xs text-[11px] leading-relaxed text-gray-600">
              {item.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
