import path from "node:path";
import { createRequire } from "node:module";
import pdfmake from "pdfmake";
import { invoiceTotals, isProforma, itemTotals, paidAmount, paymentState, remainingAmount } from "../src/lib/invoice";
import { amountInWords, num2, pln } from "../src/lib/money";
import { vatRateLabel } from "../src/lib/tax";
import { formatIban } from "../src/lib/validation";
import type { Company, Invoice } from "../src/lib/types";

// Czcionka Roboto z pakietu pdfmake (ma polskie znaki); dostęp do plików tylko w jej katalogu, bez pobierania z sieci
const fontsDir = path.join(path.dirname(createRequire(import.meta.url).resolve("pdfmake/package.json")), "fonts", "Roboto");
pdfmake.setFonts({
  Roboto: {
    normal: path.join(fontsDir, "Roboto-Regular.ttf"),
    bold: path.join(fontsDir, "Roboto-Medium.ttf"),
    italics: path.join(fontsDir, "Roboto-Italic.ttf"),
    bolditalics: path.join(fontsDir, "Roboto-MediumItalic.ttf"),
  },
});
pdfmake.setLocalAccessPolicy((p: string) => path.resolve(p).startsWith(fontsDir));
pdfmake.setUrlAccessPolicy(() => false);

const BRAND = "#1e2bb0";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

const payLabel = (m: Invoice["paymentMethod"]) => (m === "przelew" ? "przelew" : m === "gotowka" ? "gotówka" : "karta");

