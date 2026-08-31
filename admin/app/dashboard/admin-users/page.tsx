"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/header";
import { useSidebar } from "../layout";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ownerListAdmins,
  ownerCreateAdmin,
  ownerUpdateAdmin,
  type OwnerAdminUser,
} from "@/lib/api";
import { ArrowPathIcon as Loader2, ShieldCheckIcon as UserCog } from "@heroicons/react/24/solid";

const ROLE_OPTIONS = ["OWNER", "SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"] as const;
const STATUS_OPTIONS = ["ACTIVE", "DISABLED"] as const;

export default function AdminUsersPage() {
  const { toggle: toggleSidebar } = useSidebar();
  const { admin } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<OwnerAdminUser[]>([]);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("ADMIN");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ACTIVE");

  const isOwner = admin?.role === "OWNER";

  const fetchAdmins = async () => {
    setLoading(true);
    const response = await ownerListAdmins();
    if (response.success && response.data) {
      setItems(response.data.items);
    } else {
      addToast({
        title: "Erro",
        description: response.message || "Falha ao carregar admins",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOwner) {
      void fetchAdmins();
    } else {
      setLoading(false);
    }
  }, [isOwner]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setSaving(true);
    const response = await ownerCreateAdmin({
      username: username.trim(),
      password,
      displayName: displayName.trim() || undefined,
      role,
      status,
    });
    setSaving(false);

    if (response.success) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("ADMIN");
      setStatus("ACTIVE");
      addToast({ title: "Sucesso", description: "Admin criado com sucesso", variant: "success" });
      await fetchAdmins();
    } else {
      addToast({
        title: "Erro ao criar",
        description: response.message || "Falha ao criar admin",
        variant: "destructive",
      });
    }
  };

  const toggleStatus = async (item: OwnerAdminUser) => {
    setSaving(true);
    const next = item.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const response = await ownerUpdateAdmin(item.id, { status: next });
    setSaving(false);

    if (response.success) {
      addToast({ title: "Atualizado", description: `Status alterado para ${next}`, variant: "success" });
      await fetchAdmins();
    } else {
      addToast({ title: "Erro", description: response.message || "Falha ao atualizar", variant: "destructive" });
    }
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen">
        <Header title="Admins" description="Acesso restrito ao OWNER" onMenuClick={toggleSidebar} />
        <main className="p-6">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Apenas OWNER pode acessar esta área.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Admins"
        description="Criar e gerenciar usuários administrativos"
        onMenuClick={toggleSidebar}
      />

      <main className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Criar novo admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={saving}
              />
              <Input
                placeholder="Nome de exibição"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={saving}
              />
              <Input
                placeholder="Senha (mínimo 10)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={saving}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={saving}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                disabled={saving || !username.trim() || !password.trim()}
                className="md:col-span-2"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Criar admin
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admins cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum admin cadastrado.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        @{item.username} • {item.role} • {item.status}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void toggleStatus(item)}
                      disabled={saving || item.role === "OWNER"}
                      className="bg-transparent"
                    >
                      {item.status === "ACTIVE" ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
