"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/header";
import { useSidebar } from "../layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import {
  RectangleStackIcon as Layers,
  PauseIcon as Pause,
  PlayIcon as Play,
  ArrowPathIcon as RotateCcw,
  CalendarDaysIcon as Calendar,
  ExclamationTriangleIcon as AlertTriangle,
  TrashIcon as Trash2,
} from "@heroicons/react/24/solid";
import {
  pauseAllActiveKeys,
  resetAllHwid,
  addDaysToAllActiveKeys,
  deleteKeysByStatus,
} from "@/lib/api";

interface BulkAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Pause;
  variant: "default" | "destructive" | "warning";
  action: () => Promise<void>;
}

export default function BulkActionsPage() {
 const { toggle: toggleSidebar } = useSidebar();
  const [loading, setLoading] = useState<string | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDaysModal, setShowDaysModal] = useState(false);
  const [showDeleteExpiredModal, setShowDeleteExpiredModal] = useState(false);
  const [showDeleteInactiveModal, setShowDeleteInactiveModal] = useState(false);
  const [daysValue, setDaysValue] = useState(7);
  const [lastResult, setLastResult] = useState<{
    matched: number;
    modified: number;
  } | null>(null);
  const { addToast } = useToast();

  const handlePauseAll = async () => {
    setLoading("pause");
    const response = await pauseAllActiveKeys(true);
    setLoading(null);
    setShowPauseModal(false);

    if (response.success && response.data) {
      setLastResult(response.data);
      addToast({
        title: "Keys Pausadas",
        description: `${response.data.modified} licenças foram pausadas`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleResumeAll = async () => {
    setLoading("resume");
    const response = await pauseAllActiveKeys(false);
    setLoading(null);
    setShowResumeModal(false);

    if (response.success && response.data) {
      setLastResult(response.data);
      addToast({
        title: "Keys Ativadas",
        description: `${response.data.modified} licenças foram reativadas`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleResetAllHwid = async () => {
    setLoading("reset");
    const response = await resetAllHwid();
    setLoading(null);
    setShowResetModal(false);

    if (response.success && response.data) {
      setLastResult(response.data);
      addToast({
        title: "HWIDs Resetados",
        description: `${response.data.modified} licenças tiveram HWID limpo`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleAddDaysAll = async () => {
    setLoading("days");
    const response = await addDaysToAllActiveKeys(daysValue);
    setLoading(null);
    setShowDaysModal(false);

    if (response.success && response.data) {
      setLastResult(response.data);
      addToast({
        title: "Dias Atualizados",
        description: `${response.data.modified} licenças receberam ${daysValue} dias`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteExpiredKeys = async () => {
    setLoading("delete-expired");
    const response = await deleteKeysByStatus("expired");
    setLoading(null);
    setShowDeleteExpiredModal(false);

    if (response.success && response.data) {
      setLastResult({ matched: response.data.matched, modified: response.data.deleted });
      addToast({
        title: "Expiradas removidas",
        description: `${response.data.deleted} licenças expiradas foram deletadas`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteInactiveKeys = async () => {
    setLoading("delete-inactive");
    const response = await deleteKeysByStatus("inactive");
    setLoading(null);
    setShowDeleteInactiveModal(false);

    if (response.success && response.data) {
      setLastResult({ matched: response.data.matched, modified: response.data.deleted });
      addToast({
        title: "Inativas removidas",
        description: `${response.data.deleted} licenças inativas foram deletadas`,
        variant: "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Ações em Massa"
        description="Execute operações em todas as keys ativas"
        onMenuClick={toggleSidebar}
      />

      <main className="p-6">
        {/* Warning Banner */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 animate-slide-down">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">Atenção!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Estas ações afetam TODAS as licenças ativas do sistema. Use com
              cautela e sempre confirme antes de executar.
            </p>
          </div>
        </div>

        {/* Last Result */}
        {lastResult && (
          <Card className="mb-6 border-success/30 bg-success/5 animate-scale-in">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Última operação
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {lastResult.modified} de {lastResult.matched} licenças
                    modificadas
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLastResult(null)}
                >
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Pause All */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "0ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-warning/10 p-2">
                  <Pause className="h-5 w-5 text-warning" />
                </div>
                Pausar Todas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pausa todas as licenças ativas do sistema. Os usuários não
                poderão utilizar suas keys até serem reativadas.
              </p>
              <Button
                className="mt-4 w-full bg-transparent"
                variant="outline"
                onClick={() => setShowPauseModal(true)}
                disabled={loading === "pause"}
              >
                {loading === "pause" ? "Processando..." : "Pausar Todas as Keys"}
              </Button>
            </CardContent>
          </Card>

          {/* Resume All */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-success/10 p-2">
                  <Play className="h-5 w-5 text-success" />
                </div>
                Despausar Todas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Reativa todas as licenças que estão pausadas. Os usuários
                voltarão a ter acesso normal.
              </p>
              <Button
                className="mt-4 w-full bg-transparent"
                variant="outline"
                onClick={() => setShowResumeModal(true)}
                disabled={loading === "resume"}
              >
                {loading === "resume" ? "Processando..." : "Ativar Todas as Keys"}
              </Button>
            </CardContent>
          </Card>

          {/* Reset All HWID */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-muted p-2">
                  <RotateCcw className="h-5 w-5 text-foreground" />
                </div>
                Reset HWID Global
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Limpa o HWID de todas as licenças ativas. Útil após grandes
                atualizações do sistema.
              </p>
              <Button
                className="mt-4 w-full bg-transparent"
                variant="outline"
                onClick={() => setShowResetModal(true)}
                disabled={loading === "reset"}
              >
                {loading === "reset" ? "Processando..." : "Resetar Todos os HWIDs"}
              </Button>
            </CardContent>
          </Card>

          {/* Add Days All */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-muted p-2">
                  <Calendar className="h-5 w-5 text-foreground" />
                </div>
                Adicionar Dias Global
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Adiciona dias extras para todas as licenças ativas. Ideal para
                promoções ou compensações.
              </p>
              <Button
                className="mt-4 w-full bg-transparent"
                variant="outline"
                onClick={() => setShowDaysModal(true)}
                disabled={loading === "days"}
              >
                {loading === "days" ? "Processando..." : "Adicionar Dias"}
              </Button>
            </CardContent>
          </Card>

          {/* Delete Expired */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                Deletar Expiradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Remove todas as licenças expiradas do banco de dados. Ação permanente.
              </p>
              <Button
                className="mt-4 w-full"
                variant="destructive"
                onClick={() => setShowDeleteExpiredModal(true)}
                disabled={loading === "delete-expired"}
              >
                {loading === "delete-expired" ? "Processando..." : "Deletar Keys Expiradas"}
              </Button>
            </CardContent>
          </Card>

          {/* Delete Inactive */}
          <Card className="animate-slide-up opacity-0" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                Deletar Inativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Remove licenças inativas (pausadas, banidas, pendentes ou expiradas). Ação permanente.
              </p>
              <Button
                className="mt-4 w-full"
                variant="destructive"
                onClick={() => setShowDeleteInactiveModal(true)}
                disabled={loading === "delete-inactive"}
              >
                {loading === "delete-inactive" ? "Processando..." : "Deletar Keys Inativas"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modals */}
      <ConfirmModal
        isOpen={showPauseModal}
        onClose={() => setShowPauseModal(false)}
        onConfirm={handlePauseAll}
        title="Pausar Todas as Keys"
        description="Tem certeza que deseja pausar TODAS as licenças ativas? Esta ação pode ser revertida posteriormente."
        confirmText="Sim, Pausar Todas"
        variant="destructive"
        isLoading={loading === "pause"}
      />

      <ConfirmModal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        onConfirm={handleResumeAll}
        title="Despausar Todas as Keys"
        description="Tem certeza que deseja reativar todas as licenças pausadas?"
        confirmText="Sim, Ativar Todas"
        isLoading={loading === "resume"}
      />

      <ConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleResetAllHwid}
        title="Reset HWID Global"
        description="Tem certeza que deseja resetar o HWID de TODAS as licenças? Todos os usuários precisarão vincular novamente seus dispositivos."
        confirmText="Sim, Resetar Todos"
        variant="destructive"
        isLoading={loading === "reset"}
      />

      <ConfirmModal
        isOpen={showDeleteExpiredModal}
        onClose={() => setShowDeleteExpiredModal(false)}
        onConfirm={handleDeleteExpiredKeys}
        title="Deletar Keys Expiradas"
        description="Tem certeza que deseja deletar TODAS as keys expiradas? Esta ação não pode ser desfeita."
        confirmText="Sim, Deletar Expiradas"
        variant="destructive"
        isLoading={loading === "delete-expired"}
      />

      <ConfirmModal
        isOpen={showDeleteInactiveModal}
        onClose={() => setShowDeleteInactiveModal(false)}
        onConfirm={handleDeleteInactiveKeys}
        title="Deletar Keys Inativas"
        description="Tem certeza que deseja deletar TODAS as keys inativas? Esta ação não pode ser desfeita."
        confirmText="Sim, Deletar Inativas"
        variant="destructive"
        isLoading={loading === "delete-inactive"}
      />

      {/* Days Modal with Input */}
      {showDaysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowDaysModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-scale-in">
            <h2 className="text-lg font-semibold">Adicionar Dias Global</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Quantos dias deseja adicionar para todas as licenças ativas?
            </p>
            <div className="mt-4">
              <label className="text-sm text-muted-foreground">
                Quantidade de dias
              </label>
              <Input
                type="number"
                value={daysValue}
                onChange={(e) => setDaysValue(Number(e.target.value))}
                className="mt-1"
                min={1}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDaysModal(false)}
                className="bg-transparent"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddDaysAll}
                disabled={loading === "days" || daysValue < 1}
              >
                {loading === "days" ? "Processando..." : `Adicionar ${daysValue} dias`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
