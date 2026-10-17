import clsx from "clsx";
import { Check, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PARAMS_2026, TAX_FORM_LABELS, ZUS_STAGE_LABELS } from "@/lib/config2026";
import { cleanNip, isValidIban, isValidNip } from "@/lib/validation";
import type { Company, TaxForm, VatStatus, ZusStage } from "@/lib/types";
import { Field, Tip, Toggle } from "./ui";

type Props = { value: Company; onChange: (patch: Partial<Company>) => void };

function ChoiceTile({ active, onClick, title, desc, badge }: { active: boolean; onClick: () => void; title: string; desc: ReactNode; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative rounded-2xl border-2 p-4 text-left transition",
        active ? "border-brand-500 bg-brand-50/60 shadow-md shadow-brand-500/10" : "border-slate-200 bg-white hover:border-brand-200",
      )}
    >
      {active && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-white"><Check className="h-4 w-4" /></span>}
      <div className="pr-8 font-semibold text-slate-900">{title}</div>
      {badge && <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{badge}</span>}
      <div className="mt-1 text-sm text-slate-500">{desc}</div>
    </button>
  );
}

export function IdentityFields({ value: c, onChange }: Props) {
  const [lookup, setLookup] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const fetchNip = async () => {
    setLookup("loading");
    try {
      const d = await (await fetch(`/api/nip/${cleanNip(c.nip)}`)).json();
      if (!d.ok) throw new Error();
      onChange({ name: d.name, address: { street: d.street, postalCode: d.postalCode, city: d.city, country: "PL" }, bankAccount: c.bankAccount || d.bankAccounts?.[0] || "" });
      setLookup("ok");
    } catch {
      setLookup("error");
    }
  };
  const addr = (p: Partial<Company["address"]>) => onChange({ address: { ...c.address, ...p } });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Imię"><input className="input" value={c.firstName} onChange={(e) => onChange({ firstName: e.target.value })} /></Field>
        <Field label="Nazwisko"><input className="input" value={c.lastName} onChange={(e) => onChange({ lastName: e.target.value })} /></Field>
        <Field label="Data urodzenia" hint="Wymagana w pliku JPK_V7M dla osób fizycznych."><input className="input" type="date" value={c.birthDate} onChange={(e) => onChange({ birthDate: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="NIP" error={c.nip && !isValidNip(c.nip) ? "Nieprawidłowa suma kontrolna NIP" : ""}>
          <div className="flex gap-2">
            <input className="input" value={c.nip} onChange={(e) => onChange({ nip: e.target.value })} placeholder="0000000000" />
            <button type="button" title="Pobierz dane z Białej Listy MF" disabled={!isValidNip(c.nip) || lookup === "loading"} onClick={fetchNip} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-brand-600 hover:bg-brand-50 disabled:opacity-40">
              <Search className="h-4 w-4" />
            </button>
          </div>
          {lookup === "ok" && <span className="mt-1 block text-xs text-emerald-600">Dane pobrane z Białej Listy ✓</span>}
          {lookup === "error" && <span className="mt-1 block text-xs text-amber-600">Nie znaleziono — uzupełnij ręcznie.</span>}
        </Field>
        <Field label="REGON (opcjonalnie)"><input className="input" value={c.regon} onChange={(e) => onChange({ regon: e.target.value })} /></Field>
        <Field label="Główne PKD" hint="Np. 62.01.Z dla programistów. Pomaga dobrać stawkę ryczałtu i podpowiedzi (np. IP Box)."><input className="input" value={c.pkd} onChange={(e) => onChange({ pkd: e.target.value })} placeholder="62.01.Z" /></Field>
      </div>
      <Field label="Nazwa firmy (jak w CEIDG)"><input className="input" value={c.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="np. Jan Kowalski Usługi IT" /></Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Ulica i numer" className="sm:col-span-2"><input className="input" value={c.address.street} onChange={(e) => addr({ street: e.target.value })} /></Field>
        <Field label="Kod pocztowy"><input className="input" value={c.address.postalCode} onChange={(e) => addr({ postalCode: e.target.value })} placeholder="00-000" /></Field>
        <Field label="Miasto"><input className="input" value={c.address.city} onChange={(e) => addr({ city: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="E-mail"><input className="input" type="email" value={c.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>
        <Field label="Telefon"><input className="input" value={c.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field>
        <Field label="Data rozpoczęcia działalności"><input className="input" type="date" value={c.startDate} onChange={(e) => onChange({ startDate: e.target.value })} /></Field>
      </div>
    </div>
  );
}

export function TaxFields({ value: c, onChange }: Props) {
  const forms: { v: TaxForm; desc: string }[] = [
    { v: "skala", desc: "12% do 120 tys. zł dochodu, 32% powyżej. Kwota wolna 30 tys. zł, ulgi, wspólne rozliczenie." },
    { v: "liniowy", desc: "Zawsze 19% od dochodu. Dobre przy wysokich dochodach i kosztach." },
    { v: "ryczalt", desc: "Podatek od przychodu (bez kosztów). Najprostszy, dobry przy niskich kosztach." },
  ];
  const vats: { v: VatStatus; title: string; desc: string }[] = [
    { v: "czynny", title: "Czynny podatnik VAT", desc: "Doliczasz VAT do faktur, odliczasz VAT od zakupów, co miesiąc wysyłasz JPK_V7M." },
    { v: "zwolniony", title: "Zwolniony z VAT", desc: `Sprzedaż do ${PARAMS_2026.vat.exemptionLimit.toLocaleString("pl-PL")} zł rocznie. Mniej formalności, ale nie odliczasz VAT.` },
  ];
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Forma opodatkowania</div>
        <div className="grid gap-3 md:grid-cols-3">
          {forms.map((f) => <ChoiceTile key={f.v} active={c.taxForm === f.v} onClick={() => onChange({ taxForm: f.v })} title={TAX_FORM_LABELS[f.v]} desc={f.desc} />)}
        </div>
        <p className="mt-2 text-xs text-slate-500">Nie wiesz, co wybrać? Po dodaniu kilku faktur zajrzyj do „Optymalizacji” — porównamy wszystkie formy na Twoich danych.</p>
      </div>
      {c.taxForm === "ryczalt" && (
        <Field label="Stawka ryczałtu" hint="Zależy od rodzaju działalności (PKWiU). W razie wątpliwości zapytaj asystenta AI.">
          <select className="input" value={c.ryczaltRate} onChange={(e) => onChange({ ryczaltRate: Number(e.target.value) })}>
            {PARAMS_2026.ryczaltRates.map((r) => <option key={r.rate} value={r.rate}>{r.label}</option>)}
          </select>
        </Field>
      )}
      <div>
        <div className="label">VAT</div>
        <div className="grid gap-3 md:grid-cols-2">
          {vats.map((v) => <ChoiceTile key={v.v} active={c.vatStatus === v.v} onClick={() => onChange({ vatStatus: v.v })} title={v.title} desc={v.desc} />)}
        </div>
      </div>
      {c.vatStatus === "zwolniony" ? (
        <Field label="Podstawa zwolnienia (drukowana na fakturze)"><input className="input" value={c.vatExemptionBasis} onChange={(e) => onChange({ vatExemptionBasis: e.target.value })} /></Field>
      ) : (
        <Field label="Kod urzędu skarbowego" hint="4-cyfrowy kod US właściwego dla Twojego miejsca zamieszkania, np. 1471 (Warszawa-Śródmieście). Potrzebny do JPK_V7M.">
          <input className="input sm:w-48" value={c.taxOfficeCode} onChange={(e) => onChange({ taxOfficeCode: e.target.value })} placeholder="np. 1471" />
        </Field>
      )}
    </div>
  );
}

export function ZusFields({ value: c, onChange }: Props) {
  const stages: { v: ZusStage; desc: string; badge?: string }[] = [
    { v: "ulga_na_start", desc: "Pierwsze 6 miesięcy: płacisz tylko zdrowotną.", badge: "najtaniej" },
    { v: "preferencyjny", desc: "Kolejne 24 miesiące: ok. 456 zł społecznych (z chorobową)." },
    { v: "maly_zus_plus", desc: "Przy przychodzie do 120 tys. zł — składki od dochodu." },
    { v: "pelny", desc: "Standardowe składki: ok. 1 927 zł (z chorobową i FP)." },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {stages.map((s) => <ChoiceTile key={s.v} active={c.zusStage === s.v} onClick={() => onChange({ zusStage: s.v })} title={ZUS_STAGE_LABELS[s.v]} desc={s.desc} badge={s.badge} />)}
      </div>
      {c.zusStage === "maly_zus_plus" && (
        <Field label="Podstawa wymiaru składek (Mały ZUS Plus)" hint="50% średniego miesięcznego dochodu z poprzedniego roku, nie mniej niż 30% i nie więcej niż 60% prognozowanego przeciętnego wynagrodzenia.">
          <input className="input sm:w-48" type="number" value={c.malyZusBase || ""} onChange={(e) => onChange({ malyZusBase: Number(e.target.value) })} />
        </Field>
      )}
      {c.zusStage !== "ulga_na_start" && (
        <Toggle checked={c.chorobowa} onChange={(v) => onChange({ chorobowa: v })} label="Płacę dobrowolną składkę chorobową" hint="Daje prawo do zasiłku chorobowego i macierzyńskiego. Zalecana." />
      )}
      {c.zusStage === "ulga_na_start" && <Tip tone="info">W okresie ulgi na start nie płacisz składek społecznych, więc nie masz ubezpieczenia chorobowego ani wypadkowego.</Tip>}
    </div>
  );
}

export function BankFields({ value: c, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Numer konta firmowego" className="sm:col-span-2" error={c.bankAccount && !isValidIban(c.bankAccount) ? "Numer konta wygląda na niepoprawny" : ""} hint="Musi być na Białej Liście VAT, jeśli jesteś VAT-owcem.">
          <input className="input" value={c.bankAccount} onChange={(e) => onChange({ bankAccount: e.target.value })} placeholder="PL00 0000 0000 0000 0000 0000 0000" />
        </Field>
        <Field label="Bank"><input className="input" value={c.bankName} onChange={(e) => onChange({ bankName: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Wzór numeru faktury" hint="{NR} – kolejny numer, {MM} – miesiąc, {RRRR} – rok. Z {MM} numeracja zaczyna się od 1 co miesiąc.">
          <input className="input" value={c.invoiceNumberPattern} onChange={(e) => onChange({ invoiceNumberPattern: e.target.value })} />
        </Field>
        <Field label="Domyślny termin płatności (dni)"><input className="input" type="number" min={0} value={c.defaultPaymentDays} onChange={(e) => onChange({ defaultPaymentDays: Number(e.target.value) })} /></Field>
      </div>
    </div>
  );
}
