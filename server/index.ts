import "dotenv/config";
import express, { type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import nodemailer from "nodemailer";
import { searchArticles } from "../src/lib/knowledge";
import { KsefClient, simulatePurchases, simulateSend, type KsefEnv } from "./ksef";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const KSEF_MODE = process.env.KSEF_MODE === "live" ? "live" : "symulacja";
const KSEF_ENV = (["test", "demo", "prod"].includes(process.env.KSEF_ENV || "") ? process.env.KSEF_ENV : "test") as KsefEnv;

const hasAi = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const hasSmtp = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: hasAi(), smtp: hasSmtp(), ksefMode: KSEF_MODE, ksefEnv: KSEF_ENV, model: MODEL });
});

// ───────────────────────── Asystent AI ─────────────────────────

const SYSTEM_PROMPT = `Jesteś doświadczonym księgowym i doradcą podatkowym, który pomaga właścicielowi jednoosobowej działalności gospodarczej (JDG) w Polsce, bez pracowników — najczęściej freelancerowi. Działasz wewnątrz aplikacji księgowej „Księgowość JDG”.

Zakres: faktury, koszty, KPiR i ewidencja przychodów, formy opodatkowania (skala 12%/32% z kwotą wolną 30 000 zł i progiem 120 000 zł, podatek liniowy 19%, ryczałt od przychodów ewidencjonowanych), VAT (zwolnienie podmiotowe — limit 240 000 zł od 2026 r., JPK_V7M do 25. dnia miesiąca), KSeF (e-faktury w strukturze FA(3), obowiązek dla większości podatników od 1 kwietnia 2026 r., najwięksi od 1 lutego 2026 r.; najmniejsi ze sprzedażą do 10 000 zł miesięcznie mogą do końca 2026 r. wystawiać poza KSeF), ZUS przedsiębiorcy (ulga na start, preferencyjny ZUS, Mały ZUS Plus, pełny ZUS) i składka zdrowotna.

Parametry 2026 r. (zweryfikowane w aplikacji, ale przy wątpliwościach sprawdź aktualne źródła):
- minimalne wynagrodzenie 4806 zł; prognozowane przeciętne wynagrodzenie 9420 zł;
- pełny ZUS: podstawa 5652 zł, społeczne z chorobową i FP 1926,76 zł; preferencyjny: podstawa 1441,80 zł, ok. 456,18 zł z chorobową;
- zdrowotna skala: 9% dochodu, liniowy: 4,9% dochodu (odliczenie do limitu 14 100 zł rocznie), minimum 432,54 zł (styczeń 314,96 zł);
- zdrowotna ryczałt: 498,35 zł (przychód do 60 tys. zł), 830,58 zł (do 300 tys. zł), 1495,04 zł (powyżej); 50% zapłaconej składki odlicza się od przychodu;
- terminy: ZUS i zaliczka PIT/ryczałt do 20. dnia, JPK_V7M i VAT do 25. dnia następnego miesiąca, zeznanie roczne do 30 kwietnia, zmiana formy opodatkowania do 20 lutego, Mały ZUS Plus do 31 stycznia.

Jak odpowiadasz:
- Zawsze po polsku, prostym językiem, bez żargonu (a jeśli używasz terminu — wyjaśnij go jednym zdaniem).
- Prowadzisz za rękę: podawaj konkretne kroki do wykonania (lista numerowana), co kliknąć w aplikacji, jakie terminy obowiązują.
- Gdy masz dane firmy użytkownika (przekazane w bloku <kontekst_firmy>), licz na nich i podawaj konkretne kwoty. Pokaż, z czego wynika wynik.
- Proponuj legalne sposoby optymalizacji (forma opodatkowania, koszty, IP Box, ulgi, Mały ZUS Plus, wspólne rozliczenie), ale zawsze z ryzykami i warunkami.
- Gdy pytanie dotyczy aktualnego stanu prawnego, zmian przepisów lub kwot, których nie jesteś pewien — użyj wyszukiwarki internetowej i podaj źródła (preferuj gov.pl, podatki.gov.pl, zus.pl, ksef.podatki.gov.pl, isap.sejm.gov.pl). Nie wymyślaj przepisów ani kwot.
- Gdy sprawa jest nietypowa, sporna lub dotyczy dużych kwot — wyraźnie zasugeruj konsultację z doradcą podatkowym albo wniosek o interpretację indywidualną.
- Odpowiadaj zwięźle: najpierw krótka odpowiedź, potem szczegóły. Używaj nagłówków i list w Markdown.`;

