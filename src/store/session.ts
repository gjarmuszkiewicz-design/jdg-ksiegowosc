import { create } from "zustand";
import type { Invoice } from "@/lib/types";
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
/** Wersja danych na serwerze, na której pracuje ta karta (serwer dopisuje faktury ze sklepów) */
let baseRev = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Dodaje faktury, które serwer utworzył w międzyczasie (np. zamówienia ze sklepu) */
function mergeServerInvoices(added: Invoice[]) {
  const local = useStore.getState().invoices;
  const known = new Set(local.map((i) => i.id));
  const fresh = added.filter((i) => !known.has(i.id));
  if (!fresh.length) return;
  applyingRemote = true;
  useStore.setState({ invoices: [...local, ...fresh] });
  applyingRemote = false;
}

/** Co 30 s: czy serwer ma nowe faktury ze sklepów */
async function pullServerChanges() {
  if (timer || document.visibilityState === "hidden") return;
  try {
    const r = await api<{ rev: number }>("/api/state/rev");
    if (r.rev <= baseRev) return;
    const st = await api<{ state: { invoices?: Invoice[] } | null; rev: number }>("/api/state");
    if (timer) return; // w międzyczasie użytkownik coś zmienił — zapis i tak dołączy nowe faktury
    const from = baseRev;
    mergeServerInvoices((st.state?.invoices ?? []).filter((i) => (i.serverRev ?? 0) > from));
    baseRev = st.rev;
  } catch (e) {
    if ((e as { status?: number }).status === 401) handleExpired();
  }
}
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

async function pushNow() {
  useSession.setState({ save: "saving" });
  try {
    const r = await api<{ updatedAt: string; rev: number; added?: Invoice[] }>("/api/state", { method: "PUT", body: JSON.stringify({ state: snapshot(), baseRev }) });
    baseRev = r.rev;
    if (r.added?.length) mergeServerInvoices(r.added);
    useSession.setState({ save: "saved", lastSavedAt: r.updatedAt });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return handleExpired();
    useSession.setState({ save: "error" });
  }
}

/** Zamykanie / przeładowanie karty: wyślij niezapisane zmiany od razu */
function flushOnLeave() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  try {
    const blob = new Blob([JSON.stringify({ state: snapshot(), baseRev })], { type: "application/json" });
    navigator.sendBeacon("/api/state", blob);
  } catch {
    /* przeglądarka bez sendBeacon */
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushOnLeave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushOnLeave());
}

function startAutosave() {
  unsubscribe?.();
  unsubscribe = useStore.subscribe(() => {
    if (applyingRemote) return;
    if (timer) clearTimeout(timer);
    useSession.setState({ save: "saving" });
    timer = setTimeout(() => {
      timer = null;
      void pushNow();
    }, 800);
  });
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pullServerChanges, 30_000);
}

function stopAutosave() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
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
  const remote = await api<{ state: Record<string, unknown> | null; rev?: number }>("/api/state");
  baseRev = remote.rev ?? 0;
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
