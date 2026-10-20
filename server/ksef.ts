/**
 * Integracja z KSeF API 2.0 (Krajowy System e-Faktur).
 *
 * Przepływ wysyłki faktury w sesji interaktywnej:
 *  1. POST /auth/challenge                         → challenge + timestamp
 *  2. GET  /security/public-key-certificates       → certyfikaty MF (szyfrowanie tokena i klucza symetrycznego)
 *  3. POST /auth/ksef-token                        → token KSeF zaszyfrowany RSA-OAEP (SHA-256) w postaci "token|timestampMs"
 *  4. GET  /auth/{referenceNumber}                 → oczekiwanie na zakończenie uwierzytelnienia
 *  5. POST /auth/token/redeem                      → accessToken (JWT) do dalszych wywołań
 *  6. POST /sessions/online                        → otwarcie sesji z kluczem AES-256 zaszyfrowanym RSA-OAEP
 *  7. POST /sessions/online/{ref}/invoices         → faktura zaszyfrowana AES-256-CBC (PKCS#7) + skróty SHA-256
 *  8. POST /sessions/online/{ref}/close            → zamknięcie sesji (generuje UPO)
 *  9. GET  /sessions/{ref}/invoices/{invoiceRef}   → status przetworzenia i numer KSeF
 *
 * UWAGA: kod nie był testowany na środowisku MF. Miejsca oznaczone „WERYFIKUJ” trzeba sprawdzić
 * z aktualną dokumentacją: https://github.com/CIRFMF/ksef-docs oraz specyfikacją OpenAPI środowiska.
 */
import crypto from "node:crypto";

export type KsefEnv = "test" | "demo" | "prod";

export const KSEF_URLS: Record<KsefEnv, string> = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
  prod: "https://api.ksef.mf.gov.pl/v2",
};

export interface KsefSendResult {
  ok: boolean;
  status: "przyjeta" | "w_kolejce" | "odrzucona" | "brak";
  simulated?: boolean;
  ksefNumber?: string;
  referenceNumber?: string;
  message: string;
}

interface PublicKeyCert {
  certificate: string; // base64 DER
  usage: string[];
  publicKeyId?: string;
  validTo?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface KsefInvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate?: string;
  acquisitionDate?: string;
  seller?: { nip: string; name?: string };
  buyer?: { identifier?: { type: string; value?: string }; name?: string };
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  currency: string;
  invoiceType: string;
}

export interface PurchaseMetadata {
  ksefNumber: string;
  number: string;
  supplierName: string;
  supplierNip: string;
  buyerNip: string;
  issueDate: string;
  receivedDate: string;
  net: number;
  vat: number;
  gross: number;
  currency: string;
  invoiceType: string;
}

