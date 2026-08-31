"use client";

import { useEffect, useRef, useState } from "react";
import {
  Key,
  Shield,
  Users,
  Zap,
  RotateCcw,
  Ban,
  Pause,
  Calendar,
  Settings,
  Activity,
} from "lucide-react";

const features = [
  {
    icon: Key,
    title: "Gestão de Licenças",
    description:
      "Controle completo sobre todas as suas keys. Visualize, edite e gerencie licenças de forma eficiente.",
  },
  {
    icon: RotateCcw,
    title: "Reset de HWID",
    description:
      "Permite que clientes troquem de máquina facilmente. Reset individual ou em massa com um clique.",
  },
  {
    icon: Pause,
    title: "Pausar/Despausar",
    description:
      "Pause licenças temporariamente sem perder dados. Ideal para férias ou manutenções do cliente.",
  },
  {
    icon: Ban,
    title: "Sistema de Bans",
    description:
      "Bana keys problemáticas com motivo documentado. Histórico completo de todas as ações.",
  },
  {
    icon: Calendar,
    title: "Controle de Dias",
    description:
      "Adicione ou remova dias de qualquer licença. Flexibilidade total para ajustes de planos.",
  },
  {
    icon: Activity,
    title: "Ações em Massa",
    description:
      "Execute operações em todas as keys ativas simultaneamente. Economize tempo com bulk actions.",
  },
  {
    icon: Users,
    title: "Gerenciamento de Usuários",
    description:
      "Visualize usuários vinculados às licenças. Desvincule completamente quando necessário.",
  },
  {
    icon: Settings,
    title: "Modo Manutenção",
    description:
      "Ative manutenção do sistema com mensagem personalizada. Controle total sobre disponibilidade.",
  },
  {
    icon: Zap,
    title: "API Rápida",
    description:
      "Latência ultra-baixa e alta disponibilidade. Sua aplicação sempre responsiva.",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
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

  const Icon = feature.icon;

  return (
    <div
      ref={ref}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-500 hover:border-muted-foreground/30 hover:shadow-xl ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-muted/30 blur-2xl transition-all duration-500 group-hover:bg-muted/50" />
      <div className="relative">
        <div className="mb-4 inline-flex rounded-xl bg-muted p-3">
          <Icon className="h-6 w-6 text-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          {feature.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {feature.description}
        </p>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24">
      <div className="absolute inset-0 noise" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Tudo que você precisa para gerenciar
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Uma suite completa de ferramentas para administração de licenças e
            autenticação.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
