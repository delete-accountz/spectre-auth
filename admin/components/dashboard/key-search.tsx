"use client";

import React from "react"

import { useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KeySearchProps {
  onSearch: (key: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function KeySearch({ onSearch, isLoading, className }: KeySearchProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.trim());
    }
  };

  const handleClear = () => {
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar licença... (ex: SAFE-XXXX-XXXX-XXXX)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 pl-10 pr-24 font-mono text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-24 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
        <Button
          type="submit"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2"
          disabled={!value.trim() || isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </span>
          ) : (
            "Buscar"
          )}
        </Button>
      </div>
    </form>
  );
}
