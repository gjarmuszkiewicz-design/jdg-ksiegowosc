// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { autoMapping, detectCsv, detectKind, findDuplicates, guessCategory, parseCsv, parseJpkFa, parseJpkV7, parseKsefFa, parsePlDate, parsePlNumber } from "../src/lib/importers";
import { emptyCompany } from "../src/store/useStore";

const company = { ...emptyCompany, nip: "5260250274", name: "Moja Firma" };

const JPK_V7 = `<?xml version="1.0" encoding="UTF-8"?>
<tns:JPK xmlns:tns="http://crd.gov.pl/wzor/2025/12/19/14090/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/09/13/eD/DefinicjeTypy/">
  <tns:Naglowek><tns:KodFormularza kodSystemowy="JPK_V7M (3)" wersjaSchemy="1-0E">JPK_VAT</tns:KodFormularza><tns:Rok>2026</tns:Rok><tns:Miesiac>3</tns:Miesiac></tns:Naglowek>
  <tns:Ewidencja>
    <tns:SprzedazWiersz><tns:LpSprzedazy>1</tns:LpSprzedazy><tns:NrKontrahenta>7010000000</tns:NrKontrahenta><tns:NazwaKontrahenta>TechNova</tns:NazwaKontrahenta><tns:DowodSprzedazy>FV/1/03/2026</tns:DowodSprzedazy><tns:DataWystawienia>2026-03-31</tns:DataWystawienia><tns:DataSprzedazy>2026-03-31</tns:DataSprzedazy><tns:NrKSeF>5260250274-20260331-0A1B2C3D4E5F-01</tns:NrKSeF><tns:K_19>10000.00</tns:K_19><tns:K_20>2300.00</tns:K_20></tns:SprzedazWiersz>
    <tns:SprzedazWiersz><tns:LpSprzedazy>2</tns:LpSprzedazy><tns:NrKontrahenta>6750000000</tns:NrKontrahenta><tns:NazwaKontrahenta>Bright</tns:NazwaKontrahenta><tns:DowodSprzedazy>FV/2/03/2026</tns:DowodSprzedazy><tns:DataWystawienia>2026-03-15</tns:DataWystawienia><tns:K_19>1000.00</tns:K_19><tns:K_20>230.00</tns:K_20><tns:K_17>500.00</tns:K_17><tns:K_18>40.00</tns:K_18></tns:SprzedazWiersz>
    <tns:SprzedazCtrl><tns:LiczbaWierszySprzedazy>2</tns:LiczbaWierszySprzedazy></tns:SprzedazCtrl>
    <tns:ZakupWiersz><tns:LpZakupu>1</tns:LpZakupu><tns:NrDostawcy>7740001454</tns:NrDostawcy><tns:NazwaDostawcy>ORLEN S.A.</tns:NazwaDostawcy><tns:DowodZakupu>PAL/3</tns:DowodZakupu><tns:DataZakupu>2026-03-18</tns:DataZakupu><tns:DataWplywu>2026-03-19</tns:DataWplywu><tns:K_42>400.00</tns:K_42><tns:K_43>46.00</tns:K_43></tns:ZakupWiersz>
  </tns:Ewidencja>
</tns:JPK>`;

const JPK_FA = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
  <Naglowek><KodFormularza kodSystemowy="JPK_FA (4)" wersjaSchemy="1-0">JPK_FA</KodFormularza></Naglowek>
  <Faktura><KodWaluty>PLN</KodWaluty><P_1>2025-11-30</P_1><P_2A>F/11/2025</P_2A><P_3A>Klient Sp. z o.o.</P_3A><P_3B>ul. Długa 1, 00-001 Warszawa</P_3B><P_5B>7010000000</P_5B><P_6>2025-11-30</P_6><P_13_7>3000.00</P_13_7><P_15>3000.00</P_15></Faktura>
  <FakturaWiersz><P_2B>F/11/2025</P_2B><P_7>Projekt graficzny</P_7><P_8A>szt.</P_8A><P_8B>2</P_8B><P_9A>1000.00</P_9A><P_11>2000.00</P_11><P_12>zw</P_12></FakturaWiersz>
  <FakturaWiersz><P_2B>F/11/2025</P_2B><P_7>Konsultacje</P_7><P_8A>godz.</P_8A><P_8B>4</P_8B><P_9A>250.00</P_9A><P_11>1000.00</P_11><P_12>zw</P_12></FakturaWiersz>
</JPK>`;

const fa3 = (sellerNip: string, buyerNip: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>${sellerNip}</NIP><Nazwa>Sprzedawca X</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>ul. A 1</AdresL1></Adres></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>${buyerNip}</NIP><Nazwa>Nabywca Y</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>ul. B 2</AdresL1><AdresL2>00-950 Warszawa</AdresL2></Adres></Podmiot2>
  <Fa><KodWaluty>PLN</KodWaluty><P_1>2026-04-10</P_1><P_2>FV/7/2026</P_2><P_13_1>1000.00</P_13_1><P_14_1>230.00</P_14_1><P_15>1230.00</P_15>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Abonament</P_7><P_8A>mies.</P_8A><P_8B>1</P_8B><P_9A>1000.00</P_9A><P_11>1000.00</P_11><P_12>23</P_12></FaWiersz>
    <Platnosc><TerminPlatnosci><Termin>2026-04-24</Termin></TerminPlatnosci><FormaPlatnosci>6</FormaPlatnosci></Platnosc>
  </Fa>
</Faktura>`;

