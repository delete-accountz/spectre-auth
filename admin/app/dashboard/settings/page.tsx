"use client";

import React from "react";

import { useState, useEffect } from "react";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-provider";
import { useSidebar } from "../layout";
import {
  Cog6ToothIcon as Settings,
  ExclamationTriangleIcon as AlertTriangle,
  CheckCircleIcon as CheckCircle,
  PowerIcon as Power,
  ShieldCheckIcon as Shield,
  LockClosedIcon as Lock,
  KeyIcon as Key,
  GlobeAltIcon as Globe,
  BellIcon as Bell,
  CircleStackIcon as Database,
  ClipboardDocumentIcon as Copy,
  ArrowPathIcon as RefreshCw,
  ArrowPathIcon as Loader2,
  BookmarkSquareIcon as Save,
  LinkIcon as Webhook,
} from "@heroicons/react/24/solid";
import {
  setMaintenance,
  getSettings,
  getPrivacySettings,
  setPrivacySettings,
  getSecuritySettings,
  setSecuritySettings,
  getWebhookSettings,
  setWebhookSettings,
  type SettingsData,
  type PrivacySettings,
  type SecuritySettings,
  type WebhookSettings,
} from "@/lib/api";

export default function SettingsPage() {
  const { toggle: toggleSidebar, sidebarOpen, setSidebarOpen } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);

  // Maintenance mode state
  const [isMaintenanceEnabled, setIsMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    "Sistema em manutencao, voltamos em breve."
  );

  // Privacy Settings
  const [privacySettings, setPrivacySettingsState] = useState<PrivacySettings | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // Security Settings
  const [securitySettings, setSecuritySettingsState] = useState<SecuritySettings | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  // Webhook Settings
  const [webhookSettings, setWebhookSettingsState] = useState<WebhookSettings | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookUsername, setWebhookUsername] = useState("");
  const [webhookAvatarUrl, setWebhookAvatarUrl] = useState("");
  const [webhookMinLevel, setWebhookMinLevel] = useState<"INFO" | "WARN" | "ERROR">("INFO");
  const [webhookAllowSensitive, setWebhookAllowSensitive] = useState(false);

  const { addToast } = useToast();

  const fetchSettings = async () => {
    setLoading(true);

    // Fetch all settings in parallel
    const [settingsRes, privacyRes, securityRes, webhookRes] = await Promise.all([
      getSettings(),
      getPrivacySettings(),
      getSecuritySettings(),
      getWebhookSettings(),
    ]);

    if (settingsRes.success && settingsRes.data) {
      setSettings(settingsRes.data);
    }

    if (privacyRes.success && privacyRes.data) {
      setPrivacySettingsState(privacyRes.data);
    }

    if (securityRes.success && securityRes.data) {
      setSecuritySettingsState(securityRes.data);
    }

    if (webhookRes.success && webhookRes.data) {
      setWebhookSettingsState(webhookRes.data);
      setWebhookUrl(webhookRes.data.url || "");
      setWebhookUsername(webhookRes.data.username || "");
      setWebhookAvatarUrl(webhookRes.data.avatarUrl || "");
      setWebhookMinLevel(webhookRes.data.minLevel);
      setWebhookAllowSensitive(webhookRes.data.allowSensitive);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggleMaintenance = async () => {
    setMaintenanceLoading(true);
    const response = await setMaintenance(!isMaintenanceEnabled, maintenanceMessage);
    setMaintenanceLoading(false);

    if (response.success && response.data) {
      setIsMaintenanceEnabled(response.data.enabled);
      addToast({
        title: response.data.enabled ? "Manutencao Ativada" : "Manutencao Desativada",
        description: response.data.enabled
          ? "O sistema esta agora em modo de manutencao"
          : "O sistema voltou ao funcionamento normal",
        variant: response.data.enabled ? "warning" : "success",
      });
    } else {
      addToast({
        title: "Erro",
        description: response.message,
        variant: "destructive",
      });
    }
  };

  const handleTogglePrivacy = async () => {
    if (!privacySettings) return;
    setPrivacyLoading(true);
    const newValue = !privacySettings.censorEnabled;
    const response = await setPrivacySettings(newValue);
    setPrivacyLoading(false);

    if (response.success && response.data) {
      setPrivacySettingsState(response.data);
      addToast({
        title: newValue ? "Censura Ativada" : "Censura Desativada",
        description: newValue
          ? "Dados sensiveis serao ocultados nas respostas"
          : "Dados sensiveis serao exibidos normalmente",
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

  const handleToggleSecurity = async () => {
    if (!securitySettings) return;
    setSecurityLoading(true);
    const newValue = !securitySettings.hwidLockGlobal;
    const response = await setSecuritySettings(newValue);
    setSecurityLoading(false);

    if (response.success && response.data) {
      setSecuritySettingsState(response.data);
      addToast({
        title: newValue ? "HWID Lock Global Ativado" : "HWID Lock Global Desativado",
        description: newValue
          ? "Todas as keys serao vinculadas ao hardware"
          : "HWID Lock desativado globalmente",
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

  const handleSaveWebhook = async () => {
    setWebhookLoading(true);
    const response = await setWebhookSettings({
      enabled: webhookSettings?.enabled ?? false,
      url: webhookUrl || null,
      username: webhookUsername || null,
      avatarUrl: webhookAvatarUrl || null,
      minLevel: webhookMinLevel,
      allowSensitive: webhookAllowSensitive,
    });
    setWebhookLoading(false);

    if (response.success && response.data) {
      setWebhookSettingsState(response.data);
      addToast({
        title: "Webhook Atualizado",
        description: "Configuracoes do webhook salvas com sucesso",
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

  const handleToggleWebhook = async () => {
    if (!webhookSettings) return;
    setWebhookLoading(true);
    const newValue = !webhookSettings.enabled;
    const response = await setWebhookSettings({ enabled: newValue });
    setWebhookLoading(false);

    if (response.success && response.data) {
      setWebhookSettingsState(response.data);
      addToast({
        title: newValue ? "Webhook Ativado" : "Webhook Desativado",
        description: newValue
          ? "Notificacoes Discord ativadas"
          : "Notificacoes Discord desativadas",
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast({
      title: "Copiado!",
      description: `${label} copiado para a area de transferencia`,
      variant: "success",
    });
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Configuracoes"
        description="Gerencie as configuracoes do sistema, seguranca e webhooks"
        onMenuClick={toggleSidebar}
        isMaintenanceMode={isMaintenanceEnabled}
      />

      <main className="p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Maintenance Mode Section */}
            <Card
              className={`transition-all duration-300 animate-slide-down ${
                isMaintenanceEnabled
                  ? "border-warning/30 bg-warning/5"
                  : "border-success/30 bg-success/5"
              }`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Power className="h-5 w-5" />
                  Modo de Manutencao
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`rounded-full p-3 ${
                        isMaintenanceEnabled ? "bg-warning/20" : "bg-success/20"
                      }`}
                    >
                      {isMaintenanceEnabled ? (
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-success" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {isMaintenanceEnabled ? "Em Manutencao" : "Sistema Operacional"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isMaintenanceEnabled
                          ? "Todas as requisicoes estao retornando 503"
                          : "API funcionando normalmente"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isMaintenanceEnabled}
                    onCheckedChange={handleToggleMaintenance}
                    disabled={maintenanceLoading}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Mensagem de Manutencao</label>
                  <Input
                    type="text"
                    value={maintenanceMessage}
                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                    className="mt-2"
                    placeholder="Ex: Atualizacao do sistema..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security & Privacy Settings */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Security Settings */}
              <Card className="animate-slide-up opacity-0" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    Seguranca
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">HWID Lock Global</p>
                        <p className="text-sm text-muted-foreground">
                          Vincular todas as keys ao hardware
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={securitySettings?.hwidLockGlobal ?? false}
                      onCheckedChange={handleToggleSecurity}
                      disabled={securityLoading}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Modo Censura (Privacy)</p>
                        <p className="text-sm text-muted-foreground">
                          Ocultar dados sensiveis nas respostas
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={privacySettings?.censorEnabled ?? false}
                      onCheckedChange={handleTogglePrivacy}
                      disabled={privacyLoading}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* API Info */}
              <Card className="animate-slide-up opacity-0" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    Informacoes da API
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow
                    label="Base URL"
                    value={settings?.apiBaseUrl || "https://api.safetyauth.xyz"}
                    onCopy={(v) => copyToClipboard(v, "Base URL")}
                  />
                  <InfoRow label="Versao" value={settings?.apiVersion || "v2.0.0"} />
                  <InfoRow label="Rate Limit" value={`${settings?.rateLimit || 100} req/min`} />
                  <InfoRow label="Timeout" value={`${settings?.timeout || 30}s`} />
                </CardContent>
              </Card>
            </div>

            {/* Webhook Settings */}
            <Card className="animate-slide-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Webhook className="h-5 w-5 text-muted-foreground" />
                  Webhook Discord
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    webhookSettings?.enabled 
                      ? "bg-success/10 text-success" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {webhookSettings?.enabled ? "Ativo" : "Inativo"}
                  </span>
                  <Switch
                    checked={webhookSettings?.enabled ?? false}
                    onCheckedChange={handleToggleWebhook}
                    disabled={webhookLoading}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium">Webhook URL</label>
                    <Input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Username do Bot</label>
                    <Input
                      type="text"
                      value={webhookUsername}
                      onChange={(e) => setWebhookUsername(e.target.value)}
                      placeholder="SpectreAuth"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Avatar URL</label>
                    <Input
                      type="url"
                      value={webhookAvatarUrl}
                      onChange={(e) => setWebhookAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Nivel Minimo</label>
                    <select
                      value={webhookMinLevel}
                      onChange={(e) => setWebhookMinLevel(e.target.value as "INFO" | "WARN" | "ERROR")}
                      className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="INFO">INFO - Todas as notificacoes</option>
                      <option value="WARN">WARN - Avisos e erros</option>
                      <option value="ERROR">ERROR - Apenas erros</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium">Dados Sensiveis</p>
                      <p className="text-xs text-muted-foreground">Incluir keys/HWID nas notificacoes</p>
                    </div>
                    <Switch
                      checked={webhookAllowSensitive}
                      onCheckedChange={setWebhookAllowSensitive}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSaveWebhook}
                  disabled={webhookLoading}
                  className="w-full sm:w-auto"
                >
                  {webhookLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar Webhook
                </Button>
              </CardContent>
            </Card>

            {/* Database Stats */}
            <Card className="animate-slide-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  Status do Banco de Dados
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSettings}
                  className="bg-transparent"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Total de Keys"
                    value={settings?.stats?.totalKeys?.toString() || "-"}
                    icon={Key}
                  />
                  <StatCard
                    label="Keys Ativas"
                    value={settings?.stats?.activeKeys?.toString() || "-"}
                    icon={CheckCircle}
                    color="success"
                  />
                  <StatCard
                    label="Usuarios"
                    value={settings?.stats?.totalUsers?.toString() || "-"}
                    icon={Shield}
                  />
                  <StatCard
                    label="Produtos"
                    value={settings?.stats?.totalProducts?.toString() || "-"}
                    icon={Database}
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Keys Pendentes"
                    value={settings?.stats?.pendingKeys?.toString() || "0"}
                    icon={AlertTriangle}
                    color="warning"
                  />
                  <StatCard
                    label="Keys Expiradas"
                    value={settings?.stats?.expiredKeys?.toString() || "0"}
                    icon={Bell}
                    color="destructive"
                  />
                  <StatCard
                    label="Users Vinculados"
                    value={settings?.stats?.uniqueLinkedUsers?.toString() || "0"}
                    icon={Shield}
                  />
                  <StatCard
                    label="Vínculos Produto"
                    value={settings?.stats?.linkedUserProducts?.toString() || "0"}
                    icon={Database}
                  />
                </div>

                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Conexão MongoDB</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <span className="text-muted-foreground">Estado: <strong className="text-foreground">{settings?.system?.dbState || "-"}</strong></span>
                    <span className="text-muted-foreground">ReadyState: <strong className="text-foreground">{settings?.system?.dbReadyState ?? "-"}</strong></span>
                    <span className="text-muted-foreground">Host: <strong className="text-foreground">{settings?.system?.dbHost || "-"}</strong></span>
                    <span className="text-muted-foreground">Database: <strong className="text-foreground">{settings?.system?.dbName || "-"}</strong></span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{value}</span>
        {onCopy && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 bg-transparent"
            onClick={() => onCopy(value)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color?: "success" | "warning" | "destructive";
}) {
  const colorClasses = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color ? colorClasses[color] : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${color ? colorClasses[color] : ""}`}>
        {value}
      </p>
    </div>
  );
}
