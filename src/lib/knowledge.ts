export interface Article {
  id: string;
  category: "Start" | "Faktury" | "Koszty" | "VAT" | "PIT" | "ZUS" | "KSeF" | "Optymalizacja";
  title: string;
  summary: string;
  body: string[];
  tags: string[];
}

export const ARTICLES: Article[] = [
  {
    id: "forma-opodatkowania",
    category: "PIT",
    title: "Jak wybrać formę opodatkowania?",
    summary: "Skala, liniowy czy ryczałt — od czego zależy opłacalność.",
    tags: ["skala", "liniowy", "ryczałt", "forma", "wybór", "zmiana"],
    body: [
      "Skala podatkowa: 12% do 120 000 zł dochodu i 32% powyżej. Masz kwotę wolną 30 000 zł, możesz rozliczać się wspólnie z małżonkiem i korzystać z ulg (np. na dzieci). Zdrowotna: 9% dochodu, nie odliczysz jej od podatku.",
      "Podatek liniowy: 19% niezależnie od wysokości dochodu. Zdrowotna 4,9% dochodu, którą możesz odliczyć od dochodu do rocznego limitu. Brak kwoty wolnej i wspólnego rozliczenia.",
      "Ryczałt: podatek od przychodu (bez kosztów) według stawki przypisanej do rodzaju działalności — np. 12% dla IT, 8,5% dla wielu usług. Zdrowotna to stała kwota zależna od progu przychodów (60 tys. / 300 tys. zł). Opłaca się, gdy masz niskie koszty.",
      "Formę zmieniasz w CEIDG do 20 lutego danego roku (lub do 20. dnia miesiąca po pierwszym przychodzie w roku). W zakładce „Optymalizacja” aplikacja porówna wszystkie trzy formy na Twoich danych.",
    ],
  },
  {
    id: "ulga-na-start",
    category: "ZUS",
    title: "Etapy ZUS: ulga na start, preferencyjny, Mały ZUS Plus, pełny",
    summary: "Ile płacisz do ZUS w kolejnych latach działalności.",
    tags: ["zus", "ulga na start", "preferencyjny", "mały zus", "składki"],
    body: [
      "Ulga na start — przez pierwsze 6 pełnych miesięcy płacisz tylko składkę zdrowotną (bez społecznych). Nie budujesz w tym czasie emerytury i nie masz prawa do zasiłku chorobowego.",
      "Preferencyjny ZUS — kolejne 24 miesiące składki społeczne liczone od 30% minimalnego wynagrodzenia (w 2026 r. podstawa 1 441,80 zł).",
      "Mały ZUS Plus — jeśli przychód z poprzedniego roku nie przekroczył 120 000 zł, składki liczysz od połowy średniego miesięcznego dochodu. Możesz z niego korzystać 36 miesięcy w ciągu 60. Zgłoszenie do 31 stycznia.",
      "Pełny ZUS — podstawa 60% prognozowanego przeciętnego wynagrodzenia (w 2026 r. 5 652 zł), łącznie ok. 1 926,76 zł ze składką chorobową i Funduszem Pracy.",
      "Składki płacisz do 20. dnia następnego miesiąca na indywidualny mikrorachunek ZUS.",
    ],
  },
  {
    id: "zdrowotna",
    category: "ZUS",
    title: "Składka zdrowotna w 2026 roku",
    summary: "Jak liczy się zdrowotną na każdej formie opodatkowania.",
    tags: ["zdrowotna", "nfz", "składka", "minimalna"],
    body: [
      "Skala: 9% dochodu z poprzedniego miesiąca, nie mniej niż minimalna składka (od lutego 2026 r. 432,54 zł).",
      "Liniowy: 4,9% dochodu, nie mniej niż minimalna. Zapłaconą składkę możesz odliczyć od dochodu do rocznego limitu.",
      "Ryczałt: stała kwota zależna od przychodu narastająco — do 60 tys. zł: 498,35 zł; do 300 tys. zł: 830,58 zł; powyżej: 1 495,04 zł miesięcznie. 50% zapłaconej składki odliczasz od przychodu.",
      "Roczne rozliczenie zdrowotnej składasz w deklaracji DRA za kwiecień (do 20 maja).",
    ],
  },
  {
    id: "faktura-elementy",
    category: "Faktury",
    title: "Co musi zawierać faktura?",
    summary: "Obowiązkowe elementy faktury VAT i faktury bez VAT.",
    tags: ["faktura", "elementy", "wystawianie", "termin"],
    body: [
      "Datę wystawienia, kolejny numer, dane i NIP sprzedawcy i nabywcy, datę sprzedaży (jeśli inna niż wystawienia), nazwę usługi/towaru, ilość, cenę netto, wartość netto, stawkę VAT, kwotę VAT i kwotę do zapłaty.",
      "Jeśli korzystasz ze zwolnienia z VAT, na fakturze wskazujesz podstawę prawną zwolnienia (np. art. 113 ust. 1 ustawy o VAT).",
      "Fakturę wystawiasz najpóźniej 15. dnia miesiąca następującego po miesiącu wykonania usługi.",
      "Od 2026 r. faktury dla firm wystawiasz w KSeF — klient pobiera je z systemu, a PDF/wydruk jest wizualizacją.",
    ],
  },
  {
    id: "ksef",
    category: "KSeF",
    title: "KSeF — Krajowy System e-Faktur",
    summary: "Obowiązkowe e-fakturowanie i co oznacza dla JDG.",
    tags: ["ksef", "e-faktura", "fa(3)", "token", "obowiązek"],
    body: [
      "KSeF jest obowiązkowy dla większości firm od 1 kwietnia 2026 r. (najwięksi podatnicy od 1 lutego 2026 r.). Najmniejsi podatnicy z miesięczną sprzedażą fakturowaną do 10 000 zł mogą wystawiać faktury poza KSeF do końca 2026 r.",
      "Faktura w KSeF ma strukturę XML FA(3). Po przyjęciu otrzymuje numer KSeF — to on potwierdza wystawienie i datę otrzymania przez nabywcę.",
      "Do integracji z aplikacją potrzebujesz tokena KSeF, który wygenerujesz w Aplikacji Podatnika KSeF (po zalogowaniu profilem zaufanym).",
      "Faktury kosztowe od kontrahentów również pobierzesz z KSeF — nie musisz ich przepisywać ręcznie.",
      "W ewidencji JPK_V7M faktury z KSeF oznacza się numerem KSeF, a wystawione poza systemem — znacznikiem BFK lub OFF.",
    ],
  },
  {
    id: "jpk",
    category: "VAT",
    title: "JPK_V7M — jak rozliczyć VAT?",
    summary: "Miesięczny plik JPK z ewidencją i deklaracją.",
    tags: ["jpk", "vat", "deklaracja", "v7m", "wysyłka"],
    body: [
      "Czynny podatnik VAT co miesiąc do 25. dnia składa JPK_V7M za poprzedni miesiąc i płaci VAT na mikrorachunek podatkowy.",
      "Plik zawiera ewidencję sprzedaży i zakupów oraz część deklaracyjną (VAT należny, naliczony, do wpłaty lub do przeniesienia).",
      "Aplikacja wygeneruje gotowy plik XML. Możesz go podpisać i wysłać np. przez e-mikrofirmę lub Klienta JPK (podpis danymi autoryzacyjnymi lub profilem zaufanym).",
      "Gdy VAT naliczony przewyższa należny, nadwyżkę przenosisz na kolejny miesiąc albo wnioskujesz o zwrot.",
    ],
  },
  {
    id: "limit-vat",
    category: "VAT",
    title: "Zwolnienie z VAT — limit 240 000 zł",
    summary: "Kiedy możesz nie być VAT-owcem i kiedy musisz się zarejestrować.",
    tags: ["zwolnienie", "limit", "vat", "240", "rejestracja"],
    body: [
      "Od 1 stycznia 2026 r. limit zwolnienia podmiotowego z VAT wynosi 240 000 zł sprzedaży rocznie (wcześniej 200 000 zł). Przy starcie w trakcie roku limit liczysz proporcjonalnie.",
      "Po przekroczeniu limitu stajesz się czynnym podatnikiem od transakcji, którą go przekroczyłeś — złóż VAT-R przed tą sprzedażą.",
      "Niektóre usługi (np. doradcze, prawnicze, jubilerskie) wykluczają zwolnienie niezależnie od obrotów.",
      "Bycie VAT-owcem opłaca się, gdy klientami są firmy (odliczą VAT) i masz duże zakupy z VAT.",
    ],
  },
  {
    id: "koszty-samochod",
    category: "Koszty",
    title: "Samochód w firmie — VAT i koszty",
    summary: "50% VAT i 75% kosztów przy użytku mieszanym.",
    tags: ["samochód", "paliwo", "auto", "koszty", "vat 50"],
    body: [
      "Przy samochodzie osobowym używanym też prywatnie odliczasz 50% VAT od zakupu, paliwa i serwisu.",
      "Wydatki eksploatacyjne zaliczasz do kosztów w 75% (wraz z nieodliczoną połową VAT).",
      "Pełne 100% VAT i kosztów wymaga wyłącznego użytku firmowego, ewidencji przebiegu i zgłoszenia VAT-26.",
      "W aplikacji przy kategorii „Samochód” i „Paliwo” te ustawienia podpowiadają się automatycznie.",
    ],
  },
  {
    id: "koszty-co-mozna",
    category: "Koszty",
    title: "Co może być kosztem firmy?",
    summary: "Zasada związku z przychodem i najczęstsze koszty freelancera.",
    tags: ["koszty", "kup", "laptop", "telefon", "szkolenia"],
    body: [
      "Kosztem jest wydatek poniesiony w celu osiągnięcia przychodu lub zabezpieczenia jego źródła, właściwie udokumentowany.",
      "Typowe koszty freelancera: sprzęt komputerowy, oprogramowanie i subskrypcje, telefon i internet, szkolenia i książki branżowe, usługi księgowe, coworking, marketing, delegacje.",
      "Sprzęt powyżej 10 000 zł netto to środek trwały — amortyzujesz go (lub stosujesz jednorazową amortyzację w ramach pomocy de minimis).",
      "Na ryczałcie koszty nie obniżają podatku — ale warto je zbierać, jeśli rozważasz zmianę formy opodatkowania.",
    ],
  },
  {
    id: "ip-box",
    category: "Optymalizacja",
    title: "IP Box — 5% podatku dla twórców IT",
    summary: "Preferencyjna stawka dla dochodu z praw własności intelektualnej.",
    tags: ["ip box", "5%", "programista", "it", "optymalizacja"],
    body: [
      "Programiści i twórcy, którzy wytwarzają utwory chronione prawem autorskim (np. oprogramowanie), mogą opodatkować dochód z kwalifikowanego IP stawką 5%.",
      "Dostępne na skali i liniowym (nie na ryczałcie). Wymaga osobnej ewidencji, prowadzonej na bieżąco, oraz wskaźnika nexus.",
      "Rozliczasz w zeznaniu rocznym (PIT/IP). Warto rozważyć interpretację indywidualną.",
    ],
  },
  {
    id: "terminy",
    category: "Start",
    title: "Kalendarz przedsiębiorcy — najważniejsze terminy",
    summary: "Co i kiedy musisz zapłacić lub wysłać.",
    tags: ["terminy", "kalendarz", "20", "25", "zus", "pit", "vat"],
    body: [
      "Do 20. dnia miesiąca: składki ZUS za poprzedni miesiąc oraz zaliczka na PIT / ryczałt.",
      "Do 25. dnia miesiąca: JPK_V7M i płatność VAT (czynni podatnicy VAT).",
      "Do 31 stycznia: zgłoszenie do Małego ZUS Plus. Do 20 lutego: zmiana formy opodatkowania.",
      "Do 30 kwietnia: zeznanie roczne (PIT-36, PIT-36L lub PIT-28). Do 20 maja: roczne rozliczenie składki zdrowotnej.",
    ],
  },
  {
    id: "mikrorachunek",
    category: "Start",
    title: "Mikrorachunek podatkowy i ZUS",
    summary: "Gdzie płacić podatki i składki.",
    tags: ["mikrorachunek", "przelew", "płatność", "rachunek"],
    body: [
      "PIT i VAT płacisz na indywidualny mikrorachunek podatkowy — wygenerujesz go na podatki.gov.pl na podstawie NIP.",
      "Składki ZUS płacisz jednym przelewem na swój numer rachunku składkowego (NRS) — znajdziesz go w PUE/eZUS.",
    ],
  },
  {
    id: "amortyzacja",
    category: "Koszty",
    title: "Amortyzacja środków trwałych",
    summary: "Kiedy zakup trzeba amortyzować, jakie są metody i stawki.",
    tags: ["amortyzacja", "środek trwały", "kśt", "de minimis", "jednorazowa", "degresywna", "odpis"],
    body: [
      "Środek trwały to rzecz kompletna, zdatna do użytku i używana dłużej niż rok. Jeśli jej wartość początkowa przekracza 10 000 zł netto, wprowadzasz ją do ewidencji i rozliczasz w kosztach przez odpisy amortyzacyjne. Tańsze rzeczy możesz zaliczyć w koszty jednorazowo.",
      "Odpisy zaczynasz od miesiąca następującego po miesiącu wprowadzenia środka do ewidencji. Kończysz, gdy suma odpisów zrówna się z wartością początkową albo w miesiącu sprzedaży lub likwidacji.",
      "Metoda liniowa: co roku ten sam procent wartości początkowej (np. komputery 30%, wyposażenie 20%, samochody 20%, maszyny 14%, budynki niemieszkalne 2,5%, licencje na oprogramowanie 50%). Metoda degresywna: podwójna stawka liczona od wartości netto, z przejściem na liniową, gdy da niższy odpis — tylko dla grup 3–6 i 8 KŚT.",
      "Jednorazowa amortyzacja w ramach pomocy de minimis: środki z grup 3–8 KŚT (bez samochodów osobowych) do równowartości 100 000 EUR rocznie — dla małych podatników i w roku rozpoczęcia działalności. Całą wartość ujmujesz w koszty od razu.",
      "Samochody osobowe: odpisy są kosztem tylko do limitu wartości — 150 000 zł (spalinowe i hybrydy z emisją poniżej 50 g CO₂/km), 100 000 zł (emisja co najmniej 50 g CO₂/km, dla aut nabytych od 2026 r.) oraz 225 000 zł (elektryczne i wodorowe). Nadwyżka nie jest kosztem.",
      "Na ryczałcie amortyzacja nie wpływa na podatek. W aplikacji plan odpisów policzysz w zakładce „Środki trwałe”.",
    ],
  },
  {
    id: "praca-w-domu",
    category: "Koszty",
    title: "Praca w domu — koszty mieszkania",
    summary: "Jak rozliczyć media, czynsz i internet, gdy biuro jest w mieszkaniu.",
    tags: ["praca w domu", "mieszkanie", "media", "czynsz", "biuro", "home office", "prąd"],
    body: [
      "Jeśli prowadzisz firmę w mieszkaniu, możesz zaliczyć do kosztów część wydatków na lokal — proporcjonalnie do powierzchni wykorzystywanej wyłącznie do pracy (np. pokój 12 m² w mieszkaniu 60 m² = 20%).",
      "Do kosztów w tej proporcji zaliczysz m.in. prąd, ogrzewanie, wodę, czynsz administracyjny, czynsz najmu (gdy mieszkanie wynajmujesz) i odsetki od kredytu hipotecznego. Internet i telefon — według rzeczywistego użytku służbowego.",
      "Najlepiej wpisz mieszkanie w CEIDG jako miejsce wykonywania działalności i zachowaj prosty dokument z wyliczeniem proporcji (plan mieszkania, metraż).",
      "Faktury za media są zwykle wystawione na Ciebie prywatnie — to wystarczy do kosztu w podatku dochodowym, ale VAT odliczysz tylko z faktur wystawionych na firmę (z NIP).",
      "Uwaga: amortyzacja lokali i budynków mieszkalnych nie jest kosztem (od 2023 r.), a przy sprzedaży mieszkania używanego w firmie przychód może być przychodem z działalności. Rozważ to przed wprowadzeniem mieszkania do ewidencji.",
    ],
  },
  {
    id: "planowanie-podatkow",
    category: "Optymalizacja",
    title: "Jak planować podatki miesiąc do miesiąca",
    summary: "Rezerwa na podatki, terminy, stawka krańcowa i symulacja przyszłego miesiąca.",
    tags: ["planowanie", "rezerwa", "symulacja", "stawka krańcowa", "płynność", "terminy", "budżet"],
    body: [
      "Odkładaj stały procent każdej opłaconej faktury na osobne konto podatkowe. Dla VAT-owca odkładaj cały VAT z faktury plus 20–35% kwoty netto na PIT i ZUS — dokładny procent wyliczy Centrum podatkowe na podstawie Twoich danych.",
      "Pilnuj terminów: do 20. dnia miesiąca ZUS i zaliczka na PIT, do 25. dnia JPK_V7M i VAT. Podatki liczy się od daty sprzedaży, a nie od zapłaty klienta — nieopłacona faktura i tak generuje podatek.",
      "Poznaj swoją stawkę krańcową, czyli ile podatku i zdrowotnej zapłacisz od dodatkowej złotówki dochodu (np. liniowy ok. 23%, skala w drugim progu 41%). Tyle samo zaoszczędzisz na każdej złotówce kosztu.",
      "Planowane zakupy, które i tak są firmie potrzebne, zrób w miesiącu, w którym obniżą podatek najbardziej — ale nigdy nie kupuj tylko dla podatku.",
      "W Centrum podatkowym zasymulujesz kolejny miesiąc: wpisz spodziewany przychód, koszty i planowany zakup, a zobaczysz, ile podatku, ZUS i VAT zapłacisz i ile zostanie na rękę.",
    ],
  },
];

const STOPWORDS = new Set(["jak", "czy", "ile", "jaki", "jaka", "jakie", "mam", "mnie", "moje", "się", "dla", "oraz", "albo", "kiedy", "gdzie", "muszę", "można", "co", "to", "jest", "nie", "tak", "przy", "lub"]);

export function searchArticles(q: string) {
  const query = q.toLowerCase().trim();
  if (!query) return ARTICLES;
  const words = query.split(/[\s,.?!]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return ARTICLES.map((a) => {
    const hay = `${a.title} ${a.summary} ${a.tags.join(" ")} ${a.body.join(" ")}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0) + (a.tags.some((t) => t.includes(w)) ? 2 : 0), 0);
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}