/** PDF faktury — ten sam układ i treść co wydruk w aplikacji */
export async function invoicePdf(invoice: Invoice, company: Company): Promise<Buffer> {
  const t = invoiceTotals(invoice);
  const proforma = isProforma(invoice);
  const gross = invoice.priceMode === "brutto";
  const state = paymentState(invoice);
  const paid = paidAmount(invoice);
  const remaining = remainingAmount(invoice);
  const exempt = t.rates.some((r) => r.rate === "zw");
  const payments = [...(invoice.payments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const title = proforma ? "Faktura proforma" : `Faktura${exempt && t.vat === 0 ? "" : " VAT"}`;
  const a = company.address;
  const b = invoice.buyer.address;

  const party = (label: string, lines: string[]) => ({
    table: { widths: ["*"], body: [[{ stack: [{ text: label.toUpperCase(), style: "label" }, ...lines.filter(Boolean).map((l, i) => ({ text: l, bold: i === 0 }))], fillColor: "#f8fafc", margin: [8, 6, 8, 8] }]] },
    layout: "noBorders",
  });

  const th = (text: string, right = false) => ({ text, style: "th", alignment: right ? "right" : "left" });
  const rows = invoice.items.map((it, i) => {
    const v = itemTotals(it, invoice.priceMode);
    return [
      String(i + 1),
      it.name,
      { text: String(it.qty), alignment: "right" },
      it.unit,
      { text: num2(gross ? it.grossPrice ?? 0 : it.netPrice), alignment: "right" },
      { text: num2(v.net), alignment: "right" },
      { text: vatRateLabel(it.vatRate), alignment: "right" },
      { text: num2(v.vat), alignment: "right" },
      { text: num2(v.gross), alignment: "right" },
    ];
  });

  const payInfo: unknown[] = [
    { text: "PŁATNOŚĆ", style: "label" },
    `Sposób: ${payLabel(invoice.paymentMethod)}`,
    { text: [`Termin płatności: `, { text: invoice.dueDate, bold: true }] },
  ];
  if (invoice.paymentMethod === "przelew" && company.bankAccount)
    payInfo.push({ text: [`Konto: `, { text: formatIban(company.bankAccount), bold: true }, company.bankName ? ` (${company.bankName})` : ""] });
  if (state === "oplacona") payInfo.push({ text: `ZAPŁACONO W CAŁOŚCI ${invoice.paidDate ?? payments.at(-1)?.date ?? ""}`, bold: true, color: "#059669", margin: [0, 4, 0, 0] });
  if (payments.length && state !== "oplacona")
    payInfo.push({ text: "Wpłaty:", bold: true, margin: [0, 6, 0, 0] }, ...payments.map((p) => `${p.date} — ${pln(p.amount)}${p.note ? ` (${p.note})` : ""}`));
  if (proforma) payInfo.push({ text: "Dokument nie jest fakturą VAT i nie stanowi podstawy do odliczenia podatku.", color: "#b45309", bold: true, margin: [0, 8, 0, 0] });
  if (exempt) payInfo.push({ text: `Zwolnienie z VAT: ${company.vatExemptionBasis}`, margin: [0, 6, 0, 0] });
  if (invoice.notes) payInfo.push({ text: [{ text: "Uwagi: ", bold: true }, invoice.notes], margin: [0, 6, 0, 0] });

  const summary: unknown[] = [
    {
      table: { widths: ["auto", "*", "*", "*"], body: t.rates.map((r) => [{ text: vatRateLabel(r.rate), color: MUTED }, { text: num2(r.net), alignment: "right" }, { text: num2(r.vat), alignment: "right" }, { text: num2(r.gross), alignment: "right" }]) },
      layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 4, paddingBottom: () => 4 },
    },
  ];
  const totalBox = (label: string, amount: number) => ({
    table: { widths: ["*"], body: [[{ stack: [{ text: label, fontSize: 8, color: "#dbe3ff" }, { text: pln(amount), fontSize: 18, bold: true, color: "#fff" }, { text: `Słownie: ${amountInWords(amount)}`, fontSize: 7.5, color: "#e0e7ff" }], fillColor: "#3b63f8", margin: [10, 8, 10, 8] }]] },
    layout: "noBorders",
    margin: [0, 8, 0, 0],
  });
  if (state === "czesciowo") {
    summary.push(
      {
        table: { widths: ["*", "auto"], body: [["Razem brutto", { text: pln(t.gross), bold: true, alignment: "right" }], ["Zapłacono", { text: pln(paid), bold: true, color: "#059669", alignment: "right" }]] },
        layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 6, 0, 0],
      },
      totalBox("Pozostało do zapłaty", remaining),
    );
  } else summary.push(totalBox(state === "oplacona" ? "Razem (zapłacono)" : "Do zapłaty", t.gross));

  const doc = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 48],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#0f172a", lineHeight: 1.2 },
    styles: {
      label: { fontSize: 7, bold: true, color: MUTED, characterSpacing: 0.8, margin: [0, 0, 0, 3] },
      th: { fontSize: 7.5, bold: true, color: "#fff", fillColor: BRAND },
    },
    info: { title: `${title} ${invoice.number}`, author: company.name, creator: "Księgowość JDG" },
    footer: () => ({ columns: [{ text: `Wystawił(a): ${company.firstName} ${company.lastName}`.trim() }, { text: "Wygenerowano w aplikacji Księgowość JDG", alignment: "right" }], margin: [36, 12, 36, 0], fontSize: 7, color: "#94a3b8" }),
    content: [
      {
        columns: [
          { stack: [{ text: company.name, fontSize: 13, bold: true }, { text: `${a.street}, ${a.postalCode} ${a.city}`, color: MUTED }, { text: `NIP: ${company.nip}${company.regon ? ` · REGON: ${company.regon}` : ""}`, color: MUTED }, company.email ? { text: `${company.email}${company.phone ? ` · ${company.phone}` : ""}`, color: MUTED } : ""] },
          {
            alignment: "right",
            stack: [
              { text: title, fontSize: 18, bold: true, color: BRAND },
              { text: `nr ${invoice.number}`, fontSize: 11, bold: true },
              { text: `Data wystawienia: ${invoice.issueDate}${invoice.place ? `, ${invoice.place}` : ""}`, color: MUTED },
              { text: `Data sprzedaży: ${invoice.saleDate}`, color: MUTED },
              invoice.ksef.number ? { text: `Nr KSeF: ${invoice.ksef.number}`, color: MUTED, fontSize: 7.5 } : "",
            ],
          },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 2.5, lineColor: "#3b63f8" }], margin: [0, 0, 0, 12] },
      {
        columns: [
          party("Sprzedawca", [company.name, a.street, `${a.postalCode} ${a.city}`, `NIP: ${company.nip}`]),
          party("Nabywca", [invoice.buyer.name, b.street, `${b.postalCode} ${b.city}`.trim(), invoice.buyer.nip ? `NIP: ${invoice.buyer.nip}` : "", invoice.buyer.email]),
        ],
        columnGap: 14,
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          headerRows: 1,
          widths: [16, "*", 28, 28, 50, 52, 26, 44, 52],
          body: [[th("Lp."), th("Nazwa towaru / usługi"), th("Ilość", true), th("J.m."), th(gross ? "Cena brutto" : "Cena netto", true), th("Wartość netto", true), th("VAT", true), th("Kwota VAT", true), th("Brutto", true)], ...rows],
        },
        layout: { hLineWidth: (i: number) => (i <= 1 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 5, paddingBottom: () => 5 },
        fontSize: 8.5,
        margin: [0, 0, 0, 12],
      },
      { columns: [{ stack: payInfo, width: "*" }, { stack: summary, width: 220 }], columnGap: 18 },
    ],
  };
  return pdfmake.createPdf(doc).getBuffer();
}
