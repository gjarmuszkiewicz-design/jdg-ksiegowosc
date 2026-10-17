import { Mail, Send } from "lucide-react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Field, Modal, Tip } from "@/components/ui";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { invoiceTotals } from "@/lib/invoice";
import { buildFa3Xml } from "@/lib/ksef";
import { pln } from "@/lib/money";
import type { Invoice } from "@/lib/types";
import { useStore } from "@/store/useStore";

export function SendInvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { company, updateInvoice } = useStore();
  const total = invoiceTotals(invoice).gross;
  const [to, setTo] = useState(invoice.buyer.email);
  const [subject, setSubject] = useState(`Faktura ${invoice.number} — ${company.name}`);
  const [body, setBody] = useState(
    `Dzień dobry,\n\nw załączeniu przesyłam fakturę nr ${invoice.number} na kwotę ${pln(total)} z terminem płatności ${invoice.dueDate}.${invoice.ksef.number ? `\nNumer KSeF: ${invoice.ksef.number}` : ""}\n\nPozdrawiam\n${company.firstName} ${company.lastName}`,
  );
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  const send = async () => {
    setState("sending");
    const html = `<div style="font-family:Arial,sans-serif;white-space:pre-line">${body.replace(/</g, "&lt;")}</div><hr/>` + renderToStaticMarkup(<InvoiceDocument invoice={invoice} company={company} />);
    try {
      const res = await fetch("/api/invoices/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html, xml: buildFa3Xml(company, invoice), filename: `${invoice.number.replace(/\//g, "_")}.xml` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message || "Nie udało się wysłać wiadomości");
      setState("sent");
      if (invoice.status === "wystawiona") updateInvoice(invoice.id, { status: "wyslana" });
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  };

  const mailto = () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + `\n\nPodgląd faktury: ${window.location.origin}/faktury/${invoice.id}/druk`)}`;
    if (invoice.status === "wystawiona") updateInvoice(invoice.id, { status: "wyslana" });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Wyślij fakturę ${invoice.number}`}
      footer={
        <>
          <Button variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={mailto}>Otwórz w programie pocztowym</Button>
          <Button icon={<Send className="h-4 w-4" />} disabled={!to || state === "sending"} onClick={send}>{state === "sending" ? "Wysyłanie…" : "Wyślij"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Do"><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@klienta.pl" /></Field>
        <Field label="Temat"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Treść"><textarea className="input min-h-[150px]" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        {state === "sent" && <Tip tone="success" title="Wysłano!">Faktura trafiła do {to}.</Tip>}
        {state === "error" && <Tip tone="warning" title="Nie udało się wysłać">{msg}. Możesz skorzystać z przycisku „Otwórz w programie pocztowym” albo skonfigurować SMTP na serwerze.</Tip>}
        <p className="text-xs text-slate-500">Do wiadomości dołączamy wizualizację faktury i plik XML w strukturze KSeF FA(3).</p>
      </div>
    </Modal>
  );
}
