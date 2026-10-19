import { describe, expect, it } from "vitest";
import { computeObligations } from "../src/lib/obligations";
import { emptyCompany } from "../src/store/useStore";
import type { Invoice } from "../src/lib/types";

const company = { ...emptyCompany, onboarded: true, startDate: "2026-03-18", taxForm: "liniowy" as const, vatStatus: "czynny" as const,
  zusStage: "preferencyjny" as const, chorobowa: false,
  zusPeriods: [{ stage: "ulga_na_start" as const, from: "2026-03-18" }, { stage: "preferencyjny" as const, from: "2026-09-18" }] };
const inv = (d: string, net: number): Invoice => ({
  id: d, number: `FV ${d}`, issueDate: d, saleDate: d, dueDate: d, place: "", paymentMethod: "przelew",
  buyer: { name: "X", nip: "", address: emptyCompany.address, email: "", isCompany: true },
  items: [{ id: "a", name: "u", qty: 1, unit: "usł.", netPrice: net, vatRate: "23" }], notes: "", status: "oplacona", ksef: { status: "brak" }, createdAt: d,
});

describe("rejestr płatności", () => {
  const data = { company, invoices: [inv("2026-03-31", 2600)], costs: [], assets: [] };
  const today = new Date("2026-10-21T12:00:00");
  it("bez wpłat: zaległości z terminami i dniami opóźnienia", () => {
    const r = computeObligations(data, [], today);
    const marchPit = r.obligations.find((o) => o.kind === "pit" && o.period === "2026-03")!;
    expect(marchPit).toMatchObject({ amount: 494, status: "zalegle", dueDate: "2026-04-20" });
    expect(marchPit.daysLate).toBe(184);
    const marchVat = r.obligations.find((o) => o.kind === "vat" && o.period === "2026-03")!;
    expect(marchVat.dueDate).toBe("2026-04-27"); // 25.04.2026 to sobota
    expect(r.obligations.find((o) => o.period === "2026-10")?.status).toBe("szacunek");
    expect(r.overdueTotal).toBeGreaterThan(0);
  });
  it("wpłata zamyka pozycję, częściowa zostawia resztę", () => {
    const r = computeObligations(data, [
      { id: "1", kind: "pit", period: "2026-03", amount: 494, paidDate: "2026-10-21" },
      { id: "2", kind: "zus_zdrowotna", period: "2026-03", amount: 200, paidDate: "2026-04-15" },
    ], today);
    expect(r.obligations.find((o) => o.kind === "pit" && o.period === "2026-03")!.status).toBe("zaplacone");
    const h = r.obligations.find((o) => o.kind === "zus_zdrowotna" && o.period === "2026-03")!;
    expect(h).toMatchObject({ status: "czesciowo", remaining: 232.54 });
  });
});
