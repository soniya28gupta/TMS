import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type Column = { key: string; header: string; width?: number };
export type Row = Record<string, string | number | null | undefined>;

function filename(base: string, ext: string): string {
  return `${base.replace(/[^a-z0-9-_]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export async function sendExcel(
  res: Response,
  opts: { title: string; columns: Column[]; rows: Row[]; subtitle?: string },
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Task Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(opts.title.slice(0, 30));
  sheet.columns = opts.columns.map((c) => ({ key: c.key, header: c.header, width: c.width ?? 22 }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 22;

  opts.rows.forEach((row) => sheet.addRow(row));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: opts.columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename(opts.title, 'xlsx')}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function sendCsv(res: Response, opts: { title: string; columns: Column[]; rows: Row[] }): void {
  const escape = (value: unknown): string => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [
    opts.columns.map((c) => escape(c.header)).join(','),
    ...opts.rows.map((row) => opts.columns.map((c) => escape(row[c.key])).join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename(opts.title, 'csv')}"`);
  // BOM keeps Excel happy with non-ASCII names.
  res.send(`﻿${lines.join('\n')}`);
}

export function sendPdf(
  res: Response,
  opts: { title: string; columns: Column[]; rows: Row[]; subtitle?: string },
): void {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename(opts.title, 'pdf')}"`);
  doc.pipe(res);

  doc.fontSize(16).fillColor('#111827').text(opts.title);
  if (opts.subtitle) doc.moveDown(0.2).fontSize(9).fillColor('#6b7280').text(opts.subtitle);
  doc.moveDown(0.6);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / opts.columns.length;
  const rowHeight = 18;

  const drawHeader = (y: number): number => {
    doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#2563eb');
    doc.fillColor('#ffffff').fontSize(8);
    opts.columns.forEach((col, i) => {
      doc.text(col.header, doc.page.margins.left + i * colWidth + 4, y + 5, {
        width: colWidth - 8,
        ellipsis: true,
      });
    });
    return y + rowHeight;
  };

  let y = drawHeader(doc.y);

  opts.rows.forEach((row, index) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
    if (index % 2 === 1) {
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#f3f4f6');
    }
    doc.fillColor('#111827').fontSize(8);
    opts.columns.forEach((col, i) => {
      const value = row[col.key];
      doc.text(value === null || value === undefined ? '' : String(value), doc.page.margins.left + i * colWidth + 4, y + 5, {
        width: colWidth - 8,
        ellipsis: true,
      });
    });
    y += rowHeight;
  });

  doc.fontSize(8).fillColor('#9ca3af').text(
    `Generated ${new Date().toISOString().replace('T', ' ').slice(0, 16)} · ${opts.rows.length} row(s)`,
    doc.page.margins.left,
    doc.page.height - doc.page.margins.bottom - 12,
  );

  doc.end();
}

/** Single entry point used by every report endpoint. */
export async function sendExport(
  res: Response,
  format: string,
  payload: { title: string; columns: Column[]; rows: Row[]; subtitle?: string },
): Promise<boolean> {
  if (format === 'xlsx') {
    await sendExcel(res, payload);
    return true;
  }
  if (format === 'csv') {
    sendCsv(res, payload);
    return true;
  }
  if (format === 'pdf') {
    sendPdf(res, payload);
    return true;
  }
  return false;
}
