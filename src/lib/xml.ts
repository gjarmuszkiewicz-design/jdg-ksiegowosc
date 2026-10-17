export const esc = (s: string | number | undefined | null) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const tag = (name: string, value: string | number | undefined | null) =>
  value === undefined || value === null || value === "" ? "" : `<${name}>${esc(value)}</${name}>`;

export const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function downloadFile(filename: string, content: string, mime = "application/xml") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
