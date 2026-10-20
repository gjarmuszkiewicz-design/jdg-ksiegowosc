import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CloudDownload, CloudUpload, Code2, Download, KeyRound, Loader2, Receipt, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Tip } from "@/components/ui";
import { parseKsefFa } from "@/lib/importers";
import { invoiceTotals, isAccounting } from "@/lib/invoice";
import { buildFa3Xml } from "@/lib/ksef";
import { num2, pln, round2 } from "@/lib/money";
import { cleanNip } from "@/lib/validation";
import { downloadFile } from "@/lib/xml";
import { uid, useStore } from "@/store/useStore";
import type { Cost, Invoice, KsefStatus } from "@/lib/types";

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
  receivedDate?: string;
  net: number;
  vat: number;
  gross: number;
  number: string;
  currency?: string;
}

/** Faktura może być wysłana: wystawiona, bez numeru KSeF (także wystawiona wcześniej w innym programie) */
const canSend = (i: Invoice) => isAccounting(i) && !i.ksef.number && (i.ksef.status === "brak" || i.ksef.status === "odrzucona");

interface Health {
  ksefMode?: string;
  ksefEnv?: string;
  ksefSend?: boolean;
}

const monthStart = (offsetMonths: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offsetMonths, 1, 12).toISOString().slice(0, 10);
};

