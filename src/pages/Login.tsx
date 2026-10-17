import { Building2, Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field, Tip } from "@/components/ui";
import { login, register, useSession } from "@/store/session";

export default function Login() {
  const { registrationOpen, error: sessionError } = useSession();
  const [mode, setMode] = useState<"login" | "register">(registrationOpen ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register" && registrationOpen;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isRegister && password !== password2) return setError("Hasła nie są takie same.");
    setBusy(true);
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-indigo-700 to-violet-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur"><Building2 className="h-5 w-5" /></div>
          <span className="text-lg font-bold">Księgowość JDG</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white">Twoja firma pod kontrolą — bez stresu i bez księgowego żargonu.</h1>
          <ul className="mt-8 space-y-4 text-white/85">
            {[
              ["🧾", "Faktury, KSeF i koszty w jednym miejscu"],
              ["📊", "VAT, PIT, ZUS i amortyzacja liczone automatycznie"],
              ["🔮", "Symulacja przyszłego miesiąca i podpowiedzi, co zrobić"],
              ["🤖", "Asystent AI do pytań podatkowych"],
            ].map(([e, t]) => (
              <li key={t} className="flex items-center gap-3"><span className="text-xl">{e}</span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Dane są szyfrowane w transmisji i zapisywane na Twoim koncie.</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white"><Building2 className="h-5 w-5" /></div>
            <span className="text-lg font-bold">Księgowość JDG</span>
          </div>
          <h2 className="text-2xl font-bold">{isRegister ? "Załóż konto" : "Zaloguj się"}</h2>
          <p className="mt-1 text-slate-500">{isRegister ? "To zajmie chwilę. Pierwsze konto staje się kontem właściciela." : "Witaj z powrotem! Wpisz e-mail i hasło."}</p>

          <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            {isRegister && (
              <Field label="Imię i nazwisko">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
              </div>
            </Field>
            <Field label="Hasło" hint={isRegister ? "Co najmniej 8 znaków." : undefined}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input px-9" type={show ? "text" : "password"} required minLength={isRegister ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? "Ukryj hasło" : "Pokaż hasło"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {isRegister && (
              <Field label="Powtórz hasło">
                <input className="input" type={show ? "text" : "password"} required value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
              </Field>
            )}
            {(error || sessionError) && <Tip tone="warning">{error || sessionError}</Tip>}
            <Button type="submit" size="lg" className="w-full" disabled={busy} icon={isRegister ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}>
              {busy ? "Chwileczkę…" : isRegister ? "Załóż konto" : "Zaloguj się"}
            </Button>
          </form>

          {registrationOpen && (
            <p className="mt-5 text-center text-sm text-slate-500">
              {isRegister ? "Masz już konto? " : "Nie masz konta? "}
              <button className="font-semibold text-brand-600 hover:underline" onClick={() => { setMode(isRegister ? "login" : "register"); setError(null); }}>
                {isRegister ? "Zaloguj się" : "Załóż konto"}
              </button>
            </p>
          )}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Bezpieczne logowanie</span>
            <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Asystent AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
