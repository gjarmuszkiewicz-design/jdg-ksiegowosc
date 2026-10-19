import clsx from "clsx";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Stat, Tip } from "@/components/ui";
import { useYearData } from "@/lib/hooks";
import { pln } from "@/lib/money";
import { computeObligations, PAYMENT_KIND_LABELS, PAYMENT_TARGET, type Obligation } from "@/lib/obligations";
import { monthLabel } from "@/lib/tax";
import type { Payment, PaymentKind } from "@/lib/types";
import { todayIso, uid, useStore } from "@/store/useStore";

const STATUS: Record<Obligation["status"], { label: string; tone: "green" | "amber" | "red" | "blue" | "slate" }> = {
  zaplacone: { label: "zapłacone", tone: "green" },
  czesciowo: { label: "częściowo", tone: "amber" },
  zalegle: { label: "zaległe", tone: "red" },
  do_zaplaty: { label: "do zapłaty", tone: "blue" },
  szacunek: { label: "miesiąc trwa", tone: "slate" },
};

const fmtDate = (d: string) => d.split("-").reverse().join(".");

export default function Payments() {
  const data = useYearData();
  const payments = useStore((s) => s.payments);
  const upsertPayment = useStore((s) => s.upsertPayment);
  const deletePayment = useStore((s) => s.deletePayment);
  const [edit, setEdit] = useState<Payment | null>(null);
  const [toDelete, setToDelete] = useState<Payment | null>(null);

  const ob = useMemo(() => computeObligations(data, payments), [data, payments]);
  const byPeriod = useMemo(() => {
    const map = new Map<string, Obligation[]>();
    for (const o of ob.obligations) map.set(o.period, [...(map.get(o.period) ?? []), o]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [ob]);

  const newPayment = (o?: Obligation): Payment => ({
    id: uid(),
    kind: o?.kind ?? "pit",
    period: o?.period ?? todayIso().slice(0, 7),
    amount: o ? Math.ceil(o.remaining) : 0,
    paidDate: todayIso(),
  });

  const markAllOverdue = () => {
    for (const o of ob.overdue) upsertPayment({ ...newPayment(o), amount: o.remaining, note: "Oznaczono zbiorczo jako zapłacone" });
  };

  return (
    <div>
      <PageHeader
        title="Podatki i ZUS — płatności"
        subtitle="Co i do kiedy trzeba zapłacić, co już zapłaciłeś i gdzie są zaległości"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit(newPayment())}>Dodaj wpłatę</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Zaległe" value={pln(ob.overdueTotal)} sub={ob.overdue.length ? `${ob.overdue.length} pozycji po terminie` : "Brak zaległości 🎉"} icon={<AlertTriangle className="h-5 w-5" />} tone={ob.overdueTotal ? "rose" : "green"} />
        <Stat label="Do zapłaty w terminie" value={pln(ob.upcomingTotal)} sub={ob.nextDue ? `najbliższy termin: ${fmtDate(ob.nextDue)}` : "nic nie czeka"} icon={<CalendarClock className="h-5 w-5" />} tone="amber" />
        <Stat label="Zapłacone w tym roku" value={pln(ob.paidThisYear)} sub={`${payments.length} wpłat w rejestrze`} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
      </div>

      {ob.overdueTotal > 0 && (
        <div className="mb-6">
          <Tip tone="warning" title="Jak uregulować zaległości">
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li><b>PIT i VAT:</b> przed zapłatą złóż w e-Urzędzie Skarbowym <b>czynny żal</b> (zawiadomienie o spóźnionej zapłacie) — chroni przed karą skarbową.</li>
              <li>Zapłać zaległość <b>z odsetkami za zwłokę</b> — kwotę policzysz w kalkulatorze odsetek na podatki.gov.pl (odsetek nie płaci się, gdy są bardzo małe).</li>
              <li><b>ZUS:</b> dopłać brakującą kwotę na rachunek składkowy (NRS); ZUS sam nalicza odsetki i pokaże je w eZUS.</li>
              <li>Po zapłacie kliknij <b>„Zapłacone”</b> przy pozycji — zaległość zniknie z pulpitu.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" href="https://www.podatki.gov.pl/mikrorachunek-podatkowy/" target="_blank" rel="noreferrer">Mikrorachunek podatkowy <ExternalLink className="h-3.5 w-3.5" /></a>
              <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" href="https://www.podatki.gov.pl/kalkulatory/" target="_blank" rel="noreferrer">Kalkulator odsetek <ExternalLink className="h-3.5 w-3.5" /></a>
              <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" href="https://urzadskarbowy.gov.pl/" target="_blank" rel="noreferrer">e-Urząd Skarbowy <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
            <div className="mt-3"><Button size="sm" variant="secondary" onClick={markAllOverdue}>Wszystko już zapłaciłem — oznacz zaległe jako zapłacone</Button></div>
          </Tip>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Zobowiązania miesiąc po miesiącu" subtitle="Kwoty wyliczone z Twoich faktur, kosztów i ustawień ZUS" icon={<Landmark className="h-5 w-5" />} />
        {byPeriod.length === 0 ? (
          <EmptyState icon={<Landmark className="h-6 w-6" />} title="Brak zobowiązań" description="Gdy dodasz faktury i ustawisz datę rozpoczęcia działalności, pojawią się tu podatki i składki do zapłaty." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-head">Za okres</th>
                  <th className="table-head">Co</th>
                  <th className="table-head">Termin</th>
                  <th className="table-head text-right">Należne</th>
                  <th className="table-head text-right">Zapłacono</th>
                  <th className="table-head text-right">Pozostało</th>
                  <th className="table-head">Status</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byPeriod.map(([period, items]) =>
                  items.map((o, i) => (
                    <tr key={`${o.period}-${o.kind}`} className={clsx(o.status === "zalegle" && "bg-rose-50/40")}>
                      <td className="table-cell font-semibold">{i === 0 ? monthLabel(period) : ""}</td>
                      <td className="table-cell">{PAYMENT_KIND_LABELS[o.kind]}</td>
                      <td className="table-cell text-slate-600">
                        {fmtDate(o.dueDate)}
                        {o.daysLate > 0 && <div className="text-xs font-medium text-rose-600">{o.daysLate} dni po terminie</div>}
                      </td>
                      <td className="table-cell text-right">{pln(o.amount)}</td>
                      <td className="table-cell text-right text-emerald-700">{o.paid ? pln(o.paid) : "—"}</td>
                      <td className="table-cell text-right font-semibold">{o.remaining ? pln(o.remaining) : "—"}</td>
                      <td className="table-cell"><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></td>
                      <td className="table-cell text-right">
                        {o.remaining > 0 && !o.estimate && (
                          <Button size="sm" variant={o.status === "zalegle" ? "danger" : "secondary"} onClick={() => setEdit(newPayment(o))}>Zapłacone</Button>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Historia wpłat" icon={<Wallet className="h-5 w-5" />} />
        {payments.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nie ma jeszcze żadnych wpłat. Kliknij „Zapłacone” przy pozycji powyżej albo „Dodaj wpłatę”.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...payments].sort((a, b) => b.paidDate.localeCompare(a.paidDate)).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="w-24 text-slate-500">{fmtDate(p.paidDate)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{PAYMENT_KIND_LABELS[p.kind]} — {monthLabel(p.period)}</div>
                  {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
                </div>
                <div className="font-semibold">{pln(p.amount)}</div>
                <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setEdit(p)}>edytuj</button>
                <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => setToDelete(p)} aria-label="Usuń wpłatę"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {edit && <PaymentModal value={edit} onClose={() => setEdit(null)} onSave={(p) => { upsertPayment(p); setEdit(null); }} />}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Usunąć wpłatę?" footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Anuluj</Button><Button variant="danger" onClick={() => { deletePayment(toDelete!.id); setToDelete(null); }}>Usuń</Button></>}>
        <p className="text-sm text-slate-600">Wpłata zostanie usunięta z rejestru, a zobowiązanie wróci jako niezapłacone.</p>
      </Modal>
    </div>
  );
}

function PaymentModal({ value, onClose, onSave }: { value: Payment; onClose: () => void; onSave: (p: Payment) => void }) {
  const [p, setP] = useState(value);
  const set = (patch: Partial<Payment>) => setP((x) => ({ ...x, ...patch }));
  return (
    <Modal open onClose={onClose} title="Wpłata" footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button disabled={!p.amount || !p.paidDate} onClick={() => onSave({ ...p, amount: Number(p.amount) })}>Zapisz</Button></>}>
      <div className="space-y-4">
        <Field label="Rodzaj">
          <select className="input" value={p.kind} onChange={(e) => set({ kind: e.target.value as PaymentKind })}>
            {Object.entries(PAYMENT_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Za okres" hint="Miesiąc, którego dotyczy wpłata — np. składki za wrzesień płacone w październiku to „wrzesień”.">
            <input className="input" type="month" value={p.period} onChange={(e) => set({ period: e.target.value })} />
          </Field>
          <Field label="Kwota (zł)"><input className="input" type="number" step="0.01" min={0} value={p.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>
          <Field label="Data zapłaty"><input className="input" type="date" value={p.paidDate} onChange={(e) => set({ paidDate: e.target.value })} /></Field>
        </div>
        <Field label="Notatka (opcjonalnie)"><input className="input" value={p.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="np. z odsetkami, czynny żal złożony 22.10" /></Field>
        {PAYMENT_TARGET[p.kind] && <p className="text-xs text-slate-500">Płatność na: <b>{PAYMENT_TARGET[p.kind]}</b>.</p>}
      </div>
    </Modal>
  );
}
