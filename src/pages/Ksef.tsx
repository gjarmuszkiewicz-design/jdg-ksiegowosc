import { CheckCircle2, CloudDownload, CloudUpload, Code2, Download, KeyRound, Loader2, Receipt, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Modal, PageHeader, Tip } from "@/components/ui";
import { invoiceTotals } from "@/lib/invoice";
import { buildFa3Xml } from "@/lib/ksef";
import { num2, pln, round2 } from "@/lib/money";
import { cleanNip } from "@/lib/validation";
import { downloadFile } from "@/lib/xml";
import { uid, useStore } from "@/store/useStore";
import type { Invoice, KsefStatus } from "@/lib/types";

const STATUS: Record<KsefStatus, { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" }> = {
  brak: { label: "nie wysłano", tone: "slate" },
  w_kolejce: { label: "w kolejce", tone: "amber" },
  wyslana: { label: "wysłano — czeka na UPO", tone: "blue" },
  przyjeta: { label: "przyjęta", tone: "green" },
  odrzucona: { label: "odrzucona", tone: "red" },
};

interface PurchaseItem {
  ksefNumber: string;
  supplierName: string;
  supplierNip: string;
  issueDate: string;
  net: number;
  vat: number;
  gross: number;
  number: string;
}

const pending = (i: Invoice) => i.status !== "szkic" && (i.ksef.status === "brak" || i.ksef.status === "odrzucona");

