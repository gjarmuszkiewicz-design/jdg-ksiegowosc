import clsx from "clsx";
import { ArrowRight, Check, CloudDownload, Database, FileSpreadsheet, FileUp, History, Info, Scale, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Card, CardHeader, Field, Hint, PageHeader, Stat, Tabs, Tip } from "@/components/ui";
import {
  autoMapping, CSV_FIELDS, CSV_PRESETS, detectCsv, findDuplicates, mergeResults, parseCsv, parseFiles,
  type CsvMapping, type ImportResult, type ParsedFile,
} from "@/lib/importers";
import { invoiceTotals } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import { MONTHS_PL } from "@/lib/tax";
import type { OpeningBalance } from "@/lib/types";
import { useStore } from "@/store/useStore";

type Source = "jpk_v7" | "jpk_fa" | "ksef" | "csv" | "opening" | "backup";

const SOURCES: { id: Source; title: string; desc: string; icon: ReactNode; badge?: string; steps: string[] }[] = [
  {
    id: "jpk_v7",
    title: "Pliki JPK_V7M / JPK_V7K",
    desc: "Wszystkie faktury sprzedaży i zakupu z VAT, miesiąc po miesiącu.",
    icon: <FileUp className="h-5 w-5" />,
    badge: "Najlepsze dla VAT-owców",
    steps: [
      "W poprzednim programie otwórz sekcję z deklaracjami / plikami JPK (np. w wFirma: „Raporty / Deklaracje → JPK”, w iFirma: „Deklaracje → JPK_V7”). Nazwy menu mogą się różnić.",
      "Pobierz pliki XML za każdy miesiąc, który chcesz przenieść (najczęściej od stycznia bieżącego roku).",
      "Jeśli wysyłałeś JPK samodzielnie — masz je też jako zapisane pliki XML na dysku.",
      "Przeciągnij wszystkie pliki naraz poniżej — duplikaty wykryjemy sami.",
    ],
  },
  {
    id: "jpk_fa",
    title: "JPK_FA (ewidencja faktur)",
    desc: "Dla zwolnionych z VAT — faktury sprzedaży z pozycjami.",
    icon: <FileUp className="h-5 w-5" />,
    steps: [
      "W poprzednim programie znajdź generowanie JPK_FA (zwykle „JPK na żądanie” / „JPK_FA”).",
      "Wybierz zakres dat (np. cały rok) i pobierz plik XML.",
      "Wgraj plik poniżej. Koszty zaimportuj osobno z CSV (eksport KPiR / wydatków).",
    ],
  },
  {
    id: "ksef",
    title: "e-Faktury z KSeF (XML)",
    desc: "Faktury od 2026 r. — sprzedażowe i kosztowe w jednym.",
    icon: <CloudDownload className="h-5 w-5" />,
    badge: "Od 2026 r.",
    steps: [
      "Zaloguj się do Aplikacji Podatnika KSeF (ksef.mf.gov.pl) profilem zaufanym lub e-dowodem.",
      "Wyszukaj faktury wystawione i otrzymane za wybrany okres i pobierz je jako XML (paczka ZIP — rozpakuj ją).",
      "Wgraj pliki — rozpoznamy, które są sprzedażą (Twój NIP jako sprzedawca), a które kosztami.",
      "Albo wpisz token KSeF w Ustawieniach i pobieraj faktury kosztowe automatycznie w zakładce KSeF.",
    ],
  },
  {
    id: "csv",
    title: "Eksport CSV (wFirma, iFirma, Fakturownia…)",
    desc: "Lista faktur lub wydatków wyeksportowana do pliku CSV.",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    steps: [
      "W liście faktur (lub wydatków) poprzedniego programu wybierz eksport do CSV lub Excela.",
      "Plik Excel (XLSX) zapisz jako „CSV (rozdzielany średnikami)”.",
      "Wgraj plik — dopasujemy kolumny automatycznie, a Ty możesz je poprawić.",
    ],
  },
  {
    id: "opening",
    title: "Bilans otwarcia",
    desc: "Same sumy narastające — gdy przechodzisz w trakcie roku.",
    icon: <Scale className="h-5 w-5" />,
    steps: [
      "Z KPiR lub ewidencji przychodów poprzedniego programu odczytaj sumy narastające na koniec ostatniego miesiąca.",
      "Z deklaracji / potwierdzeń przelewów: zapłacone zaliczki, składki ZUS i nadwyżkę VAT.",
      "Wpisz je w formularzu poniżej — od wybranego miesiąca liczymy dalej sami.",
    ],
  },
  {
    id: "backup",
    title: "Kopia zapasowa tej aplikacji",
    desc: "Plik JSON pobrany z Ustawień — przeniesienie między urządzeniami.",
    icon: <Database className="h-5 w-5" />,
    steps: ["W Ustawieniach na innym urządzeniu kliknij „Pobierz kopię (JSON)”.", "Wgraj plik tutaj — zastąpi on wszystkie obecne dane."],
  },
];

