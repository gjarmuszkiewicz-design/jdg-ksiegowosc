import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { Button } from "@/components/ui";
import { useStore } from "@/store/useStore";

export default function InvoicePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, company } = useStore();
  const inv = invoices.find((i) => i.id === id);

  useEffect(() => {
    if (inv) document.title = `Faktura ${inv.number}`;
  }, [inv]);

  if (!inv) return <div className="p-10 text-center">Nie znaleziono faktury.</div>;
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[794px] justify-between px-4">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(`/faktury/${inv.id}`)}>Wróć</Button>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Drukuj / zapisz jako PDF</Button>
      </div>
      <div className="mx-auto max-w-[794px] shadow-xl print:shadow-none">
        <InvoiceDocument invoice={inv} company={company} />
      </div>
    </div>
  );
}
