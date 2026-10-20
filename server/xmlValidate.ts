import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Oficjalny schemat FA(3) z repozytorium CIRFMF/ksef-api (z lokalnymi ścieżkami importów) */
const FA3_XSD = path.join(__dirname, "schemas", "fa3.xsd");

/**
 * Walidacja faktury względem schematu FA(3) przez xmllint.
 * Zwraca null, gdy XML jest poprawny, albo listę błędów. Bez xmllint w systemie — undefined (nie da się sprawdzić).
 */
export async function validateFa3(xml: string): Promise<string[] | null | undefined> {
  const file = path.join(os.tmpdir(), `fa3-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`);
  await fs.writeFile(file, xml, "utf8");
  try {
    return await new Promise((resolve) => {
      execFile("xmllint", ["--noout", "--schema", FA3_XSD, file], { timeout: 15000 }, (err, _stdout, stderr) => {
        if (!err) return resolve(null);
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return resolve(undefined);
        const lines = stderr
          .split("\n")
          .filter((l) => l.includes("error"))
          .map((l) => l.replace(/^.*?Schemas validity error : /, "").replace(/\{http:\/\/crd\.gov\.pl\/wzor\/[^}]*\}/g, ""))
          .slice(0, 5);
        resolve(lines.length ? lines : [stderr.slice(0, 300) || "Nieznany błąd walidacji"]);
      });
    });
  } finally {
    await fs.rm(file, { force: true });
  }
}
