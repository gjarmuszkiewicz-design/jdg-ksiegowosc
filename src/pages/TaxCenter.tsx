import clsx from "clsx";
import {
  AlertTriangle, Banknote, Calculator, CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, Lightbulb,
  Landmark, Percent, PiggyBank, ShieldCheck, ShoppingCart, Sparkles, TrendingDown, Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Field, Hint, PageHeader, Tabs, Tip, Toggle } from "@/components/ui";
import { monthlyAdvice, reserveRate, type Advice } from "@/lib/advice";
import { KST_GROUPS, METHOD_LABELS, monthlyDepreciation } from "@/lib/assets";
import { daysUntil, upcomingDeadlines } from "@/lib/deadlines";
import { explainMonth, marginalRates, recentAverages, simulateMonth, type CalcSection, type Scenario } from "@/lib/explain";
import { useYearData, useYearSummary } from "@/lib/hooks";
import { VAT_RATES } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import { MONTHS_PL, monthLabel } from "@/lib/tax";
import type { FixedAsset, VatRate } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");
const toMk = (y: number, m: number) => `${y}-${pad(m)}`; // m: 1..12
const shiftMk = (mk: string, n: number) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return toMk(d.getFullYear(), d.getMonth() + 1);
};
/** Termin (20. / 25.) w miesiącu następującym po `mk`, przesunięty z weekendu */
const dueDate = (mk: string, day: number) => {
  const [y, m] = shiftMk(mk, 1).split("-").map(Number);
  const d = new Date(y, m - 1, day);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"][m - 1]}`;
};
const daysLabel = (n: number) => (n < 0 ? `${-n} dni po terminie` : n === 0 ? "dziś" : n === 1 ? "jutro" : `za ${n} dni`);

const TILE_STYLES = {
  pit: { bg: "from-brand-500 to-indigo-500", bar: "bg-brand-500", icon: <Landmark className="h-4 w-4" /> },
  vat: { bg: "from-violet-500 to-fuchsia-500", bar: "bg-violet-500", icon: <Percent className="h-4 w-4" /> },
  social: { bg: "from-emerald-500 to-teal-500", bar: "bg-emerald-500", icon: <ShieldCheck className="h-4 w-4" /> },
  health: { bg: "from-rose-500 to-pink-500", bar: "bg-rose-500", icon: <ShieldCheck className="h-4 w-4" /> },
};

const ADVICE_ICONS: Record<Advice["category"], ReactNode> = {
  podatek: <Landmark className="h-5 w-5" />,
  vat: <Percent className="h-5 w-5" />,
  zus: <ShieldCheck className="h-5 w-5" />,
  plynnosc: <Banknote className="h-5 w-5" />,
  planowanie: <CalendarCheck className="h-5 w-5" />,
};
const ADVICE_TONES: Record<Advice["tone"], string> = {
  info: "border-brand-100 bg-gradient-to-br from-brand-50/70 to-white [&_.ico]:bg-brand-100 [&_.ico]:text-brand-600",
  warning: "border-amber-200 bg-gradient-to-br from-amber-50/80 to-white [&_.ico]:bg-amber-100 [&_.ico]:text-amber-600",
  success: "border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white [&_.ico]:bg-emerald-100 [&_.ico]:text-emerald-600",
};

function storageGet(key: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function storageSet(key: string, v: Record<string, boolean>) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* brak dostępu do localStorage — stan tylko w pamięci */
  }
}

// ─────────────────────────── Szczegóły obliczeń ───────────────────────────

