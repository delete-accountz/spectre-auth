"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.135 18.115a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  );
}

export function Footer() {
  const { t } = useLanguage();

  const socials = [
    {
      icon: DiscordIcon,
      label: "Discord",
      sub: "discord.gg/cqsUYw3u7G",
      href: "https://discord.gg/cqsUYw3u7G",
    },
    {
      icon: YoutubeIcon,
      label: "YouTube",
      sub: "@spectre_xiter",
      href: "https://www.youtube.com/@spectre_xiter",
    },
    {
      icon: TikTokIcon,
      label: "TikTok",
      sub: "@spectre_xiters",
      href: "https://www.tiktok.com/@spectre_xiters",
    },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-border overflow-hidden">
              <Image src="/3.png" alt="SpectreAuth" width={28} height={28} className="w-7 h-7 object-contain" />
            </div>
            <span className="font-semibold tracking-tight">SpectreAuth</span>
          </div>

          {/* Socials */}
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/50">
              {t({ "pt-BR": "Comunidade", "en-US": "Community" })}
            </p>
            <div className="flex items-center gap-3">
              {socials.map(({ icon: Icon, label, sub, href }) => (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:bg-muted/40 hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono text-xs">{sub}</span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 sm:flex-row">
          <span className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} SpectreAuth
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t({ "pt-BR": "Operacional", "en-US": "Operational" })}
          </span>
        </div>
      </div>
    </footer>
  );
}
