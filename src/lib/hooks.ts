import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { yearSummary } from "./tax";

/** Zestawienie miesięczne (przychody, koszty, VAT, ZUS, PIT) dla wskazanego roku */
export function useYearSummary(year: number) {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  return useMemo(() => yearSummary({ company, invoices, costs }, year), [company, invoices, costs, year]);
}

export const currentYear = () => new Date().getFullYear();
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
