import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { invoiceTotals } from "../src/lib/invoice";
import { pln } from "../src/lib/money";
import { invoiceFromShopOrder, type ShopOrder } from "../src/lib/shopOrder";
import type { Company, Invoice, ShopSite, ShopSiteSettings, VatRate } from "../src/lib/types";
import type { AuthedRequest } from "./auth";
import { invoicePdf } from "./invoicePdf";
import { hasSmtp, sendMail } from "./mail";
import { mutateState, NoChange, type AppState } from "./stateStore";
import type { Integration, IntegrationOrder, Storage } from "./storage";
import { zipDir } from "./zip";

export const PLUGIN_VERSION = "1.0.0";
const PLUGIN_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "wordpress-plugin", "jdg-faktury");

const DEFAULT_SETTINGS: ShopSiteSettings = { invoiceMode: "na_zadanie", numberPattern: "", emailBy: "sklep", defaultVatRate: "23", markPaid: true };
const VAT: VatRate[] = ["23", "8", "5", "0", "zw", "np"];

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const newKey = () => `jdg_${randomBytes(24).toString("base64url")}`;

function cleanSettings(input: unknown, prev: ShopSiteSettings = DEFAULT_SETTINGS): ShopSiteSettings {
  const s = (input && typeof input === "object" ? input : {}) as Partial<ShopSiteSettings>;
  const pattern = typeof s.numberPattern === "string" ? s.numberPattern.trim().slice(0, 60) : prev.numberPattern;
  return {
    invoiceMode: s.invoiceMode === "zawsze" || s.invoiceMode === "na_zadanie" ? s.invoiceMode : prev.invoiceMode,
    // numer musi zawierać {NR}, inaczej każda faktura miałaby ten sam numer
    numberPattern: pattern && !pattern.includes("{NR}") ? prev.numberPattern : pattern,
    emailBy: s.emailBy === "sklep" || s.emailBy === "aplikacja" || s.emailBy === "brak" ? s.emailBy : prev.emailBy,
    defaultVatRate: VAT.includes(s.defaultVatRate as VatRate) ? (s.defaultVatRate as VatRate) : prev.defaultVatRate,
    markPaid: typeof s.markPaid === "boolean" ? s.markPaid : prev.markPaid,
  };
}

const publicSite = ({ keyHash: _h, userId: _u, ...site }: Integration): ShopSite => site;
const publicOrder = ({ userId: _u, publicToken: _t, ...o }: IntegrationOrder) => o;

const baseUrl = (req: Request) => process.env.PUBLIC_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
const pdfName = (inv: Invoice) => `Faktura_${inv.number.replace(/[^\w-]+/g, "_")}.pdf`;

