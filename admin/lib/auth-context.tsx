"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { adminLogin, adminLogout, adminMe, adminOwnerTokenLogin, type AdminAuthProfile } from "@/lib/api";

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  admin: AdminAuthProfile | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  loginOwner: (token: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [admin, setAdmin] = useState<AdminAuthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const me = await adminMe();
        if (!mounted) return;
        if (me.success && me.data?.admin) {
          setAdmin(me.data.admin);
          setIsAuthenticated(true);
        } else {
          setAdmin(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<{ ok: boolean; message?: string }> => {
    const response = await adminLogin(username, password);
    if (response.success && response.data?.admin) {
      setAdmin(response.data.admin);
      setIsAuthenticated(true);
      return { ok: true };
    }
    return { ok: false, message: response.message || "Falha ao autenticar" };
  };

  const loginOwner = async (token: string): Promise<{ ok: boolean; message?: string }> => {
    const response = await adminOwnerTokenLogin(token);
    if (response.success && response.data?.admin) {
      setAdmin(response.data.admin);
      setIsAuthenticated(true);
      return { ok: true };
    }
    return { ok: false, message: response.message || "Falha ao autenticar owner" };
  };

  const logout = async () => {
    await adminLogout();
    setAdmin(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, admin, login, loginOwner, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
