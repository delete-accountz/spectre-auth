"use client";

import { Bars3Icon, BellIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description?: string;
  onMenuClick: () => void;
  isMaintenanceMode?: boolean;
}

export function Header({
  title,
  description,
  onMenuClick,
  isMaintenanceMode = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
      {/* Maintenance Banner */}
      {isMaintenanceMode && (
        <div className="flex items-center justify-center gap-2 bg-warning/10 px-4 py-2 text-sm text-warning">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <span>Sistema em manutenção - ações administrativas bloqueadas</span>
        </div>
      )}

      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Bars3Icon className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={isMaintenanceMode ? "maintenance" : "active"} />
          <Button variant="ghost" size="icon" className="relative">
            <BellIcon className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
          </Button>
        </div>
      </div>
    </header>
  );
}
