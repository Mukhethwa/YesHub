/**
 * A one-page PDF with a title and lines of text, for seeded sample documents. Hand-built (no PDF library)
 * because it only needs Helvetica text. Non-ASCII characters are replaced so byte offsets stay exact.
 */
export function samplePdf(title: string, lines: string[]) {
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "-");

  const content = [
    "BT",
    "/F1 9 Tf",
    "60 800 Td",
    "(SAMPLE DOCUMENT FOR TESTING - NOT A REAL CERTIFICATE) Tj",
    "/F1 20 Tf",
    "0 -40 Td",
    `(${escape(title)}) Tj`,
    "/F1 11 Tf",
    "0 -32 Td",
    ...lines.flatMap((line) => [`(${escape(line)}) Tj`, "0 -18 Td"]),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
