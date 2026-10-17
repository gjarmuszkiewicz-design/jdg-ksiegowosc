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
  status: "przyjeta" | "w_kolejce" | "odrzucona";
  ksefNumber?: string;
  referenceNumber?: string;
  message: string;
}

interface PublicKeyCert {
  certificate: string; // base64 DER
  usage: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  private publicKey(usage: string) {
    // WERYFIKUJ: nazwy przeznaczeń certyfikatów ("KsefTokenEncryption", "SymmetricKeyEncryption")
    const cert = this.certs.find((c) => c.usage.includes(usage)) ?? this.certs[0];
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
    const ch = await this.call<{ challenge: string; timestamp: string }>("POST", "/auth/challenge", undefined, "");
    const timestampMs = new Date(ch.timestamp).getTime();
    const encryptedToken = this.rsaEncrypt(Buffer.from(`${this.ksefToken}|${timestampMs}`), "KsefTokenEncryption").toString("base64");

    const auth = await this.call<{ referenceNumber: string; authenticationToken: { token: string } }>(
      "POST",
      "/auth/ksef-token",
      { challenge: ch.challenge, contextIdentifier: { type: "Nip", value: this.nip }, encryptedToken },
      "",
    );
    const authToken = auth.authenticationToken.token;

    // WERYFIKUJ: kody statusu uwierzytelnienia (200 = sukces, 1xx = w toku, >=400 = błąd)
    for (let i = 0; i < 20; i++) {
      const st = await this.call<{ status: { code: number; description: string } }>("GET", `/auth/${auth.referenceNumber}`, undefined, authToken);
      if (st.status.code === 200) break;
      if (st.status.code >= 400) throw new Error(`Uwierzytelnienie KSeF odrzucone: ${st.status.description}`);
      await sleep(1000);
    }
    const redeemed = await this.call<{ accessToken: { token: string } }>("POST", "/auth/token/redeem", undefined, authToken);
    this.accessToken = redeemed.accessToken.token;
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

const ymd = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

/** Tryb symulacji — odpowiedź w formacie zbliżonym do prawdziwego numeru KSeF */
export function simulateSend(nip: string): KsefSendResult {
  const hex = (n: number) => crypto.randomBytes(n).toString("hex").toUpperCase();
  return {
    ok: true,
    status: "przyjeta",
    ksefNumber: `${nip}-${ymd()}-${hex(6)}-${hex(1)}`,
    message: "Tryb symulacji — faktura NIE została wysłana do KSeF. Ustaw KSEF_MODE=live i token, aby wysyłać naprawdę.",
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
