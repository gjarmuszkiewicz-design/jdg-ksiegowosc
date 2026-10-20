import { CheckCircle2, Copy, FilePlus2, FileText, Mail, Printer, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Stat, Tabs, Tip } from "@/components/ui";
import { invoiceTotals, isAccounting, isOverdue, isProforma, markPaid, nextNumberFor, paidAmount, paymentState, remainingAmount } from "@/lib/invoice";
import { pln } from "@/lib/money";
import type { Invoice } from "@/lib/types";
import { todayIso, uid, useStore } from "@/store/useStore";
import { SendInvoiceModal } from "./SendInvoiceModal";

type Filter = "wszystkie" | "nieoplacone" | "po-terminie" | "oplacone" | "proformy" | "szkice";

export function invoiceStatusBadge(inv: Invoice) {
  if (inv.status === "szkic") return <Badge tone="slate">szkic</Badge>;
  const state = paymentState(inv);
  if (state === "oplacona") return <Badge tone="green">opłacona</Badge>;
  if (isOverdue(inv)) return <Badge tone="red">{state === "czesciowo" ? "częściowo, po terminie" : "po terminie"}</Badge>;
  if (state === "czesciowo") return <Badge tone="amber">częściowo opłacona</Badge>;
  if (inv.status === "wyslana") return <Badge tone="blue">wysłana</Badge>;
  return <Badge tone="amber">czeka na zapłatę</Badge>;
}

export function ksefBadge(inv: Invoice) {
  const s = inv.ksef.status;
  if (s === "przyjeta") return <Badge tone="green">KSeF ✓</Badge>;
  if (s === "odrzucona") return <Badge tone="red">KSeF ✗</Badge>;
  if (s === "wyslana" || s === "w_kolejce") return <Badge tone="blue">KSeF…</Badge>;
  return inv.buyer.isCompany && inv.status !== "szkic" ? <Badge tone="amber">bez KSeF</Badge> : null;
}

