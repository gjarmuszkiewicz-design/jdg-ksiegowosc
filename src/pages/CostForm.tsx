import clsx from "clsx";
import { ArrowLeft, Calculator, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, CardHeader, Field, PageHeader, Tabs, Tip, Toggle } from "@/components/ui";
import { PARAMS_2026 as P } from "@/lib/config2026";
import { COST_CATEGORIES } from "@/lib/costs";
import { VAT_RATES, rateValue } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import { costDeductibleVat, costKup } from "@/lib/tax";
import { isValidNip } from "@/lib/validation";
import { todayIso, uid, useStore } from "@/store/useStore";
import type { Cost, VatDeduction } from "@/lib/types";

const emptyCost = (): Cost => ({
  id: uid(),
  docNumber: "",
  date: todayIso(),
  supplierName: "",
  supplierNip: "",
  description: "",
  category: "inne",
  net: 0,
  vatRate: "23",
  vat: 0,
  vatDeduction: "pelne",
  costShare: 1,
  isFixedAsset: false,
  paid: true,
  ksefNumber: "",
  createdAt: new Date().toISOString(),
});

export default function CostForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { costs, company, upsertCost } = useStore();
  const existing = costs.find((c) => c.id === id);
  const [cost, setCost] = useState<Cost>(() => existing ?? emptyCost());
  const [mode, setMode] = useState<"netto" | "brutto">("netto");
  const [amountInput, setAmountInput] = useState(() => (existing ? String(existing.net) : ""));
  const [vatTouched, setVatTouched] = useState(!!existing);
  const exempt = company.vatStatus === "zwolniony";

  useEffect(() => {
    if (existing) setCost(existing);
  }, [existing]);

  const set = (patch: Partial<Cost>) => setCost((c) => ({ ...c, ...patch }));

  // Przeliczanie netto/VAT z wpisanej kwoty
  const recalc = (raw: string, m = mode, rate = cost.vatRate) => {
    const amount = Number(raw.replace(",", ".")) || 0;
    const r = rateValue(rate);
    const net = m === "netto" ? round2(amount) : round2(amount / (1 + r));
    const vat = m === "netto" ? round2(net * r) : round2(amount - net);
    set({ net, vat });
    setVatTouched(false);
  };

  const category = COST_CATEGORIES.find((c) => c.value === cost.category);
  const nipWarning = cost.supplierNip && !isValidNip(cost.supplierNip) ? "NIP wygląda na niepoprawny (błędna suma kontrolna)." : undefined;

  const impact = useMemo(() => {
    const vat = costDeductibleVat(cost, company);
    const kup = costKup(cost, company);
    const rate =
      company.taxForm === "liniowy" ? P.pit.liniowy.rate + P.health.liniowyRate : company.taxForm === "skala" ? P.pit.skala.rate1 + P.health.skalaRate : 0;
    return { vat, kup, taxSaving: round2(kup * rate), total: round2(vat + kup * rate), rate };
  }, [cost, company]);

  const fixedAssetWarn = cost.isFixedAsset && cost.net > 10000;

  const save = () => {
    upsertCost({ ...cost, ksefNumber: cost.ksefNumber?.trim() || undefined, vatDeduction: exempt ? "brak" : cost.vatDeduction });
    navigate("/koszty");
  };

  return (
    <div>
      <PageHeader
        title={existing ? "Edycja kosztu" : "Nowy koszt"}
        subtitle="Wpisz dane z faktury zakupowej lub rachunku — resztę policzymy za Ciebie."
        actions={
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/koszty")}>
            Wróć do listy
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Dokument i dostawca" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Numer dokumentu" hint="Numer faktury lub rachunku od dostawcy.">
                <input className="input" value={cost.docNumber} onChange={(e) => set({ docNumber: e.target.value })} placeholder="np. FV/123/2026" />
              </Field>
              <Field label="Data" hint="Data wystawienia / otrzymania dokumentu — decyduje o miesiącu rozliczenia VAT i kosztu.">
                <input type="date" className="input" value={cost.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Dostawca">
                <input className="input" value={cost.supplierName} onChange={(e) => set({ supplierName: e.target.value })} placeholder="Nazwa firmy" />
              </Field>
              <Field label="NIP dostawcy" error={nipWarning}>
                <input className={clsx("input", nipWarning && "input-error")} value={cost.supplierNip} onChange={(e) => set({ supplierNip: e.target.value })} placeholder="10 cyfr" />
              </Field>
              <Field label="Opis" className="sm:col-span-2">
                <input className="input" value={cost.description} onChange={(e) => set({ description: e.target.value })} placeholder="Czego dotyczy wydatek?" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Kategoria" subtitle="Wybór kategorii podpowie właściwe ustawienia VAT i kosztów." />
            <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3 xl:grid-cols-4">
              {COST_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set({ category: c.value, ...(c.defaults ?? { vatDeduction: "pelne", costShare: 1 }), isFixedAsset: c.value === "sprzet" ? cost.isFixedAsset : false })}
                  className={clsx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    cost.category === c.value ? "border-brand-400 bg-brand-50 font-semibold text-brand-700 ring-4 ring-brand-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="text-lg">{c.emoji}</span>
                  <span className="leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
            {category?.hint && (
              <div className="px-5 pb-5">
                <Tip tone="info">{category.hint}</Tip>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Kwota"
              action={
                <Tabs
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setAmountInput("");
                  }}
                  options={[
                    { value: "netto", label: "Wpisuję netto" },
                    { value: "brutto", label: "Wpisuję brutto" },
                  ]}
                />
              }
            />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label={mode === "netto" ? "Kwota netto" : "Kwota brutto"}>
                <input
                  className="input text-lg font-semibold"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    recalc(e.target.value);
                  }}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Stawka VAT">
                <select
                  className="input"
                  value={cost.vatRate}
                  onChange={(e) => {
                    const rate = e.target.value as Cost["vatRate"];
                    set({ vatRate: rate });
                    if (amountInput) recalc(amountInput, mode, rate);
                    else set({ vatRate: rate, vat: round2(cost.net * rateValue(rate)) });
                  }}
                >
                  {VAT_RATES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kwota VAT" hint="Wyliczana automatycznie. Popraw ją, jeśli na fakturze jest inna (np. przez zaokrąglenia).">
                <input
                  className={clsx("input", vatTouched && "border-amber-300")}
                  inputMode="decimal"
                  value={cost.vat}
                  onChange={(e) => {
                    set({ vat: Number(e.target.value.replace(",", ".")) || 0 });
                    setVatTouched(true);
                  }}
                />
              </Field>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm sm:col-span-3">
                Netto <b>{pln(cost.net)}</b> + VAT <b>{pln(cost.vat)}</b> = brutto <b className="text-brand-700">{pln(cost.net + cost.vat)}</b>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rozliczenie" />
            <div className="space-y-5 p-5">
              {exempt ? (
                <Tip tone="info" title="Jesteś zwolniony z VAT">
                  Nie odliczasz VAT od zakupów — cała kwota brutto (pomnożona przez udział w kosztach) trafi do kosztów uzyskania przychodu.
                </Tip>
              ) : (
                <Field label="Odliczenie VAT" hint="Pełne — wydatki firmowe. 50% — samochód osobowy w użytku mieszanym. Brak — np. noclegi, gastronomia.">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["pelne", "100%"],
                        ["polowa", "50%"],
                        ["brak", "Bez odliczenia"],
                      ] as [VatDeduction, string][]
                    ).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set({ vatDeduction: v })}
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-sm font-medium transition",
                          cost.vatDeduction === v ? "border-brand-400 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Udział w kosztach (%)" hint="100% dla wydatków w pełni firmowych, 75% dla eksploatacji auta w użytku mieszanym, 20% dla leasingu/wynajmu takiego auta.">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={Math.round(cost.costShare * 100)}
                    onChange={(e) => set({ costShare: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
                  />
                </Field>
                <Field label="Numer KSeF (opcjonalnie)" hint="Jeśli faktura została pobrana z KSeF, numer trafi do ewidencji JPK.">
                  <input className="input" value={cost.ksefNumber ?? ""} onChange={(e) => set({ ksefNumber: e.target.value })} placeholder="np. 5260250274-20260115-…" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <Toggle checked={cost.isFixedAsset} onChange={(v) => set({ isFixedAsset: v })} label="Środek trwały" hint="Rzecz używana dłużej niż rok. Powyżej 10 000 zł netto wymaga amortyzacji." />
                <Toggle checked={cost.paid} onChange={(v) => set({ paid: v })} label="Opłacony" />
              </div>
              {fixedAssetWarn && (
                <Tip tone="warning" title="Wymaga amortyzacji">
                  Środek trwały o wartości powyżej 10 000 zł netto nie trafia jednorazowo do kosztów — rozlicza się go odpisami amortyzacyjnymi. VAT odliczysz w całości od razu.
                </Tip>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="lg:sticky lg:top-24">
            <CardHeader title="Podgląd wpływu" icon={<Calculator className="h-5 w-5" />} subtitle="Ile zyskasz na tym koszcie" />
            <div className="space-y-3 p-5 text-sm">
              {!exempt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">VAT do odliczenia</span>
                  <b className="text-emerald-600">{pln(impact.vat)}</b>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Trafi do kosztów (KUP)</span>
                <b>{company.taxForm === "ryczalt" ? "—" : pln(impact.kup)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Oszczędność PIT + zdrowotnej
                  {impact.rate > 0 && <span className="text-xs"> (~{Math.round(impact.rate * 1000) / 10}%)</span>}
                </span>
                <b className="text-emerald-600">{pln(impact.taxSaving)}</b>
              </div>
              <div className="mt-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Łącznie odzyskasz ok.</div>
                <div className="text-2xl font-bold text-emerald-700">{pln(impact.total)}</div>
              </div>
              {company.taxForm === "ryczalt" && (
                <p className="text-xs leading-relaxed text-slate-500">Na ryczałcie podatek liczony jest od przychodu, więc koszt nie obniża podatku ani składki zdrowotnej{exempt ? "" : " — zyskujesz tylko odliczenie VAT"}.</p>
              )}
              {company.taxForm === "skala" && <p className="text-xs leading-relaxed text-slate-500">Szacunek dla pierwszego progu (12% + 9% zdrowotnej). W drugim progu oszczędność wyniesie ok. 41%.</p>}
              {company.taxForm === "liniowy" && <p className="text-xs leading-relaxed text-slate-500">Szacunek: 19% podatku + 4,9% składki zdrowotnej (powyżej minimalnej).</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-5">
              <Button variant="secondary" className="flex-1" onClick={() => navigate("/koszty")}>
                Anuluj
              </Button>
              <Button className="flex-1" icon={<Save className="h-4 w-4" />} onClick={save} disabled={!cost.net && !cost.vat}>
                Zapisz
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
