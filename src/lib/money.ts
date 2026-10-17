export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const fmt = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const fmtNum = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pln = (n: number) => fmt.format(n || 0);
export const num2 = (n: number) => fmtNum.format(n || 0);

const ONES = ["", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć"];
const TEENS = ["dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście"];
const TENS = ["", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt", "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt"];
const HUNDREDS = ["", "sto", "dwieście", "trzysta", "czterysta", "pięćset", "sześćset", "siedemset", "osiemset", "dziewięćset"];
const GROUPS: [string, string, string][] = [
  ["", "", ""],
  ["tysiąc", "tysiące", "tysięcy"],
  ["milion", "miliony", "milionów"],
  ["miliard", "miliardy", "miliardów"],
];

function plural(n: number, forms: [string, string, string]) {
  if (n === 1) return forms[0];
  const u = n % 10;
  const t = n % 100;
  if (u >= 2 && u <= 4 && !(t >= 12 && t <= 14)) return forms[1];
  return forms[2];
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts = [HUNDREDS[h]];
  if (t === 1) parts.push(TEENS[o]);
  else parts.push(TENS[t], ONES[o]);
  return parts.filter(Boolean).join(" ");
}

/** Kwota słownie, np. "sto dwadzieścia trzy złote 45/100" */
export function amountInWords(amount: number) {
  const zl = Math.floor(Math.abs(amount));
  const gr = Math.round((Math.abs(amount) - zl) * 100);
  if (zl === 0) return `zero złotych ${String(gr).padStart(2, "0")}/100`;
  const words: string[] = [];
  let rest = zl;
  let g = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) {
      const w = g === 1 && chunk === 1 ? "" : threeDigits(chunk);
      words.unshift([w, g ? plural(chunk, GROUPS[g]) : ""].filter(Boolean).join(" "));
    }
    rest = Math.floor(rest / 1000);
    g++;
  }
  const currency = plural(zl, ["złoty", "złote", "złotych"]);
  return `${words.join(" ")} ${currency} ${String(gr).padStart(2, "0")}/100`;
}
