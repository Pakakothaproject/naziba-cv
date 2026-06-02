import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, PageBreak, Table, TableRow, TableCell,
  WidthType, ShadingType, convertInchesToTwip,
} from 'docx';

export interface DocxInput {
  cvContent: string;
  letterContent?: string;
  companyName?: string;
  roleName?: string;
  userName?: string;
}

function cleanText(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
}

export async function generateCvDocx(input: DocxInput): Promise<Buffer> {
  const sections: any[] = [];

  // Header section
  sections.push(
    new Paragraph({
      children: [
        new TextRun({ text: input.userName || 'Your Name', bold: true, size: 28, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: input.roleName ? `${input.roleName} at ${input.companyName || 'Company'}` : 'Professional Resume', size: 20, font: 'Calibri', color: '555555' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  // Horizontal rule
  sections.push(
    new Paragraph({
      children: [],
      spacing: { after: 120 },
      thematicBreak: true,
    }),
  );

  const lines = input.cvContent.split('\n');
  let inSection = false;
  let sectionType: 'heading' | 'content' = 'content';
  let first = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (!first) sections.push(new Paragraph({ children: [], spacing: { after: 60 } }));
      continue;
    }
    first = false;

    const clean = cleanText(line);

    // Detect section headings (e.g., ## Summary, **Experience**, or uppercase words at start)
    const isHeading = line.startsWith('#') || line.startsWith('**') ||
      /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|ACHIEVEMENTS|PROFESSIONAL|WORK|TECHNICAL)/.test(clean.toUpperCase()) ||
      /^[A-Z][A-Z\s]{3,}:?$/.test(clean);

    // Detect role headings: "Company | Title | Dates" or "Company — Title"
    const isRole = /\|/.test(line) && line.split('|').length >= 2;

    if (isHeading) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: clean.replace(/^#+\s*/, '').replace(/^[:\s]*/, ''), bold: true, size: 22, font: 'Calibri', color: '1a1a2e' }),
          ],
          spacing: { before: 200, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: '4f46e5' },
          },
        }),
      );
      continue;
    }

    if (isRole) {
      const parts = line.split('|').map(s => s.trim());
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: parts[0], bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: ` — ${parts.slice(1).join(' | ')}`, size: 18, font: 'Calibri', color: '555555' }),
          ],
          spacing: { before: 140, after: 60 },
        }),
      );
      continue;
    }

    // Bullet points
    const isBullet = line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ') || /^\d+\.\s/.test(line);
    if (isBullet) {
      const bulletText = clean.replace(/^[-•*\d]+\.?\s*/, '');
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: '•  ' + bulletText, size: 18, font: 'Calibri' }),
          ],
          spacing: { after: 40 },
          indent: { left: convertInchesToTwip(0.3) },
        }),
      );
      continue;
    }

    // Regular paragraph
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: clean, size: 18, font: 'Calibri' }),
        ],
        spacing: { after: 60 },
      }),
    );
  }

  // Cover letter (append after page break)
  if (input.letterContent) {
    sections.push(new Paragraph({ children: [], spacing: { before: 400 } }));
    sections.push(new Paragraph({ children: [], thematicBreak: true }));
    sections.push(new Paragraph({ children: [], spacing: { after: 200 } }));

    const letterLines = input.letterContent.split('\n');
    for (const raw of letterLines) {
      const line = raw.trim();
      if (!line) { sections.push(new Paragraph({ children: [], spacing: { after: 60 } })); continue; }
      const clean = cleanText(line);

      const isLetterHeading = line.startsWith('#') || line.startsWith('**');
      if (isLetterHeading) {
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: clean.replace(/^#+\s*/, ''), bold: true, size: 20, font: 'Calibri' })],
            spacing: { before: 120, after: 60 },
          }),
        );
        continue;
      }

      sections.push(
        new Paragraph({
          children: [new TextRun({ text: clean, size: 18, font: 'Calibri' })],
          spacing: { after: 80 },
          indent: { firstLine: convertInchesToTwip(0.3) },
        }),
      );
    }
  }

  const doc = new Document({
    title: `CV - ${input.companyName || ''}`,
    description: `CareerCraft AI generated CV for ${input.roleName || ''} at ${input.companyName || ''}`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 18 },
          paragraph: { spacing: { after: 60 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.7),
            right: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.7),
            left: convertInchesToTwip(0.8),
          },
        },
      },
      children: sections,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
