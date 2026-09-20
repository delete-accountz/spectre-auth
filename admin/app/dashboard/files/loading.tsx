"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "@heroicons/react/24/solid";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="p-6">
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />
              <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="h-16 rounded bg-muted" />
                  <div className="h-16 rounded bg-muted" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-8 flex-1 rounded bg-muted" />
                  <div className="h-8 flex-1 rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}