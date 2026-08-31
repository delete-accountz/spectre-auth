"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  delay?: number;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  className,
  delay = 0,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4 lg:p-6 transition-all duration-300 hover:border-muted-foreground/30 hover:shadow-lg",
        "animate-slide-up opacity-0",
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-muted/30 blur-2xl transition-all duration-500 group-hover:bg-muted/50" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground line-clamp-1">{title}</p>
          <div className="rounded-lg bg-muted p-1.5 sm:p-2 shrink-0">
            <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {description && (
            <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{description}</p>
          )}
          {trend && (
            <div
              className={cn(
                "mt-1 sm:mt-2 inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium",
                trend.isPositive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
