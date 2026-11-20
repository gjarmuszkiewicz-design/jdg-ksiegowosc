import { describe, expect, it } from "vitest";
import { costsFromScan, SCAN_SCHEMA, type ScannedInvoice } from "../src/lib/costScan";
import { emptyCompany } from "../src/store/useStore";
import type { Cost } from "../src/lib/types";

const company = { ...emptyCompany, vatStatus: "czynny" as const, nip: "7812107849" };
let n = 0;
const opts = { fileName: "fv.pdf", today: "2026-11-20", newId: () => `c${++n}` };
const scan = (p: Partial<ScannedInvoice> = {}): ScannedInvoice => ({
  isInvoice: true, documentType: "faktura", number: "FV/123/11/2026", issueDate: "2026-11-05", saleDate: "2026-11-05", dueDate: "2026-11-19",
  supplierName: "Orange Polska S.A.", supplierNip: "526-025-09-95", supplierAddress: "Warszawa", buyerName: "KUBA DESIGN", buyerNip: "7812107849", currency: "PLN",
  rates: [{ rate: "23", net: 100, vat: 23, gross: 123 }], totalGross: 123, description: "Abonament komórkowy — listopad", category: "telefon_internet", paid: false, warnings: [], ...p,
});

describe("koszt z odczytanej faktury", () => {
  it("jedna stawka → jeden koszt z danymi z faktury", () => {
    const r = costsFromScan(scan(), company, [], opts);
    expect(r.costs).toHaveLength(1);
    expect(r.costs[0]).toMatchObject({ docNumber: "FV/123/11/2026", date: "2026-11-05", supplierNip: "5260250995", net: 100, vat: 23, vatRate: "23", category: "telefon_internet", vatDeduction: "pelne", costShare: 1, paid: false, source: "skan:fv.pdf" });
    expect(r.warnings).toEqual([]);
  });

  it("kilka stawek → osobne pozycje, suma zgodna z fakturą", () => {
    const r = costsFromScan(scan({ rates: [{ rate: "23", net: 100, vat: 23, gross: 123 }, { rate: "8%", net: 50, vat: 4, gross: 54 }], totalGross: 177 }), company, [], opts);
    expect(r.costs.map((c) => c.vatRate)).toEqual(["23", "8"]);
    expect(r.costs[1].description).toContain("(VAT 8%)");
    expect(r.warnings).toEqual([]);
  });

  it("paliwo: domyślnie 50% VAT i 75% kosztu", () => {
    const r = costsFromScan(scan({ category: "paliwo", supplierName: "ORLEN" }), company, [], opts);
    expect(r.costs[0]).toMatchObject({ vatDeduction: "polowa", costShare: 0.75 });
  });

  it("ostrzega: obcy nabywca, duplikat, zła suma, proforma", () => {
    const existing = [{ docNumber: "FV/123/11/2026", supplierNip: "5260250995" } as Cost];
    const r = costsFromScan(scan({ buyerNip: "5260250274", totalGross: 200, documentType: "proforma" }), company, existing, opts);
    const all = r.warnings.join(" | ");
    expect(all).toContain("proforma");
    expect(all).toContain("duplikat");
    expect(all).toContain("nie Twoja firma");
    expect(all).toContain("nie zgadza się");
  });

  it("firma zwolniona z VAT: bez odliczenia", () => {
    const r = costsFromScan(scan(), { ...company, vatStatus: "zwolniony" }, [], opts);
    expect(r.costs[0].vatDeduction).toBe("brak");
  });

  it("schemat odpowiedzi jest kompletny (wszystkie pola wymagane, bez dodatkowych)", () => {
    expect([...SCAN_SCHEMA.required].sort()).toEqual(Object.keys(SCAN_SCHEMA.properties).sort());
    expect(SCAN_SCHEMA.additionalProperties).toBe(false);
  });
});
