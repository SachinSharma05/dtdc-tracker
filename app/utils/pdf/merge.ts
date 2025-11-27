import { PDFDocument } from "pdf-lib";

export async function mergePDFs(customPdf: Uint8Array, dtdcBase64: string) {
  const customDoc = await PDFDocument.load(customPdf);

  const dtdcPdfBytes = Uint8Array.from(
    atob(dtdcBase64),
    (c) => c.charCodeAt(0)
  );

  const dtdcDoc = await PDFDocument.load(dtdcPdfBytes);

  const merged = await PDFDocument.create();

  const [customPage] = await merged.copyPages(customDoc, [0]);
  const [dtdcPage] = await merged.copyPages(dtdcDoc, [0]);

  merged.addPage(customPage);
  merged.addPage(dtdcPage);

  return await merged.save();
}
