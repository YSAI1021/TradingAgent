import { Link, useLocation, useNavigate } from "react-router";
import {
  Home,
  Briefcase,
  TrendingUp,
  Users,
  FileText,
  LogOut,
  Settings,
  Loader2,
} from "lucide-react";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { fetchUserSetting, saveUserSetting } from "@/app/services/api";
import { useEffect, useState } from "react";

export function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalValue } = usePortfolio();
  const { user, logout, token } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");

  const portfolioDisplay =
    totalValue >= 1000
      ? `$${(totalValue / 1000).toFixed(1)}K`
      : `$${totalValue.toFixed(0)}`;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    const load = async () => {
      setSettingsLoading(true);
      setSettingsStatus("");
      try {
        const localKey = localStorage.getItem("gemini_api_key") || "";
        if (!token) {
          if (!cancelled) setGeminiApiKey(localKey);
          return;
        }
        const res = await fetchUserSetting(token, "gemini_api_key");
        const serverKey =
          res && typeof res === "object" && "value" in res
            ? String(res.value || "")
            : "";
        if (!cancelled) setGeminiApiKey(serverKey || localKey);
      } catch {
        if (!cancelled) {
          setGeminiApiKey(localStorage.getItem("gemini_api_key") || "");
          setSettingsStatus("Could not load settings from server.");
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen, token]);

  const saveSettings = async () => {
    const normalized = geminiApiKey.trim();
    setSettingsSaving(true);
    setSettingsStatus("");
    try {
      if (normalized) localStorage.setItem("gemini_api_key", normalized);
      else localStorage.removeItem("gemini_api_key");

      if (token) {
        await saveUserSetting(token, "gemini_api_key", normalized);
      }
      window.dispatchEvent(new CustomEvent("settings:gemini-key-updated"));
      setSettingsStatus("Saved.");
    } catch (error) {
      setSettingsStatus(
        error instanceof Error ? error.message : "Failed to save settings.",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

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
          const isActive =
            location.pathname === link.to ||
            (link.to === "/stocks" && location.pathname.includes("/stock"));

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
          onClick={() => setSettingsOpen(true)}
          variant="outline"
          className="w-full justify-start"
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="gemini-key-setting">Gemini API Key</Label>
              <Input
                id="gemini-key-setting"
                type="password"
                placeholder="Enter your Gemini API key"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="mt-2"
                disabled={settingsLoading}
              />
              <p className="mt-2 text-xs text-gray-500">
                This key is saved in your user settings and used by Portfolio
                Copilot.
              </p>
            </div>
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : null}
            {settingsStatus ? (
              <p className="text-xs text-gray-600">{settingsStatus}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
            <Button onClick={saveSettings} disabled={settingsSaving || settingsLoading}>
              {settingsSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
