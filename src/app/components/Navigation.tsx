import { Link, useLocation } from "react-router";
import { Home, Briefcase, TrendingUp, Users, FileText } from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";

export function Navigation() {
  const location = useLocation();
  const { totalValue } = usePortfolio();
  const portfolioDisplay = totalValue >= 1000
    ? `$${(totalValue / 1000).toFixed(1)}K`
    : `$${totalValue.toFixed(0)}`;
  
  const links = [
    { to: "/", icon: Home, label: "Dashboard" },
    { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
    { to: "/stocks", icon: TrendingUp, label: "Stocks" },
    { to: "/thesis", icon: FileText, label: "Thesis" },
    { to: "/community", icon: Users, label: "Community" },
  ];
  
  return (
    <nav className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-semibold text-gray-900">TradingAgent</h1>
        <p className="text-sm text-gray-500 mt-1">Portfolio Intelligence</p>
      </div>
      
      {/* Navigation Links */}
      <div className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to || 
                         (link.to === '/stocks' && location.pathname.includes('/stock'));
          
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
      
      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
            JD
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">John Doe</p>
            <p className="text-xs text-gray-500">Portfolio: {portfolioDisplay}</p>
          </div>
        </div>
      </div>
    </nav>
  );
}