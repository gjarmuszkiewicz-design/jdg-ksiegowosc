import clsx from "clsx";
import { ArrowLeft, Calculator, Check, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, CardHeader, Field, Hint, PageHeader, Tip } from "@/components/ui";
import { CAR_LIMIT_LABELS, DE_MINIMIS_EUR, deductibleShare, depreciationSchedule, KST_GROUPS, LOW_VALUE_LIMIT, METHOD_LABELS, suggestMethod } from "@/lib/assets";
import { marginalRates } from "@/lib/explain";
import { currentYear, useYearData, useYearSummary } from "@/lib/hooks";
import { pln, round2 } from "@/lib/money";
import { costDeductibleVat, monthLabel } from "@/lib/tax";
import type { CarLimit, DepreciationMethod, FixedAsset } from "@/lib/types";
import { todayIso, uid, useStore } from "@/store/useStore";

const METHOD_DESC: Record<DepreciationMethod, string> = {
  liniowa: "Równe odpisy co miesiąc według stawki z wykazu. Najprostsza i zawsze dostępna.",
  degresywna: "Stawka ×2 na wartość netto — większe odpisy na początku, potem przejście na liniową.",
  jednorazowa_de_minimis: "Cała wartość w koszty w miesiącu wprowadzenia do ewidencji (pomoc de minimis).",
  jednorazowa_niskocenna: "Środek do 10 000 zł netto — cała wartość w koszty w miesiącu oddania do używania.",
};

