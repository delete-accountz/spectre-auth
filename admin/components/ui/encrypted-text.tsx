"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface EncryptedTextProps {
  text: string;
  encryptedClassName?: string;
  revealedClassName?: string;
  revealDelayMs?: number;
  className?: string;
  animateOnHover?: boolean;
}

const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

export function EncryptedText({
  text,
  encryptedClassName = "text-neutral-500",
  revealedClassName = "text-white",
  revealDelayMs = 50,
  className,
  animateOnHover = false,
}: EncryptedTextProps) {
  const [displayText, setDisplayText] = useState<string[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(!animateOnHover);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const revealIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize with random characters
    const initial = text.split("").map((char) => {
      if (char === " ") return " ";
      return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    });
    setDisplayText(initial);
  }, [text]);

  useEffect(() => {
    if (!isAnimating) return;

    // Scramble effect for unrevealed characters
    intervalRef.current = setInterval(() => {
      setDisplayText((prev) =>
        prev.map((char, i) => {
          if (i < revealedCount || text[i] === " ") return text[i];
          return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        })
      );
    }, 30);

    // Gradually reveal characters
    revealIntervalRef.current = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, revealDelayMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
    };
  }, [isAnimating, text, revealDelayMs, revealedCount]);

  const handleHover = () => {
    if (animateOnHover && !isAnimating) {
      setRevealedCount(0);
      setIsAnimating(true);
    }
  };

  return (
    <span
      className={cn("font-mono inline-block", className)}
      onMouseEnter={handleHover}
    >
      {displayText.map((char, i) => (
        <span
          key={i}
          className={cn(
            "inline-block transition-all duration-150",
            i < revealedCount ? revealedClassName : encryptedClassName
          )}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
