# Księgowość JDG

Prosta aplikacja księgowa dla jednoosobowej działalności gospodarczej bez pracowników (freelancer, B2B).
Prowadzi użytkownika za rękę: podpowiada kolejne kroki, pilnuje terminów, liczy podatki i ZUS, a asystent AI (Claude) odpowiada na pytania z uwzględnieniem aktualnych przepisów.

## Funkcje

| Obszar | Co jest |
|---|---|
| Start | kreator konfiguracji firmy, dane przykładowe, pulpit z listą „Co teraz zrobić?”, terminy, podpowiedzi |
| Sprzedaż | faktury (VAT i zwolnione), numeracja, druk / PDF, wysyłka e-mail (SMTP lub program pocztowy), duplikowanie, statusy płatności, kontrahenci z pobieraniem danych z Białej Listy MF |
| KSeF | generowanie e-faktur FA(3), wysyłka (tryb symulacji / live), pobieranie faktur zakupowych i księgowanie ich jako koszty |
| Wydatki | koszty z kategoriami, automatyczne 50% VAT / 75% KUP dla samochodu, podgląd wpływu kosztu na podatek |
| Rozliczenia | VAT miesięczny + plik **JPK_V7M**, zaliczki PIT (skala / liniowy / ryczałt), ZUS (ulga na start, preferencyjny, Mały ZUS Plus, pełny) ze składką zdrowotną 2026, KPiR / ewidencja przychodów |
| Analizy | raporty i wykresy, porównanie form opodatkowania, pomysły na legalną optymalizację |
| Pomoc | asystent AI (Claude, z wyszukiwaniem w sieci), baza wiedzy |

Parametry na 2026 r. (ZUS, zdrowotna, progi, limit VAT 240 tys. zł) są w jednym pliku: `src/lib/config2026.ts`.

## Uruchomienie

```bash
cd jdg-app
npm install
cp .env.example .env   # opcjonalnie: ANTHROPIC_API_KEY, SMTP_*, KSEF_MODE
npm run dev            # front: http://localhost:5173, API: http://localhost:8787
```

Produkcja: `npm run build && npm start` (serwer Express serwuje zbudowany front z `dist/`).

Testy obliczeń: `npm test`. Kontrola typów: `npm run typecheck`.

## Architektura

- `src/` — React 18 + TypeScript + Tailwind, wykresy Recharts, stan w Zustand (zapisywany w przeglądarce).
- `src/lib/` — logika domenowa: `tax.ts` (VAT, PIT, ZUS, zestawienia), `jpk.ts` (JPK_V7M), `ksef.ts` (FA(3)), `guide.ts` (kroki i podpowiedzi), `deadlines.ts` (terminy).
- `server/` — Express: asystent AI (`/api/ai/chat`, strumieniowanie SSE), e-mail, Biała Lista MF, KSeF (`server/ksef.ts`).

## Ograniczenia obecnej wersji

- Dane są przechowywane lokalnie w przeglądarce (z kopią zapasową JSON) — docelowo baza danych i konta użytkowników.
- KSeF działa domyślnie w **trybie symulacji**. Klient API KSeF 2.0 (`server/ksef.ts`) trzeba zweryfikować na środowisku testowym MF (miejsca oznaczone `WERYFIKUJ`) przed włączeniem `KSEF_MODE=live`.
- Plik JPK_V7M jest generowany do pobrania; podpis i wysyłkę robi się np. w e-mikrofirmie lub Kliencie JPK. Przed wysyłką warto sprawdzić plik walidatorem MF.
- Obliczenia są uproszczone (m.in. brak amortyzacji środków trwałych, korekt faktur, świąt w terminach) — mają charakter pomocniczy.
