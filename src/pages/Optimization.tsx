import clsx from "clsx";
import { ArrowRight, Crown, Lightbulb, PiggyBank, Sparkles, TrendingDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, CardHeader, Field, Hint, PageHeader, Tabs, Tip } from "@/components/ui";
import { PARAMS_2026 as P, TAX_FORM_LABELS } from "@/lib/config2026";
import { insights } from "@/lib/guide";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { pln, round2 } from "@/lib/money";
import { compareForms } from "@/lib/tax";
import { useStore } from "@/store/useStore";

const IDEAS: { title: string; text: string; to?: string }[] = [
  { title: "IP Box — 5% podatku", text: "Dla twórców oprogramowania i innych praw własności intelektualnej. Działa na skali i liniowym, wymaga osobnej ewidencji.", to: "/wiedza/ip-box" },
  { title: "Wspólne rozliczenie z małżonkiem", text: "Tylko na skali podatkowej — gdy małżonek zarabia mniej, możecie zapłacić znacznie mniej podatku." },
  { title: "Mały ZUS Plus", text: "Przy przychodzie do 120 000 zł rocznie składki społeczne liczysz od dochodu. Zgłoszenie do 31 stycznia.", to: "/wiedza/ulga-na-start" },
  { title: "Ulga na start", text: "Na początku działalności przez 6 miesięcy nie płacisz składek społecznych — tylko zdrowotną.", to: "/wiedza/ulga-na-start" },
  { title: "Koszty, o których łatwo zapomnieć", text: "Subskrypcje, domeny, część rachunków za telefon, książki i kursy branżowe, coworking, delegacje, opłaty bankowe.", to: "/wiedza/koszty-co-mozna" },
  { title: "Jednorazowa amortyzacja", text: "Środki trwałe (np. droższy sprzęt) możesz w ramach pomocy de minimis zamortyzować jednorazowo i od razu obniżyć podatek." },
  { title: "IKZE", text: "Wpłaty na IKZE odliczysz od dochodu (na ryczałcie od przychodu). Przedsiębiorcy mają podwyższony roczny limit wpłat." },
  { title: "Ulgi tylko na skali", text: "Ulga na dzieci, internetowa, termomodernizacyjna i rehabilitacyjna — dostępne przede wszystkim na skali podatkowej." },
  { title: "Zmiana formy opodatkowania", text: "Formę na kolejny rok zmieniasz w CEIDG do 20 lutego (lub do 20. dnia miesiąca po pierwszym przychodzie w roku).", to: "/wiedza/forma-opodatkowania" },
];

const toneCls = { info: "border-brand-100 bg-brand-50/50", warning: "border-amber-200 bg-amber-50/60", success: "border-emerald-200 bg-emerald-50/60" };

