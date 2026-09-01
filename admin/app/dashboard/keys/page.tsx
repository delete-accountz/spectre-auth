"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/dashboard/header";
import { useSidebar } from "../layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
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
  EllipsisVerticalIcon as MoreVertical,
  ArrowPathIcon as RotateCcw,
  PlusIcon as Plus,
  NoSymbolIcon as Ban,
  PauseIcon as Pause,
  PlayIcon as Play,
  LinkSlashIcon as Unlink,
  ClockIcon as Clock,
  ClipboardDocumentIcon as Copy,
  TrashIcon as Trash,
} from "@heroicons/react/24/solid";
import {
  getKeys,
  getProducts,
  getKeyById,
  resetKeyHwid,
  addKeyDays,
  pauseKey,
  banKey,
  unlinkKey,
  createKeys,
  deleteKey,
  type KeyItem,
  type Product,
  type CreateKeysItem,
  type KeyInfoData,
  getKeyInfo,
} from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const KeysPage = () => {
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

  // Modal states
  const [selectedKey, setSelectedKey] = useState<KeyItem | null>(null);
  const [selectedKeyDetails, setSelectedKeyDetails] = useState<KeyItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionModal, setActionModal] = useState<{
    type: "addDays" | "ban" | "pause" | "resetHwid" | "unlink" | "delete" | null;
    key: KeyItem | null;
  }>({ type: null, key: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [daysToAdd, setDaysToAdd] = useState("30");
  const [banReason, setBanReason] = useState("");

  // Create keys modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createKeysLoading, setCreateKeysLoading] = useState(false);
  const [newKeyProductId, setNewKeyProductId] = useState("");
  const [newKeyDays, setNewKeyDays] = useState("30");
  const [newKeyDurationUnit, setNewKeyDurationUnit] = useState<"days" | "hours">("days");
  const [newKeyQuantity, setNewKeyQuantity] = useState("1");
  const [newKeyPrefix, setNewKeyPrefix] = useState("");
  const [createdKeys, setCreatedKeys] = useState<CreateKeysItem[]>([]);
  const [showCreatedKeys, setShowCreatedKeys] = useState(false);

  const { addToast } = useToast();

  const fetchProducts = async () => {
    const response = await getProducts(1, 100);
    if (response.success && response.data) {
      setProducts(response.data.items);
    }
  };

  const fetchKeys = useCallback(async () => {
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
  }, [page, searchQuery, statusFilter, productFilter]);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

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

  const handleKeyClick = async (key: KeyItem) => {
    setSelectedKey(key);
    setLoadingDetails(true);
    const response = await getKeyById(key.id);
    if (response.success && response.data) {
      setSelectedKeyDetails(response.data.item);
    } else {
      // Fallback to the key from the list if API fails
      setSelectedKeyDetails(key);
      addToast({
        title: "Aviso",
        description: "Alguns detalhes podem estar desatualizados",
        variant: "default",
      });
    }
    setLoadingDetails(false);
  };

  const closeDetailsModal = () => {
    setSelectedKey(null);
    setSelectedKeyDetails(null);
  };

  const openActionModal = (type: typeof actionModal.type, key: KeyItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionModal({ type, key });
    setDaysToAdd("30");
    setBanReason("");
  };

  const closeActionModal = () => {
    setActionModal({ type: null, key: null });
  };

  const handleAction = async () => {
    if (!actionModal.key || !actionModal.type) return;
    
    setActionLoading(true);
    let response;
    const keyCode = actionModal.key.code;

    switch (actionModal.type) {
      case "resetHwid":
        response = await resetKeyHwid(keyCode);
        break;
      case "addDays":
        response = await addKeyDays(keyCode, parseInt(daysToAdd));
        break;
      case "pause":
        response = await pauseKey(keyCode, !actionModal.key.paused);
        break;
      case "ban":
        response = await banKey(keyCode, !actionModal.key.banned, banReason || undefined);
        break;
      case "unlink":
        response = await unlinkKey(keyCode);
        break;
      case "delete":
        response = await deleteKey(actionModal.key.id);
        break;
    }

    setActionLoading(false);

    if (response?.success) {
      addToast({
        title: "Acao executada",
        description: `Operacao realizada com sucesso na key ${keyCode.slice(0, 8)}...`,
        variant: "success",
      });
      fetchKeys();
      closeActionModal();
    } else {
      addToast({
        title: "Erro",
        description: response?.message || "Erro ao executar acao",
        variant: "destructive",
      });
    }
  };

  const handleCreateKeys = async () => {
    if (!newKeyProductId) {
      addToast({
        title: "Erro",
        description: "Selecione um produto",
        variant: "destructive",
      });
      return;
    }

    setCreateKeysLoading(true);
    const rawValue = parseFloat(newKeyDays);
    const daysValue = newKeyDurationUnit === "hours" ? rawValue / 24 : rawValue;
    const response = await createKeys({
      productId: newKeyProductId,
      days: daysValue,
      quantity: parseInt(newKeyQuantity),
      prefix: newKeyPrefix || undefined,
    });
    setCreateKeysLoading(false);

    if (response.success && response.data) {
      setCreatedKeys(response.data.items);
      setShowCreatedKeys(true);
      addToast({
        title: "Keys criadas",
        description: `${response.data.items.length} key(s) criada(s) com sucesso`,
        variant: "success",
      });
      fetchKeys();
    } else {
      addToast({
        title: "Erro",
        description: response.message || "Erro ao criar keys",
        variant: "destructive",
      });
    }
  };

  const resetCreateModal = () => {
    setCreateModalOpen(false);
    setShowCreatedKeys(false);
    setCreatedKeys([]);
    setNewKeyProductId("");
    setNewKeyDays("30");
    setNewKeyDurationUnit("days");
    setNewKeyQuantity("1");
    setNewKeyPrefix("");
  };

  const copyCreatedKeys = () => {
    const keysText = createdKeys.map(k => k.code).join("\n");
    navigator.clipboard.writeText(keysText);
    addToast({
      title: "Copiado!",
      description: "Keys copiadas para a area de transferencia",
      variant: "success",
    });
  };

  const copySingleCreatedKey = (code: string) => {
    navigator.clipboard.writeText(code);
    addToast({
      title: "Copiado!",
      description: "Key copiada para a area de transferencia",
      variant: "success",
    });
  };

  const getActionModalContent = () => {
    if (!actionModal.type || !actionModal.key) return null;

    switch (actionModal.type) {
      case "resetHwid":
        return {
          title: "Resetar HWID",
          description: `Tem certeza que deseja resetar o HWID da key ${actionModal.key.code}? O usuario precisara vincular novamente.`,
          confirmText: "Resetar HWID",
          confirmVariant: "default" as const,
        };
      case "addDays":
        return {
          title: "Adicionar Dias",
          description: `Adicione dias de validade a key ${actionModal.key.code}.`,
          confirmText: "Adicionar",
          confirmVariant: "default" as const,
          hasInput: true,
        };
      case "pause":
        return {
          title: actionModal.key.paused ? "Despausar Key" : "Pausar Key",
          description: actionModal.key.paused 
            ? `Deseja despausar a key ${actionModal.key.code}?`
            : `Deseja pausar temporariamente a key ${actionModal.key.code}?`,
          confirmText: actionModal.key.paused ? "Despausar" : "Pausar",
          confirmVariant: "default" as const,
        };
      case "ban":
        return {
          title: actionModal.key.banned ? "Desbanir Key" : "Banir Key",
          description: actionModal.key.banned 
            ? `Deseja desbanir a key ${actionModal.key.code}?`
            : `Deseja banir permanentemente a key ${actionModal.key.code}?`,
          confirmText: actionModal.key.banned ? "Desbanir" : "Banir",
          confirmVariant: "destructive" as const,
          hasReasonInput: !actionModal.key.banned,
        };
      case "unlink":
        return {
          title: "Desvincular Key",
          description: `Tem certeza que deseja desvincular o usuário da key ${actionModal.key.code}?`,
          confirmText: "Desvincular",
          confirmVariant: "default" as const,
        };
      case "delete":
        return {
          title: "Deletar Key",
          description: `Tem certeza que deseja deletar permanentemente a key ${actionModal.key.code}? Esta ação é irreversível e todos os dados vinculados serão perdidos.`,
          confirmText: "Deletar",
          confirmVariant: "destructive" as const,
        };
    }
  };

  const modalContent = getActionModalContent();

  return (
    <div className="min-h-screen">
      <Header
        title="Licencas"
        description="Gerencie todas as licencas do sistema"
         onMenuClick={toggleSidebar}
      />

      <main className="p-4 lg:p-6">
        {/* Search and Filters */}
        <Card className="mb-4 lg:mb-6 animate-slide-down">
          <CardContent className="py-3 lg:py-4">
            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por codigo ou key..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1 sm:flex-none">
                  <Search className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Buscar</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="bg-transparent"
                >
                  <Filter className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="flex-1 sm:flex-none"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Criar Keys</span>
                </Button>
              </div>
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
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
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
                className="transition-colors hover:bg-muted/30 animate-slide-up opacity-0"
                style={{
                  animationDelay: `${index * 30}ms`,
                  animationFillMode: "forwards",
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Key Icon */}
                    <div 
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => handleKeyClick(key)}
                    >
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Key Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleKeyClick(key)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">
                          {key.code}
                        </span>
                        <StatusBadge status={getKeyStatus(key)} />
                        {key.product?.name && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                            <Package className="h-3 w-3" />
                            {key.product.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                        {key.usedBy && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {key.usedBy}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {key.expiresAt
                            ? new Date(key.expiresAt).toLocaleDateString("pt-BR")
                            : key.durationDays
                            ? `${key.durationDays}d (vinculo)`
                            : "Pendente"}
                        </span>
                        {key.productHash && (
                          <span className="hidden md:flex items-center gap-1 font-mono">
                          </span>
                        )}
                        {key.hwid && (
                          <span className="hidden sm:flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-success" />
                            HWID vinculado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="bg-transparent h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={(e) => openActionModal("addDays", key, e)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar Dias
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => openActionModal("resetHwid", key, e)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Resetar HWID
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => openActionModal("unlink", key, e)}>
                          <Unlink className="mr-2 h-4 w-4" />
                          Desvincular Key
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => openActionModal("pause", key, e)}>
                          {key.paused ? (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              Despausar
                            </>
                          ) : (
                            <>
                              <Pause className="mr-2 h-4 w-4" />
                              Pausar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => openActionModal("ban", key, e)}
                          className={key.banned ? "" : "text-destructive focus:text-destructive"}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          {key.banned ? "Desbanir" : "Banir"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => openActionModal("delete", key, e)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash className="mr-2 h-4 w-4" />
                          Deletar Key
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Ban Reason */}
                  {key.banned && key.banReason && (
                    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                      <p className="text-xs text-destructive">
                        <span className="font-medium">Motivo:</span> {key.banReason}
                      </p>
                    </div>
                  )}
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

      {/* Key Details Modal */}
      <Modal isOpen={!!selectedKey} onClose={closeDetailsModal}>
        <ModalHeader>
          <ModalTitle>Detalhes da Licenca</ModalTitle>
          <ModalDescription>
            {selectedKey?.code}
          </ModalDescription>
        </ModalHeader>
        
        {loadingDetails ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedKeyDetails ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={
                selectedKeyDetails.banned ? "banned" :
                selectedKeyDetails.paused ? "paused" :
                (!selectedKeyDetails.activatedAt && !selectedKeyDetails.expiresAt) ? "pending" :
                (selectedKeyDetails.expiresAt && new Date(selectedKeyDetails.expiresAt) < new Date()) ? "expired" : "active"
              } />
              {selectedKeyDetails.product?.name && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                  <Package className="h-3 w-3" />
                  {selectedKeyDetails.product.name}
                </span>
              )}
            </div>
            
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">HWID</p>
                <p className="mt-1 font-mono text-xs break-all">{selectedKeyDetails.hwid || "-"}</p>
              </div>
              {(selectedKeyDetails as any).sid && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">SID (Windows)</p>
                  <p className="mt-1 font-mono text-xs break-all">{(selectedKeyDetails as any).sid}</p>
                </div>
              )}
              {(selectedKeyDetails as any).lastIp && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Último IP</p>
                  <p className="mt-1 font-mono text-sm">{(selectedKeyDetails as any).lastIp}</p>
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Expiracao</p>
                <p className="mt-1 text-sm flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {selectedKeyDetails.expiresAt 
                    ? new Date(selectedKeyDetails.expiresAt).toLocaleDateString("pt-BR")
                    : "Pendente (ativa no vinculo)"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Ativada em</p>
                <p className="mt-1 text-sm flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {selectedKeyDetails.activatedAt
                    ? new Date(selectedKeyDetails.activatedAt).toLocaleDateString("pt-BR")
                    : "Nao ativada"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Product Hash</p>
                <p className="mt-1 font-mono text-xs break-all">{selectedKeyDetails.productHash || "-"}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Duracao (dias)</p>
                <p className="mt-1 text-sm">{selectedKeyDetails.durationDays ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Criado em</p>
                <p className="mt-1 text-sm flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {selectedKeyDetails.createdAt 
                    ? new Date(selectedKeyDetails.createdAt).toLocaleDateString("pt-BR")
                    : "-"}
                </p>
              </div>
            </div>

            {selectedKeyDetails.banReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-destructive/70">Motivo do Ban</p>
                <p className="mt-1 text-sm text-destructive">{selectedKeyDetails.banReason}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            Erro ao carregar detalhes
          </p>
        )}

        <ModalFooter>
          <Button variant="outline" onClick={closeDetailsModal} className="bg-transparent">
            Fechar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Action Modal */}
      <Modal isOpen={!!actionModal.type} onClose={closeActionModal}>
        {modalContent && (
          <>
            <ModalHeader>
              <ModalTitle>{modalContent.title}</ModalTitle>
              <ModalDescription>{modalContent.description}</ModalDescription>
            </ModalHeader>

            {modalContent.hasInput && (
              <div className="py-4">
                <label className="text-sm font-medium">Dias (aceita negativo para remover)</label>
                <Input
                  type="number"
                  value={daysToAdd}
                  onChange={(e) => setDaysToAdd(e.target.value)}
                  min="-36500"
                  max="36500"
                  className="mt-1"
                />
              </div>
            )}

            {modalContent.hasReasonInput && (
              <div className="py-4">
                <label className="text-sm font-medium">Motivo do ban (opcional)</label>
                <Input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Ex: Chargeback, fraude, etc."
                  className="mt-1"
                />
              </div>
            )}

            <ModalFooter>
              <Button variant="outline" onClick={closeActionModal} className="bg-transparent">
                Cancelar
              </Button>
              <Button
                variant={modalContent.confirmVariant}
                onClick={handleAction}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {modalContent.confirmText}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Create Keys Modal */}
      <Modal isOpen={createModalOpen} onClose={resetCreateModal}>
        <ModalHeader>
          <ModalTitle>{showCreatedKeys ? "Keys Criadas" : "Criar Novas Keys"}</ModalTitle>
          <ModalDescription>
            {showCreatedKeys 
              ? `${createdKeys.length} key(s) criada(s) com sucesso`
              : "Configure as opcoes para gerar novas licencas"}
          </ModalDescription>
        </ModalHeader>

        {showCreatedKeys ? (
          <div className="space-y-4">
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
              {createdKeys.map((key, i) => (
                <div 
                  key={key.id} 
                  className={`flex items-center justify-between gap-2 py-2 ${i !== createdKeys.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-sm break-all select-all">{key.code}</span>
                    {key.productHash ? (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                        hash: {key.productHash}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground text-right">
                      {key.expiresAt
                        ? new Date(key.expiresAt).toLocaleDateString("pt-BR")
                        : `${key.durationDays ?? "-"}d (no vinculo)`}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => copySingleCreatedKey(key.code)}
                      title="Copiar key"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <ModalFooter>
              <Button
                variant="outline"
                onClick={copyCreatedKeys}
                className="bg-transparent gap-2"
              >
                <Copy className="h-4 w-4" />
                Copiar Todas
              </Button>
              <Button onClick={resetCreateModal}>
                Concluir
              </Button>
            </ModalFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Produto</label>
                <select
                  value={newKeyProductId}
                  onChange={(e) => setNewKeyProductId(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione um produto</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium">Validade</label>
                    <div className="flex rounded-md border border-input overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setNewKeyDurationUnit("days");
                          setNewKeyDays("30");
                        }}
                        className={`px-2 py-0.5 transition-colors ${
                          newKeyDurationUnit === "days"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Dias
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewKeyDurationUnit("hours");
                          setNewKeyDays("24");
                        }}
                        className={`px-2 py-0.5 transition-colors ${
                          newKeyDurationUnit === "hours"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Horas
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={newKeyDays}
                    onChange={(e) => setNewKeyDays(e.target.value)}
                    min={newKeyDurationUnit === "hours" ? "1" : "1"}
                    max={newKeyDurationUnit === "hours" ? "8760" : "3650"}
                    step={newKeyDurationUnit === "hours" ? "1" : "1"}
                    placeholder={newKeyDurationUnit === "hours" ? "Ex: 24, 48, 72..." : "Ex: 30, 90, 365..."}
                    className="mt-0"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {newKeyDurationUnit === "hours"
                      ? `${newKeyDays}h = ${(parseFloat(newKeyDays || "0") / 24).toFixed(2).replace(/\.?0+$/, "")} dia(s)`
                      : `${newKeyDays} dia(s)`}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Quantidade</label>
                  <Input
                    type="number"
                    value={newKeyQuantity}
                    onChange={(e) => setNewKeyQuantity(e.target.value)}
                    min="1"
                    max="100"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Prefixo (opcional)</label>
                <Input
                  type="text"
                  value={newKeyPrefix}
                  onChange={(e) => setNewKeyPrefix(e.target.value)}
                  placeholder="Ex: Spectre-, VIP-..."
                  className="mt-1.5"
                />
              </div>
            </div>

            <ModalFooter>
              <Button variant="outline" onClick={resetCreateModal} className="bg-transparent">
                Cancelar
              </Button>
              <Button
                onClick={handleCreateKeys}
                disabled={createKeysLoading || !newKeyProductId}
              >
                {createKeysLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </span>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Keys
                  </>
                )}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
};

function Loading() {
  return null;
}

export { Loading };

export default KeysPage;
