import type { Company, Contractor, Cost, Invoice } from "@/lib/types";

const id = (p: string, n: number) => `${p}${n}`;

export function demoData() {
  const year = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const company: Company = {
    onboarded: true,
    firstName: "Anna",
    lastName: "Kowalska",
    birthDate: "1990-05-12",
    name: "Anna Kowalska Software",
    nip: "5260250274",
    regon: "123456785",
    pkd: "62.01.Z",
    address: { street: "ul. Prosta 12/4", postalCode: "00-850", city: "Warszawa", country: "PL" },
    email: "anna@example.com",
    phone: "+48 600 100 200",
    bankName: "mBank",
    bankAccount: "PL61109010140000071219812874",
    taxOfficeCode: "1471",
    startDate: `${year - 3}-03-01`,
    taxForm: "liniowy",
    ryczaltRate: 0.12,
    vatStatus: "czynny",
    vatExemptionBasis: "art. 113 ust. 1 ustawy o VAT",
    zusStage: "pelny",
    chorobowa: true,
    malyZusBase: 0,
    invoiceNumberPattern: "FV/{NR}/{MM}/{RRRR}",
    defaultPaymentDays: 14,
    ksefToken: "",
  };
  const contractors: Contractor[] = [
    { id: "k1", name: "TechNova Sp. z o.o.", nip: "7010000000", address: { street: "ul. Złota 44", postalCode: "00-120", city: "Warszawa", country: "PL" }, email: "faktury@technova.example", isCompany: true },
    { id: "k2", name: "Bright Apps S.A.", nip: "6750000000", address: { street: "ul. Lubicz 23", postalCode: "31-503", city: "Kraków", country: "PL" }, email: "ap@brightapps.example", isCompany: true },
    { id: "k3", name: "Studio Pixel Jan Nowak", nip: "8992000000", address: { street: "ul. Świdnicka 8", postalCode: "50-066", city: "Wrocław", country: "PL" }, email: "jan@pixel.example", isCompany: true },
  ];
  const invoices: Invoice[] = [];
  const costs: Cost[] = [];
  for (let m = 1; m <= nowMonth; m++) {
    const mm = String(m).padStart(2, "0");
    const last = new Date(year, m, 0).getDate();
    const issue = `${year}-${mm}-${String(Math.min(last, 28)).padStart(2, "0")}`;
    const due = new Date(year, m - 1, 28 + 14).toISOString().slice(0, 10);
    const paid = m < nowMonth;
    const rate = 15000 + (m % 3) * 1500;
    const c = contractors[0];
    invoices.push({
      id: id("f", m), number: `FV/1/${mm}/${year}`, issueDate: issue, saleDate: issue, dueDate: due, place: "Warszawa",
      paymentMethod: "przelew", buyer: { ...c, contractorId: c.id },
      items: [{ id: "i1", name: "Usługi programistyczne — rozwój aplikacji", qty: 1, unit: "usł.", netPrice: rate, vatRate: "23" }],
      notes: "", status: paid ? "oplacona" : "wystawiona", paidDate: paid ? due : undefined,
      ksef: paid ? { status: "przyjeta", number: `5260250274-${year}${mm}28-0A1B2C3D4E5F-01` } : { status: "brak" },
      createdAt: issue,
    });
    if (m % 2 === 0) {
      const c2 = contractors[1 + (m % 4 === 0 ? 1 : 0)];
      invoices.push({
        id: id("g", m), number: `FV/2/${mm}/${year}`, issueDate: `${year}-${mm}-15`, saleDate: `${year}-${mm}-15`, dueDate: `${year}-${mm}-${m === nowMonth ? "28" : "25"}`, place: "Warszawa",
        paymentMethod: "przelew", buyer: { ...c2, contractorId: c2.id },
        items: [{ id: "i1", name: "Konsultacje techniczne", qty: 10, unit: "godz.", netPrice: 250, vatRate: "23" }],
        notes: "", status: m < nowMonth - 1 ? "oplacona" : "wystawiona", paidDate: m < nowMonth - 1 ? `${year}-${mm}-24` : undefined,
        ksef: { status: "brak" }, createdAt: `${year}-${mm}-15`,
      });
    }
    costs.push(
      { id: id("c", m * 10 + 1), docNumber: `FA/${m}/JB`, date: `${year}-${mm}-05`, supplierName: "JetBrains s.r.o.", supplierNip: "", description: "Subskrypcja IDE", category: "oprogramowanie", net: 120, vatRate: "np", vat: 0, vatDeduction: "brak", costShare: 1, isFixedAsset: false, paid: true, createdAt: `${year}-${mm}-05` },
      { id: id("c", m * 10 + 2), docNumber: `${m}/2026/ORANGE`, date: `${year}-${mm}-10`, supplierName: "Orange Polska S.A.", supplierNip: "5260250995", description: "Abonament telefon + internet", category: "telefon_internet", net: 150, vatRate: "23", vat: 34.5, vatDeduction: "pelne", costShare: 1, isFixedAsset: false, paid: true, createdAt: `${year}-${mm}-10` },
      { id: id("c", m * 10 + 3), docNumber: `PAL/${m}`, date: `${year}-${mm}-18`, supplierName: "Orlen S.A.", supplierNip: "7740001454", description: "Paliwo", category: "paliwo", net: 400, vatRate: "23", vat: 92, vatDeduction: "polowa", costShare: 0.75, isFixedAsset: false, paid: true, createdAt: `${year}-${mm}-18` },
    );
    if (m === 3)
      costs.push({ id: "laptop", docNumber: "FV/2026/0311", date: `${year}-03-11`, supplierName: "x-kom sp. z o.o.", supplierNip: "6111000000", description: "Laptop do pracy", category: "sprzet", net: 7300, vatRate: "23", vat: 1679, vatDeduction: "pelne", costShare: 1, isFixedAsset: false, paid: true, createdAt: `${year}-03-11` });
  }
  return { company, contractors, invoices, costs, chat: [], dismissedTips: [] };
}
