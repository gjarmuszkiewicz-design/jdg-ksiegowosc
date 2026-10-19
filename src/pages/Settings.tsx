import { KeyRound, Building2, CloudUpload, Database, Download, Landmark, RotateCcw, Save, ShieldCheck, Upload, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BankFields, IdentityFields, TaxFields, ZusFields } from "@/components/CompanyFields";
import { Button, Card, CardHeader, Field, Modal, PageHeader, Tip } from "@/components/ui";
import { downloadFile } from "@/lib/xml";
import type { Company } from "@/lib/types";
import { changePassword, useSession } from "@/store/session";
import { useStore } from "@/store/useStore";

export default function Settings() {
  const store = useStore();
  const [draft, setDraft] = useState<Company>(store.company);
  const [saved, setSaved] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [health, setHealth] = useState<{ ai?: boolean; smtp?: boolean; ksefMode?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  const patch = (p: Partial<Company>) => { setDraft((d) => ({ ...d, ...p })); setSaved(false); };
  const save = () => { store.setCompany(draft); setSaved(true); };

  const exportBackup = () => {
    const { company, contractors, invoices, costs, assets, payments } = useStore.getState();
    downloadFile(`kopia-ksiegowosc-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 2, company, contractors, invoices, costs, assets, payments }, null, 2), "application/json");
  };
  const importBackup = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data.company || !Array.isArray(data.invoices)) throw new Error();
      useStore.setState({ company: data.company, contractors: data.contractors ?? [], invoices: data.invoices, costs: data.costs ?? [], assets: data.assets ?? [], payments: data.payments ?? [] });
      setDraft(data.company);
      alert("Kopia przywrócona.");
    } catch {
      alert("To nie jest poprawny plik kopii zapasowej.");
    }
  };

  const section = (title: string, icon: React.ReactNode, children: React.ReactNode, subtitle?: string) => (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="p-5">{children}</div>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Ustawienia firmy" subtitle="Dane, podatki, ZUS, KSeF i kopia zapasowa" actions={<Button onClick={save} disabled={saved} icon={<Save className="h-4 w-4" />}>{saved ? "Zapisano" : "Zapisz zmiany"}</Button>} />
      <div className="space-y-6">
        {section("Dane firmy i właściciela", <Building2 className="h-5 w-5" />, <IdentityFields value={draft} onChange={patch} />)}
        {section("Podatki i VAT", <Landmark className="h-5 w-5" />, <TaxFields value={draft} onChange={patch} />, "Zmiana formy opodatkowania w urzędzie: w CEIDG do 20 lutego")}
        {section("ZUS", <ShieldCheck className="h-5 w-5" />, <ZusFields value={draft} onChange={patch} />)}
        {section("Konto i numeracja faktur", <Wallet className="h-5 w-5" />, <BankFields value={draft} onChange={patch} />)}
        {section(
          "KSeF",
          <CloudUpload className="h-5 w-5" />,
          <div className="space-y-4">
            <Tip tone="info" title="Jak zdobyć token KSeF?">
              Zaloguj się do Aplikacji Podatnika KSeF (profil zaufany lub e-dowód), przejdź do „Tokeny” i wygeneruj token z uprawnieniami do wystawiania i przeglądania faktur. Wklej go poniżej.
            </Tip>
            <Field label="Token KSeF" hint="Token jest przechowywany lokalnie w przeglądarce i wysyłany wyłącznie do serwera aplikacji przy komunikacji z KSeF.">
              <input className="input font-mono" type="password" value={draft.ksefToken} onChange={(e) => patch({ ksefToken: e.target.value })} placeholder="wklej token" />
            </Field>
          </div>,
        )}
        {section("Konto i hasło", <KeyRound className="h-5 w-5" />, <PasswordForm />)}
        {section(
          "Dane i kopia zapasowa",
          <Database className="h-5 w-5" />,
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Dane są zapisywane w Twojej przeglądarce. Regularnie pobieraj kopię zapasową.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportBackup}>Pobierz kopię (JSON)</Button>
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Przywróć z kopii</Button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
              <Button variant="ghost" onClick={() => { store.loadDemo(); setDraft(useStore.getState().company); }}>Wczytaj dane przykładowe</Button>
              <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>Wyczyść wszystko</Button>
            </div>
            {health && (
              <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                <span>Asystent AI: <b className={health.ai ? "text-emerald-600" : "text-amber-600"}>{health.ai ? "połączony" : "tryb offline"}</b></span>
                <span>Wysyłka e-mail (SMTP): <b className={health.smtp ? "text-emerald-600" : "text-amber-600"}>{health.smtp ? "skonfigurowana" : "brak — używany program pocztowy"}</b></span>
                <span>KSeF: <b>{health.ksefMode}</b></span>
              </div>
            )}
          </div>,
        )}
      </div>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Wyczyścić wszystkie dane?" footer={<><Button variant="secondary" onClick={() => setConfirmReset(false)}>Anuluj</Button><Button variant="danger" onClick={() => store.resetAll()}>Tak, usuń wszystko</Button></>}>
        <p className="text-sm text-slate-600">Usuniesz firmę, faktury, koszty i kontrahentów z tej przeglądarki. Tej operacji nie można cofnąć — najpierw pobierz kopię zapasową.</p>
      </Modal>
    </div>
  );
}

function PasswordForm() {
  const user = useSession((s) => s.user);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async () => {
    try {
      await changePassword(current, next);
      setMsg({ ok: true, text: "Hasło zmienione. Inne zalogowane urządzenia zostały wylogowane." });
      setCurrent("");
      setNext("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Zalogowano jako <b>{user?.email}</b>.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Obecne hasło"><input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Nowe hasło" hint="Co najmniej 8 znaków."><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
        <div className="flex items-end"><Button variant="secondary" disabled={!current || next.length < 8} onClick={submit}>Zmień hasło</Button></div>
      </div>
      {msg && <Tip tone={msg.ok ? "success" : "warning"}>{msg.text}</Tip>}
    </div>
  );
}
