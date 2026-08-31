"use client";

import React from "react"

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EyeIcon, EyeSlashIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";

export function LoginForm() {
  const [mode, setMode] = useState<"admin" | "owner">("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ownerToken, setOwnerToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginOwner } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate a small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = mode === "owner"
      ? await loginOwner(ownerToken)
      : await login(username, password);
    
    if (!result.ok) {
      setError(result.message || "Credenciais inválidas. Verifique e tente novamente.");
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 noise" />
      
      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center">
            <Image src="/3.png" alt="Safety Logo" width={32} height={32} className="w-8 h-8 object-contain" priority />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Admin Dashboard</CardTitle>
            <CardDescription className="mt-2">
              {mode === "owner"
                ? "Login OWNER somente para o Less"
                : "Digite seu usuário e senha para acessar o painel"}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "admin" ? "default" : "outline"}
              onClick={() => {
                setMode("admin");
                setError("");
              }}
              className="w-full"
            >
              Admin
            </Button>
            <Button
              type="button"
              variant={mode === "owner" ? "default" : "outline"}
              onClick={() => {
                setMode("owner");
                setError("");
              }}
              className="w-full"
            >
              Owner
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "owner" ? (
              <div className="space-y-2">
                <Label htmlFor="owner-token">Secret Key</Label>
                <Input
                  id="owner-token"
                  type="password"
                  placeholder="Cole o secret key..."
                  value={ownerToken}
                  onChange={(e) => {
                    setOwnerToken(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Digite seu usuário..."
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError("");
                    }}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Digite sua senha..."
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      className="pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-4 h-4" />
                      ) : (
                        <EyeIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              @SpectreAuth | by Less
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 p-3 rounded-lg">
                <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || (mode === "owner" ? !ownerToken.trim() : (!username.trim() || !password.trim()))}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  Verificando...
                </span>
              ) : (
                "Acessar Dashboard"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
