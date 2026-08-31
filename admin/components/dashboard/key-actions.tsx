"use client";

import { useState } from "react";
import {
  ArrowPathIcon,
  LinkSlashIcon,
  CalendarDaysIcon,
  PauseIcon,
  PlayIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import {
  resetKeyHwid,
  unlinkKey,
  addKeyDays,
  pauseKey,
  banKey,
  deleteKey,
  type KeyActionResponse,
} from "@/lib/api";

interface KeyActionsProps {
  licenseKey: string;
  keyId: string;
  currentStatus?: {
    paused?: boolean;
    banned?: boolean;
  };
  onActionComplete?: (response: KeyActionResponse, actionType: string) => void;
  onDelete?: () => void;
}

export function KeyActions({
  licenseKey,
  keyId,
  currentStatus,
  onActionComplete,
  onDelete,
}: KeyActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [showDaysModal, setShowDaysModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [daysValue, setDaysValue] = useState(7);
  const [banReason, setBanReason] = useState("");
  const { addToast } = useToast();

  const handleResetHwid = async () => {
    setLoading("reset");
    const response = await resetKeyHwid(licenseKey);
    setLoading(null);
    setShowResetModal(false);

    if (response.success) {
      addToast({
        title: "HWID Resetado",
        description: `Key ${response.data?.licenseKeyMasked} teve o HWID limpo`,
        variant: "success",
      });
      if (response.data) onActionComplete?.(response.data, "reset_hwid");
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleUnlink = async () => {
    setLoading("unlink");
    const response = await unlinkKey(licenseKey);
    setLoading(null);
    setShowUnlinkModal(false);

    if (response.success) {
      addToast({
        title: "Key Desvinculada",
        description: `Key ${response.data?.licenseKeyMasked} foi desvinculada completamente`,
        variant: "success",
      });
      if (response.data) onActionComplete?.(response.data, "unlink");
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleAddDays = async () => {
    setLoading("days");
    const response = await addKeyDays(licenseKey, daysValue);
    setLoading(null);
    setShowDaysModal(false);

    if (response.success) {
      addToast({
        title: "Dias Atualizados",
        description: `${daysValue > 0 ? "Adicionados" : "Removidos"} ${Math.abs(daysValue)} dias. Nova expiracao: ${new Date(response.data?.expiresAt || "").toLocaleDateString("pt-BR")}`,
        variant: "success",
      });
      if (response.data) onActionComplete?.(response.data, "add_days");
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleTogglePause = async () => {
    const newPaused = !currentStatus?.paused;
    setLoading("pause");
    const response = await pauseKey(licenseKey, newPaused);
    setLoading(null);

    if (response.success) {
      addToast({
        title: newPaused ? "Key Pausada" : "Key Ativada",
        description: `Key ${response.data?.licenseKeyMasked} foi ${newPaused ? "pausada" : "reativada"}`,
        variant: "success",
      });
      if (response.data) onActionComplete?.(response.data, "pause");
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleBan = async () => {
    if (!banReason.trim() && !currentStatus?.banned) {
      addToast({
        title: "Motivo Obrigatório",
        description: "Informe o motivo do ban",
        variant: "warning",
      });
      return;
    }

    const newBanned = !currentStatus?.banned;
    setLoading("ban");
    const response = await banKey(licenseKey, newBanned, banReason);
    setLoading(null);
    setShowBanModal(false);
    setBanReason("");

    if (response.success) {
      addToast({
        title: newBanned ? "Key Banida" : "Ban Removido",
        description: `Key ${response.data?.licenseKeyMasked} foi ${newBanned ? "banida" : "desbanida"}`,
        variant: newBanned ? "destructive" : "success",
      });
      if (response.data) onActionComplete?.(response.data, "ban");
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    setLoading("delete");
    const response = await deleteKey(keyId);
    setLoading(null);
    setShowDeleteModal(false);

    if (response.success) {
      addToast({
        title: "Key Deletada",
        description: `A key foi deletada permanentemente`,
        variant: "success",
      });
      onDelete?.();
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Reset HWID */}
        <Button
          variant="outline"
          className="justify-start gap-2 bg-transparent"
          onClick={() => setShowResetModal(true)}
          disabled={loading === "reset"}
        >
          <ArrowPathIcon className="h-4 w-4" />
          Reset HWID
        </Button>

        {/* Unlink */}
        <Button
          variant="outline"
          className="justify-start gap-2 bg-transparent"
          onClick={() => setShowUnlinkModal(true)}
          disabled={loading === "unlink"}
        >
          <LinkSlashIcon className="h-4 w-4" />
          Desvincular
        </Button>

        {/* Add Days */}
        <Button
          variant="outline"
          className="justify-start gap-2 bg-transparent"
          onClick={() => setShowDaysModal(true)}
          disabled={loading === "days"}
        >
          <CalendarDaysIcon className="h-4 w-4" />
          Adicionar Dias
        </Button>

        {/* Pause/Resume */}
        <Button
          variant="outline"
          className="justify-start gap-2 bg-transparent"
          onClick={handleTogglePause}
          disabled={loading === "pause"}
        >
          {currentStatus?.paused ? (
            <>
              <PlayIcon className="h-4 w-4" />
              Despausar
            </>
          ) : (
            <>
              <PauseIcon className="h-4 w-4" />
              Pausar
            </>
          )}
        </Button>

        {/* Ban/Unban */}
        <Button
          variant={currentStatus?.banned ? "outline" : "destructive"}
          className={`justify-start gap-2 ${currentStatus?.banned ? "bg-transparent" : ""}`}
          onClick={() =>
            currentStatus?.banned ? handleBan() : setShowBanModal(true)
          }
          disabled={loading === "ban"}
        >
          {currentStatus?.banned ? (
            <>
              <ShieldCheckIcon className="h-4 w-4" />
              Remover Ban
            </>
          ) : (
            <>
              <NoSymbolIcon className="h-4 w-4" />
              Banir Key
            </>
          )}
        </Button>

        {/* Delete */}
        <Button
          variant="destructive"
          className="justify-start gap-2 sm:col-span-2 lg:col-span-3"
          onClick={() => setShowDeleteModal(true)}
          disabled={loading === "delete"}
        >
          <TrashIcon className="h-4 w-4" />
          Deletar Key Permanentemente
        </Button>
      </div>

      {/* Reset HWID Modal */}
      <ConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleResetHwid}
        title="Resetar HWID"
        description={`Tem certeza que deseja resetar o HWID da key? O cliente poderá vincular um novo dispositivo.`}
        confirmText="Resetar HWID"
        isLoading={loading === "reset"}
      />

      {/* Unlink Modal */}
      <ConfirmModal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        onConfirm={handleUnlink}
        title="Desvincular Key"
        description="Esta ação irá remover: HWID, Discord vinculado e registro de usuário. Esta ação é irreversível."
        confirmText="Desvincular"
        variant="destructive"
        isLoading={loading === "unlink"}
      />

      {/* Add Days Modal */}
      <Modal
        isOpen={showDaysModal}
        onClose={() => setShowDaysModal(false)}
        title="Adicionar/Remover Dias"
        description="Informe quantos dias deseja adicionar ou remover da licença"
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              Quantidade de dias
            </label>
            <Input
              type="number"
              value={daysValue}
              onChange={(e) => setDaysValue(Number(e.target.value))}
              className="mt-1"
              placeholder="Ex: 7 ou -3"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use valores negativos para remover dias
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDaysModal(false)}
              className="bg-transparent"
            >
              Cancelar
            </Button>
            <Button onClick={handleAddDays} disabled={loading === "days"}>
              {loading === "days" ? "Processando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Ban Modal */}
      <Modal
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        title="Banir Key"
        description="Informe o motivo do ban (obrigatório)"
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              Motivo do ban
            </label>
            <Input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="mt-1"
              placeholder="Ex: Chargeback, Abuso, etc."
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowBanModal(false)}
              className="bg-transparent"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBan}
              disabled={loading === "ban" || !banReason.trim()}
            >
              {loading === "ban" ? "Processando..." : "Banir Key"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Deletar Key"
        description="Tem certeza que deseja deletar permanentemente esta key? Esta ação é irreversível e todos os dados vinculados serão perdidos."
        confirmText="Deletar"
        variant="destructive"
        isLoading={loading === "delete"}
      />
    </>
  );
}