// Proste ograniczenie liczby zapytań ze sklepu (ochrona przed zapętloną wtyczką)
const hits = new Map<string, number[]>();
function rateLimited(siteId: string, perMinute = 120) {
  const now = Date.now();
  const list = (hits.get(siteId) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(siteId, list);
  return list.length > perMinute;
}

function customerEmail(inv: Invoice, company: Company, url: string) {
  const total = invoiceTotals(inv).gross;
  const order = inv.shopOrder;
  const subject = `Faktura ${inv.number}${order ? ` do zamówienia nr ${order.orderNumber}` : ""} — ${company.name}`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
<p>Dzień dobry,</p>
<p>w załączniku przesyłamy fakturę nr <b>${esc(inv.number)}</b>${order ? ` do zamówienia nr <b>${esc(order.orderNumber)}</b> w sklepie ${esc(order.siteName)}` : ""} na kwotę <b>${pln(total)}</b>.</p>
<p>Fakturę można też pobrać w każdej chwili: <a href="${url}">${url}</a></p>
<p>Dziękujemy za zakupy!<br/>${esc(company.name)}</p>
</div>`;
  return { subject, html };
}

/** Wszystko, co potrzebne do faktury z publicznym tokenem */
async function loadInvoice(storage: Storage, userId: string, invoiceId: string) {
  const st = (await storage.getState(userId))?.state as (AppState & { company?: Company }) | undefined;
  const invoice = st?.invoices?.find((i) => i.id === invoiceId);
  return invoice && st?.company ? { invoice, company: st.company } : undefined;
}

/** Endpointy dla wtyczki WordPress — uwierzytelnienie kluczem API sklepu */
export function wpRouter(storage: Storage) {
  const r = express.Router();

  r.use(async (req: Request & { site?: Integration }, res: Response, next: NextFunction) => {
    const header = req.get("x-jdg-key") || req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!header) return res.status(401).json({ ok: false, message: "Brak klucza API (nagłówek X-JDG-Key)." });
    try {
      const site = await storage.getIntegrationByKeyHash(hashKey(header.trim()));
      if (!site) return res.status(401).json({ ok: false, message: "Nieprawidłowy klucz API — skopiuj go ponownie z aplikacji (Integracje → Sklepy)." });
      if (!site.active) return res.status(403).json({ ok: false, message: "Połączenie z tym sklepem jest wyłączone w aplikacji." });
      if (rateLimited(site.id)) return res.status(429).json({ ok: false, message: "Za dużo zapytań — spróbuj za minutę." });
      req.site = site;
      next();
    } catch (e) {
      next(e);
    }
  });

  r.get("/ping", async (req: Request & { site?: Integration }, res) => {
    const site = req.site!;
    const st = (await storage.getState(site.userId))?.state as { company?: Company } | undefined;
    await storage.saveIntegration({ ...site, lastUsedAt: new Date().toISOString() });
    res.json({ ok: true, site: { name: site.name, settings: site.settings }, company: st?.company ? { name: st.company.name, nip: st.company.nip, vatStatus: st.company.vatStatus } : null, smtp: hasSmtp(), pluginVersion: PLUGIN_VERSION });
  });

  r.post("/orders", async (req: Request & { site?: Integration }, res, next) => {
    const site = req.site!;
    const order = req.body as ShopOrder;
    const orderId = String(order?.orderId ?? "").trim();
    if (!orderId || !Array.isArray(order.items)) return res.status(400).json({ ok: false, message: "Nieprawidłowe dane zamówienia." });
    const orderNumber = String(order.orderNumber || orderId);
    const now = new Date().toISOString();
    const customer = [order.buyer?.company, [order.buyer?.firstName, order.buyer?.lastName].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    try {
      const prev = await storage.getIntegrationOrder(site.id, orderId);
      if (prev?.status === "wystawiona" && prev.invoiceId) {
        const found = await loadInvoice(storage, site.userId, prev.invoiceId);
        return res.json({ ok: true, status: "exists", invoice: { id: prev.invoiceId, number: prev.invoiceNumber, gross: prev.total }, url: prev.publicToken ? `${baseUrl(req)}/f/${prev.publicToken}` : undefined, deleted: !found });
      }

      const token = randomBytes(18).toString("base64url");
      const result = await mutateState(storage, site.userId, (state, rev) => {
        const company = state.company as Company | undefined;
        if (!company?.onboarded) return new NoChange({ ok: false as const, skip: false, reason: "Uzupełnij dane firmy w aplikacji." });
        const out = invoiceFromShopOrder(order, site, company, state.invoices ?? [], { id: randomUUID() });
        if (!out.ok) return new NoChange(out);
        out.invoice.serverRev = rev;
        out.invoice.shopOrder = { ...out.invoice.shopOrder!, publicToken: token };
        state.invoices = [...(state.invoices ?? []), out.invoice];
        return { ...out, company };
      });

      if (!result.ok) {
        await storage.saveIntegrationOrder({ siteId: site.id, orderId, orderNumber, userId: site.userId, status: result.skip ? "pominieta" : "blad", message: result.reason, total: Number(order.total) || undefined, customer, createdAt: prev?.createdAt ?? now, updatedAt: now });
        return res.status(result.skip ? 200 : 422).json({ ok: result.skip, status: result.skip ? "skipped" : "error", message: result.reason });
      }

      const { invoice, company, warning } = result;
      const gross = invoiceTotals(invoice).gross;
      const url = `${baseUrl(req)}/f/${token}`;
      const pdf = await invoicePdf(invoice, company);
      const mail = customerEmail(invoice, company, url);
      let email: "sklep" | "wyslano" | "brak" | "blad" = site.settings.emailBy === "sklep" ? "sklep" : "brak";
      let emailError: string | undefined;
      if (site.settings.emailBy === "aplikacja" && invoice.buyer.email) {
        if (!hasSmtp()) {
          email = "blad";
          emailError = "Aplikacja nie ma skonfigurowanej poczty (SMTP) — ustaw w sklepie wysyłkę przez WordPress.";
        } else {
          try {
            await sendMail({ to: invoice.buyer.email, subject: mail.subject, html: mail.html, replyTo: company.email || undefined, attachments: [{ filename: pdfName(invoice), content: pdf, contentType: "application/pdf" }] });
            email = "wyslano";
          } catch (e) {
            email = "blad";
            emailError = (e as Error).message;
          }
        }
      }
      const message = [warning, emailError && `E-mail: ${emailError}`].filter(Boolean).join(" ") || undefined;
      await storage.saveIntegrationOrder({ siteId: site.id, orderId, orderNumber, userId: site.userId, status: "wystawiona", message, invoiceId: invoice.id, invoiceNumber: invoice.number, total: gross, customer, publicToken: token, createdAt: prev?.createdAt ?? now, updatedAt: now });
      await storage.saveIntegration({ ...site, lastUsedAt: now });

      res.json({
        ok: true,
        status: "issued",
        invoice: { id: invoice.id, number: invoice.number, gross, issueDate: invoice.issueDate, buyerEmail: invoice.buyer.email },
        url,
        warning,
        email,
        emailError,
        // wysyłka przez WordPress: wtyczka dostaje gotowy PDF i treść wiadomości
        ...(site.settings.emailBy === "sklep" ? { pdf: pdf.toString("base64"), filename: pdfName(invoice), mail } : {}),
      });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) return res.status(409).json({ ok: false, message: (e as Error).message });
      next(e);
    }
  });

  r.get("/orders/:orderId", async (req: Request & { site?: Integration }, res) => {
    const o = await storage.getIntegrationOrder(req.site!.id, req.params.orderId);
    if (!o) return res.status(404).json({ ok: false, message: "Aplikacja nie zna tego zamówienia." });
    res.json({ ok: true, order: publicOrder(o), url: o.publicToken ? `${baseUrl(req)}/f/${o.publicToken}` : undefined });
  });

  r.get("/orders/:orderId/pdf", async (req: Request & { site?: Integration }, res) => {
    const o = await storage.getIntegrationOrder(req.site!.id, req.params.orderId);
    const found = o?.invoiceId ? await loadInvoice(storage, o.userId, o.invoiceId) : undefined;
    if (!found) return res.status(404).json({ ok: false, message: "Brak faktury do tego zamówienia." });
    const pdf = await invoicePdf(found.invoice, found.company);
    res.type("application/pdf").setHeader("Content-Disposition", `attachment; filename="${pdfName(found.invoice)}"`);
    res.send(pdf);
  });

  return r;
}

/** Publiczny link do PDF faktury (wysyłany klientowi): /f/<token> */
export function publicInvoiceRouter(storage: Storage) {
  const r = express.Router();
  r.get("/f/:token", async (req, res, next) => {
    try {
      const o = /^[\w-]{20,40}$/.test(req.params.token) ? await storage.getIntegrationOrderByToken(req.params.token) : undefined;
      const found = o?.invoiceId ? await loadInvoice(storage, o.userId, o.invoiceId) : undefined;
      if (!found) return res.status(404).type("text/plain; charset=utf-8").send("Nie znaleziono faktury — link mógł wygasnąć. Skontaktuj się ze sprzedawcą.");
      const pdf = await invoicePdf(found.invoice, found.company);
      res.type("application/pdf").setHeader("Content-Disposition", `inline; filename="${pdfName(found.invoice)}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  });
  return r;
}

/** Zarządzanie sklepami w aplikacji (zalogowany użytkownik) */
export function integrationsRouter(storage: Storage) {
  const r = express.Router();
  const mine = async (req: AuthedRequest) => {
    const site = await storage.getIntegration(req.params.id);
    return site && site.userId === req.user!.id ? site : undefined;
  };

  r.get("/", async (req: AuthedRequest, res) => {
    const [sites, orders] = await Promise.all([storage.listIntegrations(req.user!.id), storage.listIntegrationOrders(req.user!.id, 100)]);
    res.json({ ok: true, sites: sites.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicSite), orders: orders.map(publicOrder), smtp: hasSmtp(), pluginVersion: PLUGIN_VERSION });
  });

  r.post("/", async (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    const url = String(req.body?.url ?? "").trim().slice(0, 200);
    if (!name) return res.status(400).json({ ok: false, message: "Podaj nazwę sklepu." });
    const key = newKey();
    const site: Integration = { id: randomUUID(), userId: req.user!.id, name, url, keyHash: hashKey(key), keyPrefix: key.slice(0, 8), settings: cleanSettings(req.body?.settings), active: true, createdAt: new Date().toISOString() };
    await storage.saveIntegration(site);
    res.json({ ok: true, site: publicSite(site), key });
  });

  r.put("/:id", async (req: AuthedRequest, res) => {
    const site = await mine(req);
    if (!site) return res.status(404).json({ ok: false, message: "Nie ma takiego sklepu." });
    const next: Integration = {
      ...site,
      name: typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim().slice(0, 80) : site.name,
      url: typeof req.body?.url === "string" ? req.body.url.trim().slice(0, 200) : site.url,
      active: typeof req.body?.active === "boolean" ? req.body.active : site.active,
      settings: cleanSettings(req.body?.settings, site.settings),
    };
    await storage.saveIntegration(next);
    res.json({ ok: true, site: publicSite(next) });
  });

  r.post("/:id/key", async (req: AuthedRequest, res) => {
    const site = await mine(req);
    if (!site) return res.status(404).json({ ok: false, message: "Nie ma takiego sklepu." });
    const key = newKey();
    await storage.saveIntegration({ ...site, keyHash: hashKey(key), keyPrefix: key.slice(0, 8) });
    res.json({ ok: true, key });
  });

  r.delete("/:id", async (req: AuthedRequest, res) => {
    const site = await mine(req);
    if (!site) return res.status(404).json({ ok: false, message: "Nie ma takiego sklepu." });
    await storage.deleteIntegration(site.id);
    res.json({ ok: true });
  });

  return r;
}

/** Paczka wtyczki do zainstalowania w WordPressie (Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer) */
export async function pluginZip() {
  return zipDir(PLUGIN_DIR, "jdg-faktury");
}
