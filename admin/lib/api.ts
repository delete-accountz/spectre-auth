const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://safetyapi.squareweb.app").replace(/\/$/, "");
const ADMIN_CSRF_STORAGE_KEY = "admin_csrf_token";
const ADMIN_OWNER_TOKEN_STORAGE_KEY = "admin_owner_token";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: unknown;
  };
  requestId?: string;
  timestamp?: string;
}

export interface AdminAuthProfile {
  id: string | null;
  username: string;
  displayName: string;
  role: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
  permissions: string[];
}

export interface AdminAuthData {
  mode: "session" | "owner-token";
  csrfToken?: string;
  sessionExpiresAt?: string;
  admin: AdminAuthProfile;
}

export interface OwnerAdminUser {
  id: string;
  username: string;
  displayName: string;
  role: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
  permissions: string[];
  status: "ACTIVE" | "DISABLED";
  failedLogins: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function getStoredAdminCsrf(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ADMIN_CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredAdminCsrf(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!token) {
      localStorage.removeItem(ADMIN_CSRF_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ADMIN_CSRF_STORAGE_KEY, token);
  } catch {}
}

function getStoredOwnerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ADMIN_OWNER_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredOwnerToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!token) {
      localStorage.removeItem(ADMIN_OWNER_TOKEN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ADMIN_OWNER_TOKEN_STORAGE_KEY, token);
  } catch {}
}

export interface OverviewData {
  keys: number;
  users: number;
  products: number;
  activeKeys: number;
  pausedKeys?: number;
  bannedKeys?: number;
  expiredKeys?: number;
  pendingKeys?: number;
  expiringSoon?: number;
  linkedUserProducts?: number;
  uniqueLinkedUsers?: number;
  logWriteHealth?: {
    ok?: boolean;
    lastError?: string | null;
    at?: string | null;
    event?: string | null;
  };
}

export interface LogWriteHealth {
  ok?: boolean;
  lastError?: string | null;
  at?: string | null;
  event?: string | null;
  requestId?: string | null;
}

export interface KeyActionResponse {
  licenseKeyMasked: string;
  expiresAt?: string;
  paused?: boolean;
  banned?: boolean;
  reason?: string;
  oldDiscordId?: string;
}

export interface KeyInfoData {
  licenseKey: string | null;
  licenseKeyMasked: string;
  productId: string | null;
  productName?: string | null;
  productHash?: string | null;
  status: {
    paused: boolean;
    banned: boolean;
    expired: boolean;
    pendingActivation?: boolean;
  };
  hwid?: string;
  discordId?: string;
  durationDays?: number | null;
  activatedAt?: string | null;
  expiresAt?: string;
  createdAt?: string;
  lastUsed?: string;
  banReason?: string;
}

export interface BulkActionResponse {
  matched: number;
  modified: number;
}

export interface MaintenanceData {
  enabled: boolean;
  message: string;
}

