import clsx from "clsx";
import { FileUp, Loader2, Save, ScanText, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { COST_CATEGORIES } from "@/lib/costs";
import { costsFromScan, type ScannedInvoice } from "@/lib/costScan";
import { VAT_RATES } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import type { Cost, CostCategory, VatRate } from "@/lib/types";
import { todayIso, uid, useStore } from "@/store/useStore";
import { Button, Field, Modal, Tip, Toggle } from "./ui";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
    r.readAsDataURL(file);
  });
}

/**
 * Dodanie kosztu z PDF lub zdjęcia faktury: AI odczytuje dane, użytkownik sprawdza i zapisuje.
 * `onUseInForm` — gdy podane, faktura z jedną stawką VAT może trafić do formularza zamiast zapisu od razu.
 */
export function ScanCostModal({ open, onClose, onSaved, onUseInForm }: { open: boolean; onClose: () => void; onSaved?: (costs: Cost[]) => void; onUseInForm?: (cost: Cost) => void }) {
  const { company, costs: existing, importBatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "review" | "error">("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [drafts, setDrafts] = useState<Cost[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [vatDate, setVatDate] = useState("");
  const [drag, setDrag] = useState(false);

  const reset = () => {
    setState("idle");
    setDrafts([]);
    setWarnings([]);
    setError("");
    setFileName("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const scan = async (file: File) => {
    setFileName(file.name);
    if (!ACCEPT.split(",").includes(file.type)) {
      setState("error");
      setError("Wybierz plik PDF albo zdjęcie (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setState("error");
      setError("Plik jest za duży (maks. 15 MB).");
      return;
    }
    setState("reading");
    try {
      const data = await readBase64(file);
      const res = await fetch("/api/costs/scan", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, mediaType: file.type, fileName: file.name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.message || `Błąd ${res.status}`);
      const r = costsFromScan(body.scanned as ScannedInvoice, company, existing, { fileName: file.name, today: todayIso(), newId: uid });
      setDrafts(r.costs.length ? r.costs : [{ ...emptyDraft(file.name), supplierName: body.scanned.supplierName ?? "", docNumber: body.scanned.number ?? "" }]);
      setWarnings(r.warnings);
      setVatDate(r.costs[0]?.date ?? todayIso());
      setState("review");
    } catch (e) {
      setState("error");
      setError((e as Error).message);
    }
  };

  const head = drafts[0];
  const setAll = (patch: Partial<Cost>) => setDrafts((d) => d.map((c) => ({ ...c, ...patch })));
  const setRow = (i: number, patch: Partial<Cost>) => setDrafts((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setCategory = (category: CostCategory) => {
    const def = COST_CATEGORIES.find((c) => c.value === category)?.defaults ?? { vatDeduction: "pelne" as const, costShare: 1 };
    setAll({ category, costShare: def.costShare, vatDeduction: company.vatStatus === "zwolniony" ? "brak" : def.vatDeduction });
  };
  const final = () => drafts.map((c) => ({ ...c, vatDate: vatDate && vatDate !== c.date ? vatDate : undefined }));
  const gross = round2(drafts.reduce((a, c) => a + c.net + c.vat, 0));
  const save = () => {
    const list = final();
    importBatch({ costs: list });
    onSaved?.(list);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Dodaj koszt z PDF lub zdjęcia"
      footer={
        state === "review" ? (
          <>
            <Button variant="ghost" onClick={reset}>Inny plik</Button>
            {onUseInForm && drafts.length === 1 && <Button variant="secondary" onClick={() => { onUseInForm(final()[0]); close(); }}>Otwórz w formularzu</Button>}
            <Button icon={<Save className="h-4 w-4" />} onClick={save} disabled={!head?.supplierName || drafts.every((c) => !c.net && !c.vat)}>
              {drafts.length > 1 ? `Zapisz ${drafts.length} pozycje kosztów` : "Zapisz koszt"}
            </Button>
          </>
        ) : undefined
      }
    >
      {(state === "idle" || state === "error") && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void scan(f); }}
            className={clsx("flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition", drag ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50")}
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white"><FileUp className="h-7 w-7" /></div>
            <div className="text-base font-semibold">Przeciągnij tu fakturę albo kliknij, aby wybrać plik</div>
            <div className="text-sm text-slate-500">PDF albo zdjęcie (JPG, PNG) — także zrobione telefonem</div>
          </button>
          <input ref={input} type="file" accept={ACCEPT} capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} aria-label="Plik faktury" />
          {state === "error" && <Tip tone="warning" title="Nie udało się odczytać faktury">{error}</Tip>}
          <p className="flex items-start gap-2 text-xs text-slate-500"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" /> Dane odczytuje sztuczna inteligencja (Claude). Plik jest wysyłany tylko do odczytu i nie jest przechowywany. Zawsze sprawdź kwoty przed zapisaniem.</p>
        </div>
      )}

      {state === "reading" && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <div className="font-semibold">Czytam fakturę „{fileName}”…</div>
          <div className="text-sm text-slate-500">Zwykle trwa to kilkanaście sekund.</div>
        </div>
      )}

      {state === "review" && head && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><ScanText className="h-4 w-4 text-violet-500" /> Odczytano z pliku <b className="text-slate-700">{fileName}</b> — sprawdź i popraw, jeśli trzeba.</div>
          {warnings.map((w) => <Tip key={w} tone="warning">{w}</Tip>)}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Sprzedawca"><input className="input" value={head.supplierName} onChange={(e) => setAll({ supplierName: e.target.value })} /></Field>
            <Field label="NIP sprzedawcy"><input className="input" value={head.supplierNip} onChange={(e) => setAll({ supplierNip: e.target.value })} /></Field>
            <Field label="Numer faktury"><input className="input" value={head.docNumber} onChange={(e) => setAll({ docNumber: e.target.value })} /></Field>
            <Field label="Kategoria">
              <select className="input" value={head.category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
                {COST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
              </select>
            </Field>
            <Field label="Data wystawienia (koszt w PIT)"><input className="input" type="date" value={head.date} onChange={(e) => setAll({ date: e.target.value })} /></Field>
            <Field label="Data otrzymania (odliczenie VAT)" hint="VAT odliczasz najwcześniej w miesiącu, w którym dostałeś fakturę."><input className="input" type="date" value={vatDate} onChange={(e) => setVatDate(e.target.value)} /></Field>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Opis</th><th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2">VAT</th><th className="px-3 py-2 text-right">Kwota VAT</th><th className="px-3 py-2 text-right">Brutto</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drafts.map((c, i) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2"><input className="input" value={c.description} onChange={(e) => setRow(i, { description: e.target.value })} aria-label="Opis" /></td>
                    <td className="w-32 px-3 py-2"><input className="input text-right" type="number" step="0.01" value={c.net} onChange={(e) => setRow(i, { net: Number(e.target.value) })} aria-label="Netto" /></td>
                    <td className="w-24 px-3 py-2">
                      <select className="input px-2" value={c.vatRate} onChange={(e) => setRow(i, { vatRate: e.target.value as VatRate })} aria-label="Stawka VAT">
                        {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="w-28 px-3 py-2"><input className="input text-right" type="number" step="0.01" value={c.vat} onChange={(e) => setRow(i, { vat: Number(e.target.value) })} aria-label="Kwota VAT" /></td>
                    <td className="w-28 px-3 py-2 text-right font-semibold">{pln(round2(c.net + c.vat))}</td>
                  </tr>
                ))}
              </tbody>
              {drafts.length > 1 && (
                <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2" colSpan={4}>Razem</td><td className="px-3 py-2 text-right">{pln(gross)}</td></tr></tfoot>
              )}
            </table>
          </div>
          <Toggle checked={head.paid} onChange={(v) => setAll({ paid: v })} label="Zapłacona" hint="Odznacz, jeśli faktura czeka na przelew." />
          {drafts.length > 1 && <p className="text-xs text-slate-500">Faktura ma kilka stawek VAT — zapiszemy ją jako {drafts.length} pozycje kosztów z tym samym numerem (tak liczą się VAT i JPK).</p>}
        </div>
      )}
    </Modal>
  );
}

function emptyDraft(fileName: string): Cost {
  return { id: uid(), docNumber: "", date: todayIso(), supplierName: "", supplierNip: "", description: "", category: "inne", net: 0, vatRate: "23", vat: 0, vatDeduction: "pelne", costShare: 1, isFixedAsset: false, paid: true, createdAt: new Date().toISOString(), source: `skan:${fileName}` };
}
