import clsx from "clsx";
import { Bot, Eraser, Send, Sparkles, Square, User } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Tip } from "@/components/ui";
import { TAX_FORM_LABELS, ZUS_STAGE_LABELS } from "@/lib/config2026";
import { upcomingDeadlines } from "@/lib/deadlines";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { isOverdue } from "@/lib/invoice";
import { round2 } from "@/lib/money";
import type { ChatMessage } from "@/lib/types";
import { useStore } from "@/store/useStore";

const SUGGESTIONS = [
  { emoji: "🧮", text: "Czy opłaca mi się ryczałt?" },
  { emoji: "📅", text: "Co mam zrobić w tym miesiącu?" },
  { emoji: "🚗", text: "Jak zaksięgować samochód?" },
  { emoji: "🧾", text: "Czy muszę wystawiać faktury w KSeF?" },
  { emoji: "💡", text: "Jak obniżyć podatek legalnie?" },
  { emoji: "🛡️", text: "Ile zapłacę ZUS w przyszłym roku?" },
];

// ───────────── prosty renderer Markdown ─────────────

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![\w*])[*_][^*_\n]+[*_](?![\w*]))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(
        href.startsWith("/") ? (
          <Link key={key} to={href} className="font-medium text-brand-600 underline underline-offset-2">{label}</Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline underline-offset-2">{label}</a>
        ),
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} className="leading-relaxed">{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    const k = blocks.length;
    blocks.push(
      <Tag key={`l${k}`} className={clsx("space-y-1 pl-5", list.ordered ? "list-decimal" : "list-disc")}>
        {list.items.map((it, i) => <li key={i} className="leading-relaxed">{inline(it, `l${k}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^-{3,}$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<hr key={`hr${blocks.length}`} className="border-slate-200" />); continue; }
    if (h) {
      flushPara(); flushList();
      const k = blocks.length;
      blocks.push(<div key={`h${k}`} className={clsx("font-semibold text-slate-900", h[1].length <= 2 ? "mt-1 text-base" : "text-sm")}>{inline(h[2], `h${k}`)}</div>);
      continue;
    }
    if (li) {
      flushPara();
      const ordered = Boolean(li[1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(li[2]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return <div className="space-y-2.5 text-sm text-slate-700">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

// ───────────── strona asystenta ─────────────

export default function Assistant() {
  const chat = useStore((s) => s.chat);
  const setChat = useStore((s) => s.setChat);
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const year = currentYear();
  const summary = useYearSummary(year);
  const [messages, setMessages] = useState<ChatMessage[]>(chat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const autoSent = useRef(false);

  const context = useMemo(() => {
    const monthIdx = new Date().getMonth();
    const ytd = summary[monthIdx];
    const sum = (k: "pit" | "vatDue" | "social" | "health") => round2(summary.slice(0, monthIdx + 1).reduce((s, m) => s + m[k], 0));
    return {
      dzisiaj: new Date().toISOString().slice(0, 10),
      formaOpodatkowania: TAX_FORM_LABELS[company.taxForm],
      stawkaRyczaltu: company.taxForm === "ryczalt" ? `${company.ryczaltRate * 100}%` : undefined,
      statusVat: company.vatStatus === "czynny" ? "czynny podatnik VAT" : "zwolniony z VAT",
      etapZus: ZUS_STAGE_LABELS[company.zusStage],
      dobrowolnaChorobowa: company.chorobowa,
      pkd: company.pkd || "nie podano",
      dataRozpoczeciaDzialalnosci: company.startDate || "nie podano",
      rok: year,
      narastajacoOdPoczatkuRoku: ytd && {
        przychod: ytd.revenueYtd,
        kosztyPodatkowe: ytd.kupYtd,
        podstawaOpodatkowania: ytd.taxBaseYtd,
        podatekNalezny: ytd.taxYtd,
        sumaZaliczekPit: sum("pit"),
        sumaVatDoZaplaty: sum("vatDue"),
        skladkiSpoleczne: sum("social"),
        skladkiZdrowotne: sum("health"),
      },
      miesiace: summary.filter((m) => m.active && m.month <= new Date().toISOString().slice(0, 7)).map((m) => ({
        miesiac: m.month, przychod: m.revenue, koszty: m.kup, vatDoZaplaty: m.vatDue, zaliczkaPit: m.pit, zus: round2(m.social + m.health),
      })),
      liczbaFaktur: invoices.length,
      fakturyPoTerminie: invoices.filter((i) => isOverdue(i)).length,
      nadchodzaceTerminy: upcomingDeadlines(company, new Date(), 5).map((d) => `${d.date}: ${d.title} — ${d.description}`),
    };
  }, [company, invoices, summary, year]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    const update = (text: string) => setMessages([...history, { role: "assistant", content: text }]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Serwer odpowiedział błędem ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const data = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; message?: string };
          if (data.type === "text" && data.text) {
            answer += data.text;
            update(answer);
          } else if (data.type === "error") {
            answer += `${answer ? "\n\n" : ""}⚠️ ${data.message}`;
            update(answer);
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        answer += `${answer ? "\n\n" : ""}⚠️ Nie udało się połączyć z serwerem aplikacji (${(err as Error).message}). Upewnij się, że działa \`npm run dev\`.`;
        update(answer);
      } else if (!answer) answer = "_(zatrzymano)_";
    } finally {
      const finalMessages: ChatMessage[] = [...history, { role: "assistant", content: answer || "_(brak odpowiedzi)_" }];
      setMessages(finalMessages);
      setChat(finalMessages);
      setBusy(false);
      abortRef.current = null;
    }
  }

  useEffect(() => {
    const q = params.get("pytanie");
    if (q && !autoSent.current) {
      autoSent.current = true;
      setParams({}, { replace: true });
      void ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setChat([]);
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-brand-600 p-6 text-white shadow-xl shadow-indigo-500/20">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 right-32 h-32 w-32 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Asystent AI</h1>
              <p className="text-sm text-white/80">Zna Twoje dane, aktualne przepisy i podpowie krok po kroku, co zrobić.</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={clear} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/25">
              <Eraser className="h-4 w-4" /> Wyczyść rozmowę
            </button>
          )}
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-3xl py-6">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-brand-100 text-violet-600">
                  <Bot className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-semibold">W czym mogę pomóc?</h2>
                <p className="text-sm text-slate-500">Wybierz pytanie albo napisz własne.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => ask(s.text)}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-lg transition group-hover:bg-violet-50">{s.emoji}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={clsx("flex gap-3 animate-fadeIn", m.role === "user" && "flex-row-reverse")}>
              <div
                className={clsx(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                  m.role === "user" ? "bg-brand-100 text-brand-700" : "bg-gradient-to-br from-violet-500 to-brand-500 text-white",
                )}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-4 py-3",
                  m.role === "user" ? "rounded-tr-sm bg-brand-600 text-sm text-white" : "rounded-tl-sm border border-slate-100 bg-slate-50",
                )}
              >
                {m.role === "user" ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  <div className="flex gap-1 py-1.5">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-100 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={1}
              placeholder="Zadaj pytanie, np. „Ile podatku zapłacę za ten miesiąc?”"
              className="input max-h-40 min-h-[44px] resize-none"
            />
            {busy ? (
              <Button type="button" variant="secondary" icon={<Square className="h-4 w-4" />} onClick={() => abortRef.current?.abort()}>
                Zatrzymaj
              </Button>
            ) : (
              <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={!input.trim()}>
                Wyślij
              </Button>
            )}
          </form>
          <p className="mt-2 text-xs text-slate-400">
            Asystent AI pomaga zrozumieć przepisy i liczy na Twoich danych, ale nie zastępuje doradcy podatkowego. Ważne decyzje skonsultuj ze specjalistą.
          </p>
        </div>
      </Card>
      {messages.length === 0 && (
        <Tip tone="info" title="Twoje dane są bezpieczne">
          Do asystenta trafia tylko podsumowanie liczb (przychody, koszty, podatki, terminy) — bez NIP-u, numeru konta i danych kontrahentów.
        </Tip>
      )}
    </div>
  );
}
