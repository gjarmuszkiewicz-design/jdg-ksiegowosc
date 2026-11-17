import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { invoiceTotals, paymentState } from "../src/lib/invoice";
import { buildFa3Xml } from "../src/lib/ksef";
import { invoiceFromShopOrder, mapVatRate, type ShopOrder } from "../src/lib/shopOrder";
import { emptyCompany } from "../src/store/useStore";
import type { Invoice, ShopSite } from "../src/lib/types";
import { invoicePdf } from "../server/invoicePdf";
import { mergeClientState } from "../server/stateStore";
import { validateFa3 } from "../server/xmlValidate";
import { zip } from "../server/zip";

const company = { ...emptyCompany, onboarded: true, vatStatus: "czynny" as const, invoiceNumberPattern: "FV/{NR}/{MM}/{RRRR}", name: "Firma", nip: "5260250274", firstName: "A", lastName: "B", address: { street: "ul. A 1", postalCode: "00-001", city: "Warszawa", country: "PL" }, defaultPaymentDays: 14 };
const site: Pick<ShopSite, "id" | "name" | "settings"> = { id: "s1", name: "Sklep testowy", settings: { invoiceMode: "na_zadanie", numberPattern: "", emailBy: "sklep", defaultVatRate: "23", markPaid: true } };
const now = new Date("2026-11-17T10:00:00Z");

const order = (patch: Partial<ShopOrder> = {}): ShopOrder => ({
  orderId: 501,
  orderNumber: "501",
  currency: "PLN",
  isPaid: true,
  paidAt: "2026-11-16T22:30:00Z", // 23:30 czasu polskiego — 16 listopada
  paymentMethod: "przelewy24",
  paymentMethodTitle: "Przelewy24",
  wantsInvoice: true,
  buyer: { company: "TechNova Sp. z o.o.", firstName: "Jan", lastName: "Nowak", nip: "526-025-02-74", email: "jan@example.com", address1: "ul. Złota 44", postcode: "00-120", city: "Warszawa", country: "PL" },
  items: [
    { name: "Kubek ceramiczny", qty: 3, total: 119.97, vatRate: 23 },
    { name: "Książka", qty: 1, total: 49.9, vatRate: 5 },
  ],
  shipping: [{ name: "InPost Paczkomat", qty: 1, total: 15.99, vatRate: 23 }],
  total: 185.86,
  ...patch,
});

