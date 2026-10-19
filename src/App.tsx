import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { initSession, useSession } from "./store/session";
import Login from "./pages/Login";
import Import from "./pages/Import";
import Layout from "./components/Layout";
import { useStore } from "./store/useStore";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import InvoiceForm from "./pages/InvoiceForm";
import InvoicePrint from "./pages/InvoicePrint";
import Contractors from "./pages/Contractors";
import Costs from "./pages/Costs";
import CostForm from "./pages/CostForm";
import Vat from "./pages/Vat";
import Pit from "./pages/Pit";
import Zus from "./pages/Zus";
import Ledger from "./pages/Ledger";
import Reports from "./pages/Reports";
import Optimization from "./pages/Optimization";
import Assistant from "./pages/Assistant";
import Knowledge from "./pages/Knowledge";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import Ksef from "./pages/Ksef";
import TaxCenter from "./pages/TaxCenter";
import Payments from "./pages/Payments";
import Assets from "./pages/Assets";
import AssetForm from "./pages/AssetForm";
import CostGuide from "./pages/CostGuide";

function Splash({ text }: { text: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="flex items-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-brand-500" /> {text}</div>
    </div>
  );
}

export default function App() {
  const onboarded = useStore((s) => s.company.onboarded);
  const status = useSession((s) => s.status);
  useEffect(() => {
    void initSession();
  }, []);
  if (status === "loading") return <Splash text="Ładowanie…" />;
  if (status === "anon") return <Login />;
  if (status === "syncing") return <Splash text="Wczytywanie Twoich danych…" />;
  if (!onboarded)
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  return (
    <Routes>
      <Route path="/faktury/:id/druk" element={<InvoicePrint />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="faktury" element={<Invoices />} />
        <Route path="faktury/nowa" element={<InvoiceForm />} />
        <Route path="faktury/:id" element={<InvoiceForm />} />
        <Route path="kontrahenci" element={<Contractors />} />
        <Route path="ksef" element={<Ksef />} />
        <Route path="koszty" element={<Costs />} />
        <Route path="koszty/nowy" element={<CostForm />} />
        <Route path="koszty/poradnik" element={<CostGuide />} />
        <Route path="podatki" element={<TaxCenter />} />
        <Route path="platnosci" element={<Payments />} />
        <Route path="srodki-trwale" element={<Assets />} />
        <Route path="srodki-trwale/nowy" element={<AssetForm />} />
        <Route path="srodki-trwale/:id" element={<AssetForm />} />
        <Route path="koszty/:id" element={<CostForm />} />
        <Route path="vat" element={<Vat />} />
        <Route path="pit" element={<Pit />} />
        <Route path="zus" element={<Zus />} />
        <Route path="ksiega" element={<Ledger />} />
        <Route path="raporty" element={<Reports />} />
        <Route path="optymalizacja" element={<Optimization />} />
        <Route path="asystent" element={<Assistant />} />
        <Route path="wiedza" element={<Knowledge />} />
        <Route path="wiedza/:id" element={<Knowledge />} />
        <Route path="ustawienia" element={<Settings />} />
        <Route path="import" element={<Import />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
