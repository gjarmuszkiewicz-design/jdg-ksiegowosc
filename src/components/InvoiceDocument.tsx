import type { CSSProperties } from "react";
import { invoiceTotals, isProforma, itemTotals, paidAmount, paymentState, remainingAmount } from "@/lib/invoice";
import { amountInWords, num2, pln } from "@/lib/money";
import { vatRateLabel } from "@/lib/tax";
import { formatIban } from "@/lib/validation";
import type { Company, Invoice } from "@/lib/types";

// Style inline — dokument musi wyglądać tak samo w druku, PDF i w treści e-maila
const s: Record<string, CSSProperties> = {
  page: { fontFamily: "Inter, Arial, sans-serif", color: "#0f172a", fontSize: 12, lineHeight: 1.5, maxWidth: 794, margin: "0 auto", background: "#fff", padding: 40 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #3b63f8", paddingBottom: 16, marginBottom: 20 },
  h1: { fontSize: 24, fontWeight: 700, margin: 0, color: "#1e2bb0" },
  muted: { color: "#64748b" },
  parties: { display: "flex", gap: 24, marginBottom: 20 },
  party: { flex: 1, background: "#f8fafc", borderRadius: 10, padding: 14 },
  partyTitle: { fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", fontWeight: 700, marginBottom: 6 },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 16 },
  th: { background: "#1e2bb0", color: "#fff", padding: "8px 6px", fontSize: 10, textAlign: "left", fontWeight: 600 },
  td: { padding: "8px 6px", borderBottom: "1px solid #e2e8f0", fontSize: 11 },
  right: { textAlign: "right" },
  totalBox: { background: "linear-gradient(135deg,#3b63f8,#6d28d9)", color: "#fff", borderRadius: 12, padding: "14px 18px", marginTop: 8 },
};

export function InvoiceDocument({ invoice, company }: { invoice: Invoice; company: Company }) {
  const t = invoiceTotals(invoice);
  const proforma = isProforma(invoice);
  const paid = paidAmount(invoice);
  const remaining = remainingAmount(invoice);
  const state = paymentState(invoice);
  const payments = [...(invoice.payments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const exempt = t.rates.some((r) => r.rate === "zw");
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{company.name}</div>
          <div style={s.muted}>{company.address.street}, {company.address.postalCode} {company.address.city}</div>
          <div style={s.muted}>NIP: {company.nip}{company.regon ? ` · REGON: ${company.regon}` : ""}</div>
          {company.email && <div style={s.muted}>{company.email}{company.phone ? ` · ${company.phone}` : ""}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h1 style={s.h1}>{proforma ? "Faktura proforma" : `Faktura${exempt && t.vat === 0 ? "" : " VAT"}`}</h1>
          <div style={{ fontSize: 14, fontWeight: 600 }}>nr {invoice.number}</div>
          <div style={s.muted}>Data wystawienia: {invoice.issueDate}{invoice.place ? `, ${invoice.place}` : ""}</div>
          <div style={s.muted}>Data sprzedaży: {invoice.saleDate}</div>
          {invoice.ksef.number && <div style={{ ...s.muted, fontSize: 10 }}>Nr KSeF: {invoice.ksef.number}</div>}
        </div>
      </div>

      <div style={s.parties}>
        <div style={s.party}>
          <div style={s.partyTitle}>Sprzedawca</div>
          <div style={{ fontWeight: 600 }}>{company.name}</div>
          <div>{company.address.street}</div>
          <div>{company.address.postalCode} {company.address.city}</div>
          <div>NIP: {company.nip}</div>
        </div>
        <div style={s.party}>
          <div style={s.partyTitle}>Nabywca</div>
          <div style={{ fontWeight: 600 }}>{invoice.buyer.name}</div>
          <div>{invoice.buyer.address.street}</div>
          <div>{invoice.buyer.address.postalCode} {invoice.buyer.address.city}</div>
          {invoice.buyer.nip && <div>NIP: {invoice.buyer.nip}</div>}
        </div>
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, borderTopLeftRadius: 8 }}>Lp.</th>
            <th style={s.th}>Nazwa towaru / usługi</th>
            <th style={{ ...s.th, ...s.right }}>Ilość</th>
            <th style={s.th}>J.m.</th>
            <th style={{ ...s.th, ...s.right }}>Cena netto</th>
            <th style={{ ...s.th, ...s.right }}>Wartość netto</th>
            <th style={{ ...s.th, ...s.right }}>VAT</th>
            <th style={{ ...s.th, ...s.right }}>Kwota VAT</th>
            <th style={{ ...s.th, ...s.right, borderTopRightRadius: 8 }}>Brutto</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => {
            const v = itemTotals(it);
            return (
              <tr key={it.id}>
                <td style={s.td}>{i + 1}</td>
                <td style={s.td}>{it.name}</td>
                <td style={{ ...s.td, ...s.right }}>{it.qty}</td>
                <td style={s.td}>{it.unit}</td>
                <td style={{ ...s.td, ...s.right }}>{num2(it.netPrice)}</td>
                <td style={{ ...s.td, ...s.right }}>{num2(v.net)}</td>
                <td style={{ ...s.td, ...s.right }}>{vatRateLabel(it.vatRate)}</td>
                <td style={{ ...s.td, ...s.right }}>{num2(v.vat)}</td>
                <td style={{ ...s.td, ...s.right }}>{num2(v.gross)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={s.partyTitle}>Płatność</div>
          <div>Sposób: {invoice.paymentMethod === "przelew" ? "przelew" : invoice.paymentMethod === "gotowka" ? "gotówka" : "karta"}</div>
          <div>Termin płatności: <b>{invoice.dueDate}</b></div>
          {invoice.paymentMethod === "przelew" && company.bankAccount && (
            <div>Konto: <b>{formatIban(company.bankAccount)}</b>{company.bankName ? ` (${company.bankName})` : ""}</div>
          )}
          {state === "oplacona" && <div style={{ color: "#059669", fontWeight: 700, marginTop: 4 }}>ZAPŁACONO W CAŁOŚCI {invoice.paidDate ?? payments.at(-1)?.date ?? ""}</div>}
          {payments.length > 0 && state !== "oplacona" && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>Wpłaty:</div>
              {payments.map((p) => (
                <div key={p.id}>{p.date} — {pln(p.amount)}{p.note ? ` (${p.note})` : ""}</div>
              ))}
            </div>
          )}
          {proforma && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#b45309", fontWeight: 600 }}>
              Dokument nie jest fakturą VAT i nie stanowi podstawy do odliczenia podatku. Fakturę wystawimy po zapłacie / wykonaniu usługi.
            </div>
          )}
          {exempt && <div style={{ marginTop: 8, fontSize: 11 }}>Zwolnienie z VAT: {company.vatExemptionBasis}</div>}
          {invoice.notes && <div style={{ marginTop: 8, fontSize: 11 }}><b>Uwagi:</b> {invoice.notes}</div>}
        </div>
        <div style={{ width: 300 }}>
          <table style={{ ...s.table, marginBottom: 0 }}>
            <tbody>
              {t.rates.map((r) => (
                <tr key={r.rate}>
                  <td style={{ ...s.td, ...s.muted }}>{vatRateLabel(r.rate)}</td>
                  <td style={{ ...s.td, ...s.right }}>{num2(r.net)}</td>
                  <td style={{ ...s.td, ...s.right }}>{num2(r.vat)}</td>
                  <td style={{ ...s.td, ...s.right }}>{num2(r.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state === "czesciowo" ? (
            <>
              <table style={{ ...s.table, marginBottom: 0, marginTop: 6 }}>
                <tbody>
                  <tr><td style={s.td}>Razem brutto</td><td style={{ ...s.td, ...s.right, fontWeight: 600 }}>{pln(t.gross)}</td></tr>
                  <tr><td style={s.td}>Zapłacono</td><td style={{ ...s.td, ...s.right, color: "#059669", fontWeight: 600 }}>{pln(paid)}</td></tr>
                </tbody>
              </table>
              <div style={s.totalBox}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Pozostało do zapłaty</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{pln(remaining)}</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Słownie: {amountInWords(remaining)}</div>
              </div>
            </>
          ) : (
            <div style={s.totalBox}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{state === "oplacona" ? "Razem (zapłacono)" : "Do zapłaty"}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{pln(t.gross)}</div>
              <div style={{ fontSize: 10, opacity: 0.85 }}>Słownie: {amountInWords(t.gross)}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 48, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8" }}>
        <span>Wystawił(a): {company.firstName} {company.lastName}</span>
        <span>Wygenerowano w aplikacji Księgowość JDG</span>
      </div>
    </div>
  );
}
