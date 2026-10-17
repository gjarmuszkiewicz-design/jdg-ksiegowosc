import { CalendarClock, HeartPulse, Info, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardHeader, Hint, PageHeader, Stat, Tip } from "@/components/ui";
import { ZUS_STAGE_LABELS } from "@/lib/config2026";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { pln } from "@/lib/money";
import { MONTHS_PL, zusSocial } from "@/lib/tax";
import type { ZusStage } from "@/lib/types";
import { useStore } from "@/store/useStore";
import { YearSelect } from "./Vat";

const PARTS: { key: "emerytalna" | "rentowa" | "chorobowa" | "wypadkowa" | "fp"; label: string; color: string; hint: string }[] = [
  { key: "emerytalna", label: "Emerytalna (19,52%)", color: "bg-brand-500", hint: "Buduje Twój kapitał emerytalny w ZUS." },
  { key: "rentowa", label: "Rentowa (8%)", color: "bg-violet-500", hint: "Daje prawo do renty w razie niezdolności do pracy." },
  { key: "chorobowa", label: "Chorobowa (2,45%)", color: "bg-emerald-500", hint: "Dobrowolna — uprawnia do zasiłku chorobowego i macierzyńskiego." },
  { key: "wypadkowa", label: "Wypadkowa (1,67%)", color: "bg-amber-500", hint: "Stawka dla firm zgłaszających do 9 osób do ubezpieczenia wypadkowego." },
  { key: "fp", label: "Fundusz Pracy (2,45%)", color: "bg-rose-500", hint: "Płatny, gdy podstawa wymiaru wynosi co najmniej minimalne wynagrodzenie." },
];

export default function Zus() {
  const company = useStore((s) => s.company);
  const [year, setYear] = useState(currentYear());
  const summary = useYearSummary(year);
  const z = zusSocial(company);

  const now = new Date();
  const idx = year === now.getFullYear() ? now.getMonth() : 11;
  const cur = summary[idx];
  const total = cur.social + cur.health;
  const yearSocial = summary.reduce((s, m) => s + m.social, 0);
  const yearHealth = summary.reduce((s, m) => s + m.health, 0);

  const stages: ZusStage[] = ["ulga_na_start", "preferencyjny", "pelny"];
  const compare = stages.map((st) => ({ stage: st, social: zusSocial({ ...company, zusStage: st }).social }));

  return (
    <div className="space-y-6">
      <PageHeader title="ZUS" subtitle="Składki społeczne i zdrowotna przedsiębiorcy" actions={<YearSelect year={year} onChange={setYear} />} />
      <div className="flex flex-wrap gap-2">
        <Badge tone="blue">{ZUS_STAGE_LABELS[company.zusStage]}</Badge>
        <Badge tone={company.chorobowa ? "green" : "amber"}>{company.chorobowa ? "Z dobrowolną chorobową" : "Bez chorobowej"}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Składki społeczne" value={pln(cur.social)} sub={`za ${MONTHS_PL[idx]}`} icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
        <Stat
          label="Składka zdrowotna"
          value={pln(cur.health)}
          sub={`za ${MONTHS_PL[idx]}`}
          icon={<HeartPulse className="h-5 w-5" />}
          tone="rose"
          hint="Na skali i liniowym liczona od dochodu z poprzedniego miesiąca (z minimum), na ryczałcie — stała kwota zależna od progu przychodu."
        />
        <Stat label="Razem do zapłaty" value={pln(total)} sub={`do 20 ${MONTHS_PL[(idx + 1) % 12]}`} icon={<Wallet className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Rozbicie składek społecznych" subtitle={z.base ? `Podstawa wymiaru: ${pln(z.base)}` : "Na uldze na start nie płacisz składek społecznych"} icon={<ShieldCheck className="h-4 w-4" />} />
          <div className="space-y-4 p-5">
            {z.social > 0 ? (
              <>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                  {PARTS.map((p) => (z[p.key] > 0 ? <div key={p.key} className={p.color} style={{ width: `${(z[p.key] / z.social) * 100}%` }} /> : null))}
                </div>
                {PARTS.map((p) => (
                  <div key={p.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${p.color}`} />
                      {p.label}
                      <Hint text={p.hint} />
                    </span>
                    <span className={z[p.key] ? "font-semibold" : "text-slate-400"}>{z[p.key] ? pln(z[p.key]) : "nie dotyczy"}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-100 pt-3 font-semibold">
                  <span>Razem społeczne</span>
                  <span>{pln(z.social)}</span>
                </div>
              </>
            ) : (
              <Tip tone="success">Korzystasz z ulgi na start — przez 6 miesięcy płacisz tylko składkę zdrowotną. Pamiętaj, że w tym czasie nie masz prawa do zasiłku chorobowego.</Tip>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Porównanie etapów" subtitle="Składki społeczne miesięcznie" />
          <div className="space-y-3 p-5">
            {compare.map((c) => (
              <div key={c.stage} className={`rounded-xl border p-3 ${c.stage === company.zusStage ? "border-brand-300 bg-brand-50" : "border-slate-100"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{ZUS_STAGE_LABELS[c.stage]}</span>
                  {c.stage === company.zusStage && <Badge tone="blue">Twój etap</Badge>}
                </div>
                <div className="mt-1 text-lg font-bold">{pln(c.social)}</div>
              </div>
            ))}
            <Link to="/wiedza/ulga-na-start" className="block text-sm font-semibold text-brand-600 hover:underline">
              Dowiedz się więcej o etapach ZUS →
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tip title="Kolejność etapów ZUS" tone="tip">
          Ulga na start (6 mies.) → preferencyjny ZUS (24 mies.) → Mały ZUS Plus (gdy przychód z poprzedniego roku ≤ 120 000 zł, max 36 mies. w ciągu 60) → pełny ZUS. Zmianę etapu
          zgłaszasz w ZUS (druk ZZA/ZUA) w ciągu 7 dni.
        </Tip>
        <Tip title="Gdzie płacić?" tone="info">
          <span className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Wszystkie składki wpłacasz jednym przelewem na swój indywidualny numer rachunku składkowego (NRS) — znajdziesz go w eZUS (PUE ZUS). Termin: 20. dzień miesiąca za miesiąc
            poprzedni.
          </span>
        </Tip>
      </div>

      <Card>
        <CardHeader title={`Składki w ${year} r.`} icon={<CalendarClock className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Miesiąc</th>
                <th className="table-head text-right">Społeczne</th>
                <th className="table-head text-right">Zdrowotna</th>
                <th className="table-head text-right">Razem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((m, i) => (
                <tr key={m.month} className={!m.active ? "text-slate-400" : i === idx ? "bg-brand-50/50" : "hover:bg-slate-50"}>
                  <td className="table-cell capitalize">{MONTHS_PL[i]}</td>
                  <td className="table-cell text-right">{pln(m.social)}</td>
                  <td className="table-cell text-right">{pln(m.health)}</td>
                  <td className="table-cell text-right font-semibold">{pln(m.social + m.health)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="table-cell">Razem</td>
                <td className="table-cell text-right">{pln(yearSocial)}</td>
                <td className="table-cell text-right">{pln(yearHealth)}</td>
                <td className="table-cell text-right">{pln(yearSocial + yearHealth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
