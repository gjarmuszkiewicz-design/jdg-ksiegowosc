import { invoiceTotals, itemTotals } from "./invoice";
import { cleanNip } from "./validation";
import { amt, esc, tag } from "./xml";
import type { Company, Invoice } from "./types";

/** Pola P_13_x / P_14_x faktury FA(3) wg stawki */
const FA_FIELDS: Record<string, [string, string | null]> = {
  "23": ["P_13_1", "P_14_1"],
  "8": ["P_13_2", "P_14_2"],
  "5": ["P_13_3", "P_14_3"],
  "0": ["P_13_6_1", null],
  zw: ["P_13_7", null],
  np: ["P_13_8", null],
};

const PAYMENT_CODES = { gotowka: 1, karta: 2, przelew: 6 } as const;

/**
 * Buduje XML e-faktury w strukturze FA(3) dla KSeF.
 * Struktura obejmuje typową fakturę krajową JDG (VAT lub zwolnioną).
 */
export function buildFa3Xml(company: Company, inv: Invoice): string {
  const t = invoiceTotals(inv);
  const exempt = t.rates.some((r) => r.rate === "zw");
  const sums = t.rates
    .map((r) => {
      const [kNet, kVat] = FA_FIELDS[r.rate];
      return tag(kNet, amt(r.net)) + (kVat ? tag(kVat, amt(r.vat)) : "");
    })
    .join("");

  const rows = inv.items
    .map((it, i) => {
      const it2 = itemTotals(it);
      return `<FaWiersz>${tag("NrWierszaFa", i + 1)}${tag("P_7", it.name)}${tag("P_8A", it.unit)}${tag("P_8B", it.qty)}${tag("P_9A", amt(it.netPrice))}${tag("P_11", amt(it2.net))}${tag("P_12", it.vatRate)}</FaWiersz>`;
    })
    .join("\n    ");

  const buyerNip = cleanNip(inv.buyer.nip);
  // AdresL1 jest w schemacie obowiązkowy — bez ulicy/miasta pomijamy cały element Adres (u nabywcy jest opcjonalny)
  const addr = (a: Invoice["buyer"]["address"]) => {
    const l1 = a.street || `${a.postalCode} ${a.city}`.trim();
    if (!l1) return "";
    return `<Adres><KodKraju>PL</KodKraju>${tag("AdresL1", l1)}${a.street ? tag("AdresL2", `${a.postalCode} ${a.city}`.trim()) : ""}</Adres>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString().slice(0, 19)}Z</DataWytworzeniaFa>
    <SystemInfo>Ksiegowosc JDG</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>${tag("NIP", cleanNip(company.nip))}${tag("Nazwa", company.name)}</DaneIdentyfikacyjne>
    ${addr(company.address)}
    ${company.email || company.phone ? `<DaneKontaktowe>${tag("Email", company.email)}${tag("Telefon", company.phone)}</DaneKontaktowe>` : ""}
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>${buyerNip ? tag("NIP", buyerNip) : "<BrakID>1</BrakID>"}${tag("Nazwa", inv.buyer.name)}</DaneIdentyfikacyjne>
    ${addr(inv.buyer.address)}
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    ${tag("P_1", inv.issueDate)}
    ${tag("P_1M", inv.place)}
    ${tag("P_2", inv.number)}
    ${inv.saleDate !== inv.issueDate ? tag("P_6", inv.saleDate) : ""}
    ${sums}
    <P_15>${amt(t.gross)}</P_15>
    <Adnotacje>
      <P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>
      <Zwolnienie>${exempt ? `<P_19>1</P_19>${tag("P_19A", company.vatExemptionBasis || "art. 113 ust. 1 ustawy o VAT")}` : "<P_19N>1</P_19N>"}</Zwolnienie>
      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${inv.notes ? `<DodatkowyOpis><Klucz>Uwagi</Klucz><Wartosc>${esc(inv.notes)}</Wartosc></DodatkowyOpis>` : ""}
    ${rows}
    <Platnosc>
      ${inv.status === "oplacona" ? `<Zaplacono>1</Zaplacono>${tag("DataZaplaty", inv.paidDate)}` : `<TerminPlatnosci>${tag("Termin", inv.dueDate)}</TerminPlatnosci>`}
      ${tag("FormaPlatnosci", PAYMENT_CODES[inv.paymentMethod])}
      ${company.bankAccount && inv.paymentMethod === "przelew" ? `<RachunekBankowy>${tag("NrRB", company.bankAccount.replace(/\s/g, ""))}${tag("NazwaBanku", company.bankName)}</RachunekBankowy>` : ""}
    </Platnosc>
  </Fa>
</Faktura>
`;
}