export default function Ksef() {
  const { company, invoices, costs, updateInvoice, importBatch } = useStore();
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [sending, setSending] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Invoice[] | null>(null);
  const [health, setHealth] = useState<Health>({});

  const [from, setFrom] = useState(monthStart(1));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [purchases, setPurchases] = useState<PurchaseItem[] | null>(null);
  const [purchSelected, setPurchSelected] = useState<string[]>([]);
  const [purchLoading, setPurchLoading] = useState(false);
  const [booking, setBooking] = useState<string[]>([]);
  const [purchError, setPurchError] = useState("");
  const [purchInfo, setPurchInfo] = useState("");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => undefined);
  }, []);

  const live = health.ksefMode === "live";
  const sendEnabled = live && !!health.ksefSend;
  const connected = !!company.ksefToken;
  const tokenHeaders: Record<string, string> = company.ksefToken ? { "x-ksef-token": company.ksefToken } : {};

  const list = useMemo(() => invoices.filter((i) => isAccounting(i)).sort((a, b) => b.issueDate.localeCompare(a.issueDate)), [invoices]);
  const sendable = list.filter(canSend);
  const accepted = list.filter((i) => i.ksef.status === "przyjeta" || i.ksef.number).length;

  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

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
        updateInvoice(inv.id, { ksef: { ...inv.ksef, message: data.message } });
        return;
      }
      updateInvoice(inv.id, {
        ksef: { status: (data.status as KsefStatus) ?? (data.ok ? "wyslana" : "odrzucona"), number: data.ksefNumber, sentAt: new Date().toISOString(), message: data.message },
      });
    } catch (err) {
      updateInvoice(inv.id, { ksef: { status: "odrzucona", sentAt: new Date().toISOString(), message: err instanceof Error ? err.message : "Nie udało się wysłać faktury." } });
    } finally {
      setSending((s) => s.filter((x) => x !== inv.id));
    }
  };

  const sendConfirmed = async (items: Invoice[]) => {
    setConfirm(null);
    for (const inv of items) await send(inv);
    setSelected([]);
  };

  const fetchPurchases = async () => {
    setPurchLoading(true);
    setPurchError("");
    setPurchInfo("");
    setPurchSelected([]);
    try {
      const qs = new URLSearchParams({ nip: cleanNip(company.nip), from, to });
      const res = await fetch(`/api/ksef/purchases?${qs}`, { headers: tokenHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Błąd serwera (${res.status})`);
      if (data.simulated) throw new Error(data.message);
      // Bezpiecznik: pokazujemy tylko faktury wystawione na Twój NIP
      const mine = (data.items ?? []).filter((p: PurchaseItem & { buyerNip?: string }) => !p.buyerNip || cleanNip(p.buyerNip) === cleanNip(company.nip));
      setPurchases(mine);
      if (mine.length !== (data.items ?? []).length) setPurchInfo("Pominięto faktury, w których nabywcą nie jest Twój NIP.");
    } catch (err) {
      setPurchError(err instanceof Error ? err.message : "Nie udało się pobrać faktur.");
    } finally {
      setPurchLoading(false);
    }
  };

  const booked = (p: PurchaseItem) => costs.some((c) => c.ksefNumber === p.ksefNumber);

  /** Pobiera pełny XML faktury z KSeF i księguje ją jako koszt (z prawdziwymi stawkami VAT) */
  const bookPurchases = async (items: PurchaseItem[]) => {
    const todo = items.filter((p) => !booked(p));
    setBooking(todo.map((p) => p.ksefNumber));
    const newCosts: Cost[] = [];
    const errors: string[] = [];
    for (const p of todo) {
      try {
        const res = await fetch(`/api/ksef/invoice/${encodeURIComponent(p.ksefNumber)}?nip=${cleanNip(company.nip)}`, { headers: tokenHeaders });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Błąd ${res.status}`);
        const parsed = parseKsefFa(await res.text(), company);
        const cost = parsed.costs[0];
        if (!cost) throw new Error("faktura nie jest zakupem na Twój NIP");
        newCosts.push({ ...cost, ksefNumber: p.ksefNumber, vatDate: p.receivedDate && p.receivedDate !== cost.date ? p.receivedDate : cost.vatDate, paid: false, source: "KSeF" });
      } catch (err) {
        // awaryjnie: koszt z metadanych (bez pozycji)
        const net = round2(p.net);
        const vat = round2(p.vat);
        const ratio = net ? vat / net : 0;
        const rate = !vat ? "zw" : Math.abs(ratio - 0.08) < 0.01 ? "8" : Math.abs(ratio - 0.05) < 0.01 ? "5" : "23";
        newCosts.push({
          id: uid(), docNumber: p.number, date: p.issueDate, vatDate: p.receivedDate && p.receivedDate !== p.issueDate ? p.receivedDate : undefined,
          supplierName: p.supplierName, supplierNip: p.supplierNip, description: "Faktura z KSeF", category: "inne",
          net, vatRate: rate, vat, vatDeduction: "pelne", costShare: 1, isFixedAsset: false, paid: false, ksefNumber: p.ksefNumber,
          createdAt: new Date().toISOString(), source: "KSeF",
        });
        errors.push(`${p.number}: ${(err as Error).message}`);
      }
    }
    if (newCosts.length) importBatch({ costs: newCosts });
    setBooking([]);
    setPurchSelected([]);
    setPurchInfo(
      `Zaksięgowano ${newCosts.length} ${newCosts.length === 1 ? "fakturę" : "faktur"} jako koszty — sprawdź kategorie w zakładce Koszty.` +
        (errors.length ? ` ${errors.length} z nich zapisano z kwot ogólnych (bez szczegółów pozycji).` : ""),
    );
  };

  const downloadPurchaseXml = async (p: PurchaseItem) => {
    try {
      const res = await fetch(`/api/ksef/invoice/${encodeURIComponent(p.ksefNumber)}?nip=${cleanNip(company.nip)}`, { headers: tokenHeaders });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Błąd ${res.status}`);
      downloadFile(`${p.ksefNumber}.xml`, await res.text());
    } catch (err) {
      setPurchError(`Nie udało się pobrać XML: ${(err as Error).message}`);
    }
  };

  const notBooked = (purchases ?? []).filter((p) => !booked(p));
  const allPurchSelected = notBooked.length > 0 && notBooked.every((p) => purchSelected.includes(p.ksefNumber));
  const allSalesSelected = sendable.length > 0 && sendable.every((i) => selected.includes(i.id));

  return (
    <div>
      <PageHeader title="KSeF — Krajowy System e-Faktur" subtitle="Wysyłaj faktury sprzedażowe i pobieraj faktury kosztowe bez przepisywania." />

      {health.ksefMode === "symulacja" && (
        <div className="mb-6">
          <Tip tone="warning" title="Połączenie z KSeF nie jest jeszcze włączone">
            Aplikacja <b>nie wysyła</b> teraz faktur do KSeF i <b>nie pobiera</b> z niego faktur zakupowych — token jest tylko zapisany. Do czasu włączenia połączenia
            wystawiaj i odbieraj faktury w{" "}
            <a className="font-semibold text-brand-600 hover:underline" href="https://ksef.podatki.gov.pl/aplikacja-podatnika-ksef-20/" target="_blank" rel="noreferrer">Aplikacji Podatnika KSeF</a>,
            a pobrane pliki XML wgrywaj w <Link to="/import" className="font-semibold text-brand-600 hover:underline">Import danych</Link>.
          </Tip>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tip tone="info" title="Jak działa KSeF?">
            Faktura dla firmy jest wystawiona dopiero wtedy, gdy trafi do KSeF i otrzyma numer KSeF. Faktury zakupowe od dostawców pobierasz z KSeF i księgujesz jednym kliknięciem.{" "}
            <Link to="/wiedza/ksef" className="font-semibold text-brand-600 hover:underline">Dowiedz się więcej</Link>
          </Tip>
        </div>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className={clsx("grid h-10 w-10 place-items-center rounded-xl", connected && live ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600")}>
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">{!connected ? "Brak tokena KSeF" : live ? "Połączenie z KSeF aktywne" : "Token zapisany"}</div>
              <div className="text-xs text-slate-500">
                {live ? `Środowisko: ${health.ksefEnv === "prod" ? "produkcyjne" : health.ksefEnv}` : "Połączenie wyłączone na serwerze"}
                {live && !sendEnabled && " · wysyłka wyłączona"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Faktury z numerem KSeF</span>
            <b>{accepted} / {list.length}</b>
          </div>
          <Button to="/ustawienia" variant="secondary" size="sm" className="mt-4 w-full">{connected ? "Zmień token" : "Dodaj token w ustawieniach"}</Button>
        </Card>
      </div>

      {/* ───────────── Sprzedaż ───────────── */}
      <Card className="mb-6">
        <CardHeader
          title="Faktury sprzedażowe"
          subtitle="Zaznacz faktury i wyślij je do KSeF"
          icon={<CloudUpload className="h-5 w-5" />}
          action={
            <Button size="sm" icon={<Send className="h-4 w-4" />} disabled={!selected.length || sending.length > 0} onClick={() => setConfirm(sendable.filter((i) => selected.includes(i.id)))}>
              Wyślij wybrane ({selected.length})
            </Button>
          }
        />
        {!list.length ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Brak wystawionych faktur" description="Gdy wystawisz fakturę, pojawi się tutaj gotowa do wysłania do KSeF." action={<Button to="/faktury/nowa">Wystaw fakturę</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="table-head w-10">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allSalesSelected} disabled={!sendable.length} onChange={() => setSelected(allSalesSelected ? [] : sendable.map((i) => i.id))} aria-label="Zaznacz wszystkie do wysłania" />
                  </th>
                  <th className="table-head">Numer</th>
                  <th className="table-head">Nabywca</th>
                  <th className="table-head text-right">Brutto</th>
                  <th className="table-head">Status KSeF</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((inv) => {
                  const hasNumber = !!inv.ksef.number;
                  const st = hasNumber ? STATUS.przyjeta : STATUS[inv.ksef.status];
                  const busy = sending.includes(inv.id);
                  const sendableRow = canSend(inv);
                  return (
                    <tr key={inv.id} className={clsx("hover:bg-slate-50/60", selected.includes(inv.id) && "bg-brand-50/40")}>
                      <td className="table-cell">
                        {sendableRow && <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.includes(inv.id)} onChange={() => setSelected((s) => toggle(s, inv.id))} aria-label={`Zaznacz ${inv.number}`} />}
                      </td>
                      <td className="table-cell">
                        <Link to={`/faktury/${inv.id}`} className="font-medium text-slate-900 hover:text-brand-600">{inv.number}</Link>
                        <div className="text-xs text-slate-500">{inv.issueDate}</div>
                      </td>
                      <td className="table-cell">
                        {inv.buyer.name}
                        {!inv.buyer.isCompany && <div className="text-xs text-slate-400">B2C — KSeF opcjonalny</div>}
                      </td>
                      <td className="table-cell text-right font-semibold">{num2(invoiceTotals(inv).gross)}</td>
                      <td className="table-cell">
                        <Badge tone={st.tone}>
                          {hasNumber || inv.ksef.status === "przyjeta" ? <CheckCircle2 className="h-3 w-3" /> : inv.ksef.status === "odrzucona" ? <XCircle className="h-3 w-3" /> : null}
                          {hasNumber && inv.ksef.status !== "przyjeta" ? "w KSeF" : st.label}
                        </Badge>
                        {inv.ksef.number && <div className="mt-1 font-mono text-[11px] text-slate-500">{inv.ksef.number}</div>}
                        {inv.ksef.message && !hasNumber && <div className="mt-1 max-w-xs text-[11px] text-slate-500">{inv.ksef.message}</div>}
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Code2 className="h-4 w-4" />} onClick={() => setPreview(inv)}>XML</Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadFile(`${inv.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, inv))} aria-label="Pobierz XML">
                            <Download className="h-4 w-4" />
                          </Button>
                          {sendableRow && (
                            <Button size="sm" icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} onClick={() => setConfirm([inv])} disabled={busy}>
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

      {/* ───────────── Zakupy ───────────── */}
      <Card>
        <CardHeader title="Faktury kosztowe z KSeF" subtitle="Faktury wystawione na Twój NIP przez dostawców" icon={<CloudDownload className="h-5 w-5" />} />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Wystawione od"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="do"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="secondary" icon={purchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />} onClick={fetchPurchases} disabled={purchLoading || !from || !to}>
              Sprawdź faktury w KSeF
            </Button>
            {purchases && purchases.length > 0 && (
              <Button variant="success" disabled={!purchSelected.length || booking.length > 0} icon={booking.length ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} onClick={() => bookPurchases(notBooked.filter((p) => purchSelected.includes(p.ksefNumber)))}>
                Pobierz wybrane jako koszty ({purchSelected.length})
              </Button>
            )}
          </div>

          {purchError && <Tip tone="warning">{purchError}</Tip>}
          {purchInfo && <Tip tone="success">{purchInfo}</Tip>}
          {!purchases && !purchError && <p className="text-sm text-slate-500">Wybierz okres i kliknij „Sprawdź faktury w KSeF”. Potem zaznacz te, które chcesz zaksięgować jako koszty.</p>}
          {purchases && !purchases.length && <p className="text-sm text-slate-500">W tym okresie nie ma w KSeF faktur wystawionych na Twój NIP.</p>}

          {purchases && purchases.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="table-head w-10">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allPurchSelected} disabled={!notBooked.length} onChange={() => setPurchSelected(allPurchSelected ? [] : notBooked.map((p) => p.ksefNumber))} aria-label="Zaznacz wszystkie" />
                    </th>
                    <th className="table-head">Dostawca</th>
                    <th className="table-head">Faktura</th>
                    <th className="table-head text-right">Netto</th>
                    <th className="table-head text-right">VAT</th>
                    <th className="table-head text-right">Brutto</th>
                    <th className="table-head" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((p) => {
                    const done = booked(p);
                    const busy = booking.includes(p.ksefNumber);
                    return (
                      <tr key={p.ksefNumber} className={clsx(purchSelected.includes(p.ksefNumber) && "bg-emerald-50/40")}>
                        <td className="table-cell">
                          {!done && <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={purchSelected.includes(p.ksefNumber)} onChange={() => setPurchSelected((s) => toggle(s, p.ksefNumber))} aria-label={`Zaznacz ${p.number}`} />}
                        </td>
                        <td className="table-cell">
                          <div className="font-medium">{p.supplierName || "—"}</div>
                          <div className="text-xs text-slate-500">NIP {p.supplierNip}</div>
                        </td>
                        <td className="table-cell">
                          <div>{p.number}</div>
                          <div className="text-xs text-slate-500">{p.issueDate}{p.receivedDate && p.receivedDate !== p.issueDate ? ` · w KSeF ${p.receivedDate}` : ""}</div>
                          <div className="font-mono text-[10px] text-slate-400">{p.ksefNumber}</div>
                        </td>
                        <td className="table-cell text-right">{num2(p.net)}</td>
                        <td className="table-cell text-right">{num2(p.vat)}</td>
                        <td className="table-cell text-right font-semibold">{pln(p.gross)}{p.currency && p.currency !== "PLN" ? ` ${p.currency}` : ""}</td>
                        <td className="table-cell">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => downloadPurchaseXml(p)} aria-label="Pobierz XML"><Download className="h-4 w-4" /></Button>
                            {done ? (
                              <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> w kosztach</Badge>
                            ) : (
                              <Button size="sm" variant="success" disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} onClick={() => bookPurchases([p])}>Pobierz</Button>
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
        </div>
      </Card>

      {/* Potwierdzenie wysyłki */}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Wysłać ${confirm?.length ?? 0} ${confirm?.length === 1 ? "fakturę" : "faktur"} do KSeF?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Anuluj</Button>
            <Button icon={<Send className="h-4 w-4" />} disabled={!sendEnabled} onClick={() => confirm && sendConfirmed(confirm)}>Tak, wyślij</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          {!sendEnabled && (
            <Tip tone="warning" title="Wysyłka jest wyłączona na serwerze">
              Aby wysyłać faktury, administrator musi ustawić w Railway zmienne <code>KSEF_MODE=live</code> i <code>KSEF_SEND=live</code>.
            </Tip>
          )}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Faktura przyjęta w KSeF ma moc prawną i trafia do klienta. Nie da się jej usunąć — błędy poprawia się fakturą korygującą. Sprawdź dane przed wysłaniem.
          </div>
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
            {confirm?.map((i) => (
              <li key={i.id} className="flex justify-between px-3 py-2">
                <span>{i.number} · {i.buyer.name}</span>
                <b>{pln(invoiceTotals(i).gross)}</b>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={`XML FA(3) — ${preview?.number ?? ""}`}
        wide
        footer={preview && <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${preview.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, preview))}>Pobierz XML</Button>}
      >
        {preview && <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-200">{buildFa3Xml(company, preview)}</pre>}
      </Modal>
    </div>
  );
}
