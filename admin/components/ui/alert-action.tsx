"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type AlertVariant = "success" | "error" | "warning" | "info";

interface AlertActionProps {
  variant: AlertVariant;
  title: string;
  description?: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number;
  className?: string;
}

const variantStyles: Record<AlertVariant, { bg: string; border: string; icon: typeof CheckCircle }> = {
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    icon: CheckCircle,
  },
  error: {
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    icon: XCircle,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    icon: Info,
  },
};

const iconColors: Record<AlertVariant, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

export function AlertAction({
  variant,
  title,
  description,
  onClose,
  autoClose = true,
  autoCloseDelay = 5000,
  className,
}: AlertActionProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  const { bg, border, icon: Icon } = variantStyles[variant];

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        handleClose();
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDelay]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 transition-all duration-300",
        bg,
        border,
        isLeaving ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0",
        className
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconColors[variant])} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        className="shrink-0 rounded-md p-1 hover:bg-muted/50 transition-colors"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

// Alert List component for stacking alerts
interface AlertListProps {
  alerts: Array<{
    id: string;
    variant: AlertVariant;
    title: string;
    description?: string;
  }>;
  onDismiss: (id: string) => void;
  className?: string;
}

export function AlertList({ alerts, onDismiss, className }: AlertListProps) {
  return (
    <div className={cn("fixed top-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]", className)}>
      {alerts.map((alert) => (
        <AlertAction
          key={alert.id}
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onClose={() => onDismiss(alert.id)}
        />
      ))}
    </div>
  );
}
