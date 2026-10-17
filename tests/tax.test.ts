import { describe, expect, it } from "vitest";
import { compareForms, yearSummary, zusSocial } from "../src/lib/tax";
import { invoiceTotals } from "../src/lib/invoice";
import { amountInWords } from "../src/lib/money";
import { isValidIban, isValidNip } from "../src/lib/validation";
import { buildJpkV7M } from "../src/lib/jpk";
import { buildFa3Xml } from "../src/lib/ksef";
import { emptyCompany } from "../src/store/useStore";
import { demoData } from "../src/store/demo";
import type { Company } from "../src/lib/types";

const co = (p: Partial<Company>): Company => ({ ...emptyCompany, onboarded: true, startDate: "2020-01-01", ...p });

describe("ZUS 2026", () => {
  it("pełny ZUS z chorobową i FP = 1926,76 zł", () => {
    expect(zusSocial(co({ zusStage: "pelny", chorobowa: true })).social).toBe(1926.76);
  });
  it("preferencyjny z chorobową = 456,18 zł (bez FP)", () => {
    const z = zusSocial(co({ zusStage: "preferencyjny", chorobowa: true }));
    expect(z.social).toBe(456.18);
    expect(z.fp).toBe(0);
  });
  it("ulga na start = 0", () => {
    expect(zusSocial(co({ zusStage: "ulga_na_start" })).social).toBe(0);
  });
});

describe("faktura", () => {
  it("sumuje VAT od sumy netto w stawce", () => {
    const t = invoiceTotals({ items: [
      { id: "1", name: "a", qty: 3, unit: "szt.", netPrice: 0.33, vatRate: "23" },
      { id: "2", name: "b", qty: 1, unit: "szt.", netPrice: 100, vatRate: "8" },
    ] });
    expect(t.net).toBe(100.99);
    expect(t.vat).toBe(8.23);
    expect(t.gross).toBe(109.22);
  });
  it("kwota słownie", () => {
    expect(amountInWords(1234.5)).toBe("tysiąc dwieście trzydzieści cztery złote 50/100");
    expect(amountInWords(2_000_015.02)).toBe("dwa miliony piętnaście złotych 02/100");
    expect(amountInWords(12)).toBe("dwanaście złotych 00/100");
  });
});

describe("walidacja", () => {
  it("NIP i IBAN", () => {
    expect(isValidNip("5260250274")).toBe(true);
    expect(isValidNip("5260250275")).toBe(false);
    expect(isValidIban("PL61109010140000071219812874")).toBe(true);
    expect(isValidIban("PL61109010140000071219812875")).toBe(false);
  });
});

describe("zestawienie roczne", () => {
  it("liniowy: 10 000 zł przychodu miesięcznie, pełny ZUS", () => {
    const company = co({ taxForm: "liniowy", zusStage: "pelny", chorobowa: true, vatStatus: "czynny" });
    const invoices = Array.from({ length: 12 }, (_, i) => {
      const d = `2026-${String(i + 1).padStart(2, "0")}-10`;
      return { id: String(i), number: `FV/${i}`, issueDate: d, saleDate: d, dueDate: d, place: "", paymentMethod: "przelew" as const,
        buyer: { name: "X", nip: "", address: emptyCompany.address, email: "", isCompany: true },
        items: [{ id: "a", name: "u", qty: 1, unit: "usł.", netPrice: 10000, vatRate: "23" as const }],
        notes: "", status: "wystawiona" as const, ksef: { status: "brak" as const }, createdAt: d };
    });
    const s = yearSummary({ company, invoices, costs: [] }, 2026);
    expect(s[0].vatDue).toBe(2300);
    expect(s[0].socialDeducted).toBe(1926.76);
    // styczeń: (10000 - 1926.76) * 19% = 1533,9 → 1534
    expect(s[0].pit).toBe(1534);
    expect(s[0].health).toBe(314.96);
    // luty: zdrowotna 4,9% dochodu ze stycznia, nie mniej niż 432,54
    expect(s[1].health).toBe(432.54);
    expect(s.reduce((a, m) => a + m.pit, 0)).toBe(s[11].taxYtd);
  });
  it("porównanie form zwraca 3 warianty z sensownymi wartościami", () => {
    const r = compareForms(200000, 20000, 23121, 0.12);
    expect(r).toHaveLength(3);
    const rycz = r.find((x) => x.form === "ryczalt")!;
    expect(rycz.health).toBeCloseTo(830.58 * 12, 1);
    for (const x of r) expect(x.total).toBeGreaterThan(0);
  });
});

describe("pliki XML", () => {
  const demo = demoData();
  it("JPK_V7M zawiera ewidencję i deklarację", () => {
    const month = demo.invoices[0].saleDate.slice(0, 7);
    const r = buildJpkV7M(demo.company, demo.invoices, demo.costs, month);
    expect(r.xml).toContain("<tns:SprzedazWiersz>");
    expect(r.xml).toContain("<tns:P_51>");
    expect(r.salesRows).toBeGreaterThan(0);
  });
  it("FA(3) zawiera wymagane sekcje", () => {
    const xml = buildFa3Xml(demo.company, demo.invoices[0]);
    expect(xml).toContain('kodSystemowy="FA (3)"');
    expect(xml).toContain("<P_15>");
    expect(xml).toContain("<FaWiersz>");
  });
});
