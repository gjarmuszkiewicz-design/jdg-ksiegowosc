export type TaxForm = "skala" | "liniowy" | "ryczalt";
export type VatStatus = "czynny" | "zwolniony";
export type ZusStage = "ulga_na_start" | "preferencyjny" | "maly_zus_plus" | "pelny";
export type VatRate = "23" | "8" | "5" | "0" | "zw" | "np";
export type PaymentMethod = "przelew" | "gotowka" | "karta";

export interface Address {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface Company {
  onboarded: boolean;
  firstName: string;
  lastName: string;
  birthDate: string;
  name: string;
  nip: string;
  regon: string;
  pkd: string;
  address: Address;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  taxOfficeCode: string;
  startDate: string;
  taxForm: TaxForm;
  /** Stawka ryczałtu jako ułamek, np. 0.12 */
  ryczaltRate: number;
  vatStatus: VatStatus;
  /** Podstawa prawna zwolnienia z VAT drukowana na fakturze */
  vatExemptionBasis: string;
  zusStage: ZusStage;
  /** Historia etapów ZUS (np. ulga na start → preferencyjny). Gdy pusta, cały czas obowiązuje `zusStage`. */
  zusPeriods?: { stage: ZusStage; from: string }[];
  chorobowa: boolean;
  /** Podstawa wymiaru dla Małego ZUS Plus (wyliczona z dochodu z poprzedniego roku) */
  malyZusBase: number;
  invoiceNumberPattern: string;
  /** Wzór numeru proformy, domyślnie PRO/{NR}/{RRRR} */
  proformaNumberPattern?: string;
  defaultPaymentDays: number;
  ksefToken: string;
  /** Stan otwarcia przy przejściu z innego programu w trakcie roku */
  openingBalance?: OpeningBalance;
}

/**
 * Bilans otwarcia: sumy narastające z poprzedniego programu na początek miesiąca `fromMonth`.
 * Dokumenty sprzed `fromMonth` danego roku nie są wtedy brane do obliczeń (żeby nie liczyć ich dwa razy).
 */
export interface OpeningBalance {
  year: number;
  /** Pierwszy miesiąc (1–12) prowadzony w tej aplikacji */
  fromMonth: number;
  revenue: number;
  costs: number;
  /** Składki społeczne odliczone narastająco */
  social: number;
  /** Zdrowotna odliczona narastająco (liniowy) lub 50% (ryczałt) */
  healthDeducted: number;
  /** Zaliczki / ryczałt zapłacone narastająco */
  taxPaid: number;
  /** Nadwyżka VAT do przeniesienia z poprzedniego miesiąca */
  vatCarry: number;
  /** Dochód z ostatniego miesiąca przed `fromMonth` (podstawa zdrowotnej) */
  lastMonthIncome: number;
}

export interface Contractor {
  id: string;
  name: string;
  nip: string;
  address: Address;
  email: string;
  isCompany: boolean;
  note?: string;
}

export interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  netPrice: number;
  /** Cena jednostkowa brutto — używana, gdy faktura liczona jest od brutto (np. ze sklepu internetowego) */
  grossPrice?: number;
  vatRate: VatRate;
}

/** Sposób liczenia faktury: od cen netto (domyślnie) albo od cen brutto (art. 106e ust. 7 — typowe dla sklepów) */
export type PriceMode = "netto" | "brutto";

export type InvoiceStatus = "szkic" | "wystawiona" | "wyslana" | "oplacona";
export type InvoiceKind = "faktura" | "proforma";

/** Wpłata od klienta za fakturę (pełna lub częściowa) */
export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  method?: PaymentMethod;
  note?: string;
}
export type KsefStatus = "brak" | "w_kolejce" | "wyslana" | "przyjeta" | "odrzucona";

export interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  place: string;
  paymentMethod: PaymentMethod;
  buyer: Omit<Contractor, "id"> & { contractorId?: string };
  items: InvoiceItem[];
  notes: string;
  status: InvoiceStatus;
  paidDate?: string;
  ksef: { status: KsefStatus; number?: string; sentAt?: string; message?: string };
  createdAt: string;
  /** Faktura (domyślnie) albo proforma — proforma nie jest dokumentem księgowym */
  kind?: InvoiceKind;
  /** Wpłaty od klienta; suma ≥ kwoty brutto oznacza fakturę opłaconą */
  payments?: InvoicePayment[];
  /** Faktura końcowa: z której proformy powstała */
  proformaId?: string;
  /** Proforma: faktura końcowa wystawiona na jej podstawie */
  finalInvoiceId?: string;
  /** Skąd pochodzi dokument, np. "import:JPK_V7M" albo "sklep:<id strony>" */
  source?: string;
  /** Liczenie od netto (domyślnie) lub od brutto */
  priceMode?: PriceMode;
  /** Zamówienie ze sklepu internetowego, z którego powstała faktura */
  shopOrder?: { siteId: string; siteName: string; orderId: string; orderNumber: string; publicToken?: string };
  /** Numer wersji danych na serwerze, w której serwer dodał ten dokument (faktury ze sklepów) */
  serverRev?: number;
}