// Products
export interface Product {
  id: string;
  _id: string;
  name: string;
  productHash: string;
  hwidLockEnabled?: boolean;
  keysCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function getProductId(product: Pick<Product, "id" | "_id">): string {
  return product.id || product._id;
}

export interface ProductsResponse {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: Product[];
}

// Keys List
export interface KeyItem {
  id: string;
  prefix: string;
  code: string;
  product: { id: string; name: string } | null;
  createdAt: string;
  durationDays?: number | null;
  activatedAt?: string | null;
  expiresAt: string | null;
  productHash?: string | null;
  usedBy: string | null;
  usedAt: string | null;
  hwid: string | null;
  paused: boolean;
  banned: boolean;
  banReason: string | null;
}

export interface KeysResponse {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: KeyItem[];
}

// Users
export interface UserItem {
  discordId: string;
  key: string;
  linkedAt: string | null;
  productLinks?: Array<{
    productId: string | null;
    key: string | null;
    linkedAt: string | null;
    expiresAt: string | null;
    productHash?: string | null;
  }>;
  username: string;
  globalName: string;
  tag: string;
  avatarUrl: string;
  fetchedAt: string | null;
  paused: boolean;
  banned: boolean;
  banReason: string | null;
}

export interface UsersResponse {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: UserItem[];
}

export interface SyncDiscordResponse {
  user: {
    discordId: string;
    discordUsername: string;
    discordGlobalName: string;
    discordTag: string;
    discordAvatarUrl: string;
    discordFetchedAt: string;
  };
  member: {
    nick: string | null;
    rolesCount: number | null;
  };
}

// Audit Logs
export interface AuditLogItem {
  _id: string;
  requestId: string;
  level: "INFO" | "WARN" | "ERROR";
  event: string;
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  ip: string;
  userAgent: string;
  keyMasked: string | null;
  hwidMasked: string | null;
  discordIdMasked: string | null;
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogsResponse {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: AuditLogItem[];
}

// Privacy Settings
export interface PrivacySettings {
  censorEnabled: boolean;
}

// Security Settings
export interface SecuritySettings {
  hwidLockGlobal: boolean;
}

// Webhook Settings
export interface WebhookSettings {
  enabled: boolean;
  url: string | null;
  minLevel: "INFO" | "WARN" | "ERROR";
  username: string | null;
  avatarUrl: string | null;
  allowSensitive: boolean;
}

// Create Keys
export interface CreateKeysItem {
  id: string;
  code: string;
  durationDays?: number | null;
  activatesOn?: "bind" | string;
  productHash?: string | null;
  expiresAt: string | null;
}

// Settings
export interface SettingsData {
  apiBaseUrl: string;
  apiVersion: string;
  rateLimit: number;
  timeout: number;
  keyPrefix: string;
  webhooksEnabled: boolean;
  stats?: {
    totalKeys: number;
    activeKeys: number;
    pendingKeys?: number;
    expiredKeys?: number;
    totalUsers: number;
    uniqueLinkedUsers?: number;
    linkedUserProducts?: number;
    totalProducts: number;
  };
  system?: {
    apiUptimeSec: number;
    now: string;
    node: string;
    dbState: string;
    dbReadyState: number;
    dbHost: string | null;
    dbName: string | null;
  };
}

export interface SystemStatusData {
  api: {
    uptimeSec: number;
    now: string;
    node: string;
  };
  database: {
    readyState: number;
    state: string;
    host: string | null;
    name: string | null;
  };
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const method = String(options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-censor": "0",
  };

  if (options.headers instanceof Headers) {
    options.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(options.headers)) {
    for (const [key, value] of options.headers) {
      headers[key] = value;
    }
  } else if (options.headers && typeof options.headers === "object") {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  const csrfToken = getStoredAdminCsrf();
  const ownerToken = getStoredOwnerToken();

  if (ownerToken) {
    headers.Authorization = `Bearer ${ownerToken}`;
  }

  if (csrfToken && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers["x-admin-csrf"] = csrfToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });

    const text = await response.text();
    let data: ApiResponse<T>;
    try {
      data = text ? (JSON.parse(text) as ApiResponse<T>) : { success: response.ok, message: response.statusText };
    } catch {
      data = { success: false, message: text || "Resposta inválida da API", error: { code: "INVALID_RESPONSE" } };
    }

    if (typeof data.success !== "boolean") {
      data.success = response.ok;
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: "Network error",
      error: {
        code: "NETWORK_ERROR",
        details: error,
      },
    };
  }
}

export async function adminLogin(
  username: string,
  password: string
): Promise<ApiResponse<AdminAuthData>> {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  setStoredOwnerToken(null);
  setStoredAdminCsrf(null);

  const response = await apiRequest<AdminAuthData>("/v1/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: normalizedUsername, password: normalizedPassword }),
  });

  if (response.success) {
    setStoredAdminCsrf(response.data?.csrfToken || null);
  }

  return response;
}

export async function adminMe(): Promise<ApiResponse<AdminAuthData>> {
  const response = await apiRequest<AdminAuthData>("/v1/admin/auth/me");
  if (response.success) {
    const csrf = response.data?.csrfToken;
    if (csrf) setStoredAdminCsrf(csrf);
  }
  return response;
}

export async function adminOwnerTokenLogin(token: string): Promise<ApiResponse<AdminAuthData>> {
  const clean = String(token || "").trim();
  if (!clean) {
    return { success: false, message: "Token inválido", error: { code: "BAD_REQUEST" } };
  }

  setStoredOwnerToken(clean);
  const me = await adminMe();
  if (!me.success || me.data?.mode !== "owner-token") {
    setStoredOwnerToken(null);
  }
  return me;
}

export async function adminLogout(): Promise<ApiResponse<unknown>> {
  const response = await apiRequest<unknown>("/v1/admin/auth/logout", {
    method: "POST",
  });
  setStoredAdminCsrf(null);
  setStoredOwnerToken(null);
  return response;
}

export async function ownerListAdmins(): Promise<ApiResponse<{ items: OwnerAdminUser[] }>> {
  return apiRequest<{ items: OwnerAdminUser[] }>("/v1/admin/owner/admins");
}

