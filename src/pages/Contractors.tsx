import clsx from "clsx";
import { Building2, DownloadCloud, FilePlus2, Mail, MapPin, Pencil, Plus, Search, Trash2, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Tip, Toggle } from "@/components/ui";
import { invoiceTotals, isAccounting } from "@/lib/invoice";
import { pln, round2 } from "@/lib/money";
import { cleanNip, isValidNip } from "@/lib/validation";
import { uid, useStore } from "@/store/useStore";
import type { Contractor } from "@/lib/types";

const emptyContractor = (): Contractor => ({
  id: uid(),
  name: "",
  nip: "",
  address: { street: "", postalCode: "", city: "", country: "PL" },
  email: "",
  isCompany: true,
  note: "",
});

export default function Contractors() {
  const { contractors, invoices, upsertContractor, deleteContractor } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Contractor | null>(null);
  const [toDelete, setToDelete] = useState<Contractor | null>(null);
  const [lookup, setLookup] = useState<{ loading: boolean; error?: string; ok?: string }>({ loading: false });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; gross: number }>();
    for (const inv of invoices) {
      if (!isAccounting(inv)) continue;
      const key = inv.buyer.contractorId ?? cleanNip(inv.buyer.nip);
      const s = m.get(key) ?? { count: 0, gross: 0 };
      s.count++;
      s.gross = round2(s.gross + invoiceTotals(inv).gross);
      m.set(key, s);
    }
    return m;
  }, [invoices]);

  const statFor = (c: Contractor) => stats.get(c.id) ?? stats.get(cleanNip(c.nip)) ?? { count: 0, gross: 0 };

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return contractors
      .filter((c) => !query || `${c.name} ${c.nip} ${c.address.city} ${c.email}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [contractors, q]);

  const open = (c?: Contractor) => {
    setLookup({ loading: false });
    setEdit(c ? structuredClone(c) : emptyContractor());
  };

  const setE = (patch: Partial<Contractor>) => setEdit((e) => (e ? { ...e, ...patch } : e));
  const setAddr = (patch: Partial<Contractor["address"]>) => setEdit((e) => (e ? { ...e, address: { ...e.address, ...patch } } : e));

  const fetchNip = async () => {
    if (!edit) return;
    const nip = cleanNip(edit.nip);
    if (!isValidNip(nip)) {
      setLookup({ loading: false, error: "Wpisz poprawny NIP, aby pobrać dane." });
      return;
    }
    setLookup({ loading: true });
    try {
      const res = await fetch(`/api/nip/${nip}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.name) throw new Error(data?.message || "Nie znaleziono podmiotu o tym NIP.");
      setEdit((e) =>
        e
          ? {
              ...e,
              name: data.name ?? e.name,
              address: {
                street: data.street ?? data.address?.street ?? e.address.street,
                postalCode: data.postalCode ?? data.address?.postalCode ?? e.address.postalCode,
                city: data.city ?? data.address?.city ?? e.address.city,
                country: "PL",
              },
              isCompany: true,
            }
          : e,
      );
      setLookup({ loading: false, ok: data.vatStatus ? `Dane pobrane. Status VAT: ${data.vatStatus}.` : "Dane pobrane z rejestru." });
    } catch (err) {
      setLookup({ loading: false, error: err instanceof Error ? err.message : "Nie udało się pobrać danych." });
    }
  };

  const nipError = edit?.isCompany && edit.nip && !isValidNip(edit.nip) ? "Niepoprawny NIP (błędna suma kontrolna)." : undefined;

  const save = () => {
    if (!edit) return;
    upsertContractor({ ...edit, nip: cleanNip(edit.nip) });
    setEdit(null);
  };

  return (
    <div>
      <PageHeader
        title="Kontrahenci"
        subtitle="Twoi klienci i dostawcy — zapisz ich raz, korzystaj przy każdej fakturze."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => open()}>
            Dodaj kontrahenta
          </Button>
        }
      />

      {contractors.length > 0 && (
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Szukaj po nazwie, NIP, mieście…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {!contractors.length ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Brak kontrahentów"
            description="Dodaj pierwszego klienta. Wystarczy NIP — dane firmy pobierzemy z rejestru."
            action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => open()}>Dodaj kontrahenta</Button>}
          />
        </Card>
      ) : !filtered.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">Nikt nie pasuje do wyszukiwania „{q}”.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const s = statFor(c);
            return (
              <Card key={c.id} className="flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start gap-3">
                  <div
                    className={clsx(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-md",
                      c.isCompany ? "bg-gradient-to-br from-brand-500 to-indigo-500" : "bg-gradient-to-br from-amber-500 to-orange-500",
                    )}
                  >
                    {c.isCompany ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.nip ? `NIP ${c.nip}` : "osoba prywatna"}</div>
                  </div>
                  <Badge tone={c.isCompany ? "blue" : "amber"}>{c.isCompany ? "B2B" : "B2C"}</Badge>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {(c.address.street || c.address.city) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span className="truncate">
                        {c.address.street}
                        {c.address.city ? `, ${c.address.postalCode} ${c.address.city}` : ""}
                      </span>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                  <div>
                    <div className="text-xs text-slate-500">Faktury</div>
                    <div className="font-bold text-slate-900">{s.count}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Suma brutto</div>
                    <div className="font-bold text-slate-900">{pln(s.gross)}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate(`/faktury/nowa?kontrahent=${c.id}`)}>
                    Wystaw fakturę
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => open(c)} aria-label="Edytuj">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setToDelete(c)} aria-label="Usuń" className="hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && contractors.some((c) => c.id === edit.id) ? "Edycja kontrahenta" : "Nowy kontrahent"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Anuluj
            </Button>
            <Button onClick={save} disabled={!edit?.name.trim()}>
              Zapisz
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Toggle checked={edit.isCompany} onChange={(v) => setE({ isCompany: v })} label="Firma (B2B)" hint="Dla firm wymagany jest NIP, a faktura trafia do KSeF. Osoby prywatne (B2C) — bez NIP." />
            {edit.isCompany && (
              <div>
                <div className="flex items-end gap-2">
                  <Field label="NIP" error={nipError} className="flex-1">
                    <input className={clsx("input", nipError && "input-error")} value={edit.nip} onChange={(e) => setE({ nip: e.target.value })} placeholder="10 cyfr" />
                  </Field>
                  <Button variant="secondary" icon={<DownloadCloud className="h-4 w-4" />} onClick={fetchNip} disabled={lookup.loading} className={nipError ? "mb-5" : ""}>
                    {lookup.loading ? "Pobieram…" : "Pobierz z GUS/białej listy"}
                  </Button>
                </div>
                {lookup.error && <p className="mt-2 text-xs font-medium text-rose-600">{lookup.error}</p>}
                {lookup.ok && <p className="mt-2 text-xs font-medium text-emerald-600">{lookup.ok}</p>}
              </div>
            )}
            <Field label={edit.isCompany ? "Nazwa firmy" : "Imię i nazwisko"}>
              <input className="input" value={edit.name} onChange={(e) => setE({ name: e.target.value })} />
            </Field>
            <Field label="Ulica i numer">
              <input className="input" value={edit.address.street} onChange={(e) => setAddr({ street: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kod pocztowy">
                <input className="input" value={edit.address.postalCode} onChange={(e) => setAddr({ postalCode: e.target.value })} placeholder="00-000" />
              </Field>
              <Field label="Miasto" className="col-span-2">
                <input className="input" value={edit.address.city} onChange={(e) => setAddr({ city: e.target.value })} />
              </Field>
            </div>
            <Field label="E-mail do wysyłki faktur">
              <input type="email" className="input" value={edit.email} onChange={(e) => setE({ email: e.target.value })} />
            </Field>
            <Field label="Notatka">
              <input className="input" value={edit.note ?? ""} onChange={(e) => setE({ note: e.target.value })} placeholder="np. termin płatności 30 dni" />
            </Field>
            {!edit.isCompany && <Tip tone="info">Fakturę dla osoby prywatnej możesz wystawić bez NIP — nie trafia ona obowiązkowo do KSeF.</Tip>}
          </div>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Usunąć kontrahenta?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (toDelete) deleteContractor(toDelete.id);
                setToDelete(null);
              }}
            >
              Usuń
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <b>{toDelete?.name}</b> zniknie z listy kontrahentów. Wystawione faktury pozostaną bez zmian — dane nabywcy są w nich zapisane.
        </p>
      </Modal>
    </div>
  );
}
