"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type StatusType = "active" | "paused" | "banned" | "expired" | "maintenance" | "pending";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  active: {
    label: "Ativo",
    className: "bg-success/10 text-success border-success/20",
  },
  paused: {
    label: "Pausado",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  banned: {
    label: "Banido",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  expired: {
    label: "Expirado",
    className: "bg-muted text-muted-foreground border-border",
  },
  maintenance: {
    label: "Manutenção",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending: {
    label: "Pendente",
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "active" && "bg-success animate-pulse",
          status === "paused" && "bg-warning",
          status === "banned" && "bg-destructive",
          status === "expired" && "bg-muted-foreground",
          status === "maintenance" && "bg-warning animate-pulse",
          status === "pending" && "bg-primary animate-pulse"
        )}
      />
      {config.label}
    </span>
  );
}
