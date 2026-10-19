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
  vatRate: VatRate;
}

export type InvoiceStatus = "szkic" | "wystawiona" | "wyslana" | "oplacona";
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
  /** Skąd pochodzi dokument, np. "import:JPK_V7M" */
  source?: string;
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
  createdAt: string;
  source?: string;
}

export interface ZusPayment {
  id: string;
  month: string; // YYYY-MM
  social: number;
  health: number;
  paidDate: string;
}

export interface TaxPayment {
  id: string;
  month: string; // YYYY-MM
  kind: "pit" | "vat";
  amount: number;
  paidDate: string;
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
