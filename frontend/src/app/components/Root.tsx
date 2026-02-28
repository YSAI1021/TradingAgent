import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Navigation } from "@/app/components/Navigation";
import { AICopilotPanel } from "@/app/components/AICopilotPanel";
import { CopilotProvider } from "@/app/context/CopilotContext";

const COPILOT_WIDTH_KEY = "copilot_panel_width";
const MIN_COPILOT_WIDTH = 340;
const MAX_COPILOT_WIDTH = 680;

export function Root() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [copilotWidth, setCopilotWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const saved = Number(localStorage.getItem(COPILOT_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_COPILOT_WIDTH && saved <= MAX_COPILOT_WIDTH
      ? saved
      : 420;
  });

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem(COPILOT_WIDTH_KEY, String(copilotWidth));
  }, [copilotWidth]);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = copilotWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = startWidth - (moveEvent.clientX - startX);
      const clamped = Math.min(MAX_COPILOT_WIDTH, Math.max(MIN_COPILOT_WIDTH, nextWidth));
      setCopilotWidth(clamped);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <CopilotProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-gray-50">
        {/* Left Navigation */}
        <Navigation />

        {/* Main Content */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {/* Page Content */}
          <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto">
            <Outlet />
          </main>

          <div
            className="w-1 shrink-0 cursor-col-resize border-l border-r border-transparent hover:border-gray-300 bg-white/40"
            onMouseDown={startResize}
            aria-label="Resize Portfolio Copilot"
            role="separator"
          />

          {/* Right-side Portfolio Copilot Panel */}
          <div className="h-full min-h-0 shrink-0 overflow-hidden" style={{ width: copilotWidth }}>
            <AICopilotPanel />
          </div>
        </div>
      </div>
    </CopilotProvider>
  );
}
