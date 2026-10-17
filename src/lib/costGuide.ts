import { monthKey } from "./tax";
import type { Company, Cost, CostCategory } from "./types";

export interface GuidePoint {
  title: string;
  text: string;
}

export interface GuideChapter {
  id: string;
  emoji: string;
  title: string;
  lead: string;
  points: GuidePoint[];
}

/** Poradnik kosztów dla JDG / freelancera (stan prawny 2026 r.) */
export const COST_GUIDE: GuideChapter[] = [
  {
    id: "zasady",
    emoji: "📐",
    title: "Zasady: co jest kosztem firmy",
    lead: "Kosztem uzyskania przychodu jest wydatek poniesiony w celu osiągnięcia przychodu albo zachowania lub zabezpieczenia jego źródła (art. 22 ust. 1 ustawy o PIT) — chyba że ustawa go wyklucza (art. 23).",
    points: [
      { title: "Związek z przychodem", text: "Musisz umieć wyjaśnić, dlaczego wydatek służy firmie. Nie musi bezpośrednio przynieść przychodu — wystarczy, że racjonalnie może się do niego przyczynić (np. szkolenie, reklama)." },
      { title: "Wydatek definitywny", text: "Kosztem jest tylko wydatek poniesiony ostatecznie z Twoich pieniędzy — zwrócona kaucja czy zaliczka nie są kosztem." },
      { title: "Dokumentowanie", text: "Każdy koszt potwierdź dowodem: fakturą (od 2026 r. zwykle z KSeF), rachunkiem, fakturą uproszczoną albo dowodem wewnętrznym." },
      { title: "Kiedy księgować (metoda kasowa vs memoriałowa)", text: "W KPiR koszty ujmuje się zwykle w dacie wystawienia faktury (metoda kasowa uproszczona). Przy metodzie memoriałowej koszty pośrednie rozlicza się w dacie poniesienia, a bezpośrednie — w roku, w którym osiągnięto związany z nimi przychód." },
      { title: "Koszty bezpośrednie i pośrednie", text: "Bezpośrednie wiążą się z konkretnym przychodem (np. podwykonawca do projektu). Pośrednie służą całej firmie (telefon, księgowość, oprogramowanie) — u freelancera to większość kosztów." },
      { title: "Środki trwałe", text: "Rzeczy używane dłużej niż rok o wartości powyżej 10 000 zł netto wprowadzasz do ewidencji i amortyzujesz. Tańsze możesz wrzucić w koszty od razu." },
    ],
  },
  {
    id: "zapominane",
    emoji: "🧠",
    title: "Koszty, o których freelancerzy zapominają",
    lead: "Najczęściej tracisz pieniądze nie przez brak kosztów, ale przez to, że ich nie księgujesz. Przejrzyj listę i sprawdź, czy masz te faktury.",
    points: [
      { title: "Telefon i abonament komórkowy", text: "Abonament używany do pracy — w całości lub w udokumentowanej części." },
      { title: "Internet", text: "Łącze domowe wykorzystywane do pracy (przy użytku mieszanym — rozsądna proporcja)." },
      { title: "Media przy pracy w domu", text: "Prąd, ogrzewanie, woda — proporcjonalnie do powierzchni wydzielonej na biuro (np. 12 m² z 60 m² = 20%)." },
      { title: "Czynsz za wynajmowane mieszkanie", text: "Część czynszu najmu odpowiadająca powierzchni biura — warto wpisać adres jako miejsce prowadzenia działalności." },
      { title: "Sprzęt komputerowy i akcesoria", text: "Laptop, monitor, klawiatura, słuchawki, dysk, router, drukarka — do 10 000 zł netto od razu w koszty." },
      { title: "Oprogramowanie i SaaS", text: "IDE, pakiety biurowe, Figma, Adobe, narzędzia AI, chmura, menedżer haseł, VPN." },
      { title: "Domena, hosting, poczta", text: "Strona firmowa, portfolio, skrzynka w domenie." },
      { title: "Szkolenia, kursy, książki, konferencje", text: "Związane z branżą — także bilety, nocleg i dojazd na konferencję." },
      { title: "Coworking i wynajem sal", text: "Biurko w coworkingu, sala na spotkanie z klientem." },
      { title: "Podróże służbowe i diety", text: "Bilety, noclegi, przejazdy; przedsiębiorca może rozliczyć dietę do wysokości przysługującej pracownikom (bez diety w miejscowości prowadzenia firmy)." },
      { title: "Prowizje bankowe i płatnicze", text: "Opłaty za konto firmowe, przelewy, terminal, PayPal, Stripe, przewalutowania." },
      { title: "Księgowość i doradztwo", text: "Biuro rachunkowe, doradca podatkowy, prawnik, aplikacje księgowe." },
      { title: "Ubezpieczenia firmowe", text: "OC zawodowe, ubezpieczenie sprzętu, OC/AC auta firmowego (auto mieszane — 75%)." },
      { title: "Odzież specjalistyczna", text: "Tylko odzież robocza, ochronna lub z logo firmy — nie codzienne ubrania." },
      { title: "Marketing i reklama", text: "Kampanie online, LinkedIn Premium, wizytówki, materiały promocyjne, gadżety z logo." },
      { title: "Paliwo i eksploatacja auta", text: "Auto w użytku mieszanym: 75% wydatków w koszty i 50% VAT do odliczenia." },
      { title: "Leasing", text: "Raty leasingu operacyjnego (dla aut osobowych z limitem 150/100/225 tys. zł)." },
      { title: "Sprzęt sprzed działalności", text: "Laptop lub auto kupione prywatnie wcześniej możesz wprowadzić do firmy i amortyzować (wartość rynkowa lub cena zakupu, dowód zakupu lub wycena)." },
      { title: "Opłaty urzędowe i notarialne", text: "Opłaty skarbowe, pełnomocnictwa, wypisy, notariusz w sprawach firmy." },
      { title: "Abonamenty branżowe", text: "Prasa fachowa, serwisy branżowe, członkostwo w stowarzyszeniach." },
      { title: "Koszty KSeF i podpisu", text: "Podpis kwalifikowany, pieczęć elektroniczna, oprogramowanie do KSeF i e-faktur." },
    ],
  },
  {
    id: "zakazane",
    emoji: "🚫",
    title: "Czego nie wolno wrzucić w koszty",
    lead: "Art. 23 ustawy o PIT wylicza wydatki, które nigdy nie są kosztem — nawet jeśli wiążą się z firmą.",
    points: [
      { title: "Kary, grzywny i odsetki od zaległości podatkowych", text: "Również odsetki za zwłokę w ZUS i mandaty — nawet drogowe w podróży służbowej." },
      { title: "Prywatne wydatki", text: "Zakupy rodzinne, wakacje, prywatne rachunki — to najczęstszy powód zakwestionowania kosztów przy kontroli." },
      { title: "Reprezentacja", text: "Wydatki na reprezentację, zwłaszcza usługi gastronomiczne i alkohol dla klientów, nie są kosztem. Kawa na spotkaniu biznesowym bywa sporna." },
      { title: "Podatek dochodowy", text: "PIT ani zaliczki na PIT nie są kosztem." },
      { title: "Składka zdrowotna", text: "Nie jest kosztem. Na podatku liniowym odliczasz ją od dochodu (do limitu), na ryczałcie 50% od przychodu, na skali wcale." },
      { title: "Odzież codzienna i kosmetyki", text: "Garnitur czy buty do pracy biurowej to wydatek osobisty." },
      { title: "Wydatki bez związku z działalnością", text: "Np. sprzęt sportowy programisty — chyba że wynika z profilu firmy." },
      { title: "Nieodliczony VAT, który mogłeś odliczyć", text: "Jeśli jesteś VAT-owcem i miałeś prawo odliczyć VAT, a tego nie zrobiłeś, ten VAT nie trafia do kosztów." },
    ],
  },
  {
    id: "strategie",
    emoji: "🎯",
    title: "Strategie legalnej optymalizacji",
    lead: "Optymalizacja to planowanie: kiedy kupić, jak rozliczyć i jaką formę wybrać. Nie kupuj rzeczy, których firma nie potrzebuje.",
    points: [
      { title: "Planowanie zakupów w czasie", text: "Zakup, który i tak musisz zrobić, obniża podatek w miesiącu poniesienia kosztu. Najwięcej zyskasz w miesiącach, gdy Twoja stawka krańcowa jest najwyższa (np. po przekroczeniu progu 120 000 zł na skali — 32% + 9%)." },
      { title: "Środki niskocenne do 10 000 zł netto", text: "Możesz zaliczyć w koszty jednorazowo w miesiącu oddania do używania — bez wieloletniej amortyzacji." },
      { title: "Jednorazowa amortyzacja de minimis", text: "Środki trwałe z grup 3–8 KŚT (poza samochodami osobowymi) do równowartości 100 000 EUR rocznie — cała wartość w koszty w roku zakupu. Dla małych podatników i firm rozpoczynających działalność." },
      { title: "Leasing czy zakup", text: "Leasing operacyjny rozkłada koszt na raty i nie wymaga amortyzacji; zakup + jednorazowa amortyzacja daje większy koszt od razu. Przy autach osobowych obie formy podlegają limitom wartości." },
      { title: "Samochód: 50%/75% czy 100%", text: "Auto mieszane: 50% VAT i 75% kosztów eksploatacji. Pełne 100% wymaga wyłącznego użytku firmowego, zgłoszenia VAT-26 i kilometrówki — dla freelancera rzadko realne." },
      { title: "Praca w domu", text: "Część mediów, czynszu najmu i amortyzacji mieszkania (gdy jest własnością — z ograniczeniami) proporcjonalnie do powierzchni biura." },
      { title: "Wprowadzenie prywatnego sprzętu", text: "Prywatny laptop czy auto wprowadzone do ewidencji środków trwałych dają odpisy amortyzacyjne, choć nie płacisz za nie drugi raz." },
      { title: "IKZE", text: "Wpłata na IKZE nie jest kosztem, ale odliczasz ją od dochodu (skala, liniowy) do rocznego limitu dla przedsiębiorców." },
      { title: "IP Box 5%", text: "Programiści i twórcy wytwarzający kwalifikowane IP mogą opodatkować dochód z niego stawką 5% (skala lub liniowy, osobna ewidencja)." },
      { title: "ZUS — kolejne etapy", text: "Ulga na start, preferencyjny ZUS i Mały ZUS Plus obniżają składki. Sprawdź uprawnienia przed 31 stycznia." },
      { title: "Forma opodatkowania a struktura kosztów", text: "Przy niskich kosztach (poniżej ok. 20–30% przychodu) ryczałt bywa tańszy. Przy wysokich — liniowy lub skala. Porównaj w Optymalizacji przed 20 lutego." },
      { title: "Nie kupuj dla podatku — przykład", text: "Na liniowym zakup za 1 000 zł netto obniży podatek i zdrowotną o ok. 230 zł. Wydajesz 1 000 zł, oszczędzasz 230 zł — tracisz 770 zł. Kupuj tylko to, co i tak jest firmie potrzebne." },
    ],
  },
  {
    id: "vat",
    emoji: "🧾",
    title: "VAT od kosztów",
    lead: "Jako czynny podatnik VAT odliczasz VAT z faktur zakupowych — to osobna korzyść niezależna od podatku dochodowego.",
    points: [
      { title: "Kiedy odliczysz", text: "W miesiącu otrzymania faktury (nie wcześniej niż powstał obowiązek podatkowy u sprzedawcy) albo w jednym z trzech kolejnych okresów rozliczeniowych." },
      { title: "Samochód osobowy", text: "Przy użytku mieszanym odliczasz 50% VAT od zakupu, leasingu, paliwa i serwisu; nieodliczona połowa trafia do kosztów." },
      { title: "Bez odliczenia", text: "Usługi noclegowe i gastronomiczne (poza wyjątkami) — VAT z nich nie podlega odliczeniu, ale wartość brutto hotelu w delegacji jest kosztem." },
      { title: "Biała lista i split payment", text: "Płatności powyżej 15 000 zł brutto realizuj na rachunek z białej listy — inaczej stracisz koszt. Przy towarach z załącznika 15 obowiązuje mechanizm podzielonej płatności." },
      { title: "Zwolniony z VAT?", text: "Nie odliczasz VAT — cała kwota brutto jest kosztem w podatku dochodowym." },
    ],
  },
  {
    id: "dokumenty",
    emoji: "📎",
    title: "Dokumentowanie kosztów",
    lead: "Bez właściwego dokumentu koszt łatwo podważyć. Od 2026 r. większość faktur krajowych dostaniesz przez KSeF.",
    points: [
      { title: "Faktura z KSeF", text: "Podstawowy dokument — pobierz faktury zakupowe w zakładce KSeF i zaksięguj jednym kliknięciem." },
      { title: "Paragon z NIP do 450 zł brutto", text: "To faktura uproszczona — wystarczy do kosztu i odliczenia VAT (np. drobne zakupy, paliwo). Wyższe kwoty — tylko pełna faktura." },
      { title: "Rachunek", text: "Od podmiotów zwolnionych z VAT lub nieprowadzących działalności w formie faktury." },
      { title: "Dowód wewnętrzny", text: "Gdy nie da się uzyskać faktury (np. bilety komunikacji miejskiej, opłaty parkingowe) — sporządzasz go sam z opisem wydatku." },
      { title: "Faktury zagraniczne", text: "Usługi z zagranicy (np. SaaS z USA czy UE) to import usług — VAT-owiec nalicza i odlicza VAT w JPK, a koszt przeliczasz po kursie NBP z dnia roboczego poprzedzającego dzień poniesienia kosztu." },
    ],
  },
  {
    id: "bledy",
    emoji: "⚠️",
    title: "Najczęstsze błędy",
    lead: "Te błędy najczęściej kończą się korektą zeznania i odsetkami.",
    points: [
      { title: "Koszt w złym miesiącu", text: "Faktura z grudnia zaksięgowana w styczniu zmienia podatek obu lat." },
      { title: "Brak związku z firmą", text: "Prywatny telewizor czy wycieczka rodzinna „na firmę” — przy kontroli wraca z odsetkami." },
      { title: "Drogi sprzęt w całości w koszty", text: "Laptop za 15 000 zł netto to środek trwały — wymaga amortyzacji (albo jednorazowej amortyzacji de minimis)." },
      { title: "Pełny VAT od auta mieszanego", text: "Bez VAT-26 i kilometrówki odliczasz tylko 50%." },
      { title: "Płatność gotówką powyżej 15 000 zł", text: "Transakcja z firmą powyżej limitu zapłacona gotówką nie jest kosztem w części przekraczającej limit." },
      { title: "Gastronomia jako koszt", text: "Obiad z klientem to reprezentacja — nie jest kosztem." },
      { title: "Zapominanie o fakturach", text: "Każda niezaksięgowana faktura to realnie wyższy podatek. Ustal stały dzień w miesiącu na przegląd kosztów i KSeF." },
    ],
  },
];

const TYPICAL: { category: CostCategory; hint: string }[] = [
  { category: "telefon_internet", hint: "Abonament telefoniczny i internet używane do pracy to koszt — sprawdź, czy masz faktury." },
  { category: "oprogramowanie", hint: "Subskrypcje (IDE, pakiet biurowy, narzędzia AI, chmura) to typowy koszt — często faktury przychodzą tylko mailem." },
  { category: "ksiegowosc", hint: "Opłaty za konto firmowe, księgowość i aplikacje finansowe są kosztem." },
  { category: "szkolenia", hint: "Kursy, książki branżowe i konferencje podnoszące kwalifikacje to koszt." },
  { category: "biuro", hint: "Materiały biurowe, coworking, część mediów przy pracy w domu — warto je ująć." },
];

/** Typowe kategorie kosztów, których brakuje w ostatnich 3 miesiącach */
export function costChecklist(costs: Cost[], company: Company, today = new Date()) {
  void company;
  const months = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const present = new Set(costs.filter((c) => months.has(monthKey(c.date))).map((c) => c.category));
  return TYPICAL.filter((t) => !present.has(t.category));
}
