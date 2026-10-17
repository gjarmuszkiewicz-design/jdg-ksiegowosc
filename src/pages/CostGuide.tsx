import clsx from "clsx";
import { Calculator, Landmark, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardHeader, Field, PageHeader, Tip } from "@/components/ui";
import { COST_GUIDE, costChecklist } from "@/lib/costGuide";
import { categoryEmoji, categoryLabel } from "@/lib/costs";
import { marginalRates } from "@/lib/explain";
import { currentYear, useYearData, useYearSummary } from "@/lib/hooks";
import { rateValue, VAT_RATES } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import type { VatRate } from "@/lib/types";

export default function CostGuide() {
  const data = useYearData();
  const summary = useYearSummary(currentYear());
  const s = summary[new Date().getMonth()];
  const mr = useMemo(() => marginalRates(data, s), [data, s]);
  const missing = useMemo(() => costChecklist(data.costs, data.company), [data.costs, data.company]);
  const [net, setNet] = useState(1000);
  const [rate, setRate] = useState<VatRate>("23");
  const [active, setActive] = useState(COST_GUIDE[0].id);

  const vatActive = data.company.vatStatus === "czynny";
  const vat = round2(net * rateValue(rate));
  const vatBack = vatActive ? vat : 0;
  // u zwolnionych z VAT kosztem jest kwota brutto
  const kupBase = vatActive ? net : net + vat;
  const taxSaving = round2(kupBase * mr.tax);
  const healthSaving = round2(kupBase * mr.health);
  const realCost = round2(net + vat - vatBack - taxSaving - healthSaving);

  const go = (id: string) => {
    setActive(id);
    document.getElementById(`rozdzial-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <PageHeader
        title="Poradnik kosztów"
        subtitle="Co możesz wrzucić w koszty, czego nie wolno i jak legalnie płacić mniej"
        actions={
          <>
            <Button variant="secondary" to="/podatki" icon={<Landmark className="h-4 w-4" />}>Centrum podatkowe</Button>
            <Button to={`/asystent?pytanie=${encodeURIComponent("Czy mogę zaliczyć do kosztów firmy taki wydatek: ")}`} icon={<Sparkles className="h-4 w-4" />}>Zapytaj AI o koszt</Button>
          </>
        }
      />

      <div className="sticky top-[61px] z-10 -mx-1 mb-6 flex gap-2 overflow-x-auto bg-slate-50/90 px-1 py-2 backdrop-blur">
        {COST_GUIDE.map((c) => (
          <button
            key={c.id}
            onClick={() => go(c.id)}
            className={clsx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition", active === c.id ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}
          >
            {c.emoji} {c.title}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {missing.length > 0 && (
            <Tip title="Tych kosztów nie widzimy u Ciebie w ostatnich 3 miesiącach" tone="tip">
              <ul className="mt-1 space-y-1">
                {missing.map((m) => (
                  <li key={m.category}>{categoryEmoji(m.category)} <b>{categoryLabel(m.category)}</b> — {m.hint}</li>
                ))}
              </ul>
            </Tip>
          )}
          {COST_GUIDE.map((ch) => (
            <Card key={ch.id} id={`rozdzial-${ch.id}`} className="scroll-mt-32">
              <div className="flex items-start gap-4 border-b border-slate-100 px-5 py-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-100 text-2xl">{ch.emoji}</div>
                <div>
                  <h2 className="text-lg font-semibold">{ch.title}</h2>
                  <p className="mt-0.5 text-sm text-slate-600">{ch.lead}</p>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {ch.points.map((p) => (
                  <div key={p.title} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                    <div className="font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-1 text-sm leading-relaxed text-slate-600">{p.text}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <p className="text-xs text-slate-400">Poradnik ma charakter informacyjny i opisuje ogólne zasady na 2026 r. W nietypowych sprawach skonsultuj się z doradcą podatkowym.</p>
        </div>

        <div className="space-y-4 xl:sticky xl:top-32 xl:self-start">
          <Card className="overflow-hidden">
            <CardHeader title="Kalkulator wpływu kosztu" subtitle="Ile realnie kosztuje Cię wydatek firmowy?" icon={<Calculator className="h-5 w-5" />} />
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kwota netto"><input className="input" type="number" min={0} value={net || ""} onChange={(e) => setNet(Number(e.target.value))} /></Field>
                <Field label="Stawka VAT">
                  <select className="input" value={rate} onChange={(e) => setRate(e.target.value as VatRate)}>
                    {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
                <Row label="Płacisz sprzedawcy (brutto)" value={pln(net + vat)} />
                {vatActive && <Row label="Odzyskasz VAT w JPK" value={`− ${pln(vatBack)}`} tone="green" />}
                <Row label={`Niższy podatek (${(mr.tax * 100).toFixed(1)}%)`} value={`− ${pln(taxSaving)}`} tone="green" />
                <Row label={`Niższa zdrowotna (${(mr.health * 100).toFixed(1)}%)`} value={`− ${pln(healthSaving)}`} tone="green" />
              </div>
              <div className="rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 p-4 text-white">
                <div className="text-sm text-white/75">Realny koszt dla Ciebie</div>
                <div className="text-2xl font-bold">{pln(realCost)}</div>
                <div className="text-xs text-white/80">Oszczędzasz {pln(round2(net + vat - realCost))} — ale wciąż wydajesz {pln(realCost)}.</div>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{mr.explanation}</p>
              {data.company.taxForm === "ryczalt" && (
                <Tip tone="info">Na ryczałcie koszt nie zmienia podatku ani zdrowotnej. Korzyścią jest tylko odliczony VAT (jeśli jesteś VAT-owcem).</Tip>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-slate-600">{label}</span>
      <span className={clsx("font-semibold", tone === "green" && "text-emerald-600")}>{value}</span>
    </div>
  );
}
