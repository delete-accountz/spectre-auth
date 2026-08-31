"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card/70 p-1",
        className
      )}
      role="group"
      aria-label="Language selector"
    >
      <Button
        type="button"
        size="sm"
        variant={language === "pt-BR" ? "default" : "ghost"}
        className="h-7 px-2"
        aria-label="Português (Brasil)"
        onClick={() => setLanguage("pt-BR")}
      >
        🇧🇷
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "en-US" ? "default" : "ghost"}
        className="h-7 px-2"
        aria-label="English (United States)"
        onClick={() => setLanguage("en-US")}
      >
        🇺🇸
      </Button>
    </div>
  );
}
