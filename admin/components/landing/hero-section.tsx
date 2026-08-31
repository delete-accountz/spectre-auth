"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Sparkles } from "lucide-react";
import { EncryptedText } from "@/components/ui/encrypted-text";
import Image from "next/image";

export function HeroSection() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const texts = useMemo(
    () => [
      "Plataforma de Licenciamento",
      "Dashboard | Keys | Assinaturas",
      "Ativação instantânea - Seguro",
      "Painel Admin - Gestão completa",
    ],
    []
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const outMs = 260; // duração do fade-out
    const holdMs = 2200; // tempo mostrando o texto

    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => {
      setIndex((i) => (i + 1) % texts.length);
      setPhase("in");
    }, holdMs + outMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [index, texts.length]);

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute inset-0 noise" />
      
      {/* Gradient orbs */}
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-muted/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-muted/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8">
        {/* Navigation */}
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="mx-auto w-10 h-10 rounded-2xl bg-foreground/10 flex items-center justify-center">
                        <Image src="/3.png" alt="Safety Logo" width={32} height={32} className="w-8 h-8 object-contain" priority />
                      </div>
            <EncryptedText
              text="SpectreAuth"
              encryptedClassName="text-muted-foreground"
              revealedClassName="text-foreground"
              revealDelayMs={80}
              className="text-xl font-bold tracking-tight"
            />
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Button asChild size="sm">
              <Link href="/dashboard">Acessar</Link>
            </Button>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="mt-24 flex flex-col items-center text-center lg:mt-32">
          <div
      className={`mb-8 inline-flex items-center gap-2 rounded-full border border-border/60 
      bg-background/40 px-4 py-1.5 backdrop-blur-md transition-all duration-700
      ${mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
    >
      {/* dot minimal */}
      <span className="h-2 w-2 rounded-full bg-emerald-500/80 animate-pulse" />

      {/* texto rotativo */}
      <span
        className={`text-xs tracking-wide text-muted-foreground transition-all duration-300 will-change-transform
        ${
          phase === "in"
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1"
        }`}
      >
        {texts[index]}
      </span>
    </div>

          {/* Headline */}
          <h1
            className={`max-w-4xl text-balance text-5xl font-bold tracking-tight transition-all duration-700 delay-100 sm:text-6xl lg:text-7xl ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            Gerencie suas licenças com{" "}
            <span className="relative">
              total controle
              <span className="absolute -bottom-1 left-0 h-1 w-full bg-foreground/20" />
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mt-6 max-w-2xl text-pretty text-lg text-muted-foreground transition-all duration-700 delay-200 sm:text-xl ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            Dashboard administrativa completa para gerenciar keys, usuários e
            produtos. Controle de HWID, pausas, bans e muito mais em uma
            interface moderna e intuitiva.
          </p>

          {/* CTA Buttons */}
          <div
            className={`mt-10 flex flex-col gap-4 sm:flex-row transition-all duration-700 delay-300 ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <Button asChild size="lg" className="group gap-2 px-8">
              <Link href="/dashboard">
                Acessar Dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 px-8 bg-transparent">
              <Link href="#features">Ver Recursos</Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div
          className={`mx-auto mt-24 grid max-w-4xl grid-cols-2 gap-8 border-t border-border pt-12 sm:grid-cols-4 transition-all duration-700 delay-500 ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          {[
            { label: "Licenças", value: "10K+" },
            { label: "Uptime", value: "99.9%" },
            { label: "Latência", value: "<50ms" },
            { label: "Requisições/dia", value: "1M+" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