let anthropic: Anthropic | null = null;
const getClient = () => (anthropic ??= new Anthropic());

function sse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  return (payload: Record<string, unknown>) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

interface ChatBody {
  messages?: { role: "user" | "assistant"; content: string }[];
  context?: unknown;
}

function offlineAnswer(question: string) {
  const found = searchArticles(question).slice(0, 2);
  const parts = [
    "**Tryb offline** — asystent AI nie jest skonfigurowany, więc odpowiadam na podstawie wbudowanej bazy wiedzy.\n",
  ];
  if (found.length) {
    for (const a of found) parts.push(`## ${a.title}\n\n${a.body.map((p) => `- ${p}`).join("\n")}\n\n[Otwórz artykuł](/wiedza/${a.id})\n`);
  } else {
    parts.push("Nie znalazłem w bazie wiedzy artykułu pasującego do pytania. Zajrzyj do zakładki [Baza wiedzy](/wiedza).\n");
  }
  parts.push("---\nAby włączyć pełnego asystenta AI, dodaj `ANTHROPIC_API_KEY=...` do pliku `.env` w katalogu aplikacji i uruchom serwer ponownie.");
  return parts.join("\n");
}

app.post("/api/ai/chat", async (req, res) => {
  const body = req.body as ChatBody;
  const history = (body.messages ?? []).filter((m) => m && typeof m.content === "string" && m.content.trim());
  const send = sse(res);

  if (!history.length || history[history.length - 1].role !== "user") {
    send({ type: "error", message: "Brak pytania." });
    return res.end();
  }

  if (!hasAi()) {
    const text = offlineAnswer(history[history.length - 1].content);
    for (const chunk of text.match(/[\s\S]{1,80}/g) ?? []) send({ type: "text", text: chunk });
    send({ type: "done", offline: true });
    return res.end();
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  // Kontekst firmy dołączamy do pierwszej wiadomości użytkownika — system prompt pozostaje stały (cache)
  const contextBlock: BetaContentBlockParam = {
    type: "text",
    text: `<kontekst_firmy>\n${JSON.stringify(body.context ?? {}, null, 2)}\n</kontekst_firmy>`,
  };
  const messages: BetaMessageParam[] = history.map((m, i) =>
    i === 0 && m.role === "user"
      ? { role: "user", content: [contextBlock, { type: "text", text: m.content }] }
      : { role: m.role, content: m.content },
  );

  try {
    for (let round = 0; round < 5; round++) {
      const stream = getClient().beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
          messages,
        },
        { signal: controller.signal },
      );
      stream.on("text", (text) => send({ type: "text", text }));
      const final = await stream.finalMessage();

      if (final.stop_reason === "pause_turn" && round < 4) {
        messages.push({ role: "assistant", content: final.content as BetaContentBlockParam[] });
        continue;
      }
      if (final.stop_reason === "refusal") {
        send({ type: "text", text: "\n\n_Nie mogę odpowiedzieć na to pytanie. Spróbuj sformułować je inaczej lub skonsultuj się z doradcą podatkowym._" });
      } else if (final.stop_reason === "max_tokens") {
        send({ type: "text", text: "\n\n_(Odpowiedź została skrócona — zadaj bardziej szczegółowe pytanie.)_" });
      }
      break;
    }
    send({ type: "done" });
  } catch (err) {
    if (controller.signal.aborted) return res.end();
    let message = "Nie udało się połączyć z asystentem AI.";
    if (err instanceof Anthropic.AuthenticationError) message = "Nieprawidłowy klucz API Anthropic — sprawdź ANTHROPIC_API_KEY w pliku .env.";
    else if (err instanceof Anthropic.RateLimitError) message = "Przekroczono limit zapytań do AI. Spróbuj ponownie za chwilę.";
    else if (err instanceof Anthropic.APIConnectionError) message = "Brak połączenia z API Anthropic.";
    else if (err instanceof Anthropic.APIError) message = `Błąd API (${err.status ?? "?"}): ${err.message}`;
    console.error("[ai]", err);
    send({ type: "error", message });
  }
  res.end();
});

