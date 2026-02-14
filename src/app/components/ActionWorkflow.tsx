import { useState } from "react";
import { CheckCircle, TrendingUp, Target } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";

interface ActionWorkflowProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  actionType: "success" | "warning" | "alert";
}

export function ActionWorkflow({ open, onClose }: ActionWorkflowProps) {
  const [note, setNote] = useState("");

  const handleSaveAndClose = () => {
    onClose();
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <DialogTitle className="text-2xl">No Action Needed</DialogTitle>
          <DialogDescription>
            Your portfolio is performing well within expected parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* AI Weekly Recap - same as Portfolio page */}
          <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <p className="font-medium">Portfolio up 5.2% this week</p>
              </div>
              <div className="p-4 rounded-lg bg-white border border-blue-500/20">
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
          </div>

          {/* Save Note (Optional) */}
          <div>
            <Label htmlFor="note">Save Note (Optional)</Label>
            <Textarea
              id="note"
              placeholder="Add a note about this..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveAndClose}>
            Save & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