describe("faktura z zamówienia WooCommerce", () => {
  it("liczy od brutto — suma zgadza się z zamówieniem co do grosza", () => {
    const r = invoiceFromShopOrder(order(), site, company, [], { id: "x", now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inv = r.invoice;
    const t = invoiceTotals(inv);
    expect(t.gross).toBe(185.86);
    // VAT z sumy brutto w stawce: 23% od 135,96 = 25,42; 5% od 49,90 = 2,38
    expect(t.rates.find((x) => x.rate === "23")?.vat).toBe(25.42);
    expect(t.rates.find((x) => x.rate === "5")?.vat).toBe(2.38);
    expect(r.warning).toBeUndefined();
    expect(inv.number).toBe("FV/1/11/2026");
    expect(inv.buyer.nip).toBe("5260250274");
    expect(inv.items[2].name).toBe("Dostawa: InPost Paczkomat");
    expect(inv.saleDate).toBe("2026-11-16");
    expect(paymentState(inv)).toBe("oplacona");
    expect(inv.notes).toContain("Zamówienie nr 501 (Sklep testowy)");
  });

  it("bez „Chcę fakturę” pomija zamówienie, chyba że sklep wystawia zawsze albo ręcznie", () => {
    const o = order({ wantsInvoice: false, buyer: { firstName: "Ola", lastName: "Kot", email: "o@example.com" } });
    expect(invoiceFromShopOrder(o, site, company, [], { id: "x", now })).toMatchObject({ ok: false, skip: true });
    expect(invoiceFromShopOrder({ ...o, force: true }, site, company, [], { id: "x", now }).ok).toBe(true);
    const always = { ...site, settings: { ...site.settings, invoiceMode: "zawsze" as const } };
    const r = invoiceFromShopOrder(o, always, company, [], { id: "x", now });
    expect(r.ok && r.invoice.buyer).toMatchObject({ name: "Ola Kot", isCompany: false, nip: "" });
  });

  it("odrzuca zły NIP i obcą walutę", () => {
    expect(invoiceFromShopOrder(order({ buyer: { company: "X", nip: "1234567890" } }), site, company, [], { id: "x", now })).toMatchObject({ ok: false, skip: false });
    expect(invoiceFromShopOrder(order({ currency: "EUR" }), site, company, [], { id: "x", now })).toMatchObject({ ok: false, skip: false });
  });

  it("osobna seria sklepu zaczyna od 1, wspólna kontynuuje numerację", () => {
    const existing = [{ number: "FV/7/11/2026", issueDate: "2026-11-03", kind: "faktura" } as Invoice];
    const own = { ...site, settings: { ...site.settings, numberPattern: "SKLEP/{NR}/{RRRR}" } };
    const a = invoiceFromShopOrder(order(), own, company, existing, { id: "x", now });
    const b = invoiceFromShopOrder(order(), site, company, existing, { id: "x", now });
    expect(a.ok && a.invoice.number).toBe("SKLEP/1/2026");
    expect(b.ok && b.invoice.number).toBe("FV/8/11/2026");
  });

  it("rabat, przez który cena jednostkowa nie dzieli się na grosze → pozycja jako komplet", () => {
    const r = invoiceFromShopOrder(order({ items: [{ name: "Świeca", qty: 3, total: 100, vatRate: 23 }], shipping: [], total: 100 }), site, company, [], { id: "x", now });
    expect(r.ok && r.invoice.items[0]).toMatchObject({ qty: 1, unit: "kpl.", grossPrice: 100, name: "Świeca (3 szt.)" });
  });

  it("stawki: najbliższa polska stawka, a przy zwolnieniu z VAT zawsze „zw”", () => {
    expect(mapVatRate(22.99, company, "23")).toBe("23");
    expect(mapVatRate("8", company, "23")).toBe("8");
    expect(mapVatRate(null, company, "5")).toBe("5");
    expect(mapVatRate(23, { ...company, vatStatus: "zwolniony" }, "23")).toBe("zw");
  });

  it("e-faktura FA(3) od brutto (P_9B, P_11A) przechodzi oficjalny schemat", async () => {
    const r = invoiceFromShopOrder(order(), site, company, [], { id: "x", now });
    if (!r.ok) throw new Error(r.reason);
    const xml = buildFa3Xml(company, r.invoice);
    expect(xml).toContain("<P_9B>39.99</P_9B>");
    expect(xml).toContain("<P_11A>119.97</P_11A>");
    expect(await validateFa3(xml)).toBeNull();
  });

  it("PDF faktury powstaje (z polskimi znakami)", async () => {
    const r = invoiceFromShopOrder(order(), site, company, [], { id: "x", now });
    if (!r.ok) throw new Error(r.reason);
    const pdf = await invoicePdf(r.invoice, company);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

describe("zapis z przeglądarki nie gubi faktur ze sklepu", () => {
  const shopInv = { id: "shop1", serverRev: 6 } as Invoice;
  const stored = { _rev: 6, invoices: [{ id: "a" } as Invoice, shopInv] };

  it("dokleja fakturę dodaną przez serwer po wersji przeglądarki", () => {
    const m = mergeClientState(stored, { invoices: [{ id: "a" } as Invoice, { id: "b" } as Invoice] }, 5);
    expect(m.state.invoices?.map((i) => i.id)).toEqual(["a", "b", "shop1"]);
    expect(m.added.map((i) => i.id)).toEqual(["shop1"]);
    expect(m.rev).toBe(7);
  });

  it("faktura usunięta w przeglądarce, która już ją znała, nie wraca", () => {
    const m = mergeClientState(stored, { invoices: [{ id: "a" } as Invoice] }, 6);
    expect(m.state.invoices?.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("paczka wtyczki", () => {
  it("ZIP otwiera się standardowym narzędziem", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
    const file = path.join(dir, "t.zip");
    fs.writeFileSync(file, zip([{ name: "jdg-faktury/a.php", data: Buffer.from("<?php echo 'zażółć';") }, { name: "jdg-faktury/includes/b.php", data: Buffer.from("x") }]));
    const out = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(), z.read('jdg-faktury/a.php').decode())", file]).toString();
    expect(out.trim()).toBe("None <?php echo 'zażółć';");
  });
});
