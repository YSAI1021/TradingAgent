import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Outlet, useLocation } from "react-router";
import { Navigation } from "@/app/components/Navigation";
import { AICopilotPanel } from "@/app/components/AICopilotPanel";

export function Root() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [copilotWidth, setCopilotWidth] = useState(() => {
    const raw = localStorage.getItem("copilot_width_px");
    const parsed = raw ? Number(raw) : 420;
    return Number.isFinite(parsed) ? Math.min(620, Math.max(320, parsed)) : 420;
  });

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = copilotWidth;
    let latestWidth = startWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.min(620, Math.max(320, startWidth + delta));
      latestWidth = next;
      setCopilotWidth(next);
    };

    const onUp = () => {
      localStorage.setItem("copilot_width_px", String(latestWidth));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Navigation */}
      <Navigation />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Page Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Resizer */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Portfolio Copilot panel"
          className="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-300 transition-colors"
          onMouseDown={handleResizeStart}
        />

        {/* Right-side Portfolio Copilot Panel */}
        <div
          style={{ width: `${copilotWidth}px` }}
          className="min-w-[320px] max-w-[620px] h-full min-h-0 overflow-hidden"
        >
          <AICopilotPanel />
        </div>
      </div>
    </div>
  );
}
