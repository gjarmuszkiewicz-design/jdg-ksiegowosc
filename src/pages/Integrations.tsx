import clsx from "clsx";
import { Copy, Download, KeyRound, Plug, Plus, RefreshCw, Save, Store, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Tabs, Tip, Toggle } from "@/components/ui";
import { nextInvoiceNumber, VAT_RATES } from "@/lib/invoice";
import { pln } from "@/lib/money";
import type { ShopOrderLog, ShopSite, ShopSiteSettings } from "@/lib/types";
import { todayIso, useStore } from "@/store/useStore";

interface ListResponse {
  sites: ShopSite[];
  orders: ShopOrderLog[];
  smtp: boolean;
  pluginVersion: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Błąd ${res.status}`);
  return data as T;
}

const appUrl = () => window.location.origin;

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input className={clsx("input font-mono text-sm", secret && "bg-amber-50")} readOnly value={value} onFocus={(e) => e.target.select()} />
        <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copy}>{copied ? "Skopiowano" : "Kopiuj"}</Button>
      </div>
    </Field>
  );
}

function SiteCard({ site, orders, smtp, onSaved, onKey, onDelete }: { site: ShopSite; orders: ShopOrderLog[]; smtp: boolean; onSaved: (s: ShopSite) => void; onKey: (key: string, site: ShopSite) => void; onDelete: () => void }) {
  const { company, invoices } = useStore();
  const [form, setForm] = useState({ name: site.name, url: site.url, active: site.active, settings: site.settings });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<ShopSiteSettings>) => setForm((f) => ({ ...f, settings: { ...f.settings, ...patch } }));
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: site.name, url: site.url, active: site.active, settings: site.settings });
  const issued = orders.filter((o) => o.status === "wystawiona").length;
  const pattern = form.settings.numberPattern.trim();
  const patternError = pattern && !pattern.includes("{NR}") ? "Wzór musi zawierać {NR}" : "";
  const preview = nextInvoiceNumber(pattern || company.invoiceNumberPattern, invoices, todayIso(), Boolean(pattern) && pattern !== company.invoiceNumberPattern);

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ site: ShopSite }>(`/api/integrations/${site.id}`, { method: "PUT", body: JSON.stringify(form) });
      onSaved(r.site);
      setMsg("Zapisano");
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  const regenerate = async () => {
    if (!confirm("Wygenerować nowy klucz? Stary przestanie działać — trzeba będzie wkleić nowy w ustawieniach wtyczki w tym sklepie.")) return;
    const r = await call<{ key: string }>(`/api/integrations/${site.id}/key`, { method: "POST" });
    onKey(r.key, site);
  };
  const remove = async () => {
    if (!confirm(`Odłączyć sklep „${site.name}”? Wystawione faktury zostaną w aplikacji, ale sklep nie będzie mógł wystawiać nowych.`)) return;
    await call(`/api/integrations/${site.id}`, { method: "DELETE" });
    onDelete();
  };

  return (
    <Card>
      <CardHeader
        icon={<Store className="h-5 w-5" />}
        title={<span className="flex items-center gap-2">{site.name} {site.active ? <Badge tone="green">aktywny</Badge> : <Badge>wyłączony</Badge>}</span>}
        subtitle={<>{site.url || "bez adresu"} · klucz {site.keyPrefix}… · {site.lastUsedAt ? `ostatnie połączenie ${new Date(site.lastUsedAt).toLocaleString("pl-PL")}` : "jeszcze nie połączono"} · faktur: {issued}</>}
      />
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Field label="Nazwa sklepu"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Adres sklepu"><input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://mojsklep.pl" /></Field>
        <div className="md:col-span-2">
          <span className="label">Kiedy wystawiać fakturę</span>
          <Tabs value={form.settings.invoiceMode} onChange={(v) => set({ invoiceMode: v })} options={[{ value: "na_zadanie", label: "Gdy klient zaznaczy „Chcę fakturę”" }, { value: "zawsze", label: "Do każdego zamówienia" }]} />
        </div>
        <Field label="Kto wysyła fakturę klientowi" hint="Najprościej przez sklep — wiadomość wychodzi z adresu sklepu, z PDF w załączniku.">
          <select className="input" value={form.settings.emailBy} onChange={(e) => set({ emailBy: e.target.value as ShopSiteSettings["emailBy"] })}>
            <option value="sklep">Sklep (poczta WordPressa)</option>
            <option value="aplikacja">Aplikacja (SMTP){smtp ? "" : " — brak konfiguracji"}</option>
            <option value="brak">Nie wysyłaj (tylko link na koncie klienta)</option>
          </select>
        </Field>
        <Field label="Numeracja faktur ze sklepu" error={patternError} hint={`Puste = wspólna numeracja. Np. SKLEP/{NR}/{MM}/{RRRR}. Następny numer: ${preview}`}>
          <input className="input font-mono" value={form.settings.numberPattern} onChange={(e) => set({ numberPattern: e.target.value })} placeholder={company.invoiceNumberPattern} />
        </Field>
        <Field label="Stawka VAT, gdy sklep nie nalicza podatku" hint={company.vatStatus === "zwolniony" ? "Jesteś zwolniony z VAT — faktury dostaną „zw.”." : "Gdy sklep ma włączone podatki, bierzemy stawkę z zamówienia."}>
          <select className="input" value={form.settings.defaultVatRate} disabled={company.vatStatus === "zwolniony"} onChange={(e) => set({ defaultVatRate: e.target.value as ShopSiteSettings["defaultVatRate"] })}>
            {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <div className="space-y-3 pt-6">
          <Toggle checked={form.settings.markPaid} onChange={(v) => set({ markPaid: v })} label="Opłacone zamówienie = faktura opłacona" hint="Płatności online (Przelewy24, PayU, BLIK, karta) oznaczą fakturę jako zapłaconą." />
          <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Połączenie aktywne" />
        </div>
        {form.settings.emailBy === "aplikacja" && !smtp && (
          <div className="md:col-span-2"><Tip tone="warning" title="Aplikacja nie ma skonfigurowanej poczty">Ustaw zmienne SMTP_HOST, SMTP_USER, SMTP_PASS i SMTP_FROM na Railway albo wybierz wysyłkę przez sklep.</Tip></div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        <Button icon={<Save className="h-4 w-4" />} onClick={save} disabled={!dirty || busy || Boolean(patternError)}>Zapisz</Button>
        <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={regenerate}>Nowy klucz API</Button>
        <Button variant="ghost" className="text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Odłącz sklep</Button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </Card>
  );
}

export default function Integrations() {
  const invoices = useStore((s) => s.invoices);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", url: "" });
  const [keyInfo, setKeyInfo] = useState<{ key: string; site: ShopSite } | null>(null);

  const load = () =>
    call<ListResponse>("/api/integrations")
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    try {
      const r = await call<{ site: ShopSite; key: string }>("/api/integrations", { method: "POST", body: JSON.stringify(newSite) });
      setAdding(false);
      setNewSite({ name: "", url: "" });
      setKeyInfo({ key: r.key, site: r.site });
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const siteName = (id: string) => data?.sites.find((s) => s.id === id)?.name ?? "usunięty sklep";
  const statusBadge = (o: ShopOrderLog) =>
    o.status === "wystawiona" ? <Badge tone="green">wystawiona</Badge> : o.status === "pominieta" ? <Badge>bez faktury</Badge> : <Badge tone="red">błąd</Badge>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sklepy WordPress"
        subtitle="Zamówienia ze sklepów WooCommerce same zamieniają się w faktury, a klient dostaje PDF na maila"
        actions={
          <>
            <a href="/api/integrations/plugin.zip" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
              <Download className="h-4 w-4" /> Pobierz wtyczkę {data ? `v${data.pluginVersion}` : ""}
            </a>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Dodaj sklep</Button>
          </>
        }
      />

      <Tip title="Jak to działa" tone="info">
        1. Dodaj sklep tutaj — dostaniesz klucz API (każdy sklep ma własny). 2. Pobierz wtyczkę i zainstaluj ją w WordPressie (Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer). 3. W WooCommerce → Faktury JDG wklej adres aplikacji i klucz. Od tej chwili po opłaceniu zamówienia faktura pojawi się w aplikacji (z numerem z Twojej numeracji), trafi do VAT i podatku, a klient dostanie ją e-mailem.
      </Tip>
      {error && <Tip tone="warning" title="Coś poszło nie tak">{error}</Tip>}

      {data && data.sites.length === 0 && (
        <EmptyState icon={<Plug className="h-6 w-6" />} title="Nie masz jeszcze połączonych sklepów" description="Dodaj pierwszy sklep — możesz podłączyć dowolnie wiele stron na WordPressie." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Dodaj sklep</Button>} />
      )}

      {data?.sites.map((s) => (
        <SiteCard
          key={s.id}
          site={s}
          smtp={data.smtp}
          orders={data.orders.filter((o) => o.siteId === s.id)}
          onSaved={(site) => setData({ ...data, sites: data.sites.map((x) => (x.id === site.id ? site : x)) })}
          onKey={(key, site) => { setKeyInfo({ key, site }); void load(); }}
          onDelete={() => void load()}
        />
      ))}

      {data && data.orders.length > 0 && (
        <Card>
          <CardHeader title="Ostatnie zamówienia ze sklepów" subtitle="Nowe faktury pojawiają się też na liście faktur (odśwież stronę, jeśli nie widzisz)" action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>Odśwież</Button>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Sklep</th><th className="px-4 py-2">Zamówienie</th><th className="px-4 py-2">Klient</th><th className="px-4 py-2 text-right">Kwota</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Faktura / uwagi</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.orders.map((o) => (
                  <tr key={`${o.siteId}-${o.orderId}`}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{new Date(o.updatedAt).toLocaleString("pl-PL")}</td>
                    <td className="px-4 py-2">{siteName(o.siteId)}</td>
                    <td className="px-4 py-2">#{o.orderNumber}</td>
                    <td className="px-4 py-2">{o.customer || "—"}</td>
                    <td className="px-4 py-2 text-right">{o.total ? pln(o.total) : "—"}</td>
                    <td className="px-4 py-2">{statusBadge(o)}</td>
                    <td className="px-4 py-2">
                      {o.invoiceId && invoices.some((i) => i.id === o.invoiceId) ? <Link className="font-semibold text-brand-700 hover:underline" to={`/faktury/${o.invoiceId}`}>{o.invoiceNumber}</Link> : o.invoiceNumber}
                      {o.message && <div className="text-xs text-slate-500">{o.message}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Dodaj sklep WordPress"
        footer={<Button icon={<Plus className="h-4 w-4" />} disabled={!newSite.name.trim()} onClick={create}>Dodaj i pokaż klucz</Button>}
      >
        <div className="space-y-4">
          <Field label="Nazwa sklepu" hint="Pojawi się w uwagach na fakturze, np. „Zamówienie nr 123 (Sklep z ceramiką)”."><input className="input" value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} placeholder="np. Sklep z ceramiką" autoFocus /></Field>
          <Field label="Adres sklepu (opcjonalnie)"><input className="input" value={newSite.url} onChange={(e) => setNewSite({ ...newSite, url: e.target.value })} placeholder="https://mojsklep.pl" /></Field>
          <p className="text-sm text-slate-500">Domyślnie faktura powstaje, gdy klient zaznaczy „Chcę fakturę”, liczona od cen brutto ze sklepu, ze wspólną numeracją. Zmienisz to po dodaniu.</p>
        </div>
      </Modal>

      <Modal open={Boolean(keyInfo)} onClose={() => setKeyInfo(null)} title={`Połącz sklep „${keyInfo?.site.name ?? ""}”`} wide footer={<Button onClick={() => setKeyInfo(null)}>Gotowe</Button>}>
        {keyInfo && (
          <div className="space-y-4">
            <Tip tone="warning" title="Zapisz klucz teraz">Ze względów bezpieczeństwa klucz widać tylko raz. Jeśli go zgubisz, wygeneruj nowy.</Tip>
            <CopyField label="Adres aplikacji" value={appUrl()} />
            <CopyField label="Klucz API sklepu" value={keyInfo.key} secret />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li><a className="font-semibold text-brand-700 hover:underline" href="/api/integrations/plugin.zip">Pobierz wtyczkę</a> (plik .zip).</li>
              <li>W WordPressie: <b>Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer</b>, wybierz plik i kliknij <b>Włącz</b>.</li>
              <li>Wejdź w <b>WooCommerce → Faktury JDG</b>, wklej adres aplikacji i klucz, zapisz i kliknij <b>Sprawdź połączenie</b>.</li>
            </ol>
          </div>
        )}
      </Modal>
    </div>
  );
}