// ───────────────────────── E-mail z fakturą ─────────────────────────

app.post("/api/invoices/email", async (req, res) => {
  const { to, subject, html, xml, filename } = req.body as { to?: string; subject?: string; html?: string; xml?: string; filename?: string };
  if (!hasSmtp()) return res.status(501).json({ ok: false, message: "Brak konfiguracji SMTP" });
  if (!to || !subject || !html) return res.status(400).json({ ok: false, message: "Brak adresata, tematu lub treści." });
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
      attachments: xml ? [{ filename: filename || "faktura.xml", content: xml, contentType: "application/xml" }] : [],
    });
    res.json({ ok: true, message: `Wysłano do ${to}` });
  } catch (err) {
    console.error("[email]", err);
    res.status(502).json({ ok: false, message: `Nie udało się wysłać e-maila: ${(err as Error).message}` });
  }
});

// ───────────────────────── Biała lista MF (dane po NIP) ─────────────────────────

app.get("/api/nip/:nip", async (req, res) => {
  const nip = req.params.nip.replace(/\D/g, "");
  if (nip.length !== 10) return res.status(400).json({ ok: false, message: "NIP musi mieć 10 cyfr." });
  try {
    const date = new Date().toISOString().slice(0, 10);
    const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`);
    const data = (await r.json()) as {
      result?: { subject?: { name: string; workingAddress?: string | null; residenceAddress?: string | null; accountNumbers?: string[] } | null };
      message?: string;
    };
    const subject = data.result?.subject;
    if (!r.ok || !subject) return res.status(404).json({ ok: false, message: data.message || "Nie znaleziono podmiotu w wykazie VAT." });
    const addr = subject.workingAddress || subject.residenceAddress || "";
    const m = addr.match(/^(.*),\s*(\d{2}-\d{3})\s+(.+)$/);
    res.json({
      ok: true,
      name: subject.name,
      street: m ? m[1] : addr,
      postalCode: m ? m[2] : "",
      city: m ? m[3] : "",
      bankAccounts: subject.accountNumbers ?? [],
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Biała lista MF niedostępna: ${(err as Error).message}` });
  }
});

// ───────────────────────── KSeF ─────────────────────────

app.post("/api/ksef/send", async (req, res) => {
  const { xml, nip, token } = req.body as { xml?: string; invoiceNumber?: string; nip?: string; token?: string };
  const cleanNip = (nip || "").replace(/\D/g, "");
  if (!xml || !xml.includes("<Faktura")) return res.status(400).json({ ok: false, status: "odrzucona", message: "Nieprawidłowy XML faktury (brak elementu Faktura)." });
  if (cleanNip.length !== 10) return res.status(400).json({ ok: false, status: "odrzucona", message: "Brak poprawnego NIP sprzedawcy." });

  const ksefToken = token || process.env.KSEF_TOKEN || "";
  if (KSEF_MODE !== "live" || !ksefToken) return res.json(simulateSend(cleanNip));

  try {
    const client = new KsefClient(KSEF_ENV, cleanNip, ksefToken);
    res.json(await client.sendInvoice(xml));
  } catch (err) {
    console.error("[ksef]", err);
    res.status(502).json({ ok: false, status: "odrzucona", message: (err as Error).message });
  }
});

app.get("/api/ksef/purchases", (req, res) => {
  const nip = String(req.query.nip || "").replace(/\D/g, "");
  // Pobieranie faktur zakupowych (POST /invoices/query/metadata) — w trybie live do zaimplementowania po weryfikacji API
  res.json({ mode: KSEF_MODE, items: simulatePurchases(nip) });
});

// ───────────────────────── Frontend (produkcja) ─────────────────────────

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`API Księgowość JDG: http://localhost:${PORT}  (AI: ${hasAi() ? MODEL : "offline"}, KSeF: ${KSEF_MODE}/${KSEF_ENV})`);
});
