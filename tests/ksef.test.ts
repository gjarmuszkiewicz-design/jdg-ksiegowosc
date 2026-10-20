import { describe, expect, it } from "vitest";
import { buildFa3Xml } from "../src/lib/ksef";
import { emptyCompany } from "../src/store/useStore";
import { monthChunks } from "../server/ksef";
import { validateFa3 } from "../server/xmlValidate";
import type { Invoice } from "../src/lib/types";

const company = { ...emptyCompany, onboarded: true, name: "Firma Test", nip: "5260250274", address: { street: "ul. Prosta 1", postalCode: "00-001", city: "Warszawa", country: "PL" }, bankAccount: "PL61109010140000071219812874", bankName: "Bank" };
const inv = (patch: Partial<Invoice> = {}): Invoice => ({
  id: "1", number: "FV 1/2026", issueDate: "2026-10-01", saleDate: "2026-09-30", dueDate: "2026-10-15", place: "Warszawa", paymentMethod: "przelew",
  buyer: { name: "Klient Sp. z o.o.", nip: "7010000000", address: { street: "", postalCode: "", city: "", country: "PL" }, email: "", isCompany: true },
  items: [
    { id: "a", name: "Usługa", qty: 1, unit: "usł.", netPrice: 1000, vatRate: "23" },
    { id: "b", name: "Produkt", qty: 3, unit: "szt.", netPrice: 19.99, vatRate: "8" },
  ],
  notes: "", status: "wystawiona", ksef: { status: "brak" }, createdAt: "2026-10-01", ...patch,
});

describe("KSeF", () => {
  it("monthChunks dzieli zakres na miesiące", () => {
    expect(monthChunks("2026-08-15", "2026-10-03")).toEqual([["2026-08-15", "2026-08-31"], ["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-03"]]);
  });
  it("FA(3) bez adresu nabywcy przechodzi oficjalny schemat", async () => {
    expect(await validateFa3(buildFa3Xml(company, inv()))).toBeNull();
  });
  it("FA(3) zapłacona, z adresem i uwagami przechodzi schemat", async () => {
    const x = buildFa3Xml(company, inv({ status: "oplacona", paidDate: "2026-10-02", notes: "Zamówienie 12", buyer: { ...inv().buyer, address: { street: "ul. Długa 2", postalCode: "80-001", city: "Gdańsk", country: "PL" } } }));
    expect(await validateFa3(x)).toBeNull();
  });
  it("niepoprawny XML jest odrzucany", async () => {
    const errors = await validateFa3(buildFa3Xml(company, inv()).replace("<P_15>", "<P_99>").replace("</P_15>", "</P_99>"));
    expect(errors?.length).toBeGreaterThan(0);
  });
});
