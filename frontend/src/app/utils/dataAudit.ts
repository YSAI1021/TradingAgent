/**
 * Data validation utilities for portfolio consistency.
 * Runs in development to verify calculations and catch discrepancies.
 */

import type { Holding } from "@/app/hooks/usePortfolio";

const AUDIT_ENABLED = import.meta.env.DEV;

export function validatePortfolioData(holdings: Holding[], totalValue: number): boolean {
  if (!AUDIT_ENABLED || !holdings.length) return true;

  let hasErrors = false;

  // 1. Position value = shares × currentPrice
  for (const h of holdings) {
    const calculatedValue = h.shares * h.currentPrice;
    if (Math.abs(calculatedValue - h.value) > 0.01) {
      console.error(
        `[Data Audit] ${h.symbol} position value mismatch:`,
        `calculated ${h.shares} × $${h.currentPrice} = $${calculatedValue.toFixed(2)}, displayed $${h.value.toFixed(2)}`
      );
      hasErrors = true;
    }
  }

  // 2. Total = sum of position values
  const calculatedTotal = holdings.reduce((sum, h) => sum + h.value, 0);
  if (Math.abs(calculatedTotal - totalValue) > 0.01) {
    console.error(
      `[Data Audit] Portfolio total mismatch:`,
      `calculated $${calculatedTotal.toFixed(2)}, displayed $${totalValue.toFixed(2)}`
    );
    hasErrors = true;
  }

  // 3. Allocations sum to 100%
  const totalAllocation = holdings.reduce((sum, h) => sum + h.allocation, 0);
  if (Math.abs(totalAllocation - 100) > 0.1) {
    console.error(
      `[Data Audit] Allocation sum mismatch:`,
      `${totalAllocation.toFixed(1)}% (should be 100%)`
    );
    hasErrors = true;
  }

  // 4. Each allocation = (value / total) × 100
  for (const h of holdings) {
    const expectedAlloc = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    if (Math.abs(h.allocation - expectedAlloc) > 0.1) {
      console.error(
        `[Data Audit] ${h.symbol} allocation mismatch:`,
        `calculated ${expectedAlloc.toFixed(1)}%, displayed ${h.allocation.toFixed(1)}%`
      );
      hasErrors = true;
    }
  }

  if (!hasErrors) {
    console.log("[Data Audit] ✓ Portfolio data validated successfully");
  }

  return !hasErrors;
}
