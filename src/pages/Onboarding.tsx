import clsx from "clsx";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Landmark, PlayCircle, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { BankFields, IdentityFields, TaxFields, ZusFields } from "@/components/CompanyFields";
import { Button, Card, Tip } from "@/components/ui";
import { isValidNip } from "@/lib/validation";
import type { Company } from "@/lib/types";
import { useStore } from "@/store/useStore";

const STEPS = [
  { title: "Witaj", icon: Sparkles },
  { title: "Dane firmy", icon: Building2 },
  { title: "Podatki", icon: Landmark },
  { title: "ZUS", icon: ShieldCheck },
  { title: "Konto i faktury", icon: Wallet },
];

export default function Onboarding() {
  const { company, setCompany, loadDemo } = useStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Company>(company);
  const patch = (p: Partial<Company>) => setDraft((d) => ({ ...d, ...p }));

  const canNext = step !== 1 || (draft.firstName && draft.lastName && isValidNip(draft.nip) && draft.name);
  const finish = () => setCompany({ ...draft, onboarded: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/40 to-violet-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="text-lg font-bold">Księgowość JDG</div>
            <div className="text-sm text-slate-500">Prosta księgowość dla jednoosobowej działalności</div>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div className={clsx("flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition", i === step ? "bg-brand-600 text-white shadow-md" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-400")}>
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                {s.title}
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-6 bg-slate-300" />}
            </div>
          ))}
        </div>

        <Card className="p-6 lg:p-8">
          {step === 0 && (
            <div className="text-center">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-xl shadow-brand-500/30"><Sparkles className="h-8 w-8" /></div>
              <h1 className="text-3xl font-bold">Ogarnijmy razem Twoją firmę 👋</h1>
              <p className="mx-auto mt-3 max-w-xl text-slate-600">Faktury, koszty, VAT, JPK, KSeF, podatek i ZUS w jednym miejscu. Zadamy Ci kilka pytań, a potem będziemy podpowiadać, co i kiedy zrobić.</p>
              <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                {[
                  ["🧾", "Faktury w minutę", "Z wysyłką e-mail i do KSeF"],
                  ["📊", "Podatki na bieżąco", "VAT, PIT i ZUS wyliczone automatycznie"],
                  ["🤖", "Asystent AI", "Odpowie na pytania i podpowie optymalizację"],
                ].map(([e, t, d]) => (
                  <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-2xl">{e}</div><div className="mt-2 font-semibold">{t}</div><div className="text-sm text-slate-500">{d}</div></div>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => setStep(1)}>Zaczynamy <ArrowRight className="h-5 w-5" /></Button>
                <Button size="lg" variant="secondary" icon={<PlayCircle className="h-5 w-5" />} onClick={loadDemo}>Wypróbuj na danych przykładowych</Button>
              </div>
            </div>
          )}
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-xl font-bold">Dane firmy</h2>
              <p className="mb-6 text-slate-500">Wpisz NIP i kliknij lupę — pobierzemy nazwę i adres z Białej Listy MF.</p>
              <IdentityFields value={draft} onChange={patch} />
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="mb-1 text-xl font-bold">Jak się rozliczasz?</h2>
              <p className="mb-6 text-slate-500">To ustawienie zmienisz w każdej chwili w Ustawieniach.</p>
              <TaxFields value={draft} onChange={patch} />
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 className="mb-1 text-xl font-bold">Składki ZUS</h2>
              <p className="mb-6 text-slate-500">Na jakim etapie jesteś? Od tego zależy wysokość składek.</p>
              <ZusFields value={draft} onChange={patch} />
            </div>
          )}
          {step === 4 && (
            <div>
              <h2 className="mb-1 text-xl font-bold">Konto i faktury</h2>
              <p className="mb-6 text-slate-500">Te dane pojawią się na każdej fakturze.</p>
              <BankFields value={draft} onChange={patch} />
              <div className="mt-6"><Tip tone="success" title="Prawie gotowe!">Po zakończeniu zobaczysz pulpit z listą pierwszych kroków. Token KSeF dodasz później w Ustawieniach.</Tip></div>
            </div>
          )}

          {step > 0 && (
            <div className="mt-8 flex justify-between border-t border-slate-100 pt-6">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(step - 1)}>Wstecz</Button>
              {step < STEPS.length - 1 ? (
                <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Dalej <ArrowRight className="h-4 w-4" /></Button>
              ) : (
                <Button variant="success" onClick={finish} icon={<CheckCircle2 className="h-4 w-4" />}>Zakończ i przejdź do pulpitu</Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
