import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, Company, Contractor, Cost, FixedAsset, Invoice, Payment } from "@/lib/types";
import { demoData } from "./demo";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const emptyCompany: Company = {
  onboarded: false,
  firstName: "",
  lastName: "",
  birthDate: "",
  name: "",
  nip: "",
  regon: "",
  pkd: "",
  address: { street: "", postalCode: "", city: "", country: "PL" },
  email: "",
  phone: "",
  bankName: "",
  bankAccount: "",
  taxOfficeCode: "",
  startDate: "",
  taxForm: "liniowy",
  ryczaltRate: 0.12,
  vatStatus: "czynny",
  vatExemptionBasis: "art. 113 ust. 1 ustawy o VAT",
  zusStage: "pelny",
  chorobowa: true,
  malyZusBase: 0,
  invoiceNumberPattern: "FV/{NR}/{MM}/{RRRR}",
  defaultPaymentDays: 14,
  ksefToken: "",
};

interface State {
  company: Company;
  contractors: Contractor[];
  invoices: Invoice[];
  costs: Cost[];
  assets: FixedAsset[];
  payments: Payment[];
  chat: ChatMessage[];
  dismissedTips: string[];
  setCompany: (c: Partial<Company>) => void;
  upsertContractor: (c: Contractor) => void;
  deleteContractor: (id: string) => void;
  upsertInvoice: (i: Invoice) => void;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  upsertCost: (c: Cost) => void;
  deleteCost: (id: string) => void;
  upsertAsset: (a: FixedAsset) => void;
  deleteAsset: (id: string) => void;
  upsertPayment: (p: Payment) => void;
  deletePayment: (id: string) => void;
  /** Dodaje wiele dokumentów naraz (import) — istniejące o tym samym id są nadpisywane */
  importBatch: (b: { invoices?: Invoice[]; costs?: Cost[]; contractors?: Contractor[]; assets?: FixedAsset[] }) => void;
  setChat: (m: ChatMessage[]) => void;
  dismissTip: (id: string) => void;
  loadDemo: () => void;
  resetAll: () => void;
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];

export const useStore = create<State>()(
  persist(
    (set) => ({
      company: emptyCompany,
      contractors: [],
      invoices: [],
      costs: [],
      assets: [],
      payments: [],
      chat: [],
      dismissedTips: [],
      setCompany: (c) => set((s) => ({ company: { ...s.company, ...c } })),
      upsertContractor: (c) => set((s) => ({ contractors: upsert(s.contractors, c) })),
      deleteContractor: (id) => set((s) => ({ contractors: s.contractors.filter((c) => c.id !== id) })),
      upsertInvoice: (i) => set((s) => ({ invoices: upsert(s.invoices, i) })),
      updateInvoice: (id, patch) => set((s) => ({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      deleteInvoice: (id) => set((s) => ({ invoices: s.invoices.filter((i) => i.id !== id) })),
      upsertCost: (c) => set((s) => ({ costs: upsert(s.costs, c) })),
      deleteCost: (id) => set((s) => ({ costs: s.costs.filter((c) => c.id !== id) })),
      upsertAsset: (a) => set((s) => ({ assets: upsert(s.assets, a) })),
      deleteAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),
      upsertPayment: (p) => set((s) => ({ payments: upsert(s.payments, p) })),
      deletePayment: (id) => set((s) => ({ payments: s.payments.filter((p) => p.id !== id) })),
      importBatch: (b) =>
        set((s) => {
          const merge = <T extends { id: string }>(list: T[], add?: T[]) => {
            if (!add?.length) return list;
            const ids = new Set(add.map((x) => x.id));
            return [...add, ...list.filter((x) => !ids.has(x.id))];
          };
          return { invoices: merge(s.invoices, b.invoices), costs: merge(s.costs, b.costs), contractors: merge(s.contractors, b.contractors), assets: merge(s.assets, b.assets) };
        }),
      setChat: (chat) => set({ chat }),
      dismissTip: (id) => set((s) => ({ dismissedTips: [...s.dismissedTips, id] })),
      loadDemo: () => set(demoData()),
      resetAll: () => set({ company: emptyCompany, contractors: [], invoices: [], costs: [], assets: [], payments: [], chat: [], dismissedTips: [] }),
    }),
    { name: "jdg-ksiegowosc-v1" },
  ),
);