export type CostCategory =
  | "towary"
  | "uslugi_obce"
  | "oprogramowanie"
  | "sprzet"
  | "biuro"
  | "telefon_internet"
  | "samochod"
  | "paliwo"
  | "podroze"
  | "szkolenia"
  | "ksiegowosc"
  | "marketing"
  | "inne";

export type VatDeduction = "pelne" | "polowa" | "brak";

export interface Cost {
  id: string;
  docNumber: string;
  date: string;
  supplierName: string;
  supplierNip: string;
  description: string;
  category: CostCategory;
  net: number;
  vatRate: VatRate;
  vat: number;
  vatDeduction: VatDeduction;
  /** Udział kosztu w KUP (np. 0.75 dla samochodu w użytku mieszanym) */
  costShare: number;
  isFixedAsset: boolean;
  paid: boolean;
  ksefNumber?: string;
  /** Data, od której liczymy odliczenie VAT (np. data wpływu), gdy inna niż data kosztu w KPiR */
  vatDate?: string;
  createdAt: string;
  source?: string;
}

export type PaymentKind = "pit" | "vat" | "zus_spoleczne" | "zus_zdrowotna" | "odsetki" | "inne";

/** Wpłata do urzędu skarbowego lub ZUS */
export interface Payment {
  id: string;
  kind: PaymentKind;
  /** Okres rozliczeniowy, którego dotyczy wpłata (RRRR-MM) */
  period: string;
  amount: number;
  paidDate: string;
  note?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type DepreciationMethod = "liniowa" | "degresywna" | "jednorazowa_de_minimis" | "jednorazowa_niskocenna";
export type CarLimit = "brak" | "150000" | "100000" | "225000";

/** Pozycja ewidencji środków trwałych i wartości niematerialnych i prawnych */
export interface FixedAsset {
  id: string;
  name: string;
  /** Numer inwentarzowy */
  inventoryNo: string;
  /** Data przyjęcia do używania — odpisy zaczynają się od następnego miesiąca */
  startDate: string;
  documentNo: string;
  /** Wartość początkowa: cena netto + nieodliczony VAT + koszty dodatkowe */
  initialValue: number;
  kstGroup: string;
  /** Roczna stawka amortyzacji (ułamek) */
  rate: number;
  method: DepreciationMethod;
  /** Limit wartości samochodu osobowego dla kosztów amortyzacji */
  carLimit: CarLimit;
  /** Udział w kosztach poza limitem (np. 1) */
  costShare: number;
  /** Data likwidacji / sprzedaży — odpisy kończą się w tym miesiącu */
  disposalDate?: string;
  /** Powiązany dokument kosztowy — jego wartość nie trafia drugi raz do kosztów */
  costId?: string;
  isIntangible: boolean;
  createdAt: string;
}

/** Ustawienia połączonego sklepu (WordPress / WooCommerce) */
export interface ShopSiteSettings {
  /** Kiedy wystawiać fakturę: tylko gdy klient zaznaczy „Chcę fakturę” albo do każdego zamówienia */
  invoiceMode: "na_zadanie" | "zawsze";
  /** Własny wzór numeracji dla sklepu, np. SKLEP/{NR}/{MM}/{RRRR}; pusty = główna numeracja faktur */
  numberPattern: string;
  /** Kto wysyła fakturę klientowi: sklep (poczta WordPressa), aplikacja (SMTP) albo nikt */
  emailBy: "sklep" | "aplikacja" | "brak";
  /** Stawka VAT, gdy sklep nie nalicza podatków */
  defaultVatRate: VatRate;
  /** Opłacone zamówienie = faktura od razu oznaczona jako zapłacona */
  markPaid: boolean;
}

export interface ShopSite {
  id: string;
  name: string;
  url: string;
  /** Początek klucza API — do rozpoznania, sam klucz widać tylko raz */
  keyPrefix: string;
  settings: ShopSiteSettings;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ShopOrderLog {
  siteId: string;
  orderId: string;
  orderNumber: string;
  status: "wystawiona" | "pominieta" | "blad";
  message?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  total?: number;
  customer?: string;
  createdAt: string;
  updatedAt: string;
}
