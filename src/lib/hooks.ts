import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { yearSummary } from "./tax";

/** Zestawienie miesięczne (przychody, koszty, VAT, ZUS, PIT) dla wskazanego roku */
export function useYearSummary(year: number) {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const assets = useStore((s) => s.assets);
  return useMemo(() => yearSummary({ company, invoices, costs, assets }, year), [company, invoices, costs, assets, year]);
}

/** Wszystkie dane potrzebne silnikowi obliczeń */
export function useYearData() {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const assets = useStore((s) => s.assets);
  return useMemo(() => ({ company, invoices, costs, assets }), [company, invoices, costs, assets]);
}

export const currentYear = () => new Date().getFullYear();
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
