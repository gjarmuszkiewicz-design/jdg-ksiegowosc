import { Download, Pencil, Plus, Receipt, Search, Trash2, Wallet, Percent, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Hint, Modal, PageHeader, Stat, Tip } from "@/components/ui";
import { COST_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/costs";
import { num2, pln, round2 } from "@/lib/money";
import { costDeductibleVat, costKup, monthKey, monthLabel } from "@/lib/tax";
import { downloadFile } from "@/lib/xml";
import { useStore } from "@/store/useStore";
import type { Cost } from "@/lib/types";
import { BookOpen, Landmark } from "lucide-react";
import { costChecklist } from "@/lib/costGuide";
import { marginalRates } from "@/lib/explain";
import { currentYear, useYearData, useYearSummary } from "@/lib/hooks";


function CostTaxPanel() {
  const data = useYearData();
  const summary = useYearSummary(currentYear());
  const s = summary[new Date().getMonth()];
  const mr = useMemo(() => marginalRates(data, s), [data, s]);
  const missing = useMemo(() => costChecklist(data.costs, data.company).slice(0, 3), [data.costs, data.company]);
  const isRycz = data.company.taxForm === "ryczalt";
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="grid lg:grid-cols-3">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
          <div className="text-sm font-medium text-white/80">Twoje koszty a podatek</div>
          {isRycz ? (
            <div className="mt-2 text-lg font-semibold">Na ryczałcie koszty nie obniżają podatku ani zdrowotnej</div>
          ) : (
            <>
              <div className="mt-1 text-3xl font-bold">{pln(100 * mr.total)}</div>
              <div className="text-sm text-white/85">mniej podatku i zdrowotnej z każdych 100 zł kosztu netto ({(mr.total * 100).toFixed(1)}%)</div>
            </>
          )}
        </div>
        <div className="space-y-1.5 p-5 text-sm">
          <div className="font-semibold text-slate-900">Ten miesiąc ({monthLabel(s.month)})</div>
          <div className="flex justify-between"><span className="text-slate-500">Koszty z dokumentów</span><b>{pln(s.kupDocs)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Amortyzacja</span><b>{pln(s.depreciation)}</b></div>
          <div className="flex justify-between border-t border-slate-100 pt-1.5"><span className="text-slate-500">Szacowana oszczędność</span><b className="text-emerald-600">≈ {pln(round2(s.kup * mr.total))}</b></div>
          <p className="pt-1 text-xs text-slate-400">{mr.explanation}</p>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
          {missing.map((x) => (
            <div key={x.category} className="text-sm text-slate-600">
              {categoryEmoji(x.category)} Brak kosztów: <b>{categoryLabel(x.category)}</b> — {x.hint}
            </div>
          ))}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="secondary" to="/koszty/poradnik" icon={<BookOpen className="h-4 w-4" />}>Poradnik kosztów</Button>
            <Button size="sm" variant="secondary" to="/podatki" icon={<Landmark className="h-4 w-4" />}>Centrum podatkowe</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Costs() {
  const { costs, company, deleteCost, assets } = useStore();
  const linkedIds = useMemo(() => new Set(assets.map((a) => a.costId).filter(Boolean) as string[]), [assets]);
  const kupOf = (c: (typeof costs)[number]) => (linkedIds.has(c.id) ? 0 : costKup(c, company));
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState<Cost | null>(null);

  const months = useMemo(() => [...new Set(costs.map((c) => monthKey(c.date)))].sort().reverse(), [costs]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return costs
      .filter((c) => !month || monthKey(c.date) === month)
      .filter((c) => !category || c.category === category)
      .filter((c) => !query || `${c.supplierName} ${c.description} ${c.docNumber} ${c.supplierNip}`.toLowerCase().includes(query))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [costs, month, category, q]);

  const totals = useMemo(
    () => ({
      net: round2(filtered.reduce((s, c) => s + c.net, 0)),
      vat: round2(filtered.reduce((s, c) => s + costDeductibleVat(c, company), 0)),
      kup: round2(filtered.reduce((s, c) => s + kupOf(c), 0)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, company, linkedIds],
  );

  const exportCsv = () => {
    const head = ["Data", "Nr dokumentu", "Dostawca", "NIP", "Opis", "Kategoria", "Netto", "Stawka VAT", "VAT", "Brutto", "VAT do odliczenia", "KUP", "Opłacony"];
    const rows = filtered.map((c) => [
      c.date, c.docNumber, c.supplierName, c.supplierNip, c.description, categoryLabel(c.category),
      num2(c.net), c.vatRate, num2(c.vat), num2(c.net + c.vat), num2(costDeductibleVat(c, company)), num2(kupOf(c)), c.paid ? "tak" : "nie",
    ]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadFile(`koszty${month ? "-" + month : ""}.csv`, "﻿" + csv, "text/csv");
  };

  return (
    <div>
      <PageHeader
        title="Koszty i zakupy"
        subtitle="Wszystkie wydatki firmowe w jednym miejscu — obniżają podatek i VAT."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!filtered.length}>
              Eksport CSV
            </Button>
            <Button to="/koszty/nowy" icon={<Plus className="h-4 w-4" />}>
              Dodaj koszt
            </Button>
          </>
        }
      />

      <CostTaxPanel />

      {company.taxForm === "ryczalt" && (
        <div className="mb-6">
          <Tip title="Jesteś na ryczałcie">
            Koszty nie obniżają podatku na ryczałcie — liczy się tylko przychód. Warto je jednak zapisywać: odliczysz VAT (jeśli jesteś VAT-owcem), a w Optymalizacji porównasz, czy inna forma opodatkowania byłaby korzystniejsza.
          </Tip>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Suma netto" value={pln(totals.net)} sub={`${filtered.length} dokumentów`} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <Stat label="VAT do odliczenia" value={pln(totals.vat)} icon={<Percent className="h-5 w-5" />} tone="green" hint="VAT naliczony, który odliczysz w JPK_V7M (z uwzględnieniem 50% dla samochodu)." />
        <Stat
          label="Koszty uzyskania przychodu"
          value={company.taxForm === "ryczalt" ? "—" : pln(totals.kup)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="violet"
          hint="Kwota, o którą zmniejsza się dochód do opodatkowania: netto + nieodliczony VAT, pomnożone przez udział w kosztach."
        />
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Szukaj dostawcy, opisu, numeru…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Wszystkie miesiące</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Wszystkie kategorie</option>
            {COST_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>

        {!filtered.length ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title={costs.length ? "Brak kosztów dla wybranych filtrów" : "Nie masz jeszcze żadnych kosztów"}
            description="Dodaj fakturę zakupową, paragon lub rachunek — aplikacja sama policzy VAT do odliczenia i koszt podatkowy."
            action={<Button to="/koszty/nowy" icon={<Plus className="h-4 w-4" />}>Dodaj pierwszy koszt</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="table-head">Data</th>
                  <th className="table-head">Dostawca / opis</th>
                  <th className="table-head">Kategoria</th>
                  <th className="table-head text-right">Netto</th>
                  <th className="table-head text-right">VAT</th>
                  <th className="table-head text-right">Brutto</th>
                  <th className="table-head text-right">KUP</th>
                  <th className="table-head">Status</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="transition hover:bg-slate-50/60">
                    <td className="table-cell whitespace-nowrap text-slate-500">{c.date}</td>
                    <td className="table-cell">
                      <Link to={`/koszty/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {c.supplierName || "—"}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {c.docNumber}
                        {c.description ? ` · ${c.description}` : ""}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span className="text-base">{categoryEmoji(c.category)}</span>
                        <span className="hidden xl:inline">{categoryLabel(c.category)}</span>
                      </span>
                    </td>
                    <td className="table-cell text-right font-medium">{num2(c.net)}</td>
                    <td className="table-cell text-right text-slate-500">
                      {num2(c.vat)}
                      {c.vatDeduction === "polowa" && <div className="text-[11px] text-amber-600">odl. 50%</div>}
                    </td>
                    <td className="table-cell text-right font-semibold">{num2(c.net + c.vat)}</td>
                    <td className="table-cell text-right text-slate-600">
                      {linkedIds.has(c.id) ? (
                        <span className="inline-flex items-center gap-1">
                          0,00 <Hint text="Rozliczane przez odpisy amortyzacyjne w ewidencji środków trwałych." />
                        </span>
                      ) : company.taxForm === "ryczalt" ? (
                        "—"
                      ) : (
                        num2(costKup(c, company))
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.paid ? <Badge tone="green">opłacony</Badge> : <Badge tone="amber">do zapłaty</Badge>}
                        {linkedIds.has(c.id) ? (
                          <Link to="/srodki-trwale">
                            <Badge tone="violet">amortyzacja</Badge>
                          </Link>
                        ) : (
                          c.isFixedAsset && <Badge tone="violet">ŚT</Badge>
                        )}
                        {c.ksefNumber && <Badge tone="blue">KSeF</Badge>}
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1">
                        <Link to={`/koszty/${c.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Edytuj">
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button onClick={() => setToDelete(c)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Usuń">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć koszt?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                if (toDelete) deleteCost(toDelete.id);
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Dokument <b>{toDelete?.docNumber}</b> od <b>{toDelete?.supplierName}</b> zostanie usunięty z ewidencji. Zmienią się wyliczenia VAT i podatku za{" "}
          {toDelete && monthLabel(monthKey(toDelete.date))}.
        </p>
      </Modal>
    </div>
  );
}
