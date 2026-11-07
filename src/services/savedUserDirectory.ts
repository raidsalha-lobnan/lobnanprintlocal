import type { SystemUser } from '../types';

export const USERS_STORAGE_KEY = 'alnoor_press_accounting_v1_users';
export const USERS_WORKSPACE_KEY = 'lobnan_login_users_workspace';
const SERVER_KEY = 'lobnan_local_sync_server_url';
const TOKEN_KEY = 'lobnan_local_sync_device_token';
const WORKSPACE_KEY = 'lobnan_local_sync_workspace';

export function isSavedUser(value: unknown): value is SystemUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<SystemUser>;
  return typeof user.id === 'string' && user.id.length > 0 &&
    (typeof user.username === 'string' || typeof user.email === 'string') &&
    (user.status === 'active' || user.status === 'inactive');
}

export function readCachedUsers(): SystemUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSavedUser) : [];
  } catch { return []; }
}

export function cacheSavedUsers(users: SystemUser[], workspace?: string): void {
  // Never seed users, roles or passwords from sample defaults.
  // Preserve the established key so AccountingProvider loads the same users after login.
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  if (workspace) localStorage.setItem(USERS_WORKSPACE_KEY, workspace);
}

export function findSavedUser(users: SystemUser[], identifier: string, password: string): SystemUser | undefined {
  const login = identifier.trim().toLocaleLowerCase();
  if (!login || !password) return undefined;
  return users.find(user => {
    if (!isSavedUser(user) || user.status !== 'active') return false;
    const identities = [user.username, user.email, user.fullName, user.phone, user.id];
    const sameIdentity = identities.some(value => typeof value === 'string' && value.trim().toLocaleLowerCase() === login);
    // Existing legacy passwords are plaintext; never grant access for missing
    // passwords, hard-coded defaults or admin email/name aliases.
    return sameIdentity && typeof user.password === 'string' && user.password.length > 0 && user.password === password;
  });
}

export function getCurrentWorkspace(): string {
  return localStorage.getItem(WORKSPACE_KEY) || 'lobnan_main';
}

export function isTrustedOfflineCache(): boolean {
  return localStorage.getItem(USERS_WORKSPACE_KEY) === getCurrentWorkspace();
}

export async function fetchUsersFromLocalServer(timeoutMs = 9000): Promise<SystemUser[]> {
  const gateway = import.meta.env.VITE_SYNC_GATEWAY_MODE === 'true';
  const url = gateway ? window.location.origin : (localStorage.getItem(SERVER_KEY) || '').replace(/\/+$/, '');
  const token = gateway ? '' : (localStorage.getItem(TOKEN_KEY) || '');
  const workspace = getCurrentWorkspace();
  if (!/^https?:\/\//.test(url) || (!gateway && token.length < 32)) {
    throw new Error('LOCAL_SERVER_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url + '/api/v1/bootstrap?workspace=' + encodeURIComponent(workspace), {
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('LOCAL_SERVER_HTTP_' + response.status);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray((data as { records?: unknown }).records)) {
      throw new Error('INVALID_USER_DIRECTORY_RESPONSE');
    }
    const records = (data as { records: Array<{ entity?: string; value?: unknown }> }).records;
    const users = records.filter(record => record?.entity === 'users').map(record => record.value).filter(isSavedUser);
    // An empty server directory is authoritative: do NOT synthesize an admin user.
    return Array.from(new Map(users.map(user => [user.id, user])).values());
  } finally {
    clearTimeout(timer);
  }
}
