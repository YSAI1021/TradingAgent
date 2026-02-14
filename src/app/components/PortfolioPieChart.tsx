import { useMemo } from "react";
import { useNavigate } from "react-router";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Holding } from "@/app/hooks/usePortfolio";
import { Card, CardContent } from "@/app/components/ui/card";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface PortfolioPieChartProps {
  holdings: Holding[];
}

export function PortfolioPieChart({ holdings }: PortfolioPieChartProps) {
  const navigate = useNavigate();

  const pieData = useMemo(() => {
    const total = holdings.reduce((sum, h) => sum + h.value, 0);
    return holdings.map((h) => ({
      ticker: h.symbol,
      name: h.name,
      value: h.value,
      allocation: total > 0 ? (h.value / total) * 100 : 0,
    }));
  }, [holdings]);

  if (!holdings.length) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <p className="text-base font-semibold text-gray-900 mb-4">Portfolio Allocation</p>
          <div className="h-[300px] flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
            <p className="text-sm text-gray-500">No portfolio data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200">
      <CardContent className="pt-6">
        <p className="text-base font-semibold text-gray-900 mb-4">Portfolio Allocation</p>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="ticker"
                cx="50%"
                cy="50%"
                outerRadius={100}
                paddingAngle={2}
                label={false}
                onClick={(data) => data?.ticker && navigate(`/stock/${data.ticker}`)}
                style={{ cursor: "pointer" }}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
                      <p className="font-medium text-gray-900">{p.ticker}</p>
                      <p className="text-gray-600">{p.name}</p>
                      <p className="mt-1">
                        ${(p.value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ({p.allocation?.toFixed(1)}%)
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
