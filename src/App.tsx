import { Navigate, Route, Routes } from "react-router-dom";
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

export default function App() {
  const onboarded = useStore((s) => s.company.onboarded);
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
