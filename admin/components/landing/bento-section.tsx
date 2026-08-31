"use client";

import React from "react"

import { useEffect, useRef, useState } from "react";
import { Key, Shield, Zap, BarChart3 } from "lucide-react";

function BentoCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-700 hover:border-muted-foreground/30 ${className} ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function BentoSection() {
  return (
    <section className="relative py-24">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Interface moderna e intuitiva
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Dashboard construída para produtividade e eficiência.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl gap-4 lg:grid-cols-3 lg:grid-rows-2">
          {/* Large Card - API Performance */}
          <BentoCard className="lg:col-span-2 lg:row-span-2" delay={0}>
            <div className="flex h-full flex-col p-8">
              <div className="mb-4 inline-flex w-fit rounded-xl bg-muted p-3">
                <BarChart3 className="h-6 w-6 text-foreground" />
              </div>
              <h3 className="text-2xl font-bold">Metricas em Tempo Real</h3>
              <p className="mt-2 max-w-md text-muted-foreground">
                Acompanhe o desempenho do seu sistema com dashboards intuitivos e alertas automaticos.
              </p>
              <div className="mt-auto pt-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Requisicoes/min</span>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">12.4K</p>
                    <p className="text-xs text-success">+23% esta semana</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Latencia Media</span>
                      <Zap className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">24ms</p>
                    <p className="text-xs text-muted-foreground">P99: 89ms</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Keys Ativas</span>
                      <Key className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">8.2K</p>
                    <p className="text-xs text-success">+156 hoje</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Uptime</span>
                      <Shield className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">99.98%</p>
                    <p className="text-xs text-muted-foreground">Ultimos 30 dias</p>
                  </div>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Key Management Card */}
          <BentoCard delay={100}>
            <div className="flex h-full flex-col p-6">
              <div className="mb-4 inline-flex w-fit rounded-xl bg-muted p-3">
                <Key className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-lg font-bold">Gestão Simplificada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Busque qualquer key instantaneamente. Todas as ações a um clique
                de distância.
              </p>
              <div className="mt-auto pt-4">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    SAFE-XXXX-XXXX-XXXX
                  </span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Security Card */}
          <BentoCard delay={200}>
            <div className="flex h-full flex-col p-6">
              <div className="mb-4 inline-flex w-fit rounded-xl bg-muted p-3">
                <Shield className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-lg font-bold">Segurança Total</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Autenticação via Bearer Token. Todas as requisições validadas e
                logadas.
              </p>
              <div className="mt-auto pt-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                  <span className="text-xs text-success">Sistema Seguro</span>
                </div>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
