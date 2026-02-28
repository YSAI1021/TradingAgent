import React, { createContext, useContext, useState, useEffect } from "react";
import {
  login as apiLogin,
  signup as apiSignup,
  AuthResponse,
} from "@/app/services/api";

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
  activity_points?: number;
  login_streak?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "auth_token";
const USER_STORAGE_KEY = "auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleInvalidToken = () => {
      setUser(null);
      setToken(null);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    };
    window.addEventListener("auth:invalid-token", handleInvalidToken);
    return () =>
      window.removeEventListener("auth:invalid-token", handleInvalidToken);
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const response: AuthResponse = await apiLogin({ username, password });
    const { token: newToken, user: newUser } = response;

    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  };

  const handleSignup = async (
    username: string,
    email: string,
    password: string,
  ) => {
    const response: AuthResponse = await apiSignup({
      username,
      email,
      password,
    });
    const { token: newToken, user: newUser } = response;

    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login: handleLogin,
        signup: handleSignup,
        logout: handleLogout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Fail-safe: return a minimal fallback to avoid runtime crashes when
    // the provider is missing (useful during HMR or partial mounts).
    // Log a warning so developers can fix the root cause.
    // NOTE: Returning a fallback preserves runtime stability but you may
    // still want to ensure `AuthProvider` wraps the app.
    // eslint-disable-next-line no-console
    console.warn("useAuth called outside AuthProvider; returning fallback auth context");
    return {
      user: null,
      token: null,
      loading: false,
      login: async () => {},
      signup: async () => {},
      logout: () => {},
      isAuthenticated: false,
    } as AuthContextType;
  }

  return context;
}
