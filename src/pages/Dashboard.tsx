import clsx from "clsx";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, FileText, Landmark, Percent, Receipt, Sparkles, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Stat, Tip } from "@/components/ui";
import { daysUntil, upcomingDeadlines } from "@/lib/deadlines";
import { insights, nextSteps } from "@/lib/guide";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { invoiceTotals, isOverdue } from "@/lib/invoice";
import { pln } from "@/lib/money";
import { MONTHS_SHORT } from "@/lib/tax";
import { useStore } from "@/store/useStore";

const toneStyles = {
  info: "border-brand-100 bg-brand-50/50",
  warning: "border-amber-200 bg-amber-50/60",
  danger: "border-rose-200 bg-rose-50/60",
  success: "border-emerald-200 bg-emerald-50/60",
};
const kindColors: Record<string, string> = { zus: "bg-emerald-500", pit: "bg-brand-500", vat: "bg-violet-500", roczne: "bg-rose-500", inne: "bg-amber-500" };

export default function Dashboard() {
  const { company, contractors, invoices, costs, assets, dismissedTips, dismissTip } = useStore();
  const year = currentYear();
  const summary = useYearSummary(year);
  const m = new Date().getMonth();
  const cur = summary[m];
  const prev = m > 0 ? summary[m - 1] : undefined;

  const steps = useMemo(() => nextSteps({ company, contractors, invoices, costs }), [company, contractors, invoices, costs]);
  const tips = useMemo(() => insights({ company, contractors, invoices, costs, assets }).filter((t) => !dismissedTips.includes(t.id)), [company, contractors, invoices, costs, assets, dismissedTips]);
  const deadlines = useMemo(() => upcomingDeadlines(company), [company]);

  const unpaid = invoices.filter((i) => i.status !== "oplacona" && i.status !== "szkic");
  const unpaidSum = unpaid.reduce((s, i) => s + invoiceTotals(i).gross, 0);
  const overdue = unpaid.filter((i) => isOverdue(i));

  // Do zapłaty w tym miesiącu (za poprzedni miesiąc)
  const toPay = prev ? prev.social + prev.health + prev.pit + prev.vatDue : 0;
  const chart = summary.map((s, i) => ({ name: MONTHS_SHORT[i], przychod: s.revenue, koszty: company.taxForm === "ryczalt" ? 0 : s.kup }));
  const ytdIncome = cur ? cur.revenueYtd - cur.kupYtd : 0;
  const recent = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Powitanie */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-brand-600/20 lg:p-8">
        <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 right-40 h-40 w-40 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/70">Twój biznes w {year} r.</p>
            <h1 className="mt-1 text-3xl font-bold">{pln(cur?.revenueYtd ?? 0)} przychodu</h1>
            <p className="mt-2 text-white/80">
              {company.taxForm === "ryczalt" ? "Ryczałt" : `Dochód: ${pln(ytdIncome)}`} · zaliczki na podatek: {pln(cur?.taxYtd ?? 0)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button to="/faktury/nowa" className="!bg-white !from-white !to-white !text-brand-700 hover:!bg-brand-50" icon={<FileText className="h-4 w-4" />}>
              Wystaw fakturę
            </Button>
            <Button to={`/asystent?pytanie=${encodeURIComponent("Co powinienem zrobić w tym miesiącu w mojej firmie? Wypisz kroki i terminy.")}`} variant="ghost" className="bg-white/10 !text-white hover:bg-white/20" icon={<Sparkles className="h-4 w-4" />}>
              Co dziś zrobić?
            </Button>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Przychód w tym miesiącu" value={pln(cur?.revenue ?? 0)} sub={`${cur?.invoicesCount ?? 0} faktur`} icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
        <Stat label="Koszty w tym miesiącu" value={pln(cur?.kup ?? 0)} sub={company.taxForm === "ryczalt" ? "Na ryczałcie nie obniżają podatku" : `${cur?.costsCount ?? 0} dokumentów`} icon={<Receipt className="h-5 w-5" />} tone="amber" />
        <Stat label="Do zapłaty do 20/25." value={pln(toPay)} sub={<Link to="/podatki" className="font-semibold text-brand-600 hover:underline">Szczegóły i symulacja →</Link>} icon={<Landmark className="h-5 w-5" />} tone="violet" hint="Suma składek ZUS, zaliczki na PIT i VAT za poprzedni miesiąc — płatne w tym miesiącu." />
        <Stat label="Nieopłacone faktury" value={pln(unpaidSum)} sub={overdue.length ? <span className="font-semibold text-rose-600">{overdue.length} po terminie</span> : `${unpaid.length} oczekuje`} icon={<CircleDollarSign className="h-5 w-5" />} tone={overdue.length ? "rose" : "green"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Kroki */}
        <Card className="xl:col-span-2">
          <CardHeader title="Co teraz zrobić?" subtitle="Twoja lista zadań — prowadzimy Cię krok po kroku" icon={<CheckCircle2 className="h-5 w-5" />} />
          <div className="space-y-2.5 p-5">
            {steps.length === 0 && (
              <Tip tone="success" title="Wszystko ogarnięte! 🎉">
                Nie masz żadnych zaległych zadań. Zajrzyj do Optymalizacji — może da się zapłacić mniej podatku.
              </Tip>
            )}
            {steps.map((s, i) => (
              <div key={s.id} className={clsx("flex items-center gap-4 rounded-xl border p-3.5 transition hover:shadow-sm", toneStyles[s.tone])}>
                <div className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white", s.tone === "danger" ? "bg-rose-500" : s.tone === "warning" ? "bg-amber-500" : "bg-brand-500")}>
                  {s.tone === "danger" ? <AlertTriangle className="h-4 w-4" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{s.title}</div>
                  <div className="text-sm text-slate-600">{s.description}</div>
                </div>
                <Button to={s.to} size="sm" variant={s.tone === "danger" ? "danger" : "secondary"}>
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Terminy */}
        <Card>
          <CardHeader title="Nadchodzące terminy" icon={<CalendarClock className="h-5 w-5" />} />
          <div className="divide-y divide-slate-100">
            {deadlines.map((d, i) => {
              const days = daysUntil(d.date);
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-lg font-bold leading-none text-slate-900">{d.date.slice(8)}</div>
                    <div className="text-[11px] uppercase text-slate-400">{MONTHS_SHORT[Number(d.date.slice(5, 7)) - 1]}</div>
                  </div>
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", kindColors[d.kind])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {d.title}
                      {days <= 3 && <Badge tone="red">{days === 0 ? "dziś" : `za ${days} dni`}</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">{d.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Przychody i koszty" subtitle={`${year} r., miesięcznie (netto)`} icon={<TrendingUp className="h-5 w-5" />} action={<Button to="/raporty" variant="ghost" size="sm">Raporty <ArrowRight className="h-3.5 w-3.5" /></Button>} />
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b63f8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b63f8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => pln(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="przychod" name="Przychód" stroke="#3b63f8" strokeWidth={2.5} fill="url(#gRev)" />
                <Area type="monotone" dataKey="koszty" name="Koszty" stroke="#f59e0b" strokeWidth={2.5} fill="url(#gCost)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Podpowiedzi" subtitle="Na podstawie Twoich danych" icon={<Sparkles className="h-5 w-5" />} />
          <div className="space-y-3 p-5">
            {tips.length === 0 && <p className="text-sm text-slate-500">Brak nowych podpowiedzi. Dodawaj faktury i koszty — będziemy analizować je na bieżąco.</p>}
            {tips.slice(0, 4).map((t) => (
              <Tip key={t.id} tone={t.tone === "warning" ? "warning" : t.tone === "success" ? "success" : "tip"} title={t.title} onClose={() => dismissTip(t.id)} action={t.to && <Link to={t.to} className="text-sm font-semibold text-brand-600 hover:underline">Dowiedz się więcej →</Link>}>
                {t.description}
              </Tip>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Ostatnie faktury" icon={<FileText className="h-5 w-5" />} action={<Button to="/faktury" variant="ghost" size="sm">Wszystkie <ArrowRight className="h-3.5 w-3.5" /></Button>} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {recent.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="table-cell font-semibold"><Link to={`/faktury/${inv.id}`} className="hover:text-brand-600">{inv.number}</Link></td>
                  <td className="table-cell text-slate-600">{inv.buyer.name}</td>
                  <td className="table-cell text-slate-500">{inv.issueDate}</td>
                  <td className="table-cell text-right font-semibold">{pln(invoiceTotals(inv).gross)}</td>
                  <td className="table-cell text-right">
                    {inv.status === "oplacona" ? <Badge tone="green">opłacona</Badge> : isOverdue(inv) ? <Badge tone="red">po terminie</Badge> : <Badge tone="amber">czeka</Badge>}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td className="table-cell py-8 text-center text-slate-500" colSpan={5}>Brak faktur. <Link to="/faktury/nowa" className="font-semibold text-brand-600">Wystaw pierwszą →</Link></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {company.vatStatus === "czynny" && cur && (
        <p className="flex items-center gap-2 text-xs text-slate-400"><Percent className="h-3.5 w-3.5" /> Wyliczenia są szacunkowe i opierają się na danych wprowadzonych do aplikacji.</p>
      )}
    </div>
  );
}