const PREVIEW_LIMIT = 50;

export default function Import() {
  const store = useStore();
  const [source, setSource] = useState<Source>("jpk_v7");
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ invoices: number; costs: number; contractors: number } | null>(null);
  const [csvKind, setCsvKind] = useState<"sprzedaz" | "koszty">("sprzedaz");
  const [csvPreset, setCsvPreset] = useState<string>("wFirma");
  const [csvMapping, setCsvMapping] = useState<CsvMapping>({});
  const [backupMsg, setBackupMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const csvFile = files.find((f) => f.kind === "csv");
  const csvInfo = useMemo(() => (csvFile ? detectCsv(csvFile.text) : undefined), [csvFile]);
  const backupFile = files.find((f) => f.kind === "backup");

  const result: ImportResult | undefined = useMemo(() => {
    const parts = files.filter((f) => f.result).map((f) => f.result!);
    if (csvFile && csvInfo) {
      try {
        parts.push(parseCsv(csvFile.text, csvMapping, csvKind, csvPreset));
      } catch {
        /* mapowanie niekompletne */
      }
    }
    return parts.length ? mergeResults(parts) : undefined;
  }, [files, csvFile, csvInfo, csvMapping, csvKind, csvPreset]);

  const dups = useMemo(
    () => (result ? findDuplicates(result, { invoices: store.invoices, costs: store.costs, contractors: store.contractors }) : undefined),
    [result, store.invoices, store.costs, store.contractors],
  );

  const handleFiles = async (list: FileList | File[]) => {
    setBusy(true);
    setDone(null);
    setBackupMsg("");
    const parsed = await parseFiles(Array.from(list), store.company);
    setFiles((prev) => [...prev, ...parsed]);
    const csv = parsed.find((p) => p.kind === "csv");
    if (csv) {
      setCsvMapping(autoMapping(detectCsv(csv.text).headers));
      setSource("csv");
    }
    setExcluded(new Set());
    setBusy(false);
  };

  const selected = (id: string) => !excluded.has(id) && !dups?.invoiceIds.has(id) && !dups?.costIds.has(id);
  const toggle = (id: string) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toImport = result
    ? {
        invoices: result.invoices.filter((i) => selected(i.id)),
        costs: result.costs.filter((c) => selected(c.id)),
        contractors: result.contractors.filter((c) => !dups?.contractorIds.has(c.id)),
      }
    : undefined;
  const totals = toImport
    ? {
        salesNet: round2(toImport.invoices.reduce((a, i) => a + invoiceTotals(i).net, 0)),
        salesVat: round2(toImport.invoices.reduce((a, i) => a + invoiceTotals(i).vat, 0)),
        costNet: round2(toImport.costs.reduce((a, c) => a + c.net, 0)),
        costVat: round2(toImport.costs.reduce((a, c) => a + c.vat, 0)),
      }
    : undefined;

  const doImport = () => {
    if (!toImport) return;
    store.importBatch(toImport);
    setDone({ invoices: toImport.invoices.length, costs: toImport.costs.length, contractors: toImport.contractors.length });
    setFiles([]);
    setExcluded(new Set());
  };

  const restoreBackup = () => {
    if (!backupFile) return;
    try {
      const data = JSON.parse(backupFile.text);
      if (!data.company || !Array.isArray(data.invoices)) throw new Error();
      useStore.setState({ company: data.company, contractors: data.contractors ?? [], invoices: data.invoices, costs: data.costs ?? [], assets: data.assets ?? [] });
      setBackupMsg("Kopia przywrócona.");
      setFiles((f) => f.filter((x) => x !== backupFile));
    } catch {
      setBackupMsg("To nie jest poprawny plik kopii zapasowej.");
    }
  };

  const src = SOURCES.find((s) => s.id === source)!;
  const rows = result
    ? [
        ...result.invoices.map((i) => ({ id: i.id, kind: "Sprzedaż" as const, date: i.issueDate, number: i.number, party: i.buyer.name, nip: i.buyer.nip, net: invoiceTotals(i).net, vat: invoiceTotals(i).vat, dup: dups?.invoiceIds.has(i.id) })),
        ...result.costs.map((c) => ({ id: c.id, kind: "Koszt" as const, date: c.date, number: c.docNumber, party: c.supplierName, nip: c.supplierNip, net: c.net, vat: c.vat, dup: dups?.costIds.has(c.id) })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Przenieś historię z innego programu" subtitle="Import z wFirma, iFirma, Fakturowni i innych — przez pliki JPK, e-faktury KSeF, CSV albo bilans otwarcia" />

      {/* Rekomendacja */}
      <Card>
        <CardHeader title="Co wybrać?" subtitle="Najkrótsza droga do kompletnej historii" icon={<Info className="h-5 w-5" />} />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[
            ["1", "Jesteś VAT-owcem → pliki JPK_V7M", "Mają wszystkie faktury sprzedaży i zakupu z VAT za każdy miesiąc. Eksportuje je każdy program, a jeśli wysyłałeś je sam — masz je na dysku. To najpełniejsze i najbardziej wiarygodne źródło."],
            ["2", "Zwolniony z VAT → JPK_FA lub CSV", "JPK_FA (faktury z pozycjami) albo eksport CSV listy faktur i wydatków / KPiR z poprzedniego programu."],
            ["3", "Faktury od 2026 r. → KSeF", "Wszystkie e-faktury (wystawione i otrzymane) pobierzesz jako XML z Aplikacji Podatnika KSeF albo automatycznie przez token."],
            ["4", "Przejście w trakcie roku → bilans otwarcia", "Nie musisz importować każdego dokumentu: wystarczą sumy narastające z KPiR i deklaracji, a dalej liczymy sami."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{n}</div>
              <div>
                <div className="font-semibold text-slate-900">{t}</div>
                <div className="text-sm text-slate-600">{d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <Tip tone="info">e-Urząd Skarbowy nie udostępnia pobierania dokumentów przez API — możesz tam najwyżej sprawdzić złożone pliki JPK i zapłacone podatki (przydatne do bilansu otwarcia).</Tip>
        </div>
      </Card>

      {/* Źródła */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={clsx("relative rounded-2xl border-2 bg-white p-4 text-left transition", source === s.id ? "border-brand-500 shadow-md shadow-brand-500/10" : "border-slate-200 hover:border-brand-200")}
          >
            {source === s.id && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-white"><Check className="h-4 w-4" /></span>}
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">{s.icon}</div>
              <div className="pr-6 font-semibold text-slate-900">{s.title}</div>
            </div>
            {s.badge && <div className="mt-2"><Badge tone="green">{s.badge}</Badge></div>}
            <div className="mt-2 text-sm text-slate-500">{s.desc}</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`Jak to zrobić: ${src.title}`} icon={<History className="h-5 w-5" />} />
        <ol className="space-y-2 p-5">
          {src.steps.map((st, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-700">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              {st}
            </li>
          ))}
        </ol>
      </Card>

      {source === "opening" ? (
        <OpeningBalanceForm />
      ) : (
        <>
          {/* Strefa plików */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={clsx("cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition", drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-300 hover:bg-brand-50/40")}
          >
            <Upload className="mx-auto h-10 w-10 text-brand-500" />
            <div className="mt-3 text-lg font-semibold">{busy ? "Wczytuję pliki…" : "Przeciągnij pliki tutaj albo kliknij, aby wybrać"}</div>
            <div className="mt-1 text-sm text-slate-500">XML (JPK_V7, JPK_FA, e-faktury KSeF), CSV, JSON — możesz wybrać wiele plików naraz</div>
            <input ref={inputRef} type="file" multiple accept=".xml,.csv,.txt,.json" className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {files.length > 0 && (
            <Card>
              <CardHeader title="Wczytane pliki" icon={<FileUp className="h-5 w-5" />} action={<Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setFiles([]); setExcluded(new Set()); }}>Wyczyść</Button>} />
              <div className="divide-y divide-slate-100">
                {files.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="font-medium">{f.name}</span>
                    <Badge tone={f.error ? "red" : "blue"}>{f.kind === "jpk_v7" ? "JPK_V7" : f.kind === "jpk_fa" ? "JPK_FA" : f.kind === "ksef" ? "e-faktura KSeF" : f.kind === "csv" ? "CSV" : f.kind === "backup" ? "kopia JSON" : "nieznany"}</Badge>
                    {f.result && <span className="text-slate-500">{f.result.invoices.length} sprzedaży · {f.result.costs.length} kosztów</span>}
                    {f.error && <span className="text-rose-600">{f.error}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {backupFile && (
            <Tip tone="warning" title="Kopia zapasowa tej aplikacji" action={<Button variant="danger" size="sm" onClick={restoreBackup}>Przywróć kopię (zastąpi obecne dane)</Button>}>
              Przywrócenie zastąpi wszystkie dane firmy, faktury, koszty i środki trwałe zawartością pliku {backupFile.name}.
            </Tip>
          )}
          {backupMsg && <Tip tone="success">{backupMsg}</Tip>}

          {/* Mapowanie CSV */}
          {csvFile && csvInfo && (
            <Card>
              <CardHeader title="Dopasuj kolumny CSV" subtitle="Dopasowaliśmy je automatycznie — sprawdź i popraw w razie potrzeby" icon={<FileSpreadsheet className="h-5 w-5" />} />
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <Tabs value={csvKind} onChange={setCsvKind} options={[{ value: "sprzedaz", label: "To są faktury sprzedaży" }, { value: "koszty", label: "To są koszty / wydatki" }]} />
                  <label className="flex items-center gap-2 text-sm">
                    Program:
                    <select className="input w-40" value={csvPreset} onChange={(e) => setCsvPreset(e.target.value)}>
                      {CSV_PRESETS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                  <span className="text-xs text-slate-500">Separator: „{csvInfo.separator === "\t" ? "tab" : csvInfo.separator}” · {csvInfo.rows.length} wierszy</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CSV_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
                      <select className="input" value={csvMapping[f.key] ?? ""} onChange={(e) => setCsvMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                        <option value="">— brak —</option>
                        {csvInfo.headers.map((h, i) => <option key={i} value={i}>{h || `kolumna ${i + 1}`}</option>)}
                      </select>
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Nazwy kolumn różnią się między programami i wersjami eksportu — dopasowanie jest automatyczne, ale zawsze możesz je poprawić ręcznie. Wystarczy kwota netto albo brutto.</p>
              </div>
            </Card>
          )}

          {/* Podgląd */}
          {done && (
            <Tip tone="success" title="Import zakończony" action={<div className="flex flex-wrap gap-2"><Button size="sm" to="/faktury">Faktury</Button><Button size="sm" variant="secondary" to="/koszty">Koszty</Button><Button size="sm" variant="secondary" to="/podatki">Mój miesiąc</Button></div>}>
              Dodano {done.invoices} faktur sprzedaży, {done.costs} kosztów i {done.contractors} kontrahentów. Sprawdź statusy płatności i kategorie kosztów.
            </Tip>
          )}

          {result && toImport && totals && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Faktury sprzedaży" value={toImport.invoices.length} sub={`netto ${pln(totals.salesNet)} · VAT ${pln(totals.salesVat)}`} icon={<FileUp className="h-5 w-5" />} />
                <Stat label="Koszty" value={toImport.costs.length} sub={`netto ${pln(totals.costNet)} · VAT ${pln(totals.costVat)}`} icon={<FileUp className="h-5 w-5" />} tone="amber" />
                <Stat label="Nowi kontrahenci" value={toImport.contractors.length} icon={<FileUp className="h-5 w-5" />} tone="violet" />
                <Stat label="Okres" value={result.period ? `${result.period.from.slice(0, 7)} – ${result.period.to.slice(0, 7)}` : "—"} sub={`Duplikaty pominięte: ${(dups?.invoiceIds.size ?? 0) + (dups?.costIds.size ?? 0)}`} icon={<History className="h-5 w-5" />} tone="green" />
              </div>

              {result.warnings.map((w, i) => <Tip key={i} tone="warning">{w}</Tip>)}

              <Card>
                <CardHeader title="Podgląd dokumentów" subtitle={rows.length > PREVIEW_LIMIT ? `Pierwsze ${PREVIEW_LIMIT} z ${rows.length}` : `${rows.length} dokumentów`} icon={<FileUp className="h-5 w-5" />}
                  action={<Button onClick={doImport} disabled={!toImport.invoices.length && !toImport.costs.length} icon={<ArrowRight className="h-4 w-4" />}>Importuj {toImport.invoices.length + toImport.costs.length} dokumentów</Button>} />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50/60">
                      <tr>
                        <th className="table-head w-10"></th>
                        <th className="table-head">Typ</th>
                        <th className="table-head">Data</th>
                        <th className="table-head">Numer</th>
                        <th className="table-head">Kontrahent</th>
                        <th className="table-head text-right">Netto</th>
                        <th className="table-head text-right">VAT</th>
                        <th className="table-head"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
                        <tr key={r.id} className={clsx(!selected(r.id) && "opacity-50")}>
                          <td className="table-cell"><input type="checkbox" checked={selected(r.id)} disabled={r.dup} onChange={() => toggle(r.id)} className="h-4 w-4 accent-brand-600" /></td>
                          <td className="table-cell"><Badge tone={r.kind === "Sprzedaż" ? "blue" : "amber"}>{r.kind}</Badge></td>
                          <td className="table-cell text-slate-600">{r.date}</td>
                          <td className="table-cell font-medium">{r.number}</td>
                          <td className="table-cell"><div>{r.party}</div>{r.nip && <div className="text-xs text-slate-400">{r.nip}</div>}</td>
                          <td className="table-cell text-right">{pln(r.net)}</td>
                          <td className="table-cell text-right">{pln(r.vat)}</td>
                          <td className="table-cell">{r.dup && <Badge tone="red">już istnieje</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Bilans otwarcia ─────────────────────────

function OpeningBalanceForm() {
  const { company, setCompany } = useStore();
  const now = new Date();
  const blank: OpeningBalance = { year: now.getFullYear(), fromMonth: now.getMonth() + 1, revenue: 0, costs: 0, social: 0, healthDeducted: 0, taxPaid: 0, vatCarry: 0, lastMonthIncome: 0 };
  const [ob, setOb] = useState<OpeningBalance>(company.openingBalance ?? blank);
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<OpeningBalance>) => { setOb((o) => ({ ...o, ...p })); setSaved(false); };
  const prevMonth = ob.fromMonth > 1 ? MONTHS_PL[ob.fromMonth - 2] : "—";
  const numField = (key: keyof OpeningBalance, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" step="0.01" value={ob[key] || ""} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<OpeningBalance>)} placeholder="0,00" />
    </Field>
  );

  return (
    <Card>
      <CardHeader title="Bilans otwarcia" subtitle="Sumy narastające z poprzedniego programu na początek miesiąca, od którego prowadzisz księgowość tutaj" icon={<Scale className="h-5 w-5" />} />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rok">
            <input className="input" type="number" value={ob.year} onChange={(e) => set({ year: Number(e.target.value) })} />
          </Field>
          <Field label="Prowadzę tutaj od miesiąca" hint="Pierwszy miesiąc, którego dokumenty wprowadzasz w tej aplikacji.">
            <select className="input" value={ob.fromMonth} onChange={(e) => set({ fromMonth: Number(e.target.value) })}>
              {MONTHS_PL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-sm text-slate-600">Wpisz sumy <b>od 1 stycznia do końca: {prevMonth} {ob.year}</b>.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numField("revenue", "Przychód narastająco", "Z KPiR lub ewidencji przychodów poprzedniego programu — wiersz „Razem od początku roku”, kolumna przychodu.")}
          {company.taxForm !== "ryczalt" && numField("costs", "Koszty narastająco (z amortyzacją)", "Z KPiR — suma wydatków narastająco (kolumny kosztowe), łącznie z odpisami amortyzacyjnymi.")}
          {numField("social", "ZUS społeczne odliczone", "Suma składek społecznych zapłaconych w tym roku i odliczonych w zaliczkach (z wyliczenia zaliczki w poprzednim programie).")}
          {company.taxForm !== "skala" && numField("healthDeducted", company.taxForm === "ryczalt" ? "50% zdrowotnej odliczone" : "Zdrowotna odliczona", company.taxForm === "ryczalt" ? "Na ryczałcie odliczasz 50% zapłaconych składek zdrowotnych od przychodu." : "Na liniowym — zapłacona zdrowotna odliczona od dochodu (do rocznego limitu).")}
          {numField("taxPaid", company.taxForm === "ryczalt" ? "Ryczałt zapłacony" : "Zaliczki PIT zapłacone", "Suma zaliczek / ryczałtu wpłaconych za miesiące tego roku — z potwierdzeń przelewów lub e-Urzędu Skarbowego.")}
          {company.vatStatus === "czynny" && numField("vatCarry", "Nadwyżka VAT do przeniesienia", "Z ostatniego JPK_V7M — pozycja „kwota nadwyżki do przeniesienia na następny okres” (P_62).")}
          {company.taxForm !== "ryczalt" && numField("lastMonthIncome", `Dochód za ${prevMonth}`, "Dochód z ostatniego miesiąca przed przejściem — podstawa składki zdrowotnej za pierwszy miesiąc tutaj.")}
        </div>
        <Tip tone="info">Dokumenty z miesięcy sprzed wybranego miesiąca nie będą brane do obliczeń w {ob.year} r. — ich wynik jest już zawarty w sumach powyżej. Możesz je mimo to zaimportować, żeby mieć pełną historię faktur.</Tip>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setCompany({ openingBalance: ob }); setSaved(true); }} icon={<Check className="h-4 w-4" />}>{saved ? "Zapisano" : "Zapisz bilans otwarcia"}</Button>
          {company.openingBalance && (
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setCompany({ openingBalance: undefined }); setOb(blank); setSaved(false); }}>Usuń bilans otwarcia</Button>
          )}
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Hint text="Bilans otwarcia uwzględniamy w zaliczkach PIT, składce zdrowotnej i rozliczeniu VAT od wybranego miesiąca." />Jak to działa?</span>
        </div>
      </div>
    </Card>
  );
}
