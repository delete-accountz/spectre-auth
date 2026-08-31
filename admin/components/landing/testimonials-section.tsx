"use client";

import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";

const testimonialsRow1 = [
  {
    quote:
      "Sistema de licenciamento mais robusto que ja usei. A integracao foi incrivelmente simples e o suporte tecnico e excepcional.",
    name: "Rafael Mendes",
    title: "Desenvolvedor Senior, AppMaster",
  },
  {
    quote:
      "A API responde em milissegundos e o dashboard administrativo e muito intuitivo. Recomendo para qualquer empresa de software.",
    name: "Julia Ferreira",
    title: "Product Owner, TechFlow",
  },
  {
    quote:
      "Conseguimos reduzir pirataria em 95% apos implementar o SpectreAuth. O sistema de HWID e extremamente eficiente.",
    name: "Bruno Almeida",
    title: "CTO, GameForge Studios",
  },
  {
    quote:
      "Melhor investimento que fizemos em protecao de software. O ROI foi visivel ja no primeiro mes de uso.",
    name: "Camila Santos",
    title: "CEO, CloudSoft",
  },
];

const testimonialsRow2 = [
  {
    quote:
      "A SpectreAuth revolucionou como gerenciamos nossas licencas. O painel administrativo e intuitivo e as acoes em massa economizam horas de trabalho.",
    name: "Carlos Silva",
    title: "CTO, TechStart Brasil",
  },
  {
    quote:
      "Implementamos em menos de uma semana e ja vimos uma reducao de 80% em fraudes de licenca. O sistema de HWID e simplesmente perfeito.",
    name: "Ana Rodrigues",
    title: "Gerente de Produto, SoftwareHouse",
  },
  {
    quote:
      "O suporte e excepcional e a API e extremamente confiavel. Nunca tivemos downtime desde que migramos para a SpectreAuth.",
    name: "Pedro Santos",
    title: "Lead Developer, GameStudio",
  },
  {
    quote:
      "As funcionalidades de ban e pause sao essenciais para nosso modelo de negocio. A granularidade de controle que temos e impressionante.",
    name: "Mariana Costa",
    title: "CEO, CloudServices",
  },
  {
    quote:
      "Migramos de uma solucao propria para a SpectreAuth e foi a melhor decisao. A economia de tempo e recursos foi significativa.",
    name: "Lucas Oliveira",
    title: "Tech Lead, StartupXYZ",
  },
];

const testimonialsRow3 = [
  {
    quote:
      "A documentacao e completa e a API e extremamente bem projetada. Integramos em nosso sistema em apenas 2 dias.",
    name: "Fernando Lima",
    title: "Arquiteto de Software, DevPro",
  },
  {
    quote:
      "O modo de manutencao e os logs de auditoria nos dao total controle sobre o sistema. Seguranca de verdade.",
    name: "Patricia Gomes",
    title: "Security Lead, SafeCode",
  },
  {
    quote:
      "Excelente custo-beneficio. Antes gastavamos muito tempo com sistema proprio, agora focamos no produto.",
    name: "Ricardo Nunes",
    title: "Founder, IndieGames BR",
  },
  {
    quote:
      "O sistema de webhooks e perfeito para nosso fluxo de trabalho. Recebemos notificacoes em tempo real.",
    name: "Amanda Reis",
    title: "DevOps Engineer, ScaleTech",
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center mb-12">
          <span className="inline-block rounded-full border border-border bg-card/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm mb-4">
            Depoimentos
          </span>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
            O que nossos clientes dizem
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Empresas de todo o mundo confiam na SpectreAuth para proteger seus softwares
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <InfiniteMovingCards
          items={testimonialsRow1}
          direction="left"
          speed="slow"
          pauseOnHover={true}
        />
        
        <InfiniteMovingCards
          items={testimonialsRow2}
          direction="right"
          speed="slow"
          pauseOnHover={true}
        />
        
        <InfiniteMovingCards
          items={testimonialsRow3}
          direction="left"
          speed="slow"
          pauseOnHover={true}
        />
      </div>
    </section>
  );
}
