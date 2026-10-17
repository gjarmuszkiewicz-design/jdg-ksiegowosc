import { BookText, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Hint, PageHeader, Tip } from "@/components/ui";
import { currentYear } from "@/lib/hooks";
import { num2, pln, round2 } from "@/lib/money";
import { monthlyDepreciation } from "@/lib/assets";
import { costKup, invoiceRevenue, MONTHS_PL, monthKey } from "@/lib/tax";
import { downloadFile } from "@/lib/xml";
import { useStore } from "@/store/useStore";
import { YearSelect } from "./Vat";

interface Row {
  date: string;
  doc: string;
  name: string;
  nip: string;
  desc: string;
  sale: number;
  otherRevenue: number;
  goods: number;
  side: number;
  wages: number;
  other: number;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function Ledger() {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const assets = useStore((s) => s.assets);
  const linkedIds = useMemo(() => new Set(assets.map((a) => a.costId).filter(Boolean) as string[]), [assets]);
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(0); // 0 = cały rok
  const isRyczalt = company.taxForm === "ryczalt";

  const inPeriod = (date: string) => date.startsWith(String(year)) && (month === 0 || monthKey(date) === `${year}-${String(month).padStart(2, "0")}`);

  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    for (const i of invoices) {
      const d = i.saleDate || i.issueDate;
      if (i.status === "szkic" || !inPeriod(d)) continue;
      r.push({ date: d, doc: i.number, name: i.buyer.name, nip: i.buyer.nip, desc: i.items.map((x) => x.name).join(", "), sale: invoiceRevenue(i), otherRevenue: 0, goods: 0, side: 0, wages: 0, other: 0 });
    }
    if (!isRyczalt)
      for (const c of costs) {
        if (!inPeriod(c.date) || linkedIds.has(c.id)) continue;
        const kup = costKup(c, company);
        r.push({ date: c.date, doc: c.docNumber, name: c.supplierName, nip: c.supplierNip, desc: c.description, sale: 0, otherRevenue: 0, goods: c.category === "towary" ? kup : 0, side: 0, wages: 0, other: c.category === "towary" ? 0 : kup });
      }
    if (!isRyczalt)
      for (let m = 1; m <= 12; m++) {
        if (month && m !== month) continue;
        const mk = `${year}-${String(m).padStart(2, "0")}`;
        const lastDay = `${mk}-${String(new Date(year, m, 0).getDate()).padStart(2, "0")}`;
        for (const it of monthlyDepreciation(assets, mk).items) {
          if (!it.deductible) continue;
          r.push({ date: lastDay, doc: `OT/${it.asset.inventoryNo || "ST"}`, name: "", nip: "", desc: `Odpis amortyzacyjny — ${it.asset.name}`, sale: 0, otherRevenue: 0, goods: 0, side: 0, wages: 0, other: it.deductible });
        }
      }
    return r.sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, costs, assets, linkedIds, company, year, month, isRyczalt]);

  const sum = (k: keyof Row) => round2(rows.reduce((s, r) => s + (r[k] as number), 0));
  const ytdTotals = useMemo(() => {
    const endMonth = month === 0 ? 12 : month;
    const upTo = `${year}-${String(endMonth).padStart(2, "0")}`;
    const rev = invoices.filter((i) => i.status !== "szkic" && (i.saleDate || i.issueDate).startsWith(String(year)) && monthKey(i.saleDate || i.issueDate) <= upTo).reduce((s, i) => s + invoiceRevenue(i), 0);
    let exp = isRyczalt ? 0 : costs.filter((c) => !linkedIds.has(c.id) && c.date.startsWith(String(year)) && monthKey(c.date) <= upTo).reduce((s, c) => s + costKup(c, company), 0);
    if (!isRyczalt) for (let m = 1; m <= endMonth; m++) exp += monthlyDepreciation(assets, `${year}-${String(m).padStart(2, "0")}`).deductible;
    return { rev: round2(rev), exp: round2(exp) };
  }, [invoices, costs, assets, linkedIds, company, year, month, isRyczalt]);

  const exportCsv = () => {
    const header = isRyczalt
      ? ["Lp", "Data wpisu", "Data uzyskania przychodu", "Nr dowodu", `Przychód ${(company.ryczaltRate * 100).toLocaleString("pl-PL")}%`, "Ogółem"]
      : ["Lp", "Data", "Nr dowodu", "Kontrahent", "NIP", "Opis", "Przychód ze sprzedaży", "Pozostałe przychody", "Razem przychód", "Zakup towarów", "Koszty uboczne", "Wynagrodzenia", "Pozostałe wydatki", "Razem wydatki"];
    const lines = rows.map((r, i) =>
      isRyczalt
        ? [i + 1, r.date, r.date, r.doc, num2(r.sale), num2(r.sale)]
        : [i + 1, r.date, r.doc, r.name, r.nip, r.desc, num2(r.sale), num2(r.otherRevenue), num2(r.sale + r.otherRevenue), num2(r.goods), num2(r.side), num2(r.wages), num2(r.other), num2(r.wages + r.other)],
    );
    const csv = "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(";")).join("\n");
    downloadFile(`${isRyczalt ? "ewidencja_przychodow" : "KPiR"}_${year}${month ? "_" + String(month).padStart(2, "0") : ""}.csv`, csv, "text/csv");
  };

  const title = isRyczalt ? "Ewidencja przychodów" : "Podatkowa księga przychodów i rozchodów";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={isRyczalt ? "Ewidencja dla ryczałtu od przychodów ewidencjonowanych" : "KPiR wg wzoru obowiązującego od 2026 r."}
        actions={
          <>
            <YearSelect year={year} onChange={setYear} />
            <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              <option value={0}>cały rok</option>
              {MONTHS_PL.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>
              Eksport CSV
            </Button>
          </>
        }
      />

      <Tip tone="info">
        {isRyczalt
          ? "Ewidencja przychodów tworzy się automatycznie z wystawionych faktur. Na ryczałcie koszty nie są ewidencjonowane, bo nie wpływają na podatek."
          : "Księga uzupełnia się automatycznie z faktur sprzedaży i kosztów. Wpisy są w kolejności chronologicznej. Wydatki pokazujemy w wysokości stanowiącej koszt podatkowy (np. 75% przy samochodzie). Środki trwałe trafiają do księgi przez miesięczne odpisy amortyzacyjne (ostatni dzień miesiąca)."}
      </Tip>

      <Card>
        <CardHeader title={month ? `${MONTHS_PL[month - 1]} ${year}` : `Rok ${year}`} subtitle={`${rows.length} wpisów`} icon={<BookText className="h-4 w-4" />} />
        {!rows.length ? (
          <EmptyState icon={<BookText className="h-6 w-6" />} title="Brak wpisów" description="W wybranym okresie nie ma faktur ani kosztów." />
        ) : isRyczalt ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-head">Lp.</th>
                  <th className="table-head">Data wpisu</th>
                  <th className="table-head">Data uzyskania przychodu</th>
                  <th className="table-head">Nr dowodu</th>
                  <th className="table-head text-right">Przychód {(company.ryczaltRate * 100).toLocaleString("pl-PL")}%</th>
                  <th className="table-head text-right">Ogółem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="table-cell text-slate-400">{i + 1}</td>
                    <td className="table-cell">{r.date}</td>
                    <td className="table-cell">{r.date}</td>
                    <td className="table-cell font-medium">{r.doc}</td>
                    <td className="table-cell text-right">{pln(r.sale)}</td>
                    <td className="table-cell text-right font-semibold">{pln(r.sale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="table-cell" colSpan={4}>
                    Suma okresu
                  </td>
                  <td className="table-cell text-right">{pln(sum("sale"))}</td>
                  <td className="table-cell text-right">{pln(sum("sale"))}</td>
                </tr>
                <tr>
                  <td className="table-cell" colSpan={5}>
                    Narastająco od początku roku
                  </td>
                  <td className="table-cell text-right">{pln(ytdTotals.rev)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-head">Lp.</th>
                  <th className="table-head">Data</th>
                  <th className="table-head">Nr dowodu</th>
                  <th className="table-head">Kontrahent</th>
                  <th className="table-head">Opis zdarzenia</th>
                  <th className="table-head text-right">
                    <span className="inline-flex items-center gap-1">
                      Przychód ze sprzedaży <Hint text="Wartość sprzedanych towarów i usług (netto)." />
                    </span>
                  </th>
                  <th className="table-head text-right">Pozostałe przychody</th>
                  <th className="table-head text-right">Zakup towarów</th>
                  <th className="table-head text-right">Koszty uboczne</th>
                  <th className="table-head text-right">Wynagrodzenia</th>
                  <th className="table-head text-right">Pozostałe wydatki</th>
                  <th className="table-head text-right">Razem wydatki</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="table-cell text-slate-400">{i + 1}</td>
                    <td className="table-cell whitespace-nowrap">{r.date}</td>
                    <td className="table-cell font-medium">{r.doc}</td>
                    <td className="table-cell">
                      <div>{r.name}</div>
                      {r.nip && <div className="text-xs text-slate-400">NIP {r.nip}</div>}
                    </td>
                    <td className="table-cell max-w-[220px] truncate text-slate-600">{r.desc}</td>
                    <td className="table-cell text-right">{r.sale ? pln(r.sale) : ""}</td>
                    <td className="table-cell text-right">{r.otherRevenue ? pln(r.otherRevenue) : ""}</td>
                    <td className="table-cell text-right">{r.goods ? pln(r.goods) : ""}</td>
                    <td className="table-cell text-right">{r.side ? pln(r.side) : ""}</td>
                    <td className="table-cell text-right">{r.wages ? pln(r.wages) : ""}</td>
                    <td className="table-cell text-right">{r.other ? pln(r.other) : ""}</td>
                    <td className="table-cell text-right font-semibold">{r.wages + r.other ? pln(r.wages + r.other) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="table-cell" colSpan={5}>
                    Suma okresu
                  </td>
                  <td className="table-cell text-right">{pln(sum("sale"))}</td>
                  <td className="table-cell text-right">{pln(sum("otherRevenue"))}</td>
                  <td className="table-cell text-right">{pln(sum("goods"))}</td>
                  <td className="table-cell text-right">{pln(sum("side"))}</td>
                  <td className="table-cell text-right">{pln(sum("wages"))}</td>
                  <td className="table-cell text-right">{pln(sum("other"))}</td>
                  <td className="table-cell text-right">{pln(sum("wages") + sum("other"))}</td>
                </tr>
                <tr className="text-slate-600">
                  <td className="table-cell" colSpan={5}>
                    Narastająco od początku roku
                  </td>
                  <td className="table-cell text-right">{pln(ytdTotals.rev)}</td>
                  <td className="table-cell" colSpan={5} />
                  <td className="table-cell text-right">{pln(ytdTotals.exp)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {!isRyczalt && (
        <Tip tone="tip" title="Dochód w okresie">
          Przychód {pln(sum("sale") + sum("otherRevenue"))} − wydatki {pln(sum("goods") + sum("side") + sum("wages") + sum("other"))} ={" "}
          <b>{pln(sum("sale") + sum("otherRevenue") - sum("goods") - sum("side") - sum("wages") - sum("other"))}</b> (przed odliczeniem składek ZUS). Zakup towarów i koszty uboczne
          zakupu wykazujemy w osobnych kolumnach — nie wliczamy ich do „razem wydatki”, zgodnie ze wzorem księgi.
        </Tip>
      )}
    </div>
  );
}
