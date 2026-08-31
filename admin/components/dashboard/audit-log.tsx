"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { KeyIcon, ArrowPathIcon, PauseIcon, PlayIcon, NoSymbolIcon, LinkSlashIcon, PlusIcon, MinusIcon, Cog6ToothIcon } from "@heroicons/react/24/solid";
import type { ComponentType, SVGProps } from "react";

export type AuditAction =
  | "reset_hwid"
  | "unlink"
  | "add_days"
  | "remove_days"
  | "pause"
  | "unpause"
  | "ban"
  | "unban"
  | "maintenance_on"
  | "maintenance_off"
  | "bulk_pause"
  | "bulk_reset";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  target?: string;
  details?: string;
  timestamp: Date;
}

const actionConfig: Record<
  AuditAction,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; color: string }
> = {
  reset_hwid: {
    label: "HWID Resetado",
    icon: ArrowPathIcon,
    color: "text-blue-400",
  },
  unlink: {
    label: "Key Desvinculada",
    icon: LinkSlashIcon,
    color: "text-amber-400",
  },
  add_days: {
    label: "Dias Adicionados",
    icon: PlusIcon,
    color: "text-emerald-400",
  },
  remove_days: {
    label: "Dias Removidos",
    icon: MinusIcon,
    color: "text-red-400",
  },
  pause: {
    label: "Key Pausada",
    icon: PauseIcon,
    color: "text-amber-400",
  },
  unpause: {
    label: "Key Despausada",
    icon: PlayIcon,
    color: "text-emerald-400",
  },
  ban: {
    label: "Key Banida",
    icon: NoSymbolIcon,
    color: "text-red-400",
  },
  unban: {
    label: "Key Desbanida",
    icon: KeyIcon,
    color: "text-emerald-400",
  },
  maintenance_on: {
    label: "Manutencao Ativada",
    icon: Cog6ToothIcon,
    color: "text-amber-400",
  },
  maintenance_off: {
    label: "Manutencao Desativada",
    icon: Cog6ToothIcon,
    color: "text-emerald-400",
  },
  bulk_pause: {
    label: "Pausa em Massa",
    icon: PauseIcon,
    color: "text-amber-400",
  },
  bulk_reset: {
    label: "Reset em Massa",
    icon: ArrowPathIcon,
    color: "text-blue-400",
  },
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "agora";
  if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400)
    return `há ${Math.floor(diffInSeconds / 3600)} h`;
  return `há ${Math.floor(diffInSeconds / 86400)} d`;
}

interface AuditLogProps {
  entries: AuditLogEntry[];
  maxEntries?: number;
  className?: string;
}

export function AuditLog({ entries, maxEntries = 10, className }: AuditLogProps) {
  const [visibleEntries, setVisibleEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    setVisibleEntries(entries.slice(0, maxEntries));
  }, [entries, maxEntries]);

  return (
    <div className={cn("space-y-2", className)}>
      {visibleEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma atividade recente</p>
        </div>
      ) : (
        visibleEntries.map((entry, index) => {
          const config = actionConfig[entry.action];
          const Icon = config.icon;

          return (
            <div
              key={entry.id}
              className={cn(
                "group flex items-start gap-3 rounded-lg border border-border/70 bg-card/30 p-3 transition-colors hover:bg-card/60",
                "animate-slide-up opacity-0"
              )}
              style={{
                animationDelay: `${index * 50}ms`,
                animationFillMode: "forwards",
              }}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/40",
                  config.color
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm line-clamp-1">
                    {entry.details || config.label}
                  </p>
                  <span
                    className="text-xs text-muted-foreground shrink-0"
                    title={entry.timestamp.toLocaleString("pt-BR")}
                  >
                    {formatTimeAgo(entry.timestamp)}
                  </span>
                </div>
                {entry.target && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    {entry.target}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// Hook for managing audit log state
export function useAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  const addEntry = (
    action: AuditAction,
    target?: string,
    details?: string
  ) => {
    const newEntry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      target,
      details,
      timestamp: new Date(),
    };
    setEntries((prev) => [newEntry, ...prev]);
  };

  const clearEntries = () => setEntries([]);

  return { entries, addEntry, clearEntries };
}
