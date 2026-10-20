import clsx from "clsx";
import { ArrowLeft, Banknote, Building2, CloudUpload, Download, FileCheck2, Mail, Plus, Printer, Save, Search, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Field, Hint, PageHeader, Tabs, Tip, Toggle } from "@/components/ui";
import { invoiceTotals, isProforma, itemTotals, markPaid, nextNumberFor, paidAmount, paymentState, remainingAmount, VAT_RATES, withPayments } from "@/lib/invoice";
import { buildFa3Xml } from "@/lib/ksef";
import { pln } from "@/lib/money";
import { vatRateLabel } from "@/lib/tax";
import { cleanNip, isValidNip } from "@/lib/validation";
import { downloadFile } from "@/lib/xml";
import type { Invoice, InvoiceItem, InvoiceKind, PaymentMethod } from "@/lib/types";
import { todayIso, uid, useStore } from "@/store/useStore";
import { SendInvoiceModal } from "./SendInvoiceModal";

const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function InvoiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { company, contractors, invoices, upsertInvoice, upsertContractor } = useStore();
  const existing = invoices.find((i) => i.id === id);
  const defaultRate = company.vatStatus === "zwolniony" ? "zw" : "23";

  const blank = (): Invoice => {
    const issueDate = todayIso();
    const pre = contractors.find((c) => c.id === params.get("kontrahent"));
    const kind: InvoiceKind = params.get("typ") === "proforma" ? "proforma" : "faktura";
    return {
      id: uid(),
      kind,
      number: nextNumberFor(company, invoices, kind, issueDate),
      issueDate,
      saleDate: issueDate,
      dueDate: addDays(issueDate, company.defaultPaymentDays),
      place: company.address.city,
      paymentMethod: "przelew",
      buyer: pre ? { ...pre, contractorId: pre.id } : { name: "", nip: "", address: { street: "", postalCode: "", city: "", country: "PL" }, email: "", isCompany: true },
      items: [{ id: uid(), name: "", qty: 1, unit: "usł.", netPrice: 0, vatRate: defaultRate }],
      notes: "",
      status: "szkic",
      ksef: { status: "brak" },
      createdAt: new Date().toISOString(),
    };
  };

  const [inv, setInv] = useState<Invoice>(() => existing ?? blank());
  const [saveContractor, setSaveContractor] = useState(!existing);
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle");
  const [saved, setSaved] = useState(!!existing);
  const [sendOpen, setSendOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (existing) setInv(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totals = invoiceTotals(inv);
  const itemNames = useMemo(() => [...new Set(invoices.flatMap((i) => i.items.map((x) => x.name)).filter(Boolean))], [invoices]);
  const locked = existing?.ksef.status === "przyjeta";

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => { setInv((s) => ({ ...s, [k]: v })); setSaved(false); };
  const setBuyer = (patch: Partial<Invoice["buyer"]>) => set("buyer", { ...inv.buyer, ...patch });
  const setAddr = (patch: Partial<Invoice["buyer"]["address"]>) => setBuyer({ address: { ...inv.buyer.address, ...patch } });
  const setItem = (iid: string, patch: Partial<InvoiceItem>) => set("items", inv.items.map((x) => (x.id === iid ? { ...x, ...patch } : x)));

  const pickContractor = (cid: string) => {
    const c = contractors.find((x) => x.id === cid);
    if (c) { setBuyer({ ...c, contractorId: c.id }); setSaveContractor(false); }
  };

  const fetchNip = async () => {
    setLookup("loading");
    try {
      const res = await fetch(`/api/nip/${cleanNip(inv.buyer.nip)}`);
      const d = await res.json();
      if (!d.ok) throw new Error();
      setBuyer({ name: d.name, address: { street: d.street, postalCode: d.postalCode, city: d.city, country: "PL" } });
      setLookup("idle");
    } catch {
      setLookup("error");
    }
  };

  const errors = {
    buyer: !inv.buyer.name ? "Podaj nazwę nabywcy" : "",
    nip: inv.buyer.isCompany && !isValidNip(inv.buyer.nip) ? "Nieprawidłowy NIP" : "",
    items: inv.items.some((x) => !x.name || x.qty <= 0) ? "Uzupełnij nazwę i ilość w każdej pozycji" : "",
    number: invoices.some((i) => i.number === inv.number && i.id !== inv.id) ? "Faktura o tym numerze już istnieje" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = (status: Invoice["status"]) => {
    setTouched(true);
    if (status !== "szkic" && hasErrors) return;
    const nextStatus = inv.status === "szkic" || status === "szkic" ? status : inv.status;
    // przy wystawieniu szkicu z wpłatami status opłacona/wystawiona wynika z sumy wpłat
    const final = inv.payments?.length && nextStatus !== "szkic" ? withPayments({ ...inv, status: nextStatus }, inv.payments) : { ...inv, status: nextStatus };
    if (saveContractor && inv.buyer.name && !inv.buyer.contractorId) {
      const cid = uid();
      upsertContractor({ id: cid, name: inv.buyer.name, nip: inv.buyer.nip, address: inv.buyer.address, email: inv.buyer.email, isCompany: inv.buyer.isCompany });
      final.buyer = { ...final.buyer, contractorId: cid };
    }
    upsertInvoice(final);
    setInv(final);
    setSaved(true);
    if (!id) navigate(`/faktury/${final.id}`, { replace: true });
  };

  const proforma = isProforma(inv);
  const docName = proforma ? "Proforma" : "Faktura";
  const finalInvoice = inv.finalInvoiceId ? invoices.find((i) => i.id === inv.finalInvoiceId) : undefined;
  const sourceProforma = inv.proformaId ? invoices.find((i) => i.id === inv.proformaId) : undefined;
  const paid = paidAmount(inv);
  const remaining = remainingAmount(inv);
  const payState = paymentState(inv);

  const switchKind = (kind: InvoiceKind) => {
    if ((inv.kind ?? "faktura") === kind) return;
    setInv((s) => ({ ...s, kind, number: nextNumberFor(company, invoices, kind, s.issueDate) }));
    setSaved(false);
  };

  /** Zapis wpłat od razu — to dane wewnętrzne, nie zmieniają treści faktury */
  const applyPayments = (payments: NonNullable<Invoice["payments"]>) => {
    const v = withPayments(inv, payments);
    setInv(v);
    if (!existing) setSaved(false);
    if (existing) upsertInvoice({ ...existing, payments: v.payments, status: v.status, paidDate: v.paidDate });
  };

  /** Faktura końcowa na podstawie proformy: te same pozycje i nabywca, przeniesione wpłaty */
  const createFinalInvoice = () => {
    const issueDate = todayIso();
    const final: Invoice = withPayments(
      {
        ...inv,
        id: uid(),
        kind: "faktura",
        number: nextNumberFor(company, invoices, "faktura", issueDate),
        issueDate,
        saleDate: issueDate,
        dueDate: inv.dueDate > issueDate ? inv.dueDate : addDays(issueDate, company.defaultPaymentDays),
        status: "szkic",
        paidDate: undefined,
        ksef: { status: "brak" },
        proformaId: inv.id,
        finalInvoiceId: undefined,
        notes: [inv.notes, `Na podstawie proformy ${inv.number}`].filter(Boolean).join(". "),
        createdAt: new Date().toISOString(),
        source: undefined,
      },
      (inv.payments ?? []).map((p) => ({ ...p, id: uid(), note: p.note || `wpłata do proformy ${inv.number}` })),
    );
    upsertInvoice(final);
    upsertInvoice({ ...inv, finalInvoiceId: final.id });
    navigate(`/faktury/${final.id}`);
  };

  return (
    <div>
      <PageHeader
        title={existing ? `${docName} ${inv.number}` : proforma ? "Nowa proforma" : "Nowa faktura"}
        subtitle={existing ? "Edytuj, drukuj, wyślij lub przekaż do KSeF" : "Wypełnij dane — podpowiemy Ci po drodze"}
        actions={<Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} to="/faktury">Wróć do listy</Button>}
      />
      {inv.status === "szkic" && !inv.proformaId && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs<InvoiceKind> value={inv.kind ?? "faktura"} onChange={switchKind} options={[{ value: "faktura", label: "Faktura VAT" }, { value: "proforma", label: "Proforma" }]} />
          <span className="text-sm text-slate-500">{proforma ? "Proforma to oferta do zapłaty — nie jest fakturą i nie wchodzi do VAT ani podatku." : "Dokument księgowy — trafi do VAT, podatku i KSeF."}</span>
        </div>
      )}
      {sourceProforma && <div className="mb-4"><Tip tone="info" title="Faktura końcowa do proformy">Wystawiona na podstawie proformy <b>{sourceProforma.number}</b>{paid > 0 ? ` — wpłaty z proformy (${pln(paid)}) zostały przeniesione.` : "."} Sprawdź dane i kliknij „Wystaw fakturę”.</Tip></div>}
      {proforma && finalInvoice && <div className="mb-4"><Tip tone="success" title="Faktura końcowa wystawiona">Do tej proformy wystawiono fakturę <b>{finalInvoice.number}</b>. <Button size="sm" variant="secondary" to={`/faktury/${finalInvoice.id}`}>Otwórz fakturę</Button></Tip></div>}
      {locked && <div className="mb-4"><Tip tone="warning" title="Faktura jest w KSeF">Zmiany po wysłaniu do KSeF wymagają wystawienia faktury korygującej. Edytuj tylko dane wewnętrzne (np. status płatności).</Tip></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Nabywca */}
          <Card>
            <CardHeader title="1. Nabywca" subtitle="Komu wystawiasz fakturę?" icon={<Building2 className="h-5 w-5" />} />
            <div className="space-y-4 p-5">
              {contractors.length > 0 && (
                <Field label="Wybierz z zapisanych kontrahentów">
                  <select className="input" value={inv.buyer.contractorId ?? ""} onChange={(e) => pickContractor(e.target.value)}>
                    <option value="">— nowy nabywca —</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name} {c.nip && `(${c.nip})`}</option>)}
                  </select>
                </Field>
              )}
              <Toggle checked={inv.buyer.isCompany} onChange={(v) => setBuyer({ isCompany: v })} label="Nabywca jest firmą (B2B)" hint="Faktury dla firm trafiają do KSeF. Dla osoby prywatnej NIP nie jest wymagany." />
              <div className="grid gap-4 sm:grid-cols-3">
                {inv.buyer.isCompany && (
                  <Field label="NIP" error={touched ? errors.nip : ""} className="sm:col-span-1">
                    <div className="flex gap-2">
                      <input className={clsx("input", touched && errors.nip && "input-error")} value={inv.buyer.nip} onChange={(e) => setBuyer({ nip: e.target.value, contractorId: undefined })} placeholder="0000000000" />
                      <button type="button" title="Pobierz dane z Białej Listy MF" onClick={fetchNip} disabled={!isValidNip(inv.buyer.nip) || lookup === "loading"} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-brand-600 hover:bg-brand-50 disabled:opacity-40">
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                    {lookup === "error" && <span className="mt-1 block text-xs text-amber-600">Nie udało się pobrać danych — wpisz ręcznie.</span>}
                  </Field>
                )}
                <Field label="Nazwa / imię i nazwisko" error={touched ? errors.buyer : ""} className={inv.buyer.isCompany ? "sm:col-span-2" : "sm:col-span-3"}>
                  <input className={clsx("input", touched && errors.buyer && "input-error")} value={inv.buyer.name} onChange={(e) => setBuyer({ name: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Ulica i numer" className="sm:col-span-2"><input className="input" value={inv.buyer.address.street} onChange={(e) => setAddr({ street: e.target.value })} /></Field>
                <Field label="Kod pocztowy"><input className="input" value={inv.buyer.address.postalCode} onChange={(e) => setAddr({ postalCode: e.target.value })} placeholder="00-000" /></Field>
                <Field label="Miasto"><input className="input" value={inv.buyer.address.city} onChange={(e) => setAddr({ city: e.target.value })} /></Field>
              </div>
              <div className="grid items-end gap-4 sm:grid-cols-2">
                <Field label="E-mail do wysyłki faktury"><input className="input" type="email" value={inv.buyer.email} onChange={(e) => setBuyer({ email: e.target.value })} /></Field>
                {!inv.buyer.contractorId && <Toggle checked={saveContractor} onChange={setSaveContractor} label="Zapisz w kontrahentach" />}
              </div>
            </div>
          </Card>

          {/* Pozycje */}
          <Card>
            <CardHeader title="2. Pozycje" subtitle="Co sprzedajesz?" icon={<Plus className="h-5 w-5" />} />
            <div className="space-y-3 p-5">
              <datalist id="item-names">{itemNames.map((n) => <option key={n} value={n} />)}</datalist>
              {inv.items.map((it, idx) => {
                const t = itemTotals(it);
                return (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <div className="col-span-2 sm:col-span-6">
                        <span className="label">{idx + 1}. Nazwa usługi / towaru</span>
                        <input className="input" list="item-names" value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder="np. Usługi programistyczne — październik" />
                      </div>
                      <div>
                        <span className="label">Ilość</span>
                        <input className="input" type="number" min={0} step="any" value={it.qty} onChange={(e) => setItem(it.id, { qty: Number(e.target.value) })} />
                      </div>
                      <div>
                        <span className="label">J.m.</span>
                        <select className="input px-2" value={it.unit} onChange={(e) => setItem(it.id, { unit: e.target.value })}>
                          {["usł.", "szt.", "godz.", "dzień", "mies.", "kpl.", "km"].map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="label">Cena netto</span>
                        <input className="input" type="number" min={0} step="0.01" value={it.netPrice || ""} onChange={(e) => setItem(it.id, { netPrice: Number(e.target.value) })} placeholder="0,00" />
                      </div>
                      <div>
                        <span className="label">VAT</span>
                        <select className="input px-2" value={it.vatRate} onChange={(e) => setItem(it.id, { vatRate: e.target.value as InvoiceItem["vatRate"] })} disabled={company.vatStatus === "zwolniony"}>
                          {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Brutto</div>
                          <div className="font-semibold">{pln(t.gross)}</div>
                        </div>
                        <button className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-30" disabled={inv.items.length === 1} onClick={() => set("items", inv.items.filter((x) => x.id !== it.id))} aria-label="Usuń pozycję">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {touched && errors.items && <p className="text-sm font-medium text-rose-600">{errors.items}</p>}
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set("items", [...inv.items, { id: uid(), name: "", qty: 1, unit: "usł.", netPrice: 0, vatRate: defaultRate }])}>
                Dodaj pozycję
              </Button>
              {company.vatStatus === "zwolniony" && <Tip tone="info">Korzystasz ze zwolnienia z VAT — na fakturze pojawi się podstawa prawna: <b>{company.vatExemptionBasis}</b>.</Tip>}
            </div>
          </Card>

          {/* Daty i płatność */}
          <Card>
            <CardHeader title="3. Daty i płatność" icon={<Send className="h-5 w-5" />} />
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Numer faktury" error={errors.number} hint="Numeracja musi być ciągła. Wzór ustawisz w Ustawieniach."><input className={clsx("input", errors.number && "input-error")} value={inv.number} onChange={(e) => set("number", e.target.value)} /></Field>
              <Field label="Data wystawienia"><input className="input" type="date" value={inv.issueDate} onChange={(e) => set("issueDate", e.target.value)} /></Field>
              <Field label="Data sprzedaży" hint="Dzień wykonania usługi (lub ostatni dzień miesiąca przy rozliczeniu miesięcznym). Od niej zależy, w którym miesiącu rozliczysz VAT i podatek."><input className="input" type="date" value={inv.saleDate} onChange={(e) => set("saleDate", e.target.value)} /></Field>
              <Field label="Miejsce wystawienia"><input className="input" value={inv.place} onChange={(e) => set("place", e.target.value)} /></Field>
              <Field label="Sposób płatności">
                <select className="input" value={inv.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value as PaymentMethod)}>
                  <option value="przelew">Przelew</option>
                  <option value="gotowka">Gotówka</option>
                  <option value="karta">Karta</option>
                </select>
              </Field>
              <Field label="Termin płatności"><input className="input" type="date" value={inv.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
              <div className="flex items-end gap-1.5 sm:col-span-2">
                {[0, 7, 14, 30].map((d) => (
                  <button key={d} onClick={() => set("dueDate", addDays(inv.issueDate, d))} className={clsx("rounded-lg border px-3 py-2 text-sm font-medium transition", inv.dueDate === addDays(inv.issueDate, d) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50")}>
                    {d === 0 ? "od razu" : `${d} dni`}
                  </button>
                ))}
              </div>
              <Field label="Uwagi na fakturze" className="sm:col-span-2 lg:col-span-4"><textarea className="input" rows={2} value={inv.notes} onChange={(e) => set("notes", e.target.value)} placeholder="np. numer zamówienia, okres rozliczeniowy" /></Field>
            </div>
          </Card>
        </div>

        {/* Podsumowanie */}
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600 to-violet-600 p-5 text-white">
              <div className="text-sm text-white/70">{payState === "czesciowo" ? "Pozostało do zapłaty" : "Do zapłaty"}</div>
              <div className="text-3xl font-bold">{pln(payState === "czesciowo" ? remaining : totals.gross)}</div>
              {payState === "czesciowo" && <div className="text-sm text-white/80">z {pln(totals.gross)} · zapłacono {pln(paid)}</div>}
              <div className="mt-1 text-sm text-white/80">netto {pln(totals.net)} · VAT {pln(totals.vat)}</div>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              {totals.rates.map((r) => (
                <div key={r.rate} className="flex justify-between px-5 py-2.5"><span className="text-slate-500">Stawka {vatRateLabel(r.rate)}</span><span>{pln(r.net)} + {pln(r.vat)}</span></div>
              ))}
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-500">Status</span>
                <div className="flex gap-1">
                  {proforma && <Badge tone="violet">proforma</Badge>}
                  <Badge tone={inv.status === "szkic" ? "slate" : payState === "oplacona" ? "green" : "amber"}>
                    {inv.status === "szkic" ? "szkic" : payState === "oplacona" ? "opłacona" : payState === "czesciowo" ? "częściowo opłacona" : "czeka na zapłatę"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-2 p-5">
              {inv.status === "szkic" ? (
                <>
                  <Button className="w-full" size="lg" onClick={() => save("wystawiona")} icon={<Save className="h-5 w-5" />}>{proforma ? "Wystaw proformę" : "Wystaw fakturę"}</Button>
                  <Button className="w-full" variant="secondary" onClick={() => save("szkic")}>Zapisz jako szkic</Button>
                </>
              ) : (
                <Button className="w-full" onClick={() => save(inv.status)} icon={<Save className="h-4 w-4" />} disabled={saved}>{saved ? "Zapisano" : "Zapisz zmiany"}</Button>
              )}
              {touched && hasErrors && <p className="text-center text-xs font-medium text-rose-600">Popraw zaznaczone pola</p>}
            </div>
          </Card>

          {saved && inv.status !== "szkic" && (
            <Card className="p-5">
              <div className="mb-3 font-semibold">Co dalej?</div>
              <div className="grid gap-2">
                <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/faktury/${inv.id}/druk`, "_blank")}>Drukuj / zapisz PDF</Button>
                <Button variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={() => setSendOpen(true)}>Wyślij e-mailem</Button>
                {proforma && !finalInvoice && <Button icon={<FileCheck2 className="h-4 w-4" />} onClick={createFinalInvoice}>Wystaw fakturę końcową</Button>}
                {!proforma && inv.buyer.isCompany && !inv.ksef.number && inv.ksef.status !== "przyjeta" && <Button variant="secondary" icon={<CloudUpload className="h-4 w-4" />} to="/ksef">Wyślij do KSeF</Button>}
                {!proforma && <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${inv.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, inv))}>Pobierz XML (FA(3))</Button>}
                {payState !== "oplacona" && <Button variant="success" onClick={() => { const v = markPaid(inv, todayIso(), uid()); setInv(v); upsertInvoice(v); }}>Oznacz jako opłaconą w całości</Button>}
              </div>
            </Card>
          )}

          <PaymentsCard inv={inv} total={totals.gross} paid={paid} remaining={remaining} onChange={applyPayments} />

          {proforma && (
            <Tip tone="info" title="Proforma a zaliczka">
              Jeśli klient zapłacił przed wykonaniem usługi, otrzymana kwota to zaliczka — przy VAT czynnym wystaw do niej fakturę (zaliczkową) najpóźniej 15. dnia następnego miesiąca. Najprościej: po zapłacie kliknij „Wystaw fakturę końcową”.
            </Tip>
          )}

          <Tip title="Podpowiedź" tone="tip">
            Fakturę wystawiasz najpóźniej 15. dnia miesiąca po wykonaniu usługi. <span className="inline-flex align-middle"><Hint text="Wyjątki dotyczą m.in. usług budowlanych (30 dni) i dostaw mediów." /></span>
          </Tip>
        </div>
      </div>
      {sendOpen && <SendInvoiceModal invoice={inv} onClose={() => setSendOpen(false)} />}
    </div>
  );
}

function PaymentsCard({ inv, total, paid, remaining, onChange }: { inv: Invoice; total: number; paid: number; remaining: number; onChange: (p: NonNullable<Invoice["payments"]>) => void }) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState<number>(remaining);
  const [note, setNote] = useState("");
  useEffect(() => setAmount(remaining), [remaining]);
  // faktury oznaczone jako opłacone przed wprowadzeniem wpłat — pokazujemy jako jedną wpłatę
  const list = inv.payments?.length ? inv.payments : paid > 0 ? [{ id: "legacy", date: inv.paidDate ?? inv.issueDate, amount: paid }] : [];
  const add = () => {
    if (!amount || amount <= 0) return;
    onChange([...list.map((p) => (p.id === "legacy" ? { ...p, id: uid() } : p)), { id: uid(), date, amount: Math.round(amount * 100) / 100, method: inv.paymentMethod, note: note || undefined }]);
    setNote("");
  };
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 font-semibold"><Banknote className="h-4 w-4 text-emerald-600" /> Wpłaty od klienta</div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.min(100, total ? (paid / total) * 100 : 0)}%` }} />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div><div className="text-slate-500">Zapłacono</div><div className="font-semibold text-emerald-700">{pln(paid)}</div></div>
        <div><div className="text-slate-500">Pozostało</div><div className={clsx("font-semibold", remaining > 0 ? "text-amber-700" : "text-slate-400")}>{pln(remaining)}</div></div>
      </div>
      {list.length > 0 && (
        <div className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="text-slate-500">{p.date}</span>
              <span className="flex-1 truncate text-xs text-slate-400">{"note" in p && p.note ? p.note : ""}</span>
              <b>{pln(p.amount)}</b>
              <button className="rounded p-1 text-rose-500 hover:bg-rose-50" aria-label="Usuń wpłatę" onClick={() => onChange(list.filter((x) => x.id !== p.id && x.id !== "legacy").map((x) => x))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data wpłaty" />
            <input className="input" type="number" step="0.01" min={0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Kwota wpłaty" />
          </div>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notatka (opcjonalnie), np. przelew 1/2" />
          <Button className="w-full" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={add} disabled={!amount || amount <= 0}>Dodaj wpłatę</Button>
        </div>
      )}
    </Card>
  );
}