export default function Invoices() {
  const { invoices, company, deleteInvoice, upsertInvoice } = useStore();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filtr") as Filter) || "wszystkie";
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [toDelete, setToDelete] = useState<Invoice | null>(null);
  const [toSend, setToSend] = useState<Invoice | null>(null);
  const navigate = useNavigate();

  const months = useMemo(() => [...new Set(invoices.map((i) => i.issueDate.slice(0, 7)))].sort().reverse(), [invoices]);
  const list = useMemo(
    () =>
      invoices
        .filter((i) => {
          if (filter === "proformy") return isProforma(i);
          if (isProforma(i)) return false;
          if (filter === "nieoplacone") return i.status !== "szkic" && remainingAmount(i) > 0;
          if (filter === "po-terminie") return isOverdue(i);
          if (filter === "oplacone") return paymentState(i) === "oplacona";
          if (filter === "szkice") return i.status === "szkic";
          return true;
        })
        .filter((i) => !month || i.issueDate.startsWith(month))
        .filter((i) => !q || `${i.number} ${i.buyer.name} ${i.buyer.nip}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number)),
    [invoices, filter, month, q],
  );

  const totals = list.reduce((s, i) => { const t = invoiceTotals(i); return { net: s.net + t.net, gross: s.gross + t.gross }; }, { net: 0, gross: 0 });
  const unpaid = invoices.filter((i) => isAccounting(i)).reduce((s, i) => s + remainingAmount(i), 0);

  const duplicate = (inv: Invoice) => {
    const issueDate = todayIso();
    const copy: Invoice = {
      ...inv, id: uid(), issueDate, saleDate: issueDate,
      dueDate: new Date(Date.now() + company.defaultPaymentDays * 86400000).toISOString().slice(0, 10),
      number: nextNumberFor(company, invoices, inv.kind ?? "faktura", issueDate),
      status: "szkic", paidDate: undefined, payments: undefined, proformaId: undefined, finalInvoiceId: undefined, ksef: { status: "brak" }, createdAt: new Date().toISOString(),
    };
    upsertInvoice(copy);
    navigate(`/faktury/${copy.id}`);
  };

  return (
    <div>
      <PageHeader
        title="Faktury sprzedaży"
        subtitle="Wystawiaj, drukuj, wysyłaj i pilnuj płatności"
        actions={<><Button to="/faktury/nowa?typ=proforma" variant="secondary">Nowa proforma</Button><Button to="/faktury/nowa" icon={<FilePlus2 className="h-4 w-4" />}>Nowa faktura</Button></>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Netto (widoczne)" value={pln(totals.net)} icon={<FileText className="h-5 w-5" />} />
        <Stat label="Brutto (widoczne)" value={pln(totals.gross)} icon={<FileText className="h-5 w-5" />} tone="violet" />
        <Stat label="Czeka na zapłatę" value={pln(unpaid)} icon={<CheckCircle2 className="h-5 w-5" />} tone="amber" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Tabs<Filter>
            value={filter}
            onChange={(v) => setParams(v === "wszystkie" ? {} : { filtr: v })}
            options={[
              { value: "wszystkie", label: "Wszystkie" },
              { value: "nieoplacone", label: "Nieopłacone" },
              { value: "po-terminie", label: "Po terminie" },
              { value: "oplacone", label: "Opłacone" },
              { value: "proformy", label: "Proformy" },
              { value: "szkice", label: "Szkice" },
            ]}
          />
          <select className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Wszystkie miesiące</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Szukaj: numer, klient, NIP" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Brak faktur" description="Wystaw pierwszą fakturę — zajmie Ci to mniej niż minutę." action={<Button to="/faktury/nowa">Wystaw fakturę</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-head">Numer</th>
                  <th className="table-head">Nabywca</th>
                  <th className="table-head">Wystawiona</th>
                  <th className="table-head">Termin</th>
                  <th className="table-head text-right">Netto</th>
                  <th className="table-head text-right">Brutto</th>
                  <th className="table-head text-right">Pozostało</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((inv) => {
                  const t = invoiceTotals(inv);
                  return (
                    <tr key={inv.id} className="group hover:bg-brand-50/30">
                      <td className="table-cell font-semibold"><Link to={`/faktury/${inv.id}`} className="hover:text-brand-600">{inv.number}</Link></td>
                      <td className="table-cell"><div className="font-medium">{inv.buyer.name}</div><div className="text-xs text-slate-400">{inv.buyer.nip}</div></td>
                      <td className="table-cell text-slate-600">{inv.issueDate}</td>
                      <td className="table-cell text-slate-600">{inv.dueDate}</td>
                      <td className="table-cell text-right">{pln(t.net)}</td>
                      <td className="table-cell text-right font-semibold">{pln(t.gross)}</td>
                      <td className="table-cell text-right">
                        {inv.status === "szkic" ? "—" : remainingAmount(inv) > 0 ? <span className="font-semibold text-amber-700">{pln(remainingAmount(inv))}</span> : <span className="text-emerald-600">0,00 zł</span>}
                        {paymentState(inv) === "czesciowo" && <div className="text-[11px] text-slate-400">zapł. {pln(paidAmount(inv))}</div>}
                      </td>
                      <td className="table-cell"><div className="flex flex-wrap gap-1">{isProforma(inv) && <Badge tone="violet">proforma</Badge>}{invoiceStatusBadge(inv)}{!isProforma(inv) && ksefBadge(inv)}{inv.finalInvoiceId && <Badge tone="green">faktura wystawiona</Badge>}</div></td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100">
                          {paymentState(inv) !== "oplacona" && inv.status !== "szkic" && (
                            <button title="Oznacz jako opłaconą w całości" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" onClick={() => upsertInvoice(markPaid(inv, todayIso(), uid()))}><CheckCircle2 className="h-4 w-4" /></button>
                          )}
                          <button title="Drukuj / PDF" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => window.open(`/faktury/${inv.id}/druk`, "_blank")}><Printer className="h-4 w-4" /></button>
                          <button title="Wyślij e-mailem" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setToSend(inv)}><Mail className="h-4 w-4" /></button>
                          <button title="Duplikuj" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => duplicate(inv)}><Copy className="h-4 w-4" /></button>
                          <button title="Usuń" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => setToDelete(inv)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Tip title="Wskazówka">Fakturę wysłaną do KSeF uznaje się za wystawioną i doręczoną. Jeśli musisz ją poprawić, wystaw fakturę korygującą — nie usuwaj oryginału.</Tip>
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć fakturę?"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Anuluj</Button><Button variant="danger" onClick={() => { deleteInvoice(toDelete!.id); setToDelete(null); }}>Usuń</Button></>}
      >
        <p className="text-sm text-slate-600">Faktura <b>{toDelete?.number}</b> zostanie trwale usunięta.</p>
        {toDelete?.ksef.status === "przyjeta" && <div className="mt-3"><Tip tone="warning">Ta faktura jest już w KSeF. Zamiast ją usuwać, wystaw korektę.</Tip></div>}
      </Modal>
      {toSend && <SendInvoiceModal invoice={toSend} onClose={() => setToSend(null)} />}
    </div>
  );
}