const CSV = `Numer;Data wystawienia;Data sprzedaży;Kontrahent;NIP;Netto;Kwota VAT;Brutto;Status
FV 1/2026;05.01.2026;31.12.2025;Firma A;701-000-00-00;1 234,56;283,95;1 518,51;Zapłacona
FV 2/2026;10.02.2026;10.02.2026;Firma B;;2000,00;460,00;2460,00;Nieopłacona
Razem;;;;;3234,56;743,95;3978,51;`;

describe("importery", () => {
  it("JPK_V7M: sprzedaż per stawka i zakupy", () => {
    expect(detectKind(JPK_V7)).toBe("jpk_v7");
    const r = parseJpkV7(JPK_V7, company);
    expect(r.invoices).toHaveLength(2);
    expect(r.invoices[0].ksef.number).toContain("5260250274");
    expect(r.invoices[1].items).toHaveLength(2);
    expect(r.invoices[1].items.find((i) => i.vatRate === "8")?.netPrice).toBe(500);
    expect(r.costs).toHaveLength(1);
    expect(r.costs[0]).toMatchObject({ net: 400, vat: 46, date: "2026-03-18", vatDate: "2026-03-19", category: "paliwo" });
    expect(r.contractors).toHaveLength(2);
    expect(r.source).toBe("JPK_V7M 2026-03");
  });

  it("JPK_FA: faktura z wierszami", () => {
    expect(detectKind(JPK_FA)).toBe("jpk_fa");
    const r = parseJpkFa(JPK_FA);
    expect(r.invoices).toHaveLength(1);
    const inv = r.invoices[0];
    expect(inv.items).toHaveLength(2);
    expect(inv.items[0]).toMatchObject({ qty: 2, netPrice: 1000, vatRate: "zw" });
    expect(inv.buyer.address.postalCode).toBe("00-001");
  });

  it("KSeF FA(3): sprzedaż i zakup rozpoznane po NIP", () => {
    const sale = parseKsefFa(fa3("5260250274", "7010000000"), company);
    expect(sale.invoices).toHaveLength(1);
    expect(sale.invoices[0].dueDate).toBe("2026-04-24");
    expect(sale.invoices[0].status).toBe("wystawiona");
    const buy = parseKsefFa(fa3("7010000000", "5260250274"), company, "7010000000-20260410-ABCDEF123456-AB.xml");
    expect(buy.costs).toHaveLength(1);
    expect(buy.costs[0]).toMatchObject({ net: 1000, vat: 230, vatRate: "23", ksefNumber: "7010000000-20260410-ABCDEF123456-AB" });
  });

  it("CSV w stylu wFirma: separator ;, liczby i daty po polsku, statusy", () => {
    const info = detectCsv(CSV);
    expect(info.separator).toBe(";");
    const map = autoMapping(info.headers);
    expect(map).toMatchObject({ number: 0, issueDate: 1, saleDate: 2, party: 3, nip: 4, net: 5, vat: 6, gross: 7, status: 8 });
    const r = parseCsv(CSV, map, "sprzedaz", "wFirma");
    expect(r.invoices).toHaveLength(2);
    expect(r.invoices[0].items[0]).toMatchObject({ netPrice: 1234.56, vatRate: "23" });
    expect(r.invoices[0].saleDate).toBe("2025-12-31");
    expect(r.invoices[0].status).toBe("oplacona");
    expect(r.invoices[1].status).toBe("wystawiona");
    expect(r.warnings.join()).toContain("Pominięto 1");
  });

  it("duplikaty i pomocnicze", () => {
    const r = parseJpkV7(JPK_V7, company);
    const d = findDuplicates(r, { invoices: [r.invoices[0]], costs: [], contractors: [] });
    expect(d.invoiceIds.has(r.invoices[0].id)).toBe(true);
    expect(d.invoiceIds.size).toBe(1);
    expect(parsePlNumber("1.234,56 zł")).toBe(1234.56);
    expect(parsePlDate("3-1-2026")).toBe("2026-01-03");
    expect(guessCategory("Orange Polska").category).toBe("telefon_internet");
  });
});

describe("JPK_V7 — korekty VAT naliczonego", () => {
  it("K_46 jako osobna pozycja z ujemnym VAT, nie duplikat oryginalnej faktury", () => {
    const xml = `<?xml version="1.0"?><tns:JPK xmlns:tns="http://crd.gov.pl/wzor/2025/12/19/14090/"><tns:Naglowek><tns:KodFormularza kodSystemowy="JPK_V7M (3)">JPK_VAT</tns:KodFormularza><tns:Rok>2026</tns:Rok><tns:Miesiac>7</tns:Miesiac></tns:Naglowek><tns:Ewidencja>
      <tns:ZakupWiersz><tns:NrDostawcy>7831711517</tns:NrDostawcy><tns:NazwaDostawcy>Hosting</tns:NazwaDostawcy><tns:DowodZakupu>6424/4/2026</tns:DowodZakupu><tns:DataZakupu>2026-04-16</tns:DataZakupu><tns:DataWplywu>2026-07-31</tns:DataWplywu><tns:K_46>-12.19</tns:K_46></tns:ZakupWiersz>
    </tns:Ewidencja></tns:JPK>`;
    const r = parseJpkV7(xml);
    expect(r.costs).toHaveLength(1);
    expect(r.costs[0]).toMatchObject({ net: 0, vat: -12.19, date: "2026-07-31" });
    expect(r.costs[0].docNumber).toContain("KOREKTA K_46");
    const original = { ...r.costs[0], id: "x", docNumber: "6424/4/2026", vat: 12.19, net: 53 };
    const dup = findDuplicates(r, { invoices: [], costs: [original], contractors: [] });
    expect(dup.costIds.size).toBe(0);
  });
});