export default function Ksef() {
  const { company, invoices, costs, updateInvoice, upsertCost } = useStore();
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [sending, setSending] = useState<string[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[] | null>(null);
  const [purchLoading, setPurchLoading] = useState(false);
  const [purchError, setPurchError] = useState("");
  const [ksefMode, setKsefMode] = useState<string>("");
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => setKsefMode(h.ksefMode ?? "")).catch(() => undefined);
  }, []);

  const list = useMemo(() => invoices.filter((i) => i.status !== "szkic").sort((a, b) => b.issueDate.localeCompare(a.issueDate)), [invoices]);
  const toSend = list.filter(pending);
  const connected = !!company.ksefToken;
  const accepted = list.filter((i) => i.ksef.status === "przyjeta").length;

  const send = async (inv: Invoice) => {
    setSending((s) => [...s, inv.id]);
    updateInvoice(inv.id, { ksef: { ...inv.ksef, status: "w_kolejce" } });
    try {
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml: buildFa3Xml(company, inv), invoiceNumber: inv.number, nip: company.nip, token: company.ksefToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.status) throw new Error(data.message || `Błąd serwera (${res.status})`);
      if (data.simulated) {
        // nic nie zostało wysłane — przywracamy poprzedni status i pokazujemy komunikat
        updateInvoice(inv.id, { ksef: { ...inv.ksef, message: data.message } });
        return;
      }
      updateInvoice(inv.id, {
        ksef: {
          status: (data.status as KsefStatus) ?? (data.ok ? "wyslana" : "odrzucona"),
          number: data.ksefNumber,
          sentAt: new Date().toISOString(),
          message: data.message,
        },
      });
    } catch (err) {
      updateInvoice(inv.id, { ksef: { status: "odrzucona", sentAt: new Date().toISOString(), message: err instanceof Error ? err.message : "Nie udało się wysłać faktury." } });
    } finally {
      setSending((s) => s.filter((x) => x !== inv.id));
    }
  };

  const sendAll = async () => {
    for (const inv of toSend) await send(inv);
  };

  const fetchPurchases = async () => {
    setPurchLoading(true);
    setPurchError("");
    try {
      const res = await fetch(`/api/ksef/purchases?nip=${cleanNip(company.nip)}`, { headers: company.ksefToken ? { "x-ksef-token": company.ksefToken } : {} });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Błąd serwera (${res.status})`);
      if (data.simulated) throw new Error(data.message);
      setPurchases(data.items ?? []);
    } catch (err) {
      setPurchError(err instanceof Error ? err.message : "Nie udało się pobrać faktur.");
    } finally {
      setPurchLoading(false);
    }
  };

  const bookPurchase = (p: PurchaseItem) => {
    const vat = round2(p.vat);
    const net = round2(p.net);
    const rate = net && vat ? (Math.abs(vat / net - 0.23) < 0.01 ? "23" : Math.abs(vat / net - 0.08) < 0.01 ? "8" : Math.abs(vat / net - 0.05) < 0.01 ? "5" : "23") : "zw";
    upsertCost({
      id: uid(),
      docNumber: p.number,
      date: p.issueDate,
      supplierName: p.supplierName,
      supplierNip: p.supplierNip,
      description: "Faktura pobrana z KSeF",
      category: "inne",
      net,
      vatRate: rate,
      vat,
      vatDeduction: "pelne",
      costShare: 1,
      isFixedAsset: false,
      paid: false,
      ksefNumber: p.ksefNumber,
      createdAt: new Date().toISOString(),
    });
  };

  const booked = (p: PurchaseItem) => costs.some((c) => c.ksefNumber === p.ksefNumber);

  return (
    <div>
      <PageHeader
        title="KSeF — Krajowy System e-Faktur"
        subtitle="Wysyłaj faktury sprzedażowe i pobieraj faktury kosztowe bez przepisywania."
        actions={
          <Button icon={<Send className="h-4 w-4" />} onClick={sendAll} disabled={!toSend.length || sending.length > 0}>
            Wyślij oczekujące ({toSend.length})
          </Button>
        }
      />

      {ksefMode === "symulacja" && (
        <div className="mb-6">
          <Tip tone="warning" title="Połączenie z KSeF nie jest jeszcze włączone">
            Aplikacja <b>nie wysyła</b> teraz faktur do KSeF i <b>nie pobiera</b> z niego faktur zakupowych — token jest tylko zapisany. Do czasu włączenia połączenia:
            wystawiaj i odbieraj faktury w <a className="font-semibold text-brand-600 hover:underline" href="https://ksef.podatki.gov.pl/aplikacja-podatnika-ksef-20/" target="_blank" rel="noreferrer">Aplikacji Podatnika KSeF</a>,
            a pobrane pliki XML wgrywaj w <Link to="/import" className="font-semibold text-brand-600 hover:underline">Import danych</Link>.
          </Tip>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tip tone="info" title="Jak działa KSeF?">
            Faktura dla firmy jest wystawiona dopiero wtedy, gdy trafi do KSeF i otrzyma numer KSeF. Aplikacja zamienia Twoją fakturę na plik XML w strukturze FA(3) i wysyła go
            do systemu Ministerstwa Finansów. Klient pobierze ją z KSeF, a PDF jest tylko wizualizacją.{" "}
            <Link to="/wiedza/ksef" className="font-semibold text-brand-600 hover:underline">
              Dowiedz się więcej
            </Link>
          </Tip>
        </div>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${connected ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">{connected ? "Token KSeF zapisany" : "Brak tokena KSeF"}</div>
              <div className="text-xs text-slate-500">{connected ? "Wysyłka w Twoim imieniu jest możliwa." : "Bez tokena działa tryb testowy (symulacja)."}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Przyjęte faktury</span>
            <b>
              {accepted} / {list.length}
            </b>
          </div>
          <Button to="/ustawienia" variant="secondary" size="sm" className="mt-4 w-full">
            {connected ? "Zmień token" : "Dodaj token w ustawieniach"}
          </Button>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Faktury sprzedażowe" subtitle="Status wysyłki do KSeF" icon={<CloudUpload className="h-5 w-5" />} />
        {!list.length ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Brak wystawionych faktur" description="Gdy wystawisz fakturę, pojawi się tutaj gotowa do wysłania do KSeF." action={<Button to="/faktury/nowa">Wystaw fakturę</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="table-head">Numer</th>
                  <th className="table-head">Nabywca</th>
                  <th className="table-head text-right">Brutto</th>
                  <th className="table-head">Status KSeF</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((inv) => {
                  const st = STATUS[inv.ksef.status];
                  const busy = sending.includes(inv.id);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="table-cell">
                        <Link to={`/faktury/${inv.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                          {inv.number}
                        </Link>
                        <div className="text-xs text-slate-500">{inv.issueDate}</div>
                      </td>
                      <td className="table-cell">
                        {inv.buyer.name}
                        {!inv.buyer.isCompany && <div className="text-xs text-slate-400">B2C — KSeF opcjonalny</div>}
                      </td>
                      <td className="table-cell text-right font-semibold">{num2(invoiceTotals(inv).gross)}</td>
                      <td className="table-cell">
                        <Badge tone={st.tone}>
                          {inv.ksef.status === "przyjeta" ? <CheckCircle2 className="h-3 w-3" /> : inv.ksef.status === "odrzucona" ? <XCircle className="h-3 w-3" /> : null}
                          {st.label}
                        </Badge>
                        {inv.ksef.number && <div className="mt-1 font-mono text-[11px] text-slate-500">{inv.ksef.number}</div>}
                        {inv.ksef.message && inv.ksef.status !== "przyjeta" && <div className="mt-1 max-w-xs text-[11px] text-slate-500">{inv.ksef.message}</div>}
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Code2 className="h-4 w-4" />} onClick={() => setPreview(inv)}>
                            XML
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadFile(`${inv.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, inv))} aria-label="Pobierz XML">
                            <Download className="h-4 w-4" />
                          </Button>
                          {inv.ksef.status !== "przyjeta" && (
                            <Button size="sm" icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} onClick={() => send(inv)} disabled={busy}>
                              Wyślij
                            </Button>
                          )}
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

      <Card>
        <CardHeader
          title="Faktury kosztowe z KSeF"
          subtitle="Faktury wystawione na Twój NIP przez dostawców"
          icon={<CloudDownload className="h-5 w-5" />}
          action={
            <Button variant="secondary" size="sm" icon={purchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />} onClick={fetchPurchases} disabled={purchLoading}>
              Pobierz faktury zakupowe
            </Button>
          }
        />
        <div className="p-5">
          {purchError && <Tip tone="warning">{purchError}</Tip>}
          {!purchases && !purchError && <p className="text-sm text-slate-500">Kliknij „Pobierz faktury zakupowe”, aby sprawdzić nowe faktury od dostawców i zaksięgować je jednym kliknięciem.</p>}
          {purchases && !purchases.length && <p className="text-sm text-slate-500">Brak nowych faktur zakupowych w KSeF.</p>}
          {purchases && purchases.length > 0 && (
            <div className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <div key={p.ksefNumber} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{p.supplierName}</div>
                    <div className="text-xs text-slate-500">
                      {p.number} · {p.issueDate} · NIP {p.supplierNip}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{p.ksefNumber}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">{pln(p.gross)}</div>
                    <div className="text-xs text-slate-500">
                      netto {num2(p.net)} · VAT {num2(p.vat)}
                    </div>
                  </div>
                  {booked(p) ? (
                    <Badge tone="green">
                      <CheckCircle2 className="h-3 w-3" /> zaksięgowano
                    </Badge>
                  ) : (
                    <Button size="sm" variant="success" onClick={() => bookPurchase(p)}>
                      Zaksięguj jako koszt
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`XML FA(3) — ${preview?.number ?? ""}`} wide footer={
        preview && (
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${preview.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, preview))}>
            Pobierz XML
          </Button>
        )
      }>
        {preview && <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-200">{buildFa3Xml(company, preview)}</pre>}
      </Modal>
    </div>
  );
}
