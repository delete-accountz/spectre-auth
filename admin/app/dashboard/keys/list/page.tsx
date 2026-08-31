"use client";

import React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSidebar } from "../../layout";
import {
  KeyIcon as Key,
  MagnifyingGlassIcon as Search,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  ArrowPathIcon as Loader2,
  ArrowPathIcon as RefreshCw,
  FunnelIcon as Filter,
  CalendarDaysIcon as Calendar,
  CubeIcon as Package,
  UserIcon as User,
} from "@heroicons/react/24/solid";
import { getKeys, getProducts, type KeyItem, type Product } from "@/lib/api";
import Loading from "@/app/loading"; // Import Loading component

export default function KeysListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toggle: toggleSidebar, sidebarOpen, setSidebarOpen } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchProducts = async () => {
    const response = await getProducts(1, 100);
    if (response.success && response.data) {
      setProducts(response.data.items);
    }
  };

  const fetchKeys = async () => {
    setLoading(true);
    const response = await getKeys(page, 25, {
      q: searchQuery || undefined,
      status: statusFilter || undefined,
      productId: productFilter || undefined,
    });
    
    if (response.success && response.data) {
      setKeys(response.data.items);
      setTotalPages(response.data.pages);
      setTotal(response.data.total);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [page, searchQuery, statusFilter, productFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const getKeyStatus = (key: KeyItem): "active" | "paused" | "banned" | "expired" | "pending" => {
    if (key.banned) return "banned";
    if (key.paused) return "paused";
    if (!key.activatedAt && !key.expiresAt) return "pending";
    const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
    if (isExpired) return "expired";
    return "active";
  };

  const handleKeyClick = (key: KeyItem) => {
    // Navigate to the key management page with the key code
    router.push(`/dashboard/keys?key=${encodeURIComponent(key.code)}`);
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Lista de Licencas"
        description="Visualize todas as licencas do sistema"
         onMenuClick={toggleSidebar}
      />

      <main className="p-6">
        {/* Search and Filters */}
        <Card className="mb-6 animate-slide-down">
          <CardContent className="py-4">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por codigo, prefixo ou Discord ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={loading}>
                Buscar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="bg-transparent"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </form>

            {/* Filters */}
            {showFilters && (
              <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Todos</option>
                    <option value="active">Ativas</option>
                    <option value="expired">Expiradas</option>
                    <option value="paused">Pausadas</option>
                    <option value="banned">Banidas</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Produto</label>
                  <select
                    value={productFilter}
                    onChange={(e) => {
                      setProductFilter(e.target.value);
                      setPage(1);
                    }}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Todos</option>
                    {products.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} licenca(s) encontrada(s)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchKeys}
            disabled={loading}
            className="bg-transparent"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Keys List */}
        {loading ? (
          <Loading /> // Use Loading component here
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="flex h-64 flex-col items-center justify-center">
              <Key className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                Nenhuma licenca encontrada
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {keys.map((key, index) => (
              <Card
                key={key.id}
                className="cursor-pointer transition-colors hover:bg-muted/50 animate-slide-up opacity-0"
                style={{
                  animationDelay: `${index * 30}ms`,
                  animationFillMode: "forwards",
                }}
                onClick={() => handleKeyClick(key)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Key Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Key Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {key.code}
                        </span>
                        <StatusBadge status={getKeyStatus(key)} />
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {key.product?.name || "Sem produto"}
                        </span>
                        {key.usedBy && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {key.usedBy}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expiration */}
                    <div className="hidden text-right sm:block">
                      <div className="flex items-center justify-end gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {key.expiresAt
                            ? new Date(key.expiresAt).toLocaleDateString("pt-BR")
                            : key.durationDays
                            ? `${key.durationDays}d (vinculo)`
                            : "-"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Expiracao
                      </p>
                    </div>

                    {/* HWID Indicator */}
                    <div className="hidden lg:block">
                      <div className={`h-2 w-2 rounded-full ${key.hwid ? "bg-success" : "bg-muted"}`} 
                           title={key.hwid ? "HWID vinculado" : "Sem HWID"} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="px-4 text-sm text-muted-foreground">
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="bg-transparent"
            >
              Proxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
