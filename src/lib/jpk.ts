import { invoiceTotals, isAccounting } from "./invoice";
import { costDeductibleVat, monthKey } from "./tax";
import { cleanNip } from "./validation";
import { amt, esc, tag } from "./xml";
import type { Company, Cost, Invoice } from "./types";

/** Pola K_ ewidencji sprzedaży wg stawki (JPK_V7M) */
const SALE_FIELDS: Record<string, [string, string | null]> = {
  zw: ["K_10", null],
  np: ["K_11", null],
  "0": ["K_13", null],
  "5": ["K_15", "K_16"],
  "8": ["K_17", "K_18"],
  "23": ["K_19", "K_20"],
};

export interface JpkResult {
  xml: string;
  totals: { salesNet: number; salesVat: number; purchaseNet: number; purchaseVat: number; due: number; carry: number };
  salesRows: number;
  purchaseRows: number;
}

/**
 * Generuje plik JPK_V7M(3) (ewidencja + deklaracja) za wskazany miesiąc.
 * Przed wysyłką plik warto sprawdzić walidatorem MF (struktura zmienia się wraz z KSeF).
 */
export function buildJpkV7M(company: Company, invoices: Invoice[], costs: Cost[], month: string, carryFromPrev = 0): JpkResult {
  const [year, m] = month.split("-");
  const sales = invoices.filter((i) => isAccounting(i) && monthKey(i.saleDate || i.issueDate) === month);
  const purchases = costs.filter((c) => monthKey(c.vatDate || c.date) === month && costDeductibleVat(c, company) !== 0);

  const P: Record<string, number> = {};
  const add = (k: string, v: number) => (P[k] = Math.round(((P[k] ?? 0) + v) * 100) / 100);

  const saleRows = sales.map((inv, idx) => {
    const t = invoiceTotals(inv);
    const fields = t.rates
      .map((r) => {
        const [kNet, kVat] = SALE_FIELDS[r.rate];
        add(kNet, r.net);
        if (kVat) add(kVat, r.vat);
        return tag(kNet, amt(r.net)) + (kVat ? tag(kVat, amt(r.vat)) : "");
      })
      .join("");
    const nip = cleanNip(inv.buyer.nip);
    return `<tns:SprzedazWiersz>${tag("tns:LpSprzedazy", idx + 1)}${nip ? tag("tns:KodKrajuNadaniaTIN", "PL") : ""}${tag("tns:NrKontrahenta", nip || "brak")}${tag("tns:NazwaKontrahenta", inv.buyer.name)}${tag("tns:DowodSprzedazy", inv.number)}${tag("tns:DataWystawienia", inv.issueDate)}${tag("tns:DataSprzedazy", inv.saleDate)}${inv.ksef.number ? tag("tns:NrKSeF", inv.ksef.number) : tag("tns:BFK", 1)}${fields}</tns:SprzedazWiersz>`;
  });

  let purchaseNet = 0;
  let purchaseVat = 0;
  const purchaseRows = purchases.map((c, idx) => {
    const vat = costDeductibleVat(c, company);
    const net = c.vatDeduction === "polowa" ? c.net * 0.5 : c.net;
    const [kNet, kVat] = c.isFixedAsset ? ["K_40", "K_41"] : ["K_42", "K_43"];
    add(kNet.replace("K_", "P_"), net);
    add(kVat.replace("K_", "P_"), vat);
    purchaseNet += net;
    purchaseVat += vat;
    return `<tns:ZakupWiersz>${tag("tns:LpZakupu", idx + 1)}${tag("tns:KodKrajuNadaniaTIN", "PL")}${tag("tns:NrDostawcy", cleanNip(c.supplierNip) || "brak")}${tag("tns:NazwaDostawcy", c.supplierName)}${tag("tns:DowodZakupu", c.docNumber)}${tag("tns:DataZakupu", c.date)}${tag("tns:DataWplywu", c.vatDate || c.date)}${c.ksefNumber ? tag("tns:NrKSeF", c.ksefNumber) : tag("tns:BFK", 1)}${tag(`tns:${kNet}`, amt(net))}${tag(`tns:${kVat}`, amt(vat))}</tns:ZakupWiersz>`;
  });

  const salesNet = ["K_10", "K_11", "K_13", "K_15", "K_17", "K_19"].reduce((s, k) => s + (P[k] ?? 0), 0);
  const salesVat = ["K_16", "K_18", "K_20"].reduce((s, k) => s + (P[k] ?? 0), 0);
  const r = (n: number) => Math.round(n);

  const P_38 = r(salesVat);
  const P_48 = r(purchaseVat) + r(carryFromPrev);
  const due = Math.max(0, P_38 - P_48);
  const carry = Math.max(0, P_48 - P_38);

  const declFields = [
    ["P_10", P.K_10], ["P_11", P.K_11], ["P_13", P.K_13], ["P_15", P.K_15], ["P_16", P.K_16],
    ["P_17", P.K_17], ["P_18", P.K_18], ["P_19", P.K_19], ["P_20", P.K_20],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => tag(`tns:${k}`, r(v as number)))
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tns:JPK xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/09/13/eD/DefinicjeTypy/" xmlns:tns="http://crd.gov.pl/wzor/2025/12/19/14090/">
  <tns:Naglowek>
    <tns:KodFormularza kodSystemowy="JPK_V7M (3)" wersjaSchemy="1-0E">JPK_VAT</tns:KodFormularza>
    <tns:WariantFormularza>3</tns:WariantFormularza>
    <tns:DataWytworzeniaJPK>${new Date().toISOString().slice(0, 19)}</tns:DataWytworzeniaJPK>
    <tns:NazwaSystemu>Ksiegowosc JDG</tns:NazwaSystemu>
    <tns:CelZlozenia poz="P_7">1</tns:CelZlozenia>
    <tns:KodUrzedu>${esc(company.taxOfficeCode)}</tns:KodUrzedu>
    <tns:Rok>${year}</tns:Rok>
    <tns:Miesiac>${Number(m)}</tns:Miesiac>
  </tns:Naglowek>
  <tns:Podmiot1 rola="Podatnik">
    <tns:OsobaFizyczna>
      <etd:NIP>${cleanNip(company.nip)}</etd:NIP>
      <etd:ImiePierwsze>${esc(company.firstName)}</etd:ImiePierwsze>
      <etd:Nazwisko>${esc(company.lastName)}</etd:Nazwisko>
      <etd:DataUrodzenia>${esc(company.birthDate)}</etd:DataUrodzenia>
      <tns:Email>${esc(company.email)}</tns:Email>
    </tns:OsobaFizyczna>
  </tns:Podmiot1>
  <tns:Deklaracja>
    <tns:Naglowek>
      <tns:KodFormularzaDekl kodSystemowy="VAT-7 (23)" kodPodatku="VAT" rodzajZobowiazania="Z" wersjaSchemy="1-0E">VAT-7</tns:KodFormularzaDekl>
      <tns:WariantFormularzaDekl>23</tns:WariantFormularzaDekl>
    </tns:Naglowek>
    <tns:PozycjeSzczegolowe>
      ${declFields}
      <tns:P_37>${r(salesNet)}</tns:P_37>
      <tns:P_38>${P_38}</tns:P_38>
      ${carryFromPrev ? `<tns:P_39>${r(carryFromPrev)}</tns:P_39>` : ""}
      ${P.P_40 ? `<tns:P_40>${r(P.P_40)}</tns:P_40><tns:P_41>${r(P.P_41)}</tns:P_41>` : ""}
      ${P.P_42 ? `<tns:P_42>${r(P.P_42)}</tns:P_42><tns:P_43>${r(P.P_43)}</tns:P_43>` : ""}
      <tns:P_48>${P_48}</tns:P_48>
      <tns:P_51>${due}</tns:P_51>
      ${carry ? `<tns:P_53>${carry}</tns:P_53><tns:P_62>${carry}</tns:P_62>` : ""}
    </tns:PozycjeSzczegolowe>
    <tns:Pouczenia>1</tns:Pouczenia>
  </tns:Deklaracja>
  <tns:Ewidencja>
    ${saleRows.join("\n    ")}
    <tns:SprzedazCtrl><tns:LiczbaWierszySprzedazy>${saleRows.length}</tns:LiczbaWierszySprzedazy><tns:PodatekNalezny>${amt(salesVat)}</tns:PodatekNalezny></tns:SprzedazCtrl>
    ${purchaseRows.join("\n    ")}
    <tns:ZakupCtrl><tns:LiczbaWierszyZakupow>${purchaseRows.length}</tns:LiczbaWierszyZakupow><tns:PodatekNaliczony>${amt(purchaseVat)}</tns:PodatekNaliczony></tns:ZakupCtrl>
  </tns:Ewidencja>
</tns:JPK>
`;
  return {
    xml,
    totals: { salesNet, salesVat, purchaseNet, purchaseVat, due, carry },
    salesRows: saleRows.length,
    purchaseRows: purchaseRows.length,
  };
}