export default function Optimization() {
  const company = useStore((s) => s.company);
  const contractors = useStore((s) => s.contractors);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const navigate = useNavigate();
  const year = currentYear();
  const summary = useYearSummary(year);
  const [mode, setMode] = useState<"forecast" | "ytd">("forecast");

  const now = new Date();
  const lastIdx = now.getMonth();
  const elapsed = summary.slice(0, lastIdx + 1);
  const activeMonths = Math.max(1, elapsed.filter((m) => m.active).length);
  const base = {
    revenue: elapsed.reduce((s, m) => s + m.revenue, 0),
    costs: elapsed.reduce((s, m) => s + m.kup, 0) || costs.filter((c) => c.date.startsWith(String(year))).reduce((s, c) => s + c.net, 0),
    social: elapsed.reduce((s, m) => s + m.social, 0),
  };
  // Dla ryczałtu kup w summary = 0, więc koszty bierzemy z dokumentów (netto)
  if (company.taxForm === "ryczalt") base.costs = costs.filter((c) => c.date.startsWith(String(year))).reduce((s, c) => s + c.net, 0);
  const factor = mode === "forecast" ? 12 / activeMonths : 1;
  const derived = { revenue: round2(base.revenue * factor), costs: round2(base.costs * factor), social: round2(base.social * factor) };

  const [sim, setSim] = useState(derived);
  const [rate, setRate] = useState<number>(company.ryczaltRate);
  useEffect(() => setSim(derived), [mode, base.revenue, base.costs, base.social]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => compareForms(sim.revenue, sim.costs, sim.social, rate), [sim, rate]);
  const best = results.reduce((a, b) => (b.total < a.total ? b : a));
  const current = results.find((r) => r.form === company.taxForm)!;
  const chart = results.map((r) => ({ name: r.label, Podatek: r.tax, Zdrowotna: r.health, "ZUS społ.": r.social }));
  const tips = insights({ company, contractors, invoices, costs }, year);

  const askAi = () => {
    const q = `Przeanalizuj moją sytuację podatkową. Forma: ${TAX_FORM_LABELS[company.taxForm]}, VAT: ${company.vatStatus}, ZUS: ${company.zusStage}, PKD: ${company.pkd || "brak"}. Prognoza roczna: przychód ${pln(sim.revenue)}, koszty ${pln(sim.costs)}, ZUS społeczne ${pln(sim.social)}. Wg symulacji najkorzystniejsza forma to ${best.label} (obciążenia ${pln(best.total)} vs obecnie ${pln(current.total)}). Co mogę legalnie zoptymalizować w tym i przyszłym roku? Uwzględnij aktualne przepisy na ${year} r.`;
    navigate("/asystent?pytanie=" + encodeURIComponent(q));
  };

  const num = (k: keyof typeof sim) => (e: React.ChangeEvent<HTMLInputElement>) => setSim({ ...sim, [k]: Number(e.target.value) || 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Optymalizacja podatkowa"
        subtitle="Porównaj formy opodatkowania na swoich danych i znajdź oszczędności"
        actions={
          <Button icon={<Sparkles className="h-4 w-4" />} onClick={askAi} className="bg-gradient-to-r from-violet-600 to-brand-600">
            Poproś AI o analizę mojej sytuacji
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Dane do symulacji"
          subtitle={mode === "forecast" ? `Prognoza roczna na podstawie ${activeMonths} mies. działalności w ${year} r.` : `Dane od początku ${year} r.`}
          action={
            <Tabs
              value={mode}
              onChange={setMode}
              options={[
                { value: "forecast", label: "Prognoza na rok" },
                { value: "ytd", label: "Dotychczas" },
              ]}
            />
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Przychód roczny" hint="Suma netto sprzedaży w roku. Możesz zmienić wartość, aby sprawdzić inne scenariusze.">
            <input type="number" className="input" value={sim.revenue} onChange={num("revenue")} />
          </Field>
          <Field label="Koszty roczne" hint="Koszty uzyskania przychodu. Na ryczałcie nie obniżają podatku, ale liczą się przy porównaniu z innymi formami.">
            <input type="number" className="input" value={sim.costs} onChange={num("costs")} />
          </Field>
          <Field label="ZUS społeczne (rok)" hint="Składki społeczne odliczane od dochodu lub przychodu.">
            <input type="number" className="input" value={sim.social} onChange={num("social")} />
          </Field>
          <Field label="Stawka ryczałtu" hint="Stawka zależy od rodzaju wykonywanych usług (PKWiU).">
            <select className="input" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              {P.ryczaltRates.map((r) => (
                <option key={r.rate} value={r.rate}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <input type="range" min={0} max={600000} step={5000} value={sim.revenue} onChange={num("revenue")} className="w-full accent-brand-600" aria-label="Przychód roczny" />
            <div className="flex justify-between text-xs text-slate-400">
              <span>0 zł</span>
              <span>przesuń, aby zmienić przychód</span>
              <span>600 000 zł</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {results.map((r) => {
          const isBest = r.form === best.form;
          const isCurrent = r.form === company.taxForm;
          const diff = round2(r.total - current.total);
          return (
            <Card key={r.form} className={clsx("relative p-5", isBest && "ring-2 ring-emerald-400")}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{r.label}</h3>
                <div className="flex gap-1">
                  {isCurrent && <Badge tone="blue">Obecna</Badge>}
                  {isBest && (
                    <Badge tone="green">
                      <Crown className="h-3 w-3" /> Najkorzystniej
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">{pln(r.total)}</div>
              <div className="text-sm text-slate-500">łączne obciążenia w roku</div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <Row label="Podatek" value={pln(r.tax)} />
                <Row label="Składka zdrowotna" value={pln(r.health)} />
                <Row label="ZUS społeczne" value={pln(r.social)} />
                <Row label="Zostaje na rękę" value={pln(r.netIncome)} strong />
              </dl>
              {!isCurrent && (
                <div className={clsx("mt-4 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold", diff < 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                  <TrendingDown className={clsx("h-4 w-4", diff > 0 && "rotate-180")} />
                  {diff < 0 ? `Oszczędność ${pln(-diff)} rocznie` : `Drożej o ${pln(diff)} rocznie`}
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-slate-500">{r.note}</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Porównanie obciążeń" icon={<PiggyBank className="h-4 w-4" />} />
        <div className="h-72 p-4">
          <ResponsiveContainer>
            <BarChart data={chart} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v: number) => pln(v)} cursor={{ fill: "#f1f5f9" }} />
              <Legend />
              <Bar dataKey="Podatek" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="Zdrowotna" stackId="a" fill="#f43f5e" />
              <Bar dataKey="ZUS społ." stackId="a" fill="#3b63f8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Tip tone="warning" title="To symulacja uproszczona">
        Wyliczenie nie uwzględnia ulg (np. na dzieci), wspólnego rozliczenia, IP Box, amortyzacji ani limitów stosowania ryczałtu i liniowego (np. świadczenia usług dla byłego
        pracodawcy). Traktuj je jako punkt wyjścia do decyzji — najlepiej skonsultuj ją z doradcą podatkowym lub asystentem AI.
      </Tip>

      {tips.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-violet-500" /> Spostrzeżenia dla Twojej firmy
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {tips.map((t) => (
              <div key={t.id} className={clsx("rounded-2xl border p-4 animate-fadeIn", toneCls[t.tone])}>
                <div className="font-semibold text-slate-900">{t.title}</div>
                <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                {t.to && (
                  <Link to={t.to} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                    Dowiedz się więcej <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Lightbulb className="h-5 w-5 text-amber-500" /> Pomysły na legalną optymalizację
          <Hint text="Ogólne możliwości dostępne dla JDG. Sprawdź warunki przed skorzystaniem." />
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {IDEAS.map((i) => (
            <Card key={i.title} className="p-4">
              <div className="font-semibold">{i.title}</div>
              <p className="mt-1 text-sm text-slate-600">{i.text}</p>
              {i.to && (
                <Link to={i.to} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                  Szczegóły <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={clsx("flex justify-between", strong && "border-t border-slate-100 pt-1.5 font-semibold text-emerald-700")}>
      <dt className={strong ? "" : "text-slate-500"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
