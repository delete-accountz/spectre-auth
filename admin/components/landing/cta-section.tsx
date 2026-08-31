"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Users, Key } from "lucide-react";

export function CtaSection() {
  return (
    <section className="relative py-16">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/50 via-transparent to-transparent" />
          
          <div className="relative px-8 py-12 text-center sm:px-16 sm:py-16">
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Shield className="h-4 w-4" />
                Segurança e Controle Total
              </div>
            </div>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Transforme a Gestão de Licenças com Nossa Plataforma
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Gerencie keys, usuários e produtos de forma eficiente e segura. 
              Acesse insights em tempo real e tome decisões informadas para o seu negócio.
            </p>
            <div className="mt-6 flex justify-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Key className="h-4 w-4" />
                Gerenciamento de Keys
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                Controle de Usuários
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                Segurança Avançada
              </div>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="group gap-2 px-8 bg-primary hover:bg-primary/90 transition-all duration-300 transform hover:scale-105">
                <Link href="/dashboard">
                  Acessar Dashboard
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="px-8">
                Saiba Mais
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
