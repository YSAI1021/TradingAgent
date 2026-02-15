import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { Navigation } from "@/app/components/Navigation";
import { AICopilotPanel } from "@/app/components/AICopilotPanel";

export function Root() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Navigation */}
      <Navigation />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Page Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        
        {/* Right-side Portfolio Copilot Panel */}
        <AICopilotPanel />
      </div>
    </div>
  );
}