export async function ownerCreateAdmin(payload: {
  username: string;
  password: string;
  displayName?: string;
  role?: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
  status?: "ACTIVE" | "DISABLED";
  permissions?: string[];
}): Promise<ApiResponse<{ admin: OwnerAdminUser }>> {
  return apiRequest<{ admin: OwnerAdminUser }>("/v1/admin/owner/admins", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function ownerUpdateAdmin(
  id: string,
  payload: {
    displayName?: string;
    role?: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
    status?: "ACTIVE" | "DISABLED";
    permissions?: string[];
    password?: string;
  }
): Promise<ApiResponse<{ admin: OwnerAdminUser }>> {
  return apiRequest<{ admin: OwnerAdminUser }>(`/v1/admin/owner/admins/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// Overview
export async function getOverview(): Promise<ApiResponse<OverviewData>> {
  return apiRequest<OverviewData>("/v1/admin/overview");
}

// Key Management
export async function getKeyInfo(
  licenseKey: string
): Promise<ApiResponse<KeyInfoData>> {
  return apiRequest<KeyInfoData>("/v1/admin/key/info", {
    method: "POST",
    body: JSON.stringify({ licenseKey }),
  });
}

export async function getKeyById(
  id: string
): Promise<ApiResponse<{ item: KeyItem }>> {
  return apiRequest<{ item: KeyItem }>(`/v1/admin/keys/${id}`);
}

export async function getUserByDiscordId(
  discordId: string
): Promise<ApiResponse<{ item: UserItem }>> {
  return apiRequest<{ item: UserItem }>(`/v1/admin/users/${discordId}`);
}

export async function resetKeyHwid(
  licenseKey: string
): Promise<ApiResponse<KeyActionResponse>> {
  return apiRequest<KeyActionResponse>("/v1/admin/key/reset-hwid", {
    method: "POST",
    body: JSON.stringify({ licenseKey }),
  });
}

export async function unlinkKey(
  licenseKey: string
): Promise<ApiResponse<KeyActionResponse>> {
  return apiRequest<KeyActionResponse>("/v1/admin/key/unlink", {
    method: "POST",
    body: JSON.stringify({ licenseKey }),
  });
}

export async function addKeyDays(
  licenseKey: string,
  days: number
): Promise<ApiResponse<KeyActionResponse>> {
  return apiRequest<KeyActionResponse>("/v1/admin/key/add-days", {
    method: "POST",
    body: JSON.stringify({ licenseKey, days }),
  });
}

export async function pauseKey(
  licenseKey: string,
  paused: boolean
): Promise<ApiResponse<KeyActionResponse>> {
  return apiRequest<KeyActionResponse>("/v1/admin/key/pause", {
    method: "POST",
    body: JSON.stringify({ licenseKey, paused }),
  });
}

export async function banKey(
  licenseKey: string,
  banned: boolean,
  reason?: string
): Promise<ApiResponse<KeyActionResponse>> {
  return apiRequest<KeyActionResponse>("/v1/admin/key/ban", {
    method: "POST",
    body: JSON.stringify({ licenseKey, banned, reason }),
  });
}

// Bulk Actions
export async function pauseAllActiveKeys(
  paused: boolean
): Promise<ApiResponse<BulkActionResponse>> {
  return apiRequest<BulkActionResponse>("/v1/admin/actives/pause-all", {
    method: "POST",
    body: JSON.stringify({ paused }),
  });
}

export async function resetAllHwid(): Promise<ApiResponse<BulkActionResponse>> {
  return apiRequest<BulkActionResponse>("/v1/admin/actives/reset-hwid-all", {
    method: "POST",
  });
}

export async function addDaysToAllActiveKeys(
  days: number
): Promise<ApiResponse<BulkActionResponse>> {
  return apiRequest<BulkActionResponse>("/v1/admin/actives/add-days-all", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}

export async function deleteKeysByStatus(
  status: "expired" | "inactive" | "paused" | "banned" | "pending",
  dryRun = false
): Promise<ApiResponse<{ status: string; dryRun: boolean; matched: number; deleted: number }>> {
  return apiRequest<{ status: string; dryRun: boolean; matched: number; deleted: number }>("/v1/admin/keys/delete-by-status", {
    method: "POST",
    body: JSON.stringify({ status, dryRun }),
  });
}

// Maintenance
export async function setMaintenance(
  enabled: boolean,
  message?: string
): Promise<ApiResponse<MaintenanceData>> {
  return apiRequest<MaintenanceData>("/v1/admin/maintenance", {
    method: "POST",
    body: JSON.stringify({ enabled, message }),
  });
}

// Products
export async function getProducts(
  page = 1,
  limit = 25,
  q?: string
): Promise<ApiResponse<ProductsResponse>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.append("q", q);
  return apiRequest<ProductsResponse>(`/v1/admin/products?${params}`);
}

export async function createProduct(
  name: string,
  hwidLockEnabled = true
): Promise<ApiResponse<{ product: Product }>> {
  return apiRequest<{ product: Product }>("/v1/admin/products", {
    method: "POST",
    body: JSON.stringify({ name, hwidLockEnabled }),
  });
}

export async function updateProduct(
  id: string,
  data: { name?: string }
): Promise<ApiResponse<{ product: Product }>> {
  return apiRequest<{ product: Product }>(`/v1/admin/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function setProductHwidLock(
  id: string,
  enabled: boolean
): Promise<ApiResponse<{ product: Product }>> {
  return apiRequest<{ product: Product }>(`/v1/admin/products/${id}/hwid-lock`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteProduct(
  id: string
): Promise<ApiResponse<{ id: string }>> {
  return apiRequest<{ id: string }>(`/v1/admin/products/${id}`, {
    method: "DELETE",
  });
}

// Stored Files
export interface StoredFileItem {
  id: string;
  name: string;
  filename: string;
  extension: string;
  size: number;
  version: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilesResponse {
  page: number;
  limit: number;
  total: number;
  pages: number;
  items: StoredFileItem[];
}

export interface FileUploadResponse {
  id: string;
  name: string;
  filename: string;
  extension: string;
  size: number;
  version: string;
  hash: string;
}

export async function getFiles(
  page = 1,
  limit = 25,
  options?: { q?: string; ext?: string }
): Promise<ApiResponse<FilesResponse>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (options?.q) params.append("q", options.q);
  if (options?.ext) params.append("ext", options.ext);
  return apiRequest<FilesResponse>(`/v1/files?${params}`);
}

export async function uploadFile(
  file: File,
  name?: string
): Promise<ApiResponse<FileUploadResponse>> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);

  const csrfToken = getStoredAdminCsrf();
  const ownerToken = getStoredOwnerToken();

  const response = await fetch(`${API_BASE_URL}/v1/admin/files/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: {
      ...(ownerToken && { Authorization: `Bearer ${ownerToken}` }),
      ...(csrfToken && { "x-admin-csrf": csrfToken }),
    },
  });

  const text = await response.text();
  try {
    const data = text ? JSON.parse(text) : { success: response.ok, message: response.statusText };
    if (typeof data.success !== "boolean") data.success = response.ok;
    return data;
  } catch {
    return { success: false, message: text || "Invalid response", error: { code: "INVALID_RESPONSE" } };
  }
}

export async function updateFile(
  id: string,
  file?: File,
  name?: string
): Promise<ApiResponse<StoredFileItem | { id: string; name: string }>> {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (name) formData.append("name", name);

  const response = await fetch(`${API_BASE_URL}/v1/admin/files/${id}`, {
    method: "PUT",
    body: formData,
    credentials: "include",
  });

  const text = await response.text();
  try {
    const data = text ? JSON.parse(text) : { success: response.ok, message: response.statusText };
    if (typeof data.success !== "boolean") data.success = response.ok;
    return data;
  } catch {
    return { success: false, message: text || "Invalid response", error: { code: "INVALID_RESPONSE" } };
  }
}

export async function deleteFile(
  id: string
): Promise<ApiResponse<{ id: string }>> {
  return apiRequest<{ id: string }>(`/v1/admin/files/${id}`, {
    method: "DELETE",
  });
}

// Keys List
export async function getKeys(
  page = 1,
  limit = 25,
  options?: { q?: string; status?: string; productId?: string; type?: "standard" | "loader" }
): Promise<ApiResponse<KeysResponse>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (options?.q) params.append("q", options.q);
  if (options?.status) params.append("status", options.status);
  if (options?.productId) params.append("productId", options.productId);
  if (options?.type) params.append("type", options.type);
  return apiRequest<KeysResponse>(`/v1/admin/keys?${params}`);
}

export async function createKeys(payload: {
  productId: string;
  days: number;
  quantity?: number;
  prefix?: string;
}): Promise<ApiResponse<{ items: CreateKeysItem[] }>> {
  return apiRequest<{ items: CreateKeysItem[] }>("/v1/admin/keys/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createLoaderKeys(payload: {
  productId: string;
  days: number;
  quantity?: number;
  prefix?: string;
}): Promise<ApiResponse<{ items: CreateKeysItem[]; product?: Product }>> {
  return apiRequest<{ items: CreateKeysItem[]; product?: Product }>("/v1/admin/keys/loader/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getLogWriteHealth(): Promise<ApiResponse<{ logWriteHealth: LogWriteHealth }>> {
  return apiRequest<{ logWriteHealth: LogWriteHealth }>("/v1/admin/system/log-health");
}

export async function deleteKey(
  id: string
): Promise<ApiResponse<{ id: string }>> {
  return apiRequest<{ id: string }>(`/v1/admin/keys/${id}`, {
    method: "DELETE",
  });
}

// Users
export async function getUsers(
  page = 1,
  limit = 25,
  q?: string
): Promise<ApiResponse<UsersResponse>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.append("q", q);
  return apiRequest<UsersResponse>(`/v1/admin/users?${params}`);
}

export async function syncUserDiscord(
  discordId: string
): Promise<ApiResponse<SyncDiscordResponse>> {
  return apiRequest<SyncDiscordResponse>("/v1/admin/users/sync-discord", {
    method: "POST",
    body: JSON.stringify({ discordId }),
  });
}

export async function deleteUser(
  username: string
): Promise<ApiResponse<{ username: string }>> {
  return apiRequest<{ username: string }>(`/v1/admin/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}

// Audit Logs
export async function getAuditLogs(
  page = 1,
  limit = 25,
  filters?: {
    level?: string;
    event?: string;
    route?: string;
    method?: string;
    statusCode?: number;
    requestId?: string;
    discordIdMasked?: string;
    from?: string;
    to?: string;
    q?: string;
  }
): Promise<ApiResponse<AuditLogsResponse>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    });
  }
  return apiRequest<AuditLogsResponse>(`/v1/admin/audit-logs?${params}`);
}

export async function getAuditLogById(
  id: string
): Promise<ApiResponse<{ item: AuditLogItem }>> {
  return apiRequest<{ item: AuditLogItem }>(`/v1/admin/audit-logs/${id}`);
}

// Privacy Settings
export async function getPrivacySettings(): Promise<ApiResponse<PrivacySettings>> {
  return apiRequest<PrivacySettings>("/v1/admin/settings/privacy");
}

export async function setPrivacySettings(
  censorEnabled: boolean
): Promise<ApiResponse<PrivacySettings>> {
  return apiRequest<PrivacySettings>("/v1/admin/settings/privacy", {
    method: "PUT",
    body: JSON.stringify({ censorEnabled }),
  });
}

// Security Settings
export async function getSecuritySettings(): Promise<ApiResponse<SecuritySettings>> {
  return apiRequest<SecuritySettings>("/v1/admin/settings/security");
}

export async function setSecuritySettings(
  hwidLockGlobal: boolean
): Promise<ApiResponse<SecuritySettings>> {
  return apiRequest<SecuritySettings>("/v1/admin/settings/security", {
    method: "PUT",
    body: JSON.stringify({ hwidLockGlobal }),
  });
}

// Webhook Settings
export async function getWebhookSettings(): Promise<ApiResponse<WebhookSettings>> {
  return apiRequest<WebhookSettings>("/v1/admin/settings/webhooks");
}

export async function getSystemStatus(): Promise<ApiResponse<SystemStatusData>> {
  return apiRequest<SystemStatusData>("/v1/admin/system/status");
}

export async function setWebhookSettings(
  data: Partial<WebhookSettings>
): Promise<ApiResponse<WebhookSettings>> {
  return apiRequest<WebhookSettings>("/v1/admin/settings/webhooks", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getSettings(): Promise<ApiResponse<SettingsData>> {
  const [overview, system, webhooks] = await Promise.all([
    getOverview(),
    getSystemStatus(),
    getWebhookSettings(),
  ]);

  return {
    success: true,
    message: "Settings retrieved",
    data: {
      apiBaseUrl: API_BASE_URL,
      apiVersion: "v2.0.0",
      rateLimit: 100,
      timeout: 30,
      keyPrefix: "SAFE-",
      webhooksEnabled: webhooks.success ? Boolean(webhooks.data?.enabled) : true,
      stats: overview.success && overview.data ? {
        totalKeys: overview.data.keys,
        activeKeys: overview.data.activeKeys,
        pendingKeys: overview.data.pendingKeys,
        expiredKeys: overview.data.expiredKeys,
        totalUsers: overview.data.users,
        uniqueLinkedUsers: overview.data.uniqueLinkedUsers,
        linkedUserProducts: overview.data.linkedUserProducts,
        totalProducts: overview.data.products,
      } : undefined,
      system: system.success && system.data ? {
        apiUptimeSec: system.data.api.uptimeSec,
        now: system.data.api.now,
        node: system.data.api.node,
        dbState: system.data.database.state,
        dbReadyState: system.data.database.readyState,
        dbHost: system.data.database.host,
        dbName: system.data.database.name,
      } : undefined,
    },
  };
}
