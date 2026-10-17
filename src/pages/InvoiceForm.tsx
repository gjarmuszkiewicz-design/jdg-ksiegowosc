import clsx from "clsx";
import { ArrowLeft, Building2, CloudUpload, Download, Mail, Plus, Printer, Save, Search, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Field, Hint, PageHeader, Tip, Toggle } from "@/components/ui";
import { invoiceTotals, itemTotals, nextInvoiceNumber, VAT_RATES } from "@/lib/invoice";
import { buildFa3Xml } from "@/lib/ksef";
import { pln } from "@/lib/money";
import { vatRateLabel } from "@/lib/tax";
import { cleanNip, isValidNip } from "@/lib/validation";
import { downloadFile } from "@/lib/xml";
import type { Invoice, InvoiceItem, PaymentMethod } from "@/lib/types";
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
    return {
      id: uid(),
      number: nextInvoiceNumber(company.invoiceNumberPattern, invoices, issueDate),
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
    const final = { ...inv, status: inv.status === "szkic" || status === "szkic" ? status : inv.status };
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

  return (
    <div>
      <PageHeader
        title={existing ? `Faktura ${inv.number}` : "Nowa faktura"}
        subtitle={existing ? "Edytuj, drukuj, wyślij lub przekaż do KSeF" : "Wypełnij dane — podpowiemy Ci po drodze"}
        actions={<Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} to="/faktury">Wróć do listy</Button>}
      />
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
              <div className="text-sm text-white/70">Do zapłaty</div>
              <div className="text-3xl font-bold">{pln(totals.gross)}</div>
              <div className="mt-1 text-sm text-white/80">netto {pln(totals.net)} · VAT {pln(totals.vat)}</div>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              {totals.rates.map((r) => (
                <div key={r.rate} className="flex justify-between px-5 py-2.5"><span className="text-slate-500">Stawka {vatRateLabel(r.rate)}</span><span>{pln(r.net)} + {pln(r.vat)}</span></div>
              ))}
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-500">Status</span>
                <Badge tone={inv.status === "szkic" ? "slate" : inv.status === "oplacona" ? "green" : "amber"}>{inv.status}</Badge>
              </div>
            </div>
            <div className="space-y-2 p-5">
              {inv.status === "szkic" ? (
                <>
                  <Button className="w-full" size="lg" onClick={() => save("wystawiona")} icon={<Save className="h-5 w-5" />}>Wystaw fakturę</Button>
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
                {inv.buyer.isCompany && inv.ksef.status !== "przyjeta" && <Button variant="secondary" icon={<CloudUpload className="h-4 w-4" />} to="/ksef">Wyślij do KSeF</Button>}
                <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${inv.number.replace(/\//g, "_")}_FA3.xml`, buildFa3Xml(company, inv))}>Pobierz XML (FA(3))</Button>
                {inv.status !== "oplacona" && <Button variant="success" onClick={() => { const v = { ...inv, status: "oplacona" as const, paidDate: todayIso() }; upsertInvoice(v); setInv(v); }}>Oznacz jako opłaconą</Button>}
              </div>
            </Card>
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