function CalcAccordion({ section, open, onToggle, extra }: { section: CalcSection; open: boolean; onToggle: () => void; extra?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <button onClick={onToggle} className={clsx("flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition", open ? "bg-brand-50/60" : "bg-white hover:bg-slate-50")}>
        <span className="font-semibold text-slate-900">{section.title}</span>
        <span className="flex items-center gap-3">
          <span className="font-bold text-slate-900">{pln(section.result)}</span>
          <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-white px-4 py-3 animate-fadeIn">
          <div className="divide-y divide-slate-50">
            {section.lines.map((l, i) => (
              <div key={i} className={clsx("flex items-start justify-between gap-4 py-2 text-sm", l.strong && "mt-1 border-t-2 !border-t-slate-200 font-bold text-slate-900")}>
                <div className="min-w-0">
                  <div className={l.strong ? "" : "text-slate-700"}>{l.label}</div>
                  {l.formula && <div className="mt-0.5 font-mono text-xs text-slate-400">{l.formula}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2 tabular-nums">
                  {l.op && <span className={clsx("w-4 text-center font-mono", l.op === "−" ? "text-rose-500" : l.op === "+" ? "text-emerald-600" : "text-slate-400")}>{l.op}</span>}
                  <span>{pln(l.value)}</span>
                </div>
              </div>
            ))}
          </div>
          {extra}
          {section.note && <Tip tone="info">{section.note}</Tip>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Strona ───────────────────────────

export default function TaxCenter() {
  const data = useYearData();
  const { company } = data;
  const now = new Date();
  const currentMk = toMk(now.getFullYear(), now.getMonth() + 1);
  const [month, setMonth] = useState(currentMk);
  const year = Number(month.slice(0, 4));
  const idx = Number(month.slice(5, 7)) - 1;
  const summary = useYearSummary(year);
  const s = summary[idx];

  const prevMk = shiftMk(month, -1);
  const prevYearSummary = useYearSummary(Number(prevMk.slice(0, 4)));
  const prev = prevYearSummary[Number(prevMk.slice(5, 7)) - 1];

  const isCurrent = month === currentMk;
  const isFuture = month > currentMk;
  const isDecember = idx === 11;

  const total = round2(s.pit + s.vatDue + s.social + s.health);
  const tiles = [
    { key: "pit" as const, label: company.taxForm === "ryczalt" ? "Ryczałt" : "Zaliczka PIT", value: s.pit, due: isDecember ? "w zeznaniu rocznym do 30 kwietnia" : `do ${fmtDate(dueDate(month, 20))}` },
    ...(company.vatStatus === "czynny" ? [{ key: "vat" as const, label: "VAT", value: s.vatDue, due: `do ${fmtDate(dueDate(month, 25))}` }] : []),
    { key: "social" as const, label: "ZUS społeczne", value: s.social, due: `do ${fmtDate(dueDate(month, 20))}` },
    { key: "health" as const, label: "Składka zdrowotna", value: s.health, due: `do ${fmtDate(dueDate(month, 20))}` },
  ];

  // Teraz do zapłaty: kwoty za miesiąc poprzedzający wybrany
  const nowPay = prev
    ? [
        { label: prev.month.endsWith("-12") ? "PIT (grudzień — w zeznaniu)" : company.taxForm === "ryczalt" ? "Ryczałt" : "Zaliczka PIT", value: prev.month.endsWith("-12") ? 0 : prev.pit, date: dueDate(prevMk, 20) },
        ...(company.vatStatus === "czynny" ? [{ label: "VAT + JPK_V7M", value: prev.vatDue, date: dueDate(prevMk, 25) }] : []),
        { label: "ZUS (społeczne + zdrowotna)", value: round2(prev.social + prev.health), date: dueDate(prevMk, 20) },
      ]
    : [];
  const nowPayTotal = round2(nowPay.reduce((a, p) => a + p.value, 0));

  // Rezerwa
  const reserve = reserveRate(summary, idx, company.vatStatus === "czynny");
  const [invoiceGross, setInvoiceGross] = useState(10000);

  // Obliczenia szczegółowe
  const sections = useMemo(() => explainMonth(data, summary, idx), [data, summary, idx]);
  const [openSec, setOpenSec] = useState<string>("pit");
  const dep = useMemo(() => monthlyDepreciation(data.assets ?? [], month), [data.assets, month]);

  // Porady
  const mr = useMemo(() => marginalRates(data, s), [data, s]);
  const advice = useMemo(() => monthlyAdvice(data, summary, idx, mr), [data, summary, idx, mr]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centrum podatkowe"
        subtitle="Wszystko o podatkach i składkach w jednym miejscu — ile, kiedy, dlaczego i co z tym zrobić"
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setMonth(shiftMk(month, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft className="h-4 w-4" /></button>
            <select className="rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm font-semibold outline-none" value={month} onChange={(e) => setMonth(e.target.value)}>
              {[year - 1, year, year + 1].flatMap((y) => MONTHS_PL.map((m, i) => <option key={`${y}-${i}`} value={toMk(y, i + 1)}>{m} {y}</option>))}
            </select>
            <button className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setMonth(shiftMk(month, 1))} aria-label="Następny miesiąc"><ChevronRight className="h-4 w-4" /></button>
            {!isCurrent && <Button size="sm" variant="ghost" onClick={() => setMonth(currentMk)}>Dziś</Button>}
          </div>
        }
      />

      {/* 1. Baner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-brand-600/20 lg:p-8">
        <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white/70">Podatki i składki za {monthLabel(month)}</p>
            {isCurrent && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">szacunek na dziś — zmieni się do końca miesiąca</span>}
            {isFuture && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">miesiąc przyszły — użyj symulacji poniżej</span>}
          </div>
          <h2 className="mt-1 text-3xl font-bold text-white">Za {MONTHS_PL[idx]} zapłacisz łącznie {pln(total)}</h2>
          <p className="mt-1 text-sm text-white/80">Przychód {pln(s.revenue)} · koszty {pln(s.kup)} · dochód {pln(s.income)}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.key} className="rounded-2xl bg-white/10 p-4 backdrop-blur ring-1 ring-white/15">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <span className={clsx("grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br text-white", TILE_STYLES[t.key].bg)}>{TILE_STYLES[t.key].icon}</span>
                  {t.label}
                </div>
                <div className="mt-2 text-2xl font-bold">{pln(t.value)}</div>
                <div className="text-xs text-white/70">{t.due}</div>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/15">
              {tiles.map((t) => t.value > 0 && <div key={t.key} className={TILE_STYLES[t.key].bar} style={{ width: `${(t.value / total) * 100}%` }} title={`${t.label}: ${pln(t.value)}`} />)}
            </div>
          )}
        </div>
      </div>

      {/* Teraz do zapłaty */}
      {prev && (
        <Card>
          <CardHeader
            title={`Teraz do zapłaty — za ${monthLabel(prevMk)}`}
            subtitle={`Płatne w miesiącu: ${monthLabel(month)} — do 20. (ZUS, PIT) i do 25. (VAT)`}
            icon={<Wallet className="h-5 w-5" />}
            action={<span className="text-xl font-bold">{pln(nowPayTotal)}</span>}
          />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {nowPay.map((p) => {
              const d = daysUntil(p.date);
              return (
                <div key={p.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="text-sm font-medium text-slate-600">{p.label}</div>
                    <div className="text-lg font-bold">{pln(p.value)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">{fmtDate(p.date)}</div>
                    {p.value > 0 && <Badge tone={d < 0 ? "red" : d <= 5 ? "amber" : "slate"}>{daysLabel(d)}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* 3. Szczegóły obliczeń */}
        <Card className="xl:col-span-2">
          <CardHeader title="Szczegóły obliczeń" subtitle="Krok po kroku, tak jak liczy urząd" icon={<Calculator className="h-5 w-5" />} />
          <div className="space-y-3 p-5">
            {sections.map((sec) => (
              <CalcAccordion
                key={sec.id}
                section={sec}
                open={openSec === sec.id}
                onToggle={() => setOpenSec(openSec === sec.id ? "" : sec.id)}
                extra={
                  sec.id === "month" && dep.items.length > 0 ? (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Odpisy amortyzacyjne w tym miesiącu</div>
                      {dep.items.map((it) => (
                        <div key={it.asset.id} className="flex justify-between gap-3 py-1 text-sm">
                          <span className="text-slate-700">
                            {it.asset.name} <span className="text-xs text-slate-400">({METHOD_LABELS[it.asset.method]}, {(it.asset.rate * 100).toLocaleString("pl-PL")}%)</span>
                          </span>
                          <span className="tabular-nums">
                            {pln(it.deductible)}
                            {it.deductible < it.amount && <span className="ml-1 text-xs text-slate-400">z {pln(it.amount)}</span>}
                          </span>
                        </div>
                      ))}
                      <Link to="/srodki-trwale" className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">Ewidencja środków trwałych →</Link>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        </Card>

        {/* 2. Ile odkładać */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
              <div className="flex items-center gap-2 text-sm text-white/80"><PiggyBank className="h-4 w-4" /> Ile odkładać?</div>
              <div className="mt-1 text-3xl font-bold">{reserve ? `${reserve.toLocaleString("pl-PL")}%` : "—"}</div>
              <div className="text-sm text-white/85">z każdej faktury brutto na podatki, VAT i ZUS</div>
            </div>
            <div className="space-y-3 p-5">
              <Field label="Kwota faktury brutto" hint="Wyliczone na podstawie obciążeń z ostatnich miesięcy. Najlepiej przelewaj tę kwotę od razu na osobne konto oszczędnościowe.">
                <input className="input" type="number" min={0} value={invoiceGross || ""} onChange={(e) => setInvoiceGross(Number(e.target.value))} />
              </Field>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                <span className="text-sm font-medium text-emerald-800">Odłóż</span>
                <span className="text-lg font-bold text-emerald-700">{pln(round2((invoiceGross * reserve) / 100))}</span>
              </div>
              {!reserve && <p className="text-xs text-slate-500">Brak danych z ostatnich miesięcy — dodaj faktury, a wyliczymy procent.</p>}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <TrendingDown className="h-4 w-4 text-brand-600" /> Twoja stawka krańcowa: {(mr.total * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%
              <Hint text="O ile spadną podatek i składka zdrowotna, gdy dochód zmniejszy się o 1 zł (np. przez dodatkowy koszt)." />
            </div>
            <p className="mt-2 text-sm text-slate-600">{mr.explanation}</p>
            {mr.total > 0 && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                1 000 zł kosztu netto = <b className="text-emerald-600">−{pln(1000 * mr.total)}</b> podatku i zdrowotnej, realnie kosztuje Cię <b>{pln(mr.realCostOf1000)}</b>.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 4. Co możesz zrobić */}
      <Card>
        <CardHeader title="Co możesz zrobić?" subtitle={`Porady na ${monthLabel(month)} na podstawie Twoich danych`} icon={<Lightbulb className="h-5 w-5" />} action={<Button to="/koszty/poradnik" variant="ghost" size="sm">Poradnik kosztów →</Button>} />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {advice.length === 0 && <p className="text-sm text-slate-500">Brak porad na ten miesiąc — wszystko wygląda dobrze.</p>}
          {advice.map((a) => (
            <div key={a.id} className={clsx("flex flex-col rounded-2xl border p-4 animate-fadeIn", ADVICE_TONES[a.tone])}>
              <div className="flex items-start gap-3">
                <div className="ico grid h-10 w-10 shrink-0 place-items-center rounded-xl">{ADVICE_ICONS[a.category]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{a.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{a.description}</p>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 pl-[52px]">
                {a.amount !== undefined ? (
                  <div>
                    <div className="text-lg font-bold text-slate-900">{pln(a.amount)}</div>
                    {a.amountLabel && <div className="text-xs text-slate-500">{a.amountLabel}</div>}
                  </div>
                ) : <span />}
                {a.to && <Link to={a.to} className="text-sm font-semibold text-brand-600 hover:underline">Przejdź →</Link>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 5. Symulacja i 6. Plan */}
      <Simulation currentMk={currentMk} />

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <AlertTriangle className="h-3.5 w-3.5" /> Wszystkie kwoty to szacunki na podstawie danych wprowadzonych do aplikacji. Ostateczne rozliczenie zależy od kompletu dokumentów — w razie wątpliwości skonsultuj się z księgowym.
      </p>
    </div>
  );
}

// ─────────────────────────── Symulacja ───────────────────────────

function Simulation({ currentMk }: { currentMk: string }) {
  const data = useYearData();
  const { company } = data;
  const [mode, setMode] = useState<"next" | "current">("next");
  const simMonth = mode === "next" ? shiftMk(currentMk, 1) : currentMk;
  const curYear = Number(currentMk.slice(0, 4));
  const curIdx = Number(currentMk.slice(5, 7)) - 1;
  const summary = useYearSummary(curYear);
  const avg = useMemo(() => recentAverages(summary, curIdx), [summary, curIdx]);
  const defaultRate: VatRate = company.vatStatus === "zwolniony" ? "zw" : "23";

  const [revenue, setRevenue] = useState(0);
  const [revenueVatRate, setRevenueVatRate] = useState<VatRate>(defaultRate);
  const [costs, setCosts] = useState(0);
  const [costsVatRate, setCostsVatRate] = useState<VatRate>("23");
  const [withPurchase, setWithPurchase] = useState(false);
  const [pNet, setPNet] = useState(8000);
  const [pVat, setPVat] = useState<VatRate>("23");
  const [asAsset, setAsAsset] = useState(false);
  const [kst, setKst] = useState("491");
  const [method, setMethod] = useState<FixedAsset["method"]>("liniowa");

  // Wartości domyślne: średnie z ostatnich miesięcy (dla trybu „do końca miesiąca” — zero)
  useEffect(() => {
    if (mode === "next") {
      setRevenue(Math.round(avg.revenue));
      setCosts(Math.round(avg.costs));
    } else {
      setRevenue(0);
      setCosts(0);
    }
  }, [mode, avg.revenue, avg.costs]);

  const rate = KST_GROUPS.find((g) => g.value === kst)?.rate ?? 0.2;
  const base: Scenario = { revenue, revenueVatRate, costs, costsVatRate };
  const withP: Scenario = { ...base, purchase: { net: pNet, vatRate: pVat, asAsset, rate, method: asAsset ? method : "jednorazowa_niskocenna" } };
  const resBase = useMemo(() => simulateMonth(data, simMonth, base), [data, simMonth, revenue, revenueVatRate, costs, costsVatRate]); // eslint-disable-line react-hooks/exhaustive-deps
  const resP = useMemo(() => (withPurchase ? simulateMonth(data, simMonth, withP) : null), [data, simMonth, revenue, revenueVatRate, costs, costsVatRate, withPurchase, pNet, pVat, asAsset, rate, method]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: { key: keyof typeof resBase.payments; label: string }[] = [
    { key: "pit", label: company.taxForm === "ryczalt" ? "Ryczałt" : "Zaliczka PIT" },
    ...(company.vatStatus === "czynny" ? [{ key: "vat" as const, label: "VAT" }] : []),
    { key: "social", label: "ZUS społeczne" },
    { key: "health", label: "Zdrowotna" },
  ];
  const chart = rows.map((r) => ({ name: r.label, "Bez zakupu": resBase.payments[r.key], ...(resP ? { "Z zakupem": resP.payments[r.key] } : {}) }));
  const purchaseGross = round2(pNet + (pVat === "zw" || pVat === "np" ? 0 : (pNet * Number(pVat)) / 100));
  const saved = resP ? round2(resBase.payments.total - resP.payments.total) : 0;
  const balance = resP ? round2(resP.netCash - resBase.netCash) : 0;

  const vatOptions = company.vatStatus === "zwolniony" ? VAT_RATES.filter((r) => r.value === "zw") : VAT_RATES;
  const sliderMax = Math.max(50000, Math.round(avg.revenue * 3 / 1000) * 1000);

  const results = (label: string, r: ReturnType<typeof simulateMonth>, accent: string) => (
    <div className={clsx("rounded-2xl border p-4", accent)}>
      <div className="mb-2 font-semibold text-slate-900">{label}</div>
      <div className="divide-y divide-slate-100 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between py-1.5"><span className="text-slate-600">{row.label}</span><span className="tabular-nums">{pln(r.payments[row.key])}</span></div>
        ))}
        <div className="flex justify-between py-2 font-bold"><span>Razem do zapłaty</span><span className="tabular-nums">{pln(r.payments.total)}</span></div>
        {r.nextHealth !== undefined && company.taxForm !== "ryczalt" && (
          <div className="flex justify-between py-1.5"><span className="text-slate-600">Zdrowotna w kolejnym miesiącu <Hint text="Na skali i liniowym zdrowotna liczona jest od dochodu z poprzedniego miesiąca." /></span><span className="tabular-nums">{pln(r.nextHealth)}</span></div>
        )}
        <div className="flex justify-between py-2"><span className="font-medium text-emerald-700">Zostanie na koncie</span><span className="font-bold tabular-nums text-emerald-700">{pln(r.netCash)}</span></div>
      </div>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader
          title={mode === "next" ? `Symulacja: ${monthLabel(simMonth)}` : `Symulacja: ${monthLabel(simMonth)} — do końca miesiąca`}
          subtitle="Zaplanuj przychody, koszty i zakupy — zobacz, ile zapłacisz i ile zostanie"
          icon={<Sparkles className="h-5 w-5" />}
          action={<Tabs value={mode} onChange={setMode} options={[{ value: "next", label: "Przyszły miesiąc" }, { value: "current", label: "Ten miesiąc — do końca dojdzie…" }]} />}
        />
        <div className="grid gap-6 p-5 xl:grid-cols-5">
          <div className="space-y-5 xl:col-span-2">
            <div>
              <Field label={mode === "next" ? "Przychód netto (szacunek)" : "Dodatkowy przychód netto do końca miesiąca"} hint="Domyślnie średnia z ostatnich 3 miesięcy.">
                <input className="input" type="number" min={0} value={revenue || ""} onChange={(e) => setRevenue(Number(e.target.value))} />
              </Field>
              <input type="range" min={0} max={sliderMax} step={500} value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
            </div>
            <Field label="Stawka VAT sprzedaży">
              <select className="input" value={revenueVatRate} onChange={(e) => setRevenueVatRate(e.target.value as VatRate)} disabled={company.vatStatus === "zwolniony"}>
                {vatOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <div>
              <Field label="Koszty bieżące netto" hint="Abonamenty, paliwo, usługi — domyślnie średnia z ostatnich miesięcy.">
                <input className="input" type="number" min={0} value={costs || ""} onChange={(e) => setCosts(Number(e.target.value))} />
              </Field>
              <input type="range" min={0} max={Math.max(10000, sliderMax / 4)} step={100} value={costs} onChange={(e) => setCosts(Number(e.target.value))} className="mt-2 w-full accent-amber-500" />
            </div>
            <Field label="Stawka VAT kosztów">
              <select className="input" value={costsVatRate} onChange={(e) => setCostsVatRate(e.target.value as VatRate)}>
                {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>

            <div className="rounded-2xl border border-slate-200 p-4">
              <Toggle checked={withPurchase} onChange={setWithPurchase} label="Planuję większy zakup" hint="Porównamy obciążenia z zakupem i bez niego." />
              {withPurchase && (
                <div className="mt-4 space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Kwota netto"><input className="input" type="number" min={0} value={pNet || ""} onChange={(e) => setPNet(Number(e.target.value))} /></Field>
                    <Field label="VAT">
                      <select className="input" value={pVat} onChange={(e) => setPVat(e.target.value as VatRate)}>
                        {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Toggle checked={asAsset} onChange={setAsAsset} label="Jako środek trwały (amortyzacja)" hint="Rzecz używana dłużej niż rok. Powyżej 10 000 zł netto amortyzacja jest obowiązkowa, chyba że skorzystasz z jednorazowej (de minimis)." />
                  {!asAsset && pNet > 10000 && <Tip tone="warning">Zakup powyżej 10 000 zł netto, który będzie używany dłużej niż rok, to środek trwały — włącz amortyzację.</Tip>}
                  {asAsset && (
                    <div className="grid gap-3">
                      <Field label="Grupa KŚT / stawka">
                        <select className="input" value={kst} onChange={(e) => setKst(e.target.value)}>
                          {KST_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label} — {(g.rate * 100).toLocaleString("pl-PL")}%</option>)}
                        </select>
                      </Field>
                      <Field label="Metoda amortyzacji">
                        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as FixedAsset["method"])}>
                          <option value="liniowa">{METHOD_LABELS.liniowa}</option>
                          <option value="jednorazowa_de_minimis">{METHOD_LABELS.jednorazowa_de_minimis}</option>
                          <option value="jednorazowa_niskocenna">{METHOD_LABELS.jednorazowa_niskocenna}</option>
                        </select>
                      </Field>
                      {method === "liniowa" && <p className="text-xs text-slate-500">Przy amortyzacji liniowej pierwszy odpis jest w miesiącu po zakupie — w symulowanym miesiącu zakup obniży głównie VAT.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-3">
            <div className={clsx("grid gap-4", resP && "md:grid-cols-2")}>
              {results(resP ? "Bez zakupu" : "Wynik symulacji", resBase, "border-slate-200 bg-slate-50/50")}
              {resP && results("Z zakupem", resP, "border-brand-200 bg-brand-50/40")}
            </div>
            {resP && (
              <Tip tone={balance >= 0 ? "success" : "tip"} title={`Zakup obniży podatki i składki o ${pln(saved)}, ale wydasz ${pln(purchaseGross)}`}>
                Bilans dla Twojego konta w tym miesiącu: <b>{balance >= 0 ? "+" : ""}{pln(balance)}</b>. Kupuj, jeśli rzecz jest firmie potrzebna — oszczędność podatkowa to tylko część ceny.
              </Tip>
            )}
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 100) / 10}k`} />
                  <Tooltip formatter={(v: number) => pln(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Bez zakupu" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                  {resP && <Bar dataKey="Z zakupem" fill="#3b63f8" radius={[6, 6, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      <Plan month={shiftMk(currentMk, 1)} reserveAmount={(resP ?? resBase).payments.total} simMonthLabel={monthLabel(simMonth)} />
    </>
  );
}

// ─────────────────────────── Plan na przyszły miesiąc ───────────────────────────

function Plan({ month, reserveAmount, simMonthLabel }: { month: string; reserveAmount: number; simMonthLabel: string }) {
  const { company } = useYearData();
  const key = `jdg-plan-${month}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => storageGet(key));
  useEffect(() => setDone(storageGet(key)), [key]);
  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    storageSet(key, next);
  };

  const items = useMemo(() => {
    const deadlines = upcomingDeadlines(company, new Date(), 40).filter((d) => d.date.startsWith(month));
    const list: { id: string; title: string; desc: string; date?: string; to?: string }[] = deadlines.map((d) => ({ id: `${d.kind}-${d.date}-${d.title}`, title: d.title, desc: d.description, date: d.date }));
    list.push({ id: "odloz", title: `Odłóż ${pln(reserveAmount)} na podatki i ZUS`, desc: `Szacunek z symulacji (${simMonthLabel}). Przelej na osobne konto, gdy wpłyną pieniądze od klientów.` });
    list.push({ id: "faktury", title: "Wystaw faktury za poprzedni miesiąc do 15.", desc: "Ustawowy termin wystawienia faktury za usługi.", date: `${month}-15`, to: "/faktury/nowa" });
    list.push({ id: "ksef-koszty", title: "Pobierz faktury kosztowe z KSeF", desc: "Każda brakująca faktura to wyższy podatek i VAT.", to: "/ksef" });
    if (company.vatStatus === "czynny" && !deadlines.some((d) => d.kind === "vat"))
      list.push({ id: "jpk", title: "Wyślij JPK_V7M", desc: "Do 25. dnia miesiąca za miesiąc poprzedni.", to: "/vat" });
    if (company.vatStatus === "czynny") list.push({ id: "jpk-gen", title: "Wygeneruj i sprawdź JPK_V7M", desc: "Plik przygotujesz w zakładce VAT i JPK.", to: "/vat" });
    list.push({ id: "kontrola", title: "Przejrzyj nieopłacone faktury", desc: "Przypomnij się klientom przed terminami podatkowymi.", to: "/faktury?filtr=nieoplacone" });
    return list.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  }, [company, month, reserveAmount, simMonthLabel]);

  const doneCount = items.filter((i) => done[i.id]).length;

  return (
    <Card>
      <CardHeader
        title={`Plan na ${monthLabel(month)}`}
        subtitle={`${doneCount} z ${items.length} zrobione`}
        icon={<ShoppingCart className="h-5 w-5" />}
        action={<div className="hidden w-40 overflow-hidden rounded-full bg-slate-100 sm:block"><div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} /></div>}
      />
      <div className="divide-y divide-slate-100">
        {items.map((it) => (
          <label key={it.id} className={clsx("flex cursor-pointer items-start gap-3 px-5 py-3 transition hover:bg-slate-50", done[it.id] && "opacity-60")}>
            <input type="checkbox" className="mt-1 h-4 w-4 rounded accent-emerald-600" checked={!!done[it.id]} onChange={() => toggle(it.id)} />
            <div className="min-w-0 flex-1">
              <div className={clsx("text-sm font-semibold text-slate-900", done[it.id] && "line-through")}>{it.title}</div>
              <div className="text-xs text-slate-500">{it.desc}</div>
            </div>
            {it.date && <Badge tone="blue">{fmtDate(it.date)}</Badge>}
            {it.to && <Link to={it.to} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold text-brand-600 hover:underline">Przejdź →</Link>}
          </label>
        ))}
      </div>
    </Card>
  );
}
