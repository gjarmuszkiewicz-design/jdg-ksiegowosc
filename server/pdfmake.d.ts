// Minimalne typy pdfmake 0.3 (pakiet nie ma własnych deklaracji)
declare module "pdfmake" {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
  }
  const pdfmake: {
    setFonts(fonts: Record<string, Record<string, string>>): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    createPdf(doc: unknown): OutputDocument;
  };
  export default pdfmake;
}
