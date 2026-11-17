import type { Invoice } from "../src/lib/types";
import type { Storage } from "./storage";

/**
 * Stan księgowości użytkownika z numerem wersji (_rev).
 * Serwer sam dopisuje faktury ze sklepów, więc zapis z przeglądarki nie może ich nadpisać:
 * przeglądarka wysyła wersję, na której pracowała (baseRev), a serwer dokleja faktury dodane później.
 */
export interface AppState {
  invoices?: Invoice[];
  _rev?: number;
  [k: string]: unknown;
}

// Jedna operacja na stanie danego użytkownika naraz (aplikacja działa w jednym procesie)
const locks = new Map<string, Promise<unknown>>();
export function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(userId, tail);
  void tail.then(() => locks.get(userId) === tail && locks.delete(userId));
  return run;
}

export const revOf = (state: unknown) => Number((state as AppState | null)?._rev ?? 0);

export function stripRev(state: unknown) {
  if (!state || typeof state !== "object") return state;
  const { _rev: _ignored, ...rest } = state as AppState;
  return rest;
}

/** Zapis z przeglądarki: dołącza faktury dodane przez serwer po wersji `baseRev`, których przeglądarka jeszcze nie zna */
export function mergeClientState(stored: AppState | undefined, incoming: AppState, baseRev: number) {
  const curRev = revOf(stored);
  let added: Invoice[] = [];
  if (stored && curRev > baseRev) {
    const known = new Set((incoming.invoices ?? []).map((i) => i.id));
    added = (stored.invoices ?? []).filter((i) => (i.serverRev ?? 0) > baseRev && !known.has(i.id));
    if (added.length) incoming = { ...incoming, invoices: [...(incoming.invoices ?? []), ...added] };
  }
  return { state: { ...incoming, _rev: curRev + 1 }, added, rev: curRev + 1 };
}

export async function saveClientState(storage: Storage, userId: string, incoming: AppState, baseRev: number) {
  return withUserLock(userId, async () => {
    const stored = (await storage.getState(userId))?.state as AppState | undefined;
    const merged = mergeClientState(stored, incoming, baseRev);
    const st = await storage.putState(userId, merged.state);
    return { updatedAt: st.updatedAt, rev: merged.rev, added: merged.added };
  });
}

/** Wynik bez zapisu — stan zostaje bez zmian */
export class NoChange<T> {
  constructor(public value: T) {}
}

/** Zmiana stanu po stronie serwera (np. faktura ze sklepu); `fn` dostaje numer nowej wersji, a `NoChange` pomija zapis */
export async function mutateState<T, U = never>(storage: Storage, userId: string, fn: (state: AppState, rev: number) => T | NoChange<U> | Promise<T | NoChange<U>>): Promise<T | U> {
  return withUserLock(userId, async () => {
    const stored = (await storage.getState(userId))?.state as AppState | undefined;
    if (!stored) throw Object.assign(new Error("Konto nie ma jeszcze danych firmy — dokończ konfigurację w aplikacji."), { status: 409 });
    const rev = revOf(stored) + 1;
    const state: AppState = { ...stored, invoices: [...(stored.invoices ?? [])] };
    const result = await fn(state, rev);
    if (result instanceof NoChange) return result.value;
    state._rev = rev;
    await storage.putState(userId, state);
    return result;
  });
}
