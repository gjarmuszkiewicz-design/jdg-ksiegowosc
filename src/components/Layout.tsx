import clsx from "clsx";
import {
  BarChart3, BookOpen, Calculator, Car, CheckCircle2, CloudOff, GraduationCap, Loader2, LogOut, Upload, BookText, Building2, CloudUpload, FilePlus2, FileText, Landmark, LayoutDashboard,
  Menu, Percent, PiggyBank, Receipt, Settings, ShieldCheck, Sparkles, Users, Wallet, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout, useSession } from "@/store/session";
import { useStore } from "@/store/useStore";
import { Button } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Start",
    items: [
      { to: "/", label: "Pulpit", icon: <LayoutDashboard />, end: true },
      { to: "/podatki", label: "Mój miesiąc: podatki", icon: <Calculator /> },
    ],
  },
  {
    section: "Sprzedaż",
    items: [
      { to: "/faktury", label: "Faktury", icon: <FileText />, end: true },
      { to: "/faktury/nowa", label: "Wystaw fakturę", icon: <FilePlus2 /> },
      { to: "/kontrahenci", label: "Kontrahenci", icon: <Users /> },
      { to: "/ksef", label: "KSeF", icon: <CloudUpload /> },
    ],
  },
  {
    section: "Wydatki",
    items: [
      { to: "/koszty", label: "Koszty i zakupy", icon: <Receipt />, end: true },
      { to: "/koszty/nowy", label: "Dodaj koszt", icon: <Wallet /> },
      { to: "/srodki-trwale", label: "Środki trwałe", icon: <Car /> },
      { to: "/koszty/poradnik", label: "Poradnik kosztów", icon: <GraduationCap /> },
    ],
  },
  {
    section: "Rozliczenia",
    items: [
      { to: "/vat", label: "VAT i JPK", icon: <Percent /> },
      { to: "/pit", label: "Podatek dochodowy", icon: <Landmark /> },
      { to: "/zus", label: "ZUS", icon: <ShieldCheck /> },
      { to: "/ksiega", label: "Księga / ewidencja", icon: <BookText /> },
    ],
  },
  {
    section: "Analizy",
    items: [
      { to: "/raporty", label: "Raporty", icon: <BarChart3 /> },
      { to: "/optymalizacja", label: "Optymalizacja", icon: <PiggyBank /> },
    ],
  },
  {
    section: "Pomoc",
    items: [
      { to: "/asystent", label: "Asystent AI", icon: <Sparkles /> },
      { to: "/wiedza", label: "Baza wiedzy", icon: <BookOpen /> },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const company = useStore((s) => s.company);
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-violet-500 text-white shadow-lg shadow-brand-500/30">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white">Księgowość JDG</div>
          <div className="truncate text-xs text-slate-400">{company.name || "Twoja firma"}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium transition [&>svg]:h-[18px] [&>svg]:w-[18px]",
                      isActive ? "bg-white/10 text-white shadow-inner" : "hover:bg-white/5 hover:text-white",
                      item.to === "/asystent" && !isActive && "text-violet-300",
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-white/10 p-3">
        <NavLink
          to="/import"
          onClick={onNavigate}
          className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white")}
        >
          <Upload className="h-[18px] w-[18px]" /> Import danych
        </NavLink>
        <NavLink
          to="/ustawienia"
          onClick={onNavigate}
          className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white")}
        >
          <Settings className="h-[18px] w-[18px]" /> Ustawienia firmy
        </NavLink>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  const firstName = useStore((s) => s.company.firstName);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Dzień dobry" : hour < 18 ? "Cześć" : "Dobry wieczór";

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button className="absolute right-3 top-5 text-slate-400" onClick={() => setOpen(false)} aria-label="Zamknij menu">
              <X />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm text-slate-500 sm:block">
            {greet}
            {firstName ? `, ${firstName}` : ""} 👋 &nbsp;·&nbsp; {new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SaveIndicator />
            <Button variant="secondary" size="sm" icon={<Wallet className="h-4 w-4" />} onClick={() => navigate("/koszty/nowy")}>
              Koszt
            </Button>
            <Button size="sm" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate("/faktury/nowa")}>
              Faktura
            </Button>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      {loc.pathname !== "/asystent" && (
        <button
          onClick={() => navigate("/asystent")}
          className="no-print fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-brand-600 px-5 py-3.5 font-semibold text-white shadow-xl shadow-violet-500/30 transition hover:scale-105"
        >
          <Sparkles className="h-5 w-5" /> Zapytaj AI
        </button>
      )}
    </div>
  );
}

function SaveIndicator() {
  const save = useSession((s) => s.save);
  if (save === "saving") return <span className="hidden items-center gap-1.5 text-xs text-slate-400 md:flex"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Zapisywanie…</span>;
  if (save === "saved") return <span className="hidden items-center gap-1.5 text-xs text-emerald-600 md:flex"><CheckCircle2 className="h-3.5 w-3.5" /> Zapisano</span>;
  if (save === "error") return <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600"><CloudOff className="h-3.5 w-3.5" /> Błąd zapisu</span>;
  return null;
}

function UserMenu() {
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white shadow" aria-label="Konto użytkownika">
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-fadeIn">
            <div className="px-3 py-2">
              <div className="truncate font-semibold">{user.name || "Moje konto"}</div>
              <div className="truncate text-sm text-slate-500">{user.email}</div>
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setOpen(false); navigate("/ustawienia"); }}>
              <Settings className="h-4 w-4 text-slate-400" /> Ustawienia i hasło
            </button>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50" onClick={() => { setOpen(false); void logout().then(() => navigate("/")); }}>
              <LogOut className="h-4 w-4" /> Wyloguj
            </button>
          </div>
        </>
      )}
    </div>
  );
}
