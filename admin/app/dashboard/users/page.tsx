"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useSidebar } from "../layout";
import {
  UsersIcon as Users,
  MagnifyingGlassIcon as Search,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  ArrowPathIcon as Loader2,
  ArrowPathIcon as RefreshCw,
  KeyIcon as Key,
  CalendarDaysIcon as Calendar,
  ArrowTopRightOnSquareIcon as ExternalLink,
  CubeIcon as Package,
  ClockIcon as Clock,
  ShieldCheckIcon as Shield,
  EllipsisVerticalIcon as MoreVertical,
  ArrowPathIcon as RotateCcw,
  PlusIcon as Plus,
  NoSymbolIcon as Ban,
  PauseIcon as Pause,
  PlayIcon as Play,
  LinkSlashIcon as Unlink,
  TrashIcon as Trash,
} from "@heroicons/react/24/solid";
import {
  getUsers,
  syncUserDiscord,
  getUserByDiscordId,
  getKeyById,
  resetKeyHwid,
  addKeyDays,
  pauseKey,
  banKey,
  unlinkKey,
  deleteUser,
  type UserItem,
  type KeyItem,
  getKeyInfo,
  type KeyInfoData,
} from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function UsersPage() {
  const { toggle: toggleSidebar, sidebarOpen, setSidebarOpen } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [syncingUser, setSyncingUser] = useState<string | null>(null);

  // User details modal
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedUserDetails, setSelectedUserDetails] = useState<UserItem | null>(null);
  const [selectedUserKeyDetails, setSelectedUserKeyDetails] = useState<KeyItem | null>(null);
  const [selectedUserKeyInfo, setSelectedUserKeyInfo] = useState<KeyInfoData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Action modal states
  const [actionModal, setActionModal] = useState<{
    type: "addDays" | "ban" | "pause" | "resetHwid" | "unlink" | "delete" | null;
    user: UserItem | null;
  }>({ type: null, user: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [daysToAdd, setDaysToAdd] = useState("30");
  const [banReason, setBanReason] = useState("");

  const { addToast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const response = await getUsers(page, 25, searchQuery || undefined);
    
    if (response.success && response.data) {
      setUsers(response.data.items);
      setTotalPages(response.data.pages);
      setTotal(response.data.total);
    }
    setLoading(false);
  }, [page, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleSyncDiscord = async (discordId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSyncingUser(discordId);
    const response = await syncUserDiscord(discordId);
    setSyncingUser(null);
    
    if (response.success && response.data) {
      addToast({
        title: "Discord Sincronizado",
        description: `Perfil de ${response.data.user.discordUsername} atualizado`,
        variant: "success",
      });
      fetchUsers();
    } else {
      addToast({
        title: "Erro ao sincronizar",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const getUserStatus = (user: UserItem): "active" | "paused" | "banned" => {
    if (user.banned) return "banned";
    if (user.paused) return "paused";
    return "active";
  };

  const handleUserClick = async (user: UserItem) => {
    setSelectedUser(user);
    setLoadingDetails(true);
    
    // Fetch user details
    const userResponse = await getUserByDiscordId(user.discordId);
    if (userResponse.success && userResponse.data) {
      setSelectedUserDetails(userResponse.data.item);
    } else {
      setSelectedUserDetails(user);
    }

    // Fetch key details if user has a key
    if (user.key) {
      const keyInfoResponse = await getKeyInfo(user.key);
      if (keyInfoResponse.success && keyInfoResponse.data) {
        setSelectedUserKeyInfo(keyInfoResponse.data);
      } else {
        setSelectedUserKeyInfo(null);
      }

      // Try to find key ID from list or use getKeyInfo as fallback
      const keysResponse = await import("@/lib/api").then(m => m.getKeys(1, 100, { q: user.key }));
      if (keysResponse.success && keysResponse.data && keysResponse.data.items.length > 0) {
        const keyItem = keysResponse.data.items.find(k => k.code === user.key);
        if (keyItem) {
          setSelectedUserKeyDetails(keyItem);
        }
      }
    } else {
      setSelectedUserKeyInfo(null);
    }
    
    setLoadingDetails(false);
  };

  const closeDetailsModal = () => {
    setSelectedUser(null);
    setSelectedUserDetails(null);
    setSelectedUserKeyDetails(null);
    setSelectedUserKeyInfo(null);
  };

  const openActionModal = (type: typeof actionModal.type, user: UserItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionModal({ type, user });
    setDaysToAdd("30");
    setBanReason("");
  };

  const closeActionModal = () => {
    setActionModal({ type: null, user: null });
  };

  const handleAction = async () => {
    if (!actionModal.user || !actionModal.type) return;

    // delete não precisa de key
    if (actionModal.type === "delete") {
      setActionLoading(true);
      const response = await deleteUser(actionModal.user.username);
      setActionLoading(false);
      if (response.success) {
        addToast({
          title: "Usuário Deletado",
          description: `Usuário ${actionModal.user.username} foi deletado permanentemente`,
          variant: "success",
        });
        fetchUsers();
        closeActionModal();
      } else {
        addToast({
          title: "Erro",
          description: response.message || "Erro ao deletar usuário",
          variant: "destructive",
        });
      }
      return;
    }

    if (!actionModal.user.key) {
      addToast({
        title: "Erro",
        description: "Usuario nao possui key vinculada",
        variant: "destructive",
      });
      return;
    }
    
    setActionLoading(true);
    let response;
    const keyCode = actionModal.user.key;
    let keyState: KeyInfoData | null = null;

    if (actionModal.type === "pause" || actionModal.type === "ban") {
      const stateResponse = await getKeyInfo(keyCode);
      if (stateResponse.success && stateResponse.data) {
        keyState = stateResponse.data;
      }
    }

    switch (actionModal.type) {
      case "resetHwid":
        response = await resetKeyHwid(keyCode);
        break;
      case "addDays":
        response = await addKeyDays(keyCode, parseInt(daysToAdd));
        break;
      case "pause":
        response = await pauseKey(keyCode, !(keyState?.status?.paused ?? false));
        break;
      case "ban":
        response = await banKey(keyCode, !(keyState?.status?.banned ?? false), banReason || undefined);
        break;
      case "unlink":
        response = await unlinkKey(keyCode);
        break;
    }
    setActionLoading(false);

    if (response?.success) {
      addToast({
        title: "Acao executada",
        description: `Operacao realizada com sucesso para ${actionModal.user.username}`,
        variant: "success",
      });
      fetchUsers();
      closeActionModal();
    } else {
      addToast({
        title: "Erro",
        description: response?.message || "Erro ao executar acao",
        variant: "destructive",
      });
    }
  };

  const getActionModalContent = () => {
    if (!actionModal.type || !actionModal.user) return null;

    switch (actionModal.type) {
      case "resetHwid":
        return {
          title: "Resetar HWID",
          description: `Tem certeza que deseja resetar o HWID de ${actionModal.user.username}? O usuario precisara vincular novamente.`,
          confirmText: "Resetar HWID",
          confirmVariant: "default" as const,
        };
      case "addDays":
        return {
          title: "Adicionar Dias",
          description: `Adicione dias de validade para ${actionModal.user.username}.`,
          confirmText: "Adicionar",
          confirmVariant: "default" as const,
          hasInput: true,
        };
      case "pause":
        return {
          title: "Alternar Pausa da Key",
          description: `Esta acao alterna o estado de pausa da key vinculada de ${actionModal.user.username}.`,
          confirmText: "Aplicar",
          confirmVariant: "default" as const,
        };
      case "ban":
        return {
          title: "Alternar Banimento da Key",
          description: `Esta acao alterna o banimento da key vinculada de ${actionModal.user.username}.`,
          confirmText: "Aplicar",
          confirmVariant: "destructive" as const,
          hasReasonInput: true,
        };
      case "unlink":
        return {
          title: "Desvincular Key",
          description: `Tem certeza que deseja desvincular a key do usuario ${actionModal.user.username}?`,
          confirmText: "Desvincular",
          confirmVariant: "default" as const,
        };
      case "delete":
        return {
          title: "Deletar Usuário",
          description: `Tem certeza que deseja deletar permanentemente o usuário ${actionModal.user.username}? Esta ação é irreversível e todos os dados vinculados serão perdidos.`,
          confirmText: "Deletar",
          confirmVariant: "destructive" as const,
        };
    }
  };

  const modalContent = getActionModalContent();

  return (
    <div className="min-h-screen">
      <Header
        title="Usuarios"
        description="Gerencie os usuarios vinculados ao sistema"
        onMenuClick={toggleSidebar}
      />

      <main className="p-6">
        {/* Search Bar */}
        <Card className="mb-6 animate-slide-down">
          <CardContent className="py-4">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por username ou key..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={loading}>
                Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users Stats */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} usuario(s) encontrado(s)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="bg-transparent"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <Card>
            <CardContent className="flex h-64 flex-col items-center justify-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                Nenhum usuario encontrado
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {users.map((user, index) => (
              <Card
                key={user.discordId}
                className="transition-colors hover:bg-muted/30 animate-slide-up opacity-0"
                style={{
                  animationDelay: `${index * 30}ms`,
                  animationFillMode: "forwards",
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div 
                      className="relative cursor-pointer"
                      onClick={() => handleUserClick(user)}
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl || "/placeholder.svg"}
                          alt={user.username}
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-border"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted ring-2 ring-border">
                          <Users className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
                        getUserStatus(user) === "active" ? "bg-success" :
                        getUserStatus(user) === "paused" ? "bg-warning" : "bg-destructive"
                      }`} />
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleUserClick(user)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">
                          {user.globalName || user.username}
                        </h3>
                        <StatusBadge status={getUserStatus(user)} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        @{user.username}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {user.username}
                        </span>
                        {user.key && (
                          <span className="flex items-center gap-1 font-mono">
                            <Key className="h-3 w-3" />
                            {user.key}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Key Badge on Desktop */}
                    <div className="hidden md:flex flex-col items-end gap-1">
                      {user.linkedAt && (
                        <span className="text-xs text-muted-foreground">
                          Vinculado em {new Date(user.linkedAt).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(user.key || user.username || "");
                        }}
                        className="bg-transparent"
                        title="Copiar key"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="bg-transparent"
                      >
                        <a
                          href={`https://discord.gg/G8jAjBTajJ`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Suporte no Discord"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>

                      {/* Actions Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="bg-transparent h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {user.key && (
                            <>
                              <DropdownMenuItem onClick={(e) => openActionModal("addDays", user, e)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar Dias
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => openActionModal("resetHwid", user, e)}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Resetar HWID
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => openActionModal("unlink", user, e)}>
                                <Unlink className="mr-2 h-4 w-4" />
                                Desvincular Key
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => openActionModal("pause", user, e)}>
                                {user.paused ? (
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
                                onClick={(e) => openActionModal("ban", user, e)}
                                className={user.banned ? "" : "text-destructive focus:text-destructive"}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                {user.banned ? "Desbanir" : "Banir"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => openActionModal("delete", user, e)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Deletar Usuário
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Ban Reason */}
                  {user.banned && user.banReason && (
                    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                      <p className="text-xs text-destructive">
                        <span className="font-medium">Motivo:</span> {user.banReason}
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

      {/* User Details Modal */}
      <Modal isOpen={!!selectedUser} onClose={closeDetailsModal}>
        <ModalHeader>
          <ModalTitle>Detalhes do Usuario</ModalTitle>
          <ModalDescription>
            {selectedUser?.globalName || selectedUser?.username}
          </ModalDescription>
        </ModalHeader>
        
        {selectedUser && (
          <div className="space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-4">
              {selectedUser.avatarUrl ? (
                <img
                  src={selectedUser.avatarUrl || "/placeholder.svg"}
                  alt={selectedUser.username}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted ring-2 ring-border">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h3 className="font-semibold">{selectedUser.globalName || selectedUser.username}</h3>
                <p className="text-sm text-muted-foreground">@{selectedUser.username}</p>
                <StatusBadge status={getUserStatus(selectedUser)} />
              </div>
            </div>

            {/* Key Details */}
            {loadingDetails ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedUser.key ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Key</p>
                    <p className="mt-1 font-mono text-sm">{selectedUser.key}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Produto</p>
                    <p className="mt-1 text-sm flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {selectedUserKeyDetails?.product?.name || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Expiracao</p>
                    <p className="mt-1 text-sm flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {selectedUserKeyDetails?.expiresAt
                        ? new Date(selectedUserKeyDetails.expiresAt).toLocaleDateString("pt-BR")
                        : selectedUserKeyInfo?.status?.pendingActivation
                        ? "Pendente (ativa no vinculo)"
                        : "Sem expiracao"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Vinculado em</p>
                    <p className="mt-1 text-sm flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {selectedUser.linkedAt 
                        ? new Date(selectedUser.linkedAt).toLocaleDateString("pt-BR")
                        : "-"}
                    </p>
                  </div>
                </div>

                {selectedUserKeyDetails?.hwid && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">HWID</p>
                    <p className="mt-1 font-mono text-xs truncate">{selectedUserKeyDetails.hwid}</p>
                  </div>
                )}

                {selectedUserKeyInfo?.productHash && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Product Hash</p>
                    <p className="mt-1 font-mono text-xs break-all">{selectedUserKeyInfo.productHash}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                Usuario sem key vinculada
              </p>
            )}
          </div>
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
                <label className="text-sm font-medium">Quantidade de dias</label>
                <Input
                  type="number"
                  value={daysToAdd}
                  onChange={(e) => setDaysToAdd(e.target.value)}
                  min="1"
                  max="365"
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
    </div>
  );
}
