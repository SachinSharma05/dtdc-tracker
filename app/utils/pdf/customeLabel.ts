import jsPDF from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";

// Generate QR and Barcode
async function generateQR(awb: string) {
  // QR contains tracking link + AWB
  const qrData = `AWB:${awb}\nTrack: https://www.dtdc.in/tracking/tracking_results.asp?strCNNo=${awb}`;

  return await QRCode.toDataURL(qrData, {
    margin: 1,
    width: 200,
  });
}

async function generateBarcode(awb: string) {
  const canvas = createCanvas(300, 80);
  JsBarcode(canvas, awb, {
    format: "CODE128",
    displayValue: true,
    fontSize: 18,
    height: 60,
  });

  return canvas.toDataURL("image/png");
}

export async function generateCustomLabel({
  awb,
  company,
  address,
  phone,
}: {
  awb: string;
  company: string;
  address: string;
  phone: string;
}) {
  const pdf = new jsPDF({ unit: "mm", format: [100, 120] });

  // ---------- Header ----------
  pdf.setFontSize(18);
  pdf.text(company, 10, 15);

  pdf.setFontSize(10);
  pdf.text(address, 10, 22);
  pdf.text(`Phone: ${phone}`, 10, 28);

  pdf.setLineWidth(0.4);
  pdf.line(10, 33, 90, 33);

  // ---------- QR Code ----------
  const qrBase64 = await generateQR(awb);
  pdf.addImage(qrBase64, "PNG", 65, 10, 25, 25); // top-right corner

  // ---------- AWB ----------
  pdf.setFontSize(16);
  pdf.text(`AWB: ${awb}`, 10, 45);

  pdf.setFontSize(11);
  pdf.text("Scan QR for tracking", 10, 52);

  // ---------- Barcode ----------
  const barcodeBase64 = await generateBarcode(awb);
  pdf.addImage(barcodeBase64, "PNG", 10, 60, 80, 22);

  // Footer Message
  pdf.setFontSize(9);
  pdf.text("Thank you for shipping with us!", 10, 88);

  return pdf.output("arraybuffer");
}
