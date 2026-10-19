import { create } from "zustand";
import { useStore } from "./useStore";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface SessionState {
  status: "loading" | "anon" | "syncing" | "ready";
  user: SessionUser | null;
  registrationOpen: boolean;
  storageKind: string;
  save: SaveState;
  lastSavedAt: string | null;
  error: string | null;
}

export const useSession = create<SessionState>(() => ({
  status: "loading",
  user: null,
  registrationOpen: false,
  storageKind: "",
  save: "idle",
  lastSavedAt: null,
  error: null,
}));

const OWNER_KEY = "jdg-ksiegowosc-owner";
const PERSIST_KEY = "jdg-ksiegowosc-v1";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw Object.assign(new Error(data.message || `Błąd ${res.status}`), { status: res.status });
  return data as T;
}

/** Część stanu zapisywana na serwerze */
const snapshot = () => {
  const s = useStore.getState();
  return { company: s.company, contractors: s.contractors, invoices: s.invoices, costs: s.costs, assets: s.assets, payments: s.payments, chat: s.chat, dismissedTips: s.dismissedTips };
};

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

async function pushNow() {
  useSession.setState({ save: "saving" });
  try {
    const r = await api<{ updatedAt: string }>("/api/state", { method: "PUT", body: JSON.stringify({ state: snapshot() }) });
    useSession.setState({ save: "saved", lastSavedAt: r.updatedAt });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return handleExpired();
    useSession.setState({ save: "error" });
  }
}

function startAutosave() {
  unsubscribe?.();
  unsubscribe = useStore.subscribe(() => {
    if (applyingRemote) return;
    if (timer) clearTimeout(timer);
    useSession.setState({ save: "saving" });
    timer = setTimeout(pushNow, 800);
  });
}

function stopAutosave() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

function clearLocal() {
  applyingRemote = true;
  useStore.getState().resetAll();
  applyingRemote = false;
  try {
    localStorage.removeItem(PERSIST_KEY);
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* brak dostępu do localStorage */
  }
}

function handleExpired() {
  stopAutosave();
  clearLocal();
  useSession.setState({ status: "anon", user: null, error: "Sesja wygasła — zaloguj się ponownie." });
}

/** Po zalogowaniu: pobierz dane z serwera albo (pierwsze logowanie) przenieś dane z tej przeglądarki */
async function loadUserData(user: SessionUser) {
  useSession.setState({ status: "syncing", user, error: null });
  const remote = await api<{ state: Record<string, unknown> | null }>("/api/state");
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER_KEY);
  } catch {
    /* ignoruj */
  }
  applyingRemote = true;
  if (remote.state) {
    useStore.getState().resetAll();
    useStore.setState(remote.state);
  } else if (owner && owner !== user.id) {
    // dane w przeglądarce należą do innego konta — nie przenosimy ich
    useStore.getState().resetAll();
  }
  applyingRemote = false;
  try {
    localStorage.setItem(OWNER_KEY, user.id);
  } catch {
    /* ignoruj */
  }
  if (!remote.state && useStore.getState().company.onboarded) await pushNow();
  startAutosave();
  useSession.setState({ status: "ready" });
}

export async function initSession() {
  try {
    const me = await api<{ user: SessionUser | null; registrationOpen: boolean; storage: string }>("/api/auth/me");
    useSession.setState({ registrationOpen: me.registrationOpen, storageKind: me.storage });
    if (me.user) await loadUserData(me.user);
    else useSession.setState({ status: "anon" });
  } catch (e) {
    useSession.setState({ status: "anon", error: `Nie udało się połączyć z serwerem: ${(e as Error).message}` });
  }
}

export async function login(email: string, password: string) {
  const r = await api<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  await loadUserData(r.user);
}

export async function register(name: string, email: string, password: string) {
  const r = await api<{ user: SessionUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
  useSession.setState({ registrationOpen: false });
  await loadUserData(r.user);
}

export async function logout() {
  if (timer) {
    clearTimeout(timer);
    await pushNow();
  }
  stopAutosave();
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  clearLocal();
  useSession.setState({ status: "anon", user: null, save: "idle" });
  const me = await api<{ registrationOpen: boolean }>("/api/auth/me").catch(() => null);
  if (me) useSession.setState({ registrationOpen: me.registrationOpen });
}

export async function changePassword(current: string, password: string) {
  await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, password }) });
}

export const saveNow = pushNow;
