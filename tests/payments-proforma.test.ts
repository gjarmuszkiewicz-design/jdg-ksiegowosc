import { describe, expect, it } from "vitest";
import { isOverdue, markPaid, paidAmount, paymentState, remainingAmount, withPayments, nextNumberFor } from "../src/lib/invoice";
import { buildFa3Xml } from "../src/lib/ksef";
import { buildJpkV7M } from "../src/lib/jpk";
import { yearSummary } from "../src/lib/tax";
import { emptyCompany } from "../src/store/useStore";
import { validateFa3 } from "../server/xmlValidate";
import type { Invoice } from "../src/lib/types";

const company = { ...emptyCompany, onboarded: true, startDate: "2026-01-01", name: "Firma", nip: "5260250274", taxOfficeCode: "1471", firstName: "A", lastName: "B", birthDate: "1990-01-01", address: { street: "ul. A 1", postalCode: "00-001", city: "Warszawa", country: "PL" } };
// 4065,04 netto + 23% = 5000,00 brutto
const inv = (patch: Partial<Invoice> = {}): Invoice => ({
  id: "f1", number: "FV 1/2026", issueDate: "2026-10-01", saleDate: "2026-10-01", dueDate: "2026-10-15", place: "", paymentMethod: "przelew",
  buyer: { name: "Klient", nip: "7010000000", address: { street: "ul. B 2", postalCode: "00-002", city: "Kraków", country: "PL" }, email: "", isCompany: true },
  items: [{ id: "a", name: "Usługa", qty: 1, unit: "usł.", netPrice: 4065.04, vatRate: "23" }],
  notes: "", status: "wystawiona", ksef: { status: "brak" }, createdAt: "2026-10-01", ...patch,
});

describe("częściowe płatności", () => {
  it("5000 zł, wpłata 2500 → częściowo, pozostało 2500, nadal po terminie", () => {
    const v = withPayments(inv(), [{ id: "p1", date: "2026-10-05", amount: 2500 }]);
    expect(paidAmount(v)).toBe(2500);
    expect(remainingAmount(v)).toBe(2500);
    expect(paymentState(v)).toBe("czesciowo");
    expect(v.status).toBe("wystawiona");
    expect(isOverdue(v, "2026-10-20")).toBe(true);
  });
  it("druga wpłata domyka fakturę", () => {
    const v = withPayments(inv(), [{ id: "p1", date: "2026-10-05", amount: 2500 }, { id: "p2", date: "2026-10-12", amount: 2500 }]);
    expect(v.status).toBe("oplacona");
    expect(v.paidDate).toBe("2026-10-12");
    expect(isOverdue(v, "2026-10-20")).toBe(false);
  });
  it("markPaid dopłaca brakującą kwotę", () => {
    const v = markPaid(withPayments(inv(), [{ id: "p1", date: "2026-10-05", amount: 1000 }]), "2026-10-10", "x");
    expect(v.payments?.at(-1)?.amount).toBe(4000);
    expect(paymentState(v)).toBe("oplacona");
  });
  it("e-faktura FA(3) z zapłatą częściową i z kilkoma ratami przechodzi oficjalny schemat", async () => {
    const part = withPayments(inv(), [{ id: "p1", date: "2026-10-05", amount: 2500 }]);
    expect(buildFa3Xml(company, part)).toContain("<ZnacznikZaplatyCzesciowej>1</ZnacznikZaplatyCzesciowej>");
    expect(await validateFa3(buildFa3Xml(company, part))).toBeNull();
    const full = withPayments(inv(), [{ id: "p1", date: "2026-10-05", amount: 2500 }, { id: "p2", date: "2026-10-12", amount: 2500 }]);
    expect(buildFa3Xml(company, full)).toContain("<ZnacznikZaplatyCzesciowej>2</ZnacznikZaplatyCzesciowej>");
    expect(await validateFa3(buildFa3Xml(company, full))).toBeNull();
  });
});

describe("proforma", () => {
  it("nie wchodzi do przychodu, VAT ani JPK", () => {
    const data = { company, invoices: [inv(), inv({ id: "p", number: "PRO/1/2026", kind: "proforma" })], costs: [], assets: [] };
    const s = yearSummary(data, 2026)[9];
    expect(s.revenue).toBe(4065.04);
    expect(s.invoicesCount).toBe(1);
    expect(buildJpkV7M(company, data.invoices, [], "2026-10").salesRows).toBe(1);
  });
  it("ma osobną numerację", () => {
    const list = [inv(), inv({ id: "p", number: "PRO/1/2026", kind: "proforma" })];
    expect(nextNumberFor(company, list, "proforma", "2026-10-20")).toBe("PRO/2/2026");
    expect(nextNumberFor({ ...company, invoiceNumberPattern: "FV {NR}/{RRRR}" }, list, "faktura", "2026-10-20")).toBe("FV 2/2026");
  });
});
