import { PDFDocument } from "pdf-lib";

export async function mergePDFs(customPdf: Uint8Array, dtdcPdf: Uint8Array) {
  // Load PDFs
  const customDoc = await PDFDocument.load(customPdf);
  const dtdcDoc = await PDFDocument.load(dtdcPdf);

  // Create merged PDF
  const merged = await PDFDocument.create();

  // Copy first page of custom label
  const customPages = await merged.copyPages(customDoc, [0]);
  merged.addPage(customPages[0]);

  // Copy first page of DTDC label
  const dtdcPages = await merged.copyPages(dtdcDoc, [0]);
  merged.addPage(dtdcPages[0]);

  // Return merged PDF bytes
  return await merged.save();
}