export default function AssetForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { assets, costs, company, upsertAsset } = useStore();
  const data = useYearData();
  const summary = useYearSummary(currentYear());
  const existing = assets.find((a) => a.id === id);

  const [a, setA] = useState<FixedAsset>(() => {
    if (existing) return existing;
    const cost = costs.find((c) => c.id === params.get("koszt"));
    const value = cost ? round2(cost.net + (cost.vat - costDeductibleVat(cost, company))) : 0;
    const group = cost?.category === "samochod" ? KST_GROUPS.find((g) => g.value === "741")! : KST_GROUPS[0];
    return {
      id: uid(),
      name: cost?.description || "",
      inventoryNo: `ST/${assets.length + 1}`,
      startDate: cost?.date ?? todayIso(),
      documentNo: cost?.docNumber ?? "",
      initialValue: value,
      kstGroup: group.value,
      rate: group.rate,
      method: value ? suggestMethod(value) : "liniowa",
      carLimit: group.car ? "150000" : "brak",
      costShare: 1,
      costId: cost?.id,
      isIntangible: !!group.intangible,
      createdAt: new Date().toISOString(),
    };
  });
  const set = (p: Partial<FixedAsset>) => setA((x) => ({ ...x, ...p }));

  const group = KST_GROUPS.find((g) => g.value === a.kstGroup) ?? KST_GROUPS[KST_GROUPS.length - 1];
  const linkedCost = costs.find((c) => c.id === a.costId);

  const available: Record<DepreciationMethod, { ok: boolean; why?: string }> = {
    liniowa: { ok: true },
    degresywna: { ok: group.degressive && !group.intangible, why: "Tylko dla grup 3–6 i 8 KŚT (nie dla aut osobowych i WNiP)." },
    jednorazowa_de_minimis: { ok: !group.car && !group.intangible, why: "Niedostępna dla samochodów osobowych i WNiP." },
    jednorazowa_niskocenna: { ok: a.initialValue <= LOW_VALUE_LIMIT, why: "Tylko dla wartości do 10 000 zł netto." },
  };

  const pickGroup = (v: string) => {
    const g = KST_GROUPS.find((x) => x.value === v)!;
    const patch: Partial<FixedAsset> = { kstGroup: v, rate: g.rate, isIntangible: !!g.intangible, carLimit: g.car ? (a.carLimit === "brak" ? "150000" : a.carLimit) : "brak" };
    if ((a.method === "degresywna" && !(g.degressive && !g.intangible)) || (a.method === "jednorazowa_de_minimis" && (g.car || g.intangible))) patch.method = "liniowa";
    set(patch);
  };

  const schedule = useMemo(() => depreciationSchedule(a), [a]);
  const preview = useMemo(() => {
    const first = schedule[0];
    const last = schedule[schedule.length - 1];
    const deductible = round2(schedule.reduce((s, r) => s + r.deductible, 0));
    const byYear = new Map<string, number>();
    for (const r of schedule) byYear.set(r.month.slice(0, 4), round2((byYear.get(r.month.slice(0, 4)) ?? 0) + r.amount));
    const now = new Date().getMonth();
    const mr = summary[now] ? marginalRates(data, summary[now]) : null;
    return {
      monthly: a.method === "liniowa" ? round2((a.initialValue * a.rate) / 12) : first?.amount ?? 0,
      yearly: round2(a.initialValue * a.rate * (a.method === "degresywna" ? 2 : 1)),
      first: first?.month,
      last: last?.month,
      deductible,
      nonDeductible: round2(a.initialValue - deductible),
      saving: mr ? round2(deductible * mr.total) : 0,
      rateLabel: mr ? `${(mr.total * 100).toFixed(1)}%` : "",
      chart: [...byYear.entries()].map(([year, value]) => ({ year, value })),
    };
  }, [schedule, a, data, summary]);

  const valid = a.name.trim() && a.initialValue > 0 && a.startDate && a.rate > 0 && available[a.method].ok;
  const save = () => {
    if (!valid) return;
    upsertAsset(a);
    navigate("/srodki-trwale");
  };

  return (
    <div>
      <PageHeader
        title={existing ? "Edycja środka trwałego" : "Nowy środek trwały"}
        subtitle="Wpisz dane — plan amortyzacji policzymy automatycznie"
        actions={<Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/srodki-trwale")}>Wróć</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {linkedCost && (
            <Tip tone="info" title="Powiązany dokument kosztowy">
              {linkedCost.docNumber} · {linkedCost.supplierName} · {pln(linkedCost.net)} netto. Faktura nie trafi drugi raz do kosztów — rozliczasz ją odpisami.
            </Tip>
          )}
          <Card>
            <CardHeader title="Dane środka trwałego" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nazwa" className="sm:col-span-2"><input className="input" value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="np. Laptop Dell XPS 15" /></Field>
              <Field label="Nr inwentarzowy"><input className="input" value={a.inventoryNo} onChange={(e) => set({ inventoryNo: e.target.value })} /></Field>
              <Field label="Data przyjęcia do używania" hint="Odpisy liniowe i degresywne zaczynają się od następnego miesiąca."><input type="date" className="input" value={a.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="Nr dokumentu zakupu"><input className="input" value={a.documentNo} onChange={(e) => set({ documentNo: e.target.value })} /></Field>
              <Field label="Wartość początkowa (zł)" hint="Cena netto + nieodliczony VAT + koszty transportu, montażu i uruchomienia do dnia przyjęcia do używania.">
                <input type="number" min={0} step="0.01" className="input" value={a.initialValue || ""} onChange={(e) => set({ initialValue: Number(e.target.value) })} />
              </Field>
              <Field label="Grupa KŚT / rodzaj" className="sm:col-span-2">
                <select className="input" value={a.kstGroup} onChange={(e) => pickGroup(e.target.value)}>
                  {KST_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label} — {(g.rate * 100).toLocaleString("pl-PL")}%</option>)}
                </select>
              </Field>
              {a.kstGroup === "inne" && (
                <Field label="Roczna stawka amortyzacji (%)" hint="Stawka z wykazu stawek amortyzacyjnych (załącznik nr 1 do ustawy o PIT).">
                  <input type="number" min={0} max={100} step="0.1" className="input" value={round2(a.rate * 100)} onChange={(e) => set({ rate: Number(e.target.value) / 100 })} />
                </Field>
              )}
              <Field label="Udział w kosztach (%)" hint="Np. 100% przy wyłącznym użytku firmowym. Zmniejsz, jeśli środek służy też celom prywatnym.">
                <input type="number" min={0} max={100} className="input" value={Math.round(a.costShare * 100)} onChange={(e) => set({ costShare: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} />
              </Field>
              {group.car && (
                <Field label="Limit wartości samochodu osobowego" className="sm:col-span-2" hint="Odpisy od wartości powyżej limitu nie są kosztem podatkowym.">
                  <select className="input" value={a.carLimit} onChange={(e) => set({ carLimit: e.target.value as CarLimit })}>
                    {(["150000", "100000", "225000"] as CarLimit[]).map((k) => <option key={k} value={k}>{CAR_LIMIT_LABELS[k]}</option>)}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">Kosztem podatkowym będzie <b>{(deductibleShare(a) * 100).toFixed(1)}%</b> każdego odpisu.</span>
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Metoda amortyzacji" subtitle="Wybierz, jak rozłożyć wartość w kosztach" />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {(Object.keys(METHOD_LABELS) as DepreciationMethod[]).map((m) => {
                const av = available[m];
                const active = a.method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!av.ok}
                    onClick={() => set({ method: m })}
                    className={clsx(
                      "relative rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      active ? "border-brand-500 bg-brand-50/60 shadow-md shadow-brand-500/10" : "border-slate-200 bg-white hover:border-brand-200",
                    )}
                  >
                    {active && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-white"><Check className="h-4 w-4" /></span>}
                    <div className="flex items-center gap-1.5 pr-8 font-semibold text-slate-900">
                      {METHOD_LABELS[m]}
                      {m === "degresywna" && <Hint text="Roczny odpis = wartość netto na początek roku × (stawka × 2). Gdy spadnie poniżej odpisu liniowego, przechodzisz na liniową." />}
                      {m === "jednorazowa_de_minimis" && <Hint text={`Limit ${DE_MINIMIS_EUR.toLocaleString("pl-PL")} EUR rocznie łącznie. Dla małego podatnika (przychód do 2 mln EUR) lub w roku rozpoczęcia działalności. To pomoc publiczna de minimis — trzeba ją wykazać w zeznaniu PIT i zachować zaświadczenia.`} />}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{METHOD_DESC[m]}</div>
                    {!av.ok && av.why && <div className="mt-1 text-xs font-medium text-amber-600">{av.why}</div>}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="lg:sticky lg:top-24">
            <CardHeader title="Podgląd" subtitle="Jak odpisy wpłyną na koszty" icon={<Calculator className="h-5 w-5" />} />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Pierwszy odpis</span><b>{preview.monthly ? pln(preview.monthly) : "—"}</b></div>
              {(a.method === "liniowa" || a.method === "degresywna") && <div className="flex justify-between"><span className="text-slate-500">Roczny odpis (1. rok)</span><b>{pln(preview.yearly)}</b></div>}
              <div className="flex justify-between"><span className="text-slate-500">Okres odpisów</span><b>{preview.first ? `${monthLabel(preview.first)} – ${monthLabel(preview.last!)}` : "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Koszt podatkowy łącznie</span><b className="text-emerald-600">{pln(preview.deductible)}</b></div>
              {preview.nonDeductible > 0.005 && <div className="flex justify-between"><span className="text-slate-500">Poza kosztami</span><b className="text-amber-600">{pln(preview.nonDeductible)}</b></div>}
              <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-white p-3">
                {company.taxForm === "ryczalt" ? (
                  <span className="text-slate-600">Na ryczałcie amortyzacja nie obniża podatku.</span>
                ) : (
                  <>
                    <div className="text-xs text-slate-500">Szacowana oszczędność podatku i zdrowotnej (stawka krańcowa {preview.rateLabel})</div>
                    <div className="text-lg font-bold text-emerald-700">{pln(preview.saving)}</div>
                  </>
                )}
              </div>
              {preview.chart.length > 0 && (
                <div className="h-36">
                  <ResponsiveContainer>
                    <BarChart data={preview.chart}>
                      <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
                      <Tooltip formatter={(v: number) => pln(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                      <Bar dataKey="value" name="Odpisy" fill="#3b63f8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <Button className="w-full" icon={<Save className="h-4 w-4" />} onClick={save} disabled={!valid}>Zapisz środek trwały</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
