import { Clock, Percent, PiggyBank, Receipt, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, EmptyState, PageHeader, Stat, Tip } from "@/components/ui";
import { categoryLabel } from "@/lib/costs";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { invoiceTotals } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import { costKup, invoiceRevenue, MONTHS_SHORT } from "@/lib/tax";
import type { CostCategory } from "@/lib/types";
import { useStore } from "@/store/useStore";
import { YearSelect } from "./Vat";

const COLORS = ["#3b63f8", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#06b6d4", "#84cc16", "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#a855f7", "#64748b"];
const tooltipFmt = (v: number) => pln(v);

export default function Reports() {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const assets = useStore((s) => s.assets);
  const [year, setYear] = useState(currentYear());
  const summary = useYearSummary(year);

  const yInv = useMemo(() => invoices.filter((i) => i.status !== "szkic" && (i.saleDate || i.issueDate).startsWith(String(year))), [invoices, year]);
  const yCost = useMemo(() => costs.filter((c) => c.date.startsWith(String(year))), [costs, year]);
  const linkedIds = useMemo(() => new Set(assets.map((a) => a.costId).filter(Boolean) as string[]), [assets]);
  const isRyczalt = company.taxForm === "ryczalt";

  const flow = summary.map((m, i) => ({ name: MONTHS_SHORT[i], Przychody: m.revenue, Koszty: isRyczalt ? round2(yCost.filter((c) => c.date.startsWith(m.month)).reduce((s, c) => s + costKup(c, company), 0)) : m.kup }));
  const burden = summary.map((m, i) => ({ name: MONTHS_SHORT[i], Podatek: m.pit, "ZUS społ.": m.social, Zdrowotna: m.health, VAT: m.vatDue }));

  const byCategory = useMemo(() => {
    const map = new Map<CostCategory, number>();
    for (const c of yCost) if (!linkedIds.has(c.id)) map.set(c.category, round2((map.get(c.category) ?? 0) + c.net));
    const list = [...map.entries()].map(([k, v]) => ({ name: categoryLabel(k), value: v }));
    const depreciation = round2(summary.reduce((s, m) => s + m.depreciation, 0));
    if (depreciation > 0) list.push({ name: "Amortyzacja", value: depreciation });
    return list.sort((a, b) => b.value - a.value);
  }, [yCost, linkedIds, summary]);

  const topClients = useMemo(() => {
    const map = new Map<string, { net: number; count: number }>();
    for (const i of yInv) {
      const e = map.get(i.buyer.name) ?? { net: 0, count: 0 };
      e.net = round2(e.net + invoiceRevenue(i));
      e.count++;
      map.set(i.buyer.name, e);
    }
    return [...map.entries()].sort((a, b) => b[1].net - a[1].net).slice(0, 6);
  }, [yInv]);

  const revenue = summary.reduce((s, m) => s + m.revenue, 0);
  const kupAll = flow.reduce((s, m) => s + m.Koszty, 0);
  const pit = summary.reduce((s, m) => s + m.pit, 0);
  const social = summary.reduce((s, m) => s + m.social, 0);
  const health = summary.reduce((s, m) => s + m.health, 0);
  const net = round2(revenue - kupAll - pit - social - health);
  const margin = revenue ? ((revenue - kupAll) / revenue) * 100 : 0;
  const avgInvoice = yInv.length ? yInv.reduce((s, i) => s + invoiceTotals(i).gross, 0) / yInv.length : 0;
  const paid = yInv.filter((i) => i.paidDate);
  const avgDays = paid.length ? paid.reduce((s, i) => s + (new Date(i.paidDate!).getTime() - new Date(i.issueDate).getTime()) / 86400000, 0) / paid.length : 0;
  const maxClient = topClients[0]?.[1].net ?? 1;

  if (!yInv.length && !yCost.length)
    return (
      <div>
        <PageHeader title="Raporty" actions={<YearSelect year={year} onChange={setYear} />} />
        <Card>
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Brak danych do raportów" description="Wystaw pierwszą fakturę lub dodaj koszt, a tutaj pojawią się wykresy." />
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Raporty" subtitle="Jak radzi sobie Twoja firma" actions={<YearSelect year={year} onChange={setYear} />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Zostaje na rękę" value={pln(net)} sub="po kosztach, podatku i ZUS" icon={<PiggyBank className="h-5 w-5" />} tone="green" hint="Przychód − koszty − podatek dochodowy − składki ZUS (społeczne i zdrowotna). VAT nie jest Twoim kosztem, więc go nie odejmujemy." />
        <Stat label="Marża" value={`${margin.toFixed(1)}%`} sub="dochód / przychód" icon={<Percent className="h-5 w-5" />} tone="blue" />
        <Stat label="Średnia faktura" value={pln(avgInvoice)} sub={`${yInv.length} faktur brutto`} icon={<Receipt className="h-5 w-5" />} tone="violet" />
        <Stat label="Średni czas zapłaty" value={`${Math.round(avgDays)} dni`} sub={`na podstawie ${paid.length} opłaconych`} icon={<Clock className="h-5 w-5" />} tone="amber" />
      </div>

      <Card>
        <CardHeader title="Przychody i koszty" subtitle="netto, miesiąc po miesiącu" />
        <div className="h-72 p-4">
          <ResponsiveContainer>
            <AreaChart data={flow}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b63f8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b63f8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={70} />
              <Tooltip formatter={tooltipFmt} />
              <Legend />
              <Area type="monotone" dataKey="Przychody" stroke="#3b63f8" strokeWidth={2.5} fill="url(#gRev)" />
              <Area type="monotone" dataKey="Koszty" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gCost)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Obciążenia publiczne" subtitle="podatek, ZUS, zdrowotna i VAT do zapłaty" />
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <BarChart data={burden}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={tooltipFmt} cursor={{ fill: "#f1f5f9" }} />
                <Legend />
                <Bar dataKey="Podatek" stackId="a" fill="#8b5cf6" />
                <Bar dataKey="ZUS społ." stackId="a" fill="#3b63f8" />
                <Bar dataKey="Zdrowotna" stackId="a" fill="#f43f5e" />
                <Bar dataKey="VAT" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Struktura kosztów" subtitle="wg kategorii (netto)" />
          {byCategory.length ? (
            <div className="flex flex-col items-center gap-4 p-4 sm:flex-row">
              <div className="h-60 w-full sm:w-1/2">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={tooltipFmt} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2 text-sm sm:w-1/2">
                {byCategory.slice(0, 7).map((c, i) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="font-semibold">{pln(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Brak kosztów w tym roku.</div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Najwięksi klienci" subtitle="przychód netto w roku" icon={<Users className="h-4 w-4" />} />
        <div className="space-y-4 p-5">
          {topClients.map(([name, v], i) => (
            <div key={name}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{name}</span>
                <span className="text-slate-500">
                  {v.count} fakt. · <b className="text-slate-800">{pln(v.net)}</b> ({revenue ? ((v.net / revenue) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(v.net / maxClient) * 100}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {topClients[0] && revenue > 0 && topClients[0][1].net / revenue > 0.7 && (
        <Tip tone="warning" title="Uzależnienie od jednego klienta">
          {topClients[0][0]} odpowiada za ponad 70% przychodu. Rozważ dywersyfikację — utrata tego klienta mocno uderzyłaby w Twoje finanse.
        </Tip>
      )}
    </div>
  );
}
