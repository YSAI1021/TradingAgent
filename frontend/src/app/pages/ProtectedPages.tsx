import { ProtectedRoute } from "@/app/components/ProtectedRoute";
import { Dashboard } from "@/app/pages/Dashboard";
import { Portfolio } from "@/app/pages/Portfolio";
import { StockList } from "@/app/pages/StockList";
import { Stock } from "@/app/pages/Stock";
import { Thesis } from "@/app/pages/Thesis";
import { Community } from "@/app/pages/Community";

// Protected route wrappers
export function ProtectedDashboard() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

export function ProtectedPortfolio() {
  return (
    <ProtectedRoute>
      <Portfolio />
    </ProtectedRoute>
  );
}

export function ProtectedStockList() {
  return (
    <ProtectedRoute>
      <StockList />
    </ProtectedRoute>
  );
}

export function ProtectedStock() {
  return (
    <ProtectedRoute>
      <Stock />
    </ProtectedRoute>
  );
}

export function ProtectedThesis() {
  return (
    <ProtectedRoute>
      <Thesis />
    </ProtectedRoute>
  );
}

export function ProtectedCommunity() {
  return (
    <ProtectedRoute>
      <Community />
    </ProtectedRoute>
  );
}
