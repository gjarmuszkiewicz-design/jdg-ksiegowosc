import clsx from "clsx";
import { Archive, CalendarRange, ChevronDown, ChevronRight, Download, Package, Pencil, Plus, Trash2, TrendingDown, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Hint, Modal, PageHeader, Stat, Tip } from "@/components/ui";
import { assetStatus, CAR_LIMIT_LABELS, deductibleShare, depreciationSchedule, KST_GROUPS, METHOD_LABELS, monthlyDepreciation } from "@/lib/assets";
import { currentYear } from "@/lib/hooks";
import { num2, pln, round2 } from "@/lib/money";
import { MONTHS_PL, monthLabel } from "@/lib/tax";
import { downloadFile } from "@/lib/xml";
import type { FixedAsset } from "@/lib/types";
import { todayIso, useStore } from "@/store/useStore";

const kstLabel = (v: string) => KST_GROUPS.find((g) => g.value === v)?.label ?? v;
const methodTone = { liniowa: "blue", degresywna: "violet", jednorazowa_de_minimis: "amber", jednorazowa_niskocenna: "green" } as const;
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

function ScheduleModal({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const rows = useMemo(() => depreciationSchedule(asset), [asset]);
  const years = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const y = r.month.slice(0, 4);
      map.set(y, [...(map.get(y) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);
  const [open, setOpen] = useState<string | null>(String(currentYear()));

  const exportCsv = () => {
    const head = ["Miesiąc", "Odpis", "W tym koszt podatkowy", "Umorzenie narastająco", "Wartość netto", "Uwagi"];
    const lines = rows.map((r) => [r.month, num2(r.amount), num2(r.deductible), num2(r.cumulative), num2(r.remaining), r.note ?? ""]);
    downloadFile(`plan_amortyzacji_${(asset.inventoryNo || asset.name).replace(/[^\w-]+/g, "_")}.csv`, "﻿" + [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\n"), "text/csv");
  };

  return (
    <Modal open onClose={onClose} title={`Plan amortyzacji — ${asset.name}`} wide footer={<><Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Eksport CSV</Button><Button onClick={onClose}>Zamknij</Button></>}>
      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">Wartość początkowa</div><div className="font-semibold">{pln(asset.initialValue)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">Metoda / stawka</div><div className="font-semibold">{METHOD_LABELS[asset.method]} · {(asset.rate * 100).toLocaleString("pl-PL")}%</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">Kosztem podatkowym</div><div className="font-semibold">{(deductibleShare(asset) * 100).toFixed(1)}% odpisów</div></div>
      </div>
      {!rows.length ? (
        <p className="text-sm text-slate-500">Brak odpisów do wyliczenia.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Miesiąc</th>
                <th className="table-head text-right">Odpis</th>
                <th className="table-head text-right">W tym koszt</th>
                <th className="table-head text-right">Umorzenie</th>
                <th className="table-head text-right">Wartość netto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {years.map(([y, list]) => {
                const isOpen = open === y;
                const last = list[list.length - 1];
                return [
                  <tr key={y} className="cursor-pointer bg-brand-50/40 font-semibold hover:bg-brand-50" onClick={() => setOpen(isOpen ? null : y)}>
                    <td className="table-cell"><span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Rok {y} <span className="font-normal text-slate-400">({list.length} mies.)</span></span></td>
                    <td className="table-cell text-right">{num2(round2(list.reduce((s, r) => s + r.amount, 0)))}</td>
                    <td className="table-cell text-right">{num2(round2(list.reduce((s, r) => s + r.deductible, 0)))}</td>
                    <td className="table-cell text-right">{num2(last.cumulative)}</td>
                    <td className="table-cell text-right">{num2(last.remaining)}</td>
                  </tr>,
                  ...(isOpen
                    ? list.map((r) => (
                        <tr key={r.month}>
                          <td className="table-cell pl-10 text-slate-600">{monthLabel(r.month)}{r.note && <div className="text-xs text-amber-600">{r.note}</div>}</td>
                          <td className="table-cell text-right">{num2(r.amount)}</td>
                          <td className="table-cell text-right text-emerald-700">{num2(r.deductible)}</td>
                          <td className="table-cell text-right text-slate-500">{num2(r.cumulative)}</td>
                          <td className="table-cell text-right text-slate-500">{num2(r.remaining)}</td>
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Assets() {
  const navigate = useNavigate();
  const { assets, company, upsertAsset, deleteAsset } = useStore();
  const [schedule, setSchedule] = useState<FixedAsset | null>(null);
  const [dispose, setDispose] = useState<FixedAsset | null>(null);
  const [disposeDate, setDisposeDate] = useState(todayIso());
  const [toDelete, setToDelete] = useState<FixedAsset | null>(null);
  const year = currentYear();
  const isRyczalt = company.taxForm === "ryczalt";

  const yearRows = useMemo(
    () => MONTHS_PL.map((name, i) => ({ name, ...monthlyDepreciation(assets, `${year}-${String(i + 1).padStart(2, "0")}`) })),
    [assets, year],
  );
  const stats = useMemo(() => {
    const st = assets.map((a) => assetStatus(a));
    return {
      initial: round2(assets.reduce((s, a) => s + a.initialValue, 0)),
      cumulative: round2(st.reduce((s, x) => s + x.cumulative, 0)),
      net: round2(st.reduce((s, x) => s + x.netValue, 0)),
      yearDeductible: round2(yearRows.reduce((s, r) => s + r.deductible, 0)),
      yearAmount: round2(yearRows.reduce((s, r) => s + r.amount, 0)),
    };
  }, [assets, yearRows]);

  const sorted = [...assets].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Środki trwałe i amortyzacja"
        subtitle="Ewidencja środków trwałych oraz wartości niematerialnych i prawnych"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/srodki-trwale/nowy")}>Dodaj środek trwały</Button>}
      />

      <Tip tone="info" title="Jak to działa?">
        Środek trwały to rzecz używana w firmie dłużej niż rok (laptop, auto, meble). Jeśli kosztuje <b>do 10 000 zł netto</b>, możesz wrzucić go w koszty od razu. Droższe rozliczasz <b>odpisami amortyzacyjnymi</b> — liniowo, degresywnie albo jednorazowo w ramach pomocy de minimis. Odpisy zaczynają się od miesiąca <b>następującego po przyjęciu do używania</b> i trafiają do kosztów automatycznie.
      </Tip>
      {isRyczalt && (
        <Tip tone="warning" title="Jesteś na ryczałcie">
          Amortyzacja nie obniża ryczałtu (podatek liczy się od przychodu). Ewidencję środków trwałych i tak trzeba prowadzić — przyda się m.in. przy sprzedaży sprzętu i przy zmianie formy opodatkowania.
        </Tip>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Wartość początkowa" value={pln(stats.initial)} sub={`${assets.length} pozycji`} icon={<Package className="h-5 w-5" />} tone="blue" />
        <Stat label="Umorzenie narastająco" value={pln(stats.cumulative)} sub="dotychczasowe odpisy" icon={<TrendingDown className="h-5 w-5" />} tone="violet" />
        <Stat label="Wartość netto" value={pln(stats.net)} sub="pozostało do zamortyzowania" icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <Stat label={`Odpisy kosztowe ${year}`} value={pln(stats.yearDeductible)} sub={isRyczalt ? "bez wpływu na ryczałt" : `z ${pln(stats.yearAmount)} odpisów`} icon={<CalendarRange className="h-5 w-5" />} tone="green" hint="Część odpisów, która jest kosztem podatkowym (np. po limicie wartości samochodu osobowego)." />
      </div>

      <Card>
        <CardHeader title="Ewidencja" subtitle="Kliknij „Plan”, aby zobaczyć odpisy miesiąc po miesiącu" icon={<Package className="h-5 w-5" />} />
        {!assets.length ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="Brak środków trwałych" description="Dodaj laptop, samochód czy licencję — policzymy odpisy i dodamy je do kosztów." action={<Button onClick={() => navigate("/srodki-trwale/nowy")}>Dodaj pierwszy</Button>} />
        ) : (
          <div className="divide-y divide-slate-100">
            {sorted.map((a) => {
              const st = assetStatus(a);
              const progress = a.initialValue ? Math.min(100, (st.cumulative / a.initialValue) * 100) : 0;
              const share = deductibleShare(a);
              return (
                <div key={a.id} className={clsx("flex flex-col gap-4 p-5 lg:flex-row lg:items-center", a.disposalDate && "opacity-70")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{a.name}</span>
                      {a.inventoryNo && <span className="text-xs text-slate-400">{a.inventoryNo}</span>}
                      <Badge tone={methodTone[a.method]}>{METHOD_LABELS[a.method]}</Badge>
                      {a.isIntangible && <Badge tone="slate">WNiP</Badge>}
                      {st.fullyDepreciated && <Badge tone="green">zamortyzowany</Badge>}
                      {a.disposalDate && <Badge tone="red">zlikwidowany {a.disposalDate}</Badge>}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {kstLabel(a.kstGroup)} · stawka {(a.rate * 100).toLocaleString("pl-PL")}% · od {a.startDate}
                      {st.endMonth && ` · koniec: ${monthLabel(st.endMonth)}`}
                    </div>
                    {a.carLimit !== "brak" && share < 1 && (
                      <div className="mt-1 text-xs text-amber-700">
                        Limit {CAR_LIMIT_LABELS[a.carLimit].split(" — ")[0]}: kosztem jest {(share * 100).toFixed(1)}% odpisów, poza kosztami łącznie {pln(st.nonDeductibleTotal)}.
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs font-semibold text-slate-500">{progress.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right text-sm lg:w-96">
                    <div><div className="text-xs text-slate-400">Wartość pocz.</div><div className="font-semibold">{pln(a.initialValue)}</div></div>
                    <div><div className="text-xs text-slate-400">Umorzenie</div><div className="font-semibold">{pln(st.cumulative)}</div></div>
                    <div><div className="text-xs text-slate-400">Netto</div><div className="font-semibold text-brand-700">{pln(st.netValue)}</div></div>
                  </div>
                  <div className="flex gap-1 lg:justify-end">
                    <Button size="sm" variant="secondary" icon={<CalendarRange className="h-4 w-4" />} onClick={() => setSchedule(a)}>Plan</Button>
                    <button title="Edytuj" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => navigate(`/srodki-trwale/${a.id}`)}><Pencil className="h-4 w-4" /></button>
                    {!a.disposalDate && <button title="Likwidacja / sprzedaż" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => { setDispose(a); setDisposeDate(todayIso()); }}><Archive className="h-4 w-4" /></button>}
                    <button title="Usuń" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {assets.length > 0 && (
        <Card>
          <CardHeader title={`Odpisy w ${year} r.`} subtitle="Trafiają automatycznie do kosztów w zestawieniach PIT i KPiR" icon={<TrendingDown className="h-5 w-5" />} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-head">Miesiąc</th>
                  <th className="table-head text-right">Odpisy</th>
                  <th className="table-head text-right"><span className="inline-flex items-center gap-1">W tym koszt podatkowy <Hint text="Po uwzględnieniu limitu wartości samochodu osobowego i udziału w kosztach." /></span></th>
                  <th className="table-head">Pozycje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearRows.map((r) => (
                  <tr key={r.name} className={clsx(!r.amount && "text-slate-400")}>
                    <td className="table-cell capitalize">{r.name}</td>
                    <td className="table-cell text-right">{pln(r.amount)}</td>
                    <td className="table-cell text-right font-semibold">{pln(r.deductible)}</td>
                    <td className="table-cell text-xs text-slate-500">{r.items.map((i) => i.asset.name).join(", ") || "—"}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="table-cell">Razem</td>
                  <td className="table-cell text-right">{pln(stats.yearAmount)}</td>
                  <td className="table-cell text-right">{pln(stats.yearDeductible)}</td>
                  <td className="table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {schedule && <ScheduleModal asset={schedule} onClose={() => setSchedule(null)} />}

      <Modal
        open={!!dispose}
        onClose={() => setDispose(null)}
        title="Likwidacja lub sprzedaż"
        footer={<><Button variant="secondary" onClick={() => setDispose(null)}>Anuluj</Button><Button onClick={() => { upsertAsset({ ...dispose!, disposalDate: disposeDate }); setDispose(null); }}>Zapisz</Button></>}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Odpisy dla <b>{dispose?.name}</b> skończą się w miesiącu likwidacji lub sprzedaży.</p>
          <Field label="Data likwidacji / sprzedaży"><input type="date" className="input" value={disposeDate} onChange={(e) => setDisposeDate(e.target.value)} /></Field>
          <Tip tone="tip">Przy sprzedaży wystaw fakturę — przychód ze sprzedaży środka trwałego jest przychodem firmy. Niezamortyzowaną część przy likwidacji (zużycie) możesz zaliczyć do kosztów; przy sprzedaży — tylko na zasadach z ustawy. W razie wątpliwości zapytaj asystenta AI.</Tip>
        </div>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć środek trwały?"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Anuluj</Button><Button variant="danger" onClick={() => { deleteAsset(toDelete!.id); setToDelete(null); }}>Usuń</Button></>}
      >
        <p className="text-sm text-slate-600">Pozycja <b>{toDelete?.name}</b> i jej odpisy znikną z ewidencji i kosztów. Jeśli środek został sprzedany lub zlikwidowany, użyj raczej opcji „Likwidacja / sprzedaż”.</p>
      </Modal>
    </div>
  );
}
