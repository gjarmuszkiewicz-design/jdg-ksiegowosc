import { describe, expect, it } from "vitest";
import { depreciationSchedule, monthlyDepreciation } from "../src/lib/assets";
import { explainMonth, marginalRates, simulateMonth } from "../src/lib/explain";
import { yearSummary } from "../src/lib/tax";
import { emptyCompany } from "../src/store/useStore";
import type { FixedAsset } from "../src/lib/types";

const asset = (p: Partial<FixedAsset>): FixedAsset => ({
  id: "a", name: "Laptop", inventoryNo: "ST/1", startDate: "2026-03-10", documentNo: "FV", initialValue: 12000,
  kstGroup: "491", rate: 0.3, method: "liniowa", carLimit: "brak", costShare: 1, isIntangible: false, createdAt: "2026-03-10", ...p,
});

describe("amortyzacja", () => {
  it("liniowa: odpisy od miesiąca po przyjęciu, 300 zł/mies., suma = wartość", () => {
    const s = depreciationSchedule(asset({}));
    expect(s[0].month).toBe("2026-04");
    expect(s[0].amount).toBe(300);
    expect(s.at(-1)!.cumulative).toBe(12000);
    expect(s).toHaveLength(40);
  });
  it("degresywna: pierwszy rok 2× stawka od wartości, potem przejście na liniową", () => {
    const s = depreciationSchedule(asset({ method: "degresywna", initialValue: 24000, startDate: "2025-12-15" }));
    // 2026: 24000 × 60% = 14400 → 1200/mies.
    expect(s[0].month).toBe("2026-01");
    expect(s[0].amount).toBe(1200);
    // 2027: wartość netto 9600 × 60% = 5760 < liniowy 7200 → liniowa 600/mies.
    const jan27 = s.find((r) => r.month === "2027-01")!;
    expect(jan27.amount).toBe(600);
    expect(jan27.note).toContain("liniową");
    expect(s.at(-1)!.cumulative).toBe(24000);
  });
  it("jednorazowa: całość w miesiącu przyjęcia", () => {
    const s = depreciationSchedule(asset({ method: "jednorazowa_de_minimis", initialValue: 50000 }));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ month: "2026-03", amount: 50000 });
  });
  it("limit samochodu 150 000 zł", () => {
    const s = depreciationSchedule(asset({ kstGroup: "741", rate: 0.2, initialValue: 200000, carLimit: "150000" }));
    expect(s[0].amount).toBeCloseTo(3333.33, 2);
    expect(s[0].deductible).toBeCloseTo(2500, 2);
  });
  it("likwidacja zatrzymuje odpisy", () => {
    const s = depreciationSchedule(asset({ disposalDate: "2026-06-20" }));
    expect(s.at(-1)!.month).toBe("2026-06");
    expect(monthlyDepreciation([asset({ disposalDate: "2026-06-20" })], "2026-07").amount).toBe(0);
  });
});

describe("silnik z amortyzacją, rozpisanie i symulacja", () => {
  const company = { ...emptyCompany, onboarded: true, startDate: "2020-01-01", taxForm: "liniowy" as const, vatStatus: "czynny" as const };
  const data = { company, invoices: [], costs: [], assets: [asset({})] };
  it("amortyzacja trafia do kosztów miesiąca", () => {
    const s = yearSummary(data, 2026);
    expect(s[3].depreciation).toBe(300);
    expect(s[3].kup).toBe(300);
  });
  it("rozpisanie PIT kończy się kwotą zaliczki", () => {
    const sum = yearSummary(data, 2026);
    const ex = explainMonth(data, sum, 3);
    const pit = ex.find((x) => x.id === "pit")!;
    expect(pit.lines.at(-1)!.value).toBe(sum[3].pit);
  });
  it("stawka krańcowa liniowego ≈ 22,97%", () => {
    const sum = yearSummary(data, 2026);
    expect(marginalRates(data, sum[3]).total).toBeCloseTo(0.2297, 3);
  });
  it("symulacja: przychód zwiększa podatek, zakup go obniża", () => {
    const a = simulateMonth(data, "2026-11", { revenue: 60000, revenueVatRate: "23", costs: 0, costsVatRate: "23" });
    const b = simulateMonth(data, "2026-11", { revenue: 60000, revenueVatRate: "23", costs: 0, costsVatRate: "23", purchase: { net: 5000, vatRate: "23", asAsset: false, rate: 0.3, method: "liniowa" } });
    expect(a.payments.pit).toBeGreaterThan(0);
    expect(a.payments.vat).toBe(13800);
    expect(b.payments.pit).toBeLessThan(a.payments.pit);
    expect(b.payments.vat).toBe(13800 - 1150);
  });
});
