import type { CostCategory, VatDeduction } from "./types";

export const COST_CATEGORIES: { value: CostCategory; label: string; emoji: string; defaults?: { vatDeduction: VatDeduction; costShare: number }; hint?: string }[] = [
  { value: "oprogramowanie", label: "Oprogramowanie i subskrypcje", emoji: "💻" },
  { value: "sprzet", label: "Sprzęt i wyposażenie", emoji: "🖥️", hint: "Sprzęt powyżej 10 000 zł netto to środek trwały — wymaga amortyzacji." },
  { value: "telefon_internet", label: "Telefon i internet", emoji: "📱" },
  { value: "biuro", label: "Biuro, coworking, materiały", emoji: "🏢" },
  { value: "uslugi_obce", label: "Usługi obce / podwykonawcy", emoji: "🤝" },
  { value: "towary", label: "Zakup towarów handlowych", emoji: "📦" },
  { value: "samochod", label: "Samochód (serwis, leasing, ubezpieczenie)", emoji: "🚗", defaults: { vatDeduction: "polowa", costShare: 0.75 }, hint: "Auto w użytku mieszanym: 50% VAT i 75% kosztów." },
  { value: "paliwo", label: "Paliwo", emoji: "⛽", defaults: { vatDeduction: "polowa", costShare: 0.75 }, hint: "Paliwo do auta w użytku mieszanym: 50% VAT i 75% kosztów." },
  { value: "podroze", label: "Podróże służbowe", emoji: "✈️" },
  { value: "szkolenia", label: "Szkolenia, książki, konferencje", emoji: "🎓" },
  { value: "ksiegowosc", label: "Księgowość, prawnik, bank", emoji: "📑" },
  { value: "marketing", label: "Marketing i reklama", emoji: "📣" },
  { value: "inne", label: "Inne", emoji: "🧾" },
];

export const categoryLabel = (c: CostCategory) => COST_CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const categoryEmoji = (c: CostCategory) => COST_CATEGORIES.find((x) => x.value === c)?.emoji ?? "🧾";
