import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "smart_slot_access_token";
const REFRESH_KEY = "smart_slot_refresh_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ─── Token helpers ─────────────────────────────────────────────────────────
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

  const storeTokens = (accessToken, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  };

  const clearTokens = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  };

  // ─── API fetch with auth header ────────────────────────────────────────────
  const authedFetch = useCallback(async (path, options = {}) => {
    const token = getToken();
    const res = await fetch(`/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    return res;
  }, []);

  // ─── Validate token on mount ───────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await authedFetch("/auth/me");
        if (res.ok) {
          const json = await res.json();
          setUser(json.data);
        } else {
          clearTokens();
        }
      } catch {
        clearTokens();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [authedFetch]);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Login failed.");
    storeTokens(json.data.access_token, json.data.refresh_token);
    setUser(json.data.user);
    return json.data;
  }, []);

  // ─── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async ({ org_name, email, password, full_name }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_name, email, password, full_name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Registration failed.");
    storeTokens(json.data.access_token, json.data.refresh_token);
    setUser(json.data.user);
    return json.data;
  }, []);

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, register, getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
