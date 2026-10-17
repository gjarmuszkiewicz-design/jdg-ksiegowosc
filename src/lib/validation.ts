export const cleanNip = (nip: string) => nip.replace(/[^0-9]/g, "");

export function isValidNip(nip: string) {
  const n = cleanNip(nip);
  if (n.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, wi, i) => s + wi * Number(n[i]), 0);
  return sum % 11 === Number(n[9]);
}

export function isValidIban(acc: string) {
  let s = acc.replace(/\s/g, "").toUpperCase();
  if (/^\d{26}$/.test(s)) s = "PL" + s;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  const digits = re.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let mod = 0;
  for (const ch of digits) mod = (mod * 10 + Number(ch)) % 97;
  return mod === 1;
}

export const formatIban = (acc: string) =>
  acc.replace(/\s/g, "").replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, "$1 $2 $3 $4 $5 $6 $7");
