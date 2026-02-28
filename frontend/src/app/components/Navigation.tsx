import { Link, useLocation, useNavigate } from "react-router";
import {
  Briefcase,
  FileText,
  LogOut,
} from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";

export function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalValue } = usePortfolio();
  const { user, logout } = useAuth();

  const portfolioDisplay =
    totalValue >= 1000
      ? `$${(totalValue / 1000).toFixed(1)}K`
      : `$${totalValue.toFixed(0)}`;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const links = [
    { to: "/portfolio", icon: Briefcase, label: "Portfolio", matchAlso: [] as string[] },
    { to: "/thesis", icon: FileText, label: "Thesis", matchAlso: [] as string[] },
  ];

  return (
    <nav className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-semibold text-gray-900">My Investment Thesis</h1>
        <p className="text-sm text-gray-500 mt-1">Decision Intelligence Layer</p>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            location.pathname === link.to ||
            link.matchAlso.includes(location.pathname);

          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200 space-y-3">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {user?.username?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.username || "User"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              Portfolio: {portfolioDisplay}
            </p>
          </div>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </nav>
  );
}