/** Dzieli zakres dat (RRRR-MM-DD) na kawałki w obrębie miesięcy kalendarzowych */
export function monthChunks(from: string, to: string): [string, string][] {
  const out: [string, string][] = [];
  let cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const chunkEnd = monthEnd < end ? monthEnd : end;
    out.push([cur.toISOString().slice(0, 10), chunkEnd.toISOString().slice(0, 10)]);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

export class KsefClient {
  private accessToken = "";
  private certs: PublicKeyCert[] = [];

  constructor(
    private readonly env: KsefEnv,
    private readonly nip: string,
    private readonly ksefToken: string,
  ) {}

  private get base() {
    return KSEF_URLS[this.env];
  }

  private async call<T>(method: string, path: string, body?: unknown, bearer = this.accessToken): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`KSeF ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private cert(usage: string) {
    const now = Date.now();
    return (
      this.certs.find((c) => c.usage.includes(usage) && (!c.validTo || new Date(c.validTo).getTime() > now)) ??
      this.certs.find((c) => c.usage.includes(usage)) ??
      this.certs[0]
    );
  }

  private publicKey(usage: string) {
    const cert = this.cert(usage);
    if (!cert) throw new Error("Brak certyfikatu klucza publicznego MF");
    const pem = `-----BEGIN CERTIFICATE-----\n${cert.certificate.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
    return new crypto.X509Certificate(pem).publicKey;
  }

  private rsaEncrypt(data: Buffer, usage: string) {
    return crypto.publicEncrypt(
      { key: this.publicKey(usage), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      data,
    );
  }

  async authenticate() {
    this.certs = await this.call<PublicKeyCert[]>("GET", "/security/public-key-certificates", undefined, "");
    const ch = await this.call<{ challenge: string; timestamp: string; timestampMs?: number }>("POST", "/auth/challenge", undefined, "");
    const timestampMs = ch.timestampMs ?? new Date(ch.timestamp).getTime();
    const encryptedToken = this.rsaEncrypt(Buffer.from(`${this.ksefToken}|${timestampMs}`), "KsefTokenEncryption").toString("base64");

    const auth = await this.call<{ referenceNumber: string; authenticationToken: { token: string } }>(
      "POST",
      "/auth/ksef-token",
      { challenge: ch.challenge, contextIdentifier: { type: "Nip", value: this.nip }, encryptedToken, ...(this.cert("KsefTokenEncryption")?.publicKeyId ? { publicKeyId: this.cert("KsefTokenEncryption")!.publicKeyId } : {}) },
      "",
    );
    const authToken = auth.authenticationToken.token;

    // Status uwierzytelnienia: 100 = w toku, 200 = sukces, >= 400 = błąd (np. nieprawidłowy token lub brak uprawnień)
    let ok = false;
    for (let i = 0; i < 20; i++) {
      const st = await this.call<{ status: { code: number; description: string; details?: string[] } }>("GET", `/auth/${auth.referenceNumber}`, undefined, authToken);
      if (st.status.code === 200) {
        ok = true;
        break;
      }
      if (st.status.code >= 400) throw new Error(`KSeF odrzucił logowanie tokenem: ${st.status.description}${st.status.details?.length ? ` (${st.status.details.join("; ")})` : ""}`);
      await sleep(1000);
    }
    if (!ok) throw new Error("KSeF nie potwierdził logowania w czasie 20 s — spróbuj ponownie za chwilę.");
    const redeemed = await this.call<{ accessToken: { token: string } }>("POST", "/auth/token/redeem", undefined, authToken);
    this.accessToken = redeemed.accessToken.token;
  }

  /**
   * Faktury, w których jesteśmy nabywcą (Podmiot 2), wystawione w podanym okresie.
   * Zapytania po miesiącu, stronicowanie do 100 rekordów (POST /invoices/query/metadata).
   */
  async queryPurchases(from: string, to: string): Promise<PurchaseMetadata[]> {
    if (!this.accessToken) await this.authenticate();
    const out: PurchaseMetadata[] = [];
    for (const [start, end] of monthChunks(from, to)) {
      for (let page = 0; page < 50; page++) {
        const res = await this.call<{ hasMore: boolean; isTruncated: boolean; invoices: KsefInvoiceMetadata[] }>(
          "POST",
          `/invoices/query/metadata?pageSize=100&pageOffset=${page}&sortOrder=Asc`,
          { subjectType: "Subject2", dateRange: { dateType: "Issue", from: `${start}T00:00:00+00:00`, to: `${end}T23:59:59+00:00` } },
        );
        for (const m of res.invoices ?? [])
          out.push({
            ksefNumber: m.ksefNumber,
            number: m.invoiceNumber,
            supplierName: m.seller?.name ?? "",
            supplierNip: m.seller?.nip ?? "",
            buyerNip: m.buyer?.identifier?.value ?? "",
            issueDate: m.issueDate,
            receivedDate: (m.acquisitionDate ?? m.invoicingDate ?? "").slice(0, 10),
            net: m.netAmount,
            vat: m.vatAmount,
            gross: m.grossAmount,
            currency: m.currency,
            invoiceType: m.invoiceType,
          });
        if (!res.hasMore || res.isTruncated) break;
      }
    }
    return out;
  }

  /** Pełny XML faktury po numerze KSeF */
  async getInvoiceXml(ksefNumber: string): Promise<string> {
    if (!this.accessToken) await this.authenticate();
    const res = await fetch(`${this.base}/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/xml" },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`KSeF GET /invoices/ksef → ${res.status}: ${text.slice(0, 300)}`);
    return text;
  }

  async sendInvoice(xml: string): Promise<KsefSendResult> {
    if (!this.accessToken) await this.authenticate();

    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const session = await this.call<{ referenceNumber: string }>("POST", "/sessions/online", {
      // WERYFIKUJ: kod formularza dla FA(3)
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: this.rsaEncrypt(key, "SymmetricKeyEncryption").toString("base64"),
        initializationVector: iv.toString("base64"),
        ...(this.cert("SymmetricKeyEncryption")?.publicKeyId ? { publicKeyId: this.cert("SymmetricKeyEncryption")!.publicKeyId } : {}),
      },
    });

    const plain = Buffer.from(xml, "utf8");
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("base64");

    const sent = await this.call<{ referenceNumber: string }>("POST", `/sessions/online/${session.referenceNumber}/invoices`, {
      invoiceHash: sha(plain),
      invoiceSize: plain.length,
      encryptedInvoiceHash: sha(encrypted),
      encryptedInvoiceSize: encrypted.length,
      encryptedInvoiceContent: encrypted.toString("base64"),
    });

    await this.call("POST", `/sessions/online/${session.referenceNumber}/close`);

    // WERYFIKUJ: struktura odpowiedzi statusu faktury
    for (let i = 0; i < 15; i++) {
      const st = await this.call<{ status: { code: number; description: string }; ksefNumber?: string }>(
        "GET",
        `/sessions/${session.referenceNumber}/invoices/${sent.referenceNumber}`,
      );
      if (st.status.code === 200 && st.ksefNumber)
        return { ok: true, status: "przyjeta", ksefNumber: st.ksefNumber, referenceNumber: sent.referenceNumber, message: "Faktura przyjęta w KSeF." };
      if (st.status.code >= 400)
        return { ok: false, status: "odrzucona", referenceNumber: sent.referenceNumber, message: `KSeF odrzucił fakturę: ${st.status.description}` };
      await sleep(2000);
    }
    return { ok: true, status: "w_kolejce", referenceNumber: sent.referenceNumber, message: "Faktura w trakcie przetwarzania — sprawdź status później." };
  }
}



/** Tryb symulacji — odpowiedź w formacie zbliżonym do prawdziwego numeru KSeF */
export function simulateSend(nip: string): KsefSendResult {
  const hex = (n: number) => crypto.randomBytes(n).toString("hex").toUpperCase();
  // Symulacja niczego nie wysyła — nie zmieniamy statusu faktury i nie nadajemy zmyślonego numeru KSeF
  void hex;
  void nip;
  return {
    ok: false,
    simulated: true,
    status: "brak",
    message: "Tryb symulacji — faktura NIE została wysłana do KSeF. Wyślij ją w Aplikacji Podatnika KSeF albo poczekaj na włączenie połączenia z KSeF.",
  };
}

export function simulatePurchases(nip: string) {
  const d = new Date();
  const day = (offset: number) => new Date(d.getFullYear(), d.getMonth(), Math.max(1, d.getDate() - offset)).toISOString().slice(0, 10);
  const mk = (supplierNip: string, offset: number) => `${supplierNip}-${day(offset).replace(/-/g, "")}-${crypto.randomBytes(6).toString("hex").toUpperCase()}-${crypto.randomBytes(1).toString("hex").toUpperCase()}`;
  return [
    { ksefNumber: mk("5260250995", 3), number: `FV/${d.getMonth() + 1}/ORANGE/88`, supplierName: "Orange Polska S.A.", supplierNip: "5260250995", issueDate: day(3), net: 150, vat: 34.5, gross: 184.5 },
    { ksefNumber: mk("7740001454", 6), number: `F/ORL/${d.getMonth() + 1}/1203`, supplierName: "Orlen S.A.", supplierNip: "7740001454", issueDate: day(6), net: 325.2, vat: 74.8, gross: 400 },
    { ksefNumber: mk("9512404440", 9), number: `FA/2026/${d.getMonth() + 1}/77`, supplierName: "Biuro Coworking Hub sp. z o.o.", supplierNip: "9512404440", issueDate: day(9), net: 800, vat: 184, gross: 984 },
  ].map((x) => ({ ...x, buyerNip: nip }));
}
