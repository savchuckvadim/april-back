import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { Workbook } from 'exceljs';

const TEXT_EXTENSIONS = new Set(['.txt', '.md']);
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.txt', '.md']);

@Injectable()
export class FileLoaderService {
    private readonly logger = new Logger(FileLoaderService.name);

    isSupported(filePath: string): boolean {
        return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    }

    async extractText(filePath: string): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.pdf') {
            return this.extractPdf(filePath);
        }
        if (ext === '.docx') {
            return this.extractDocx(filePath);
        }
        if (ext === '.xlsx') {
            return this.extractXlsx(filePath);
        }
        if (TEXT_EXTENSIONS.has(ext)) {
            return this.extractPlainText(filePath);
        }

        throw new Error(`Неподдерживаемый тип файла: ${filePath}`);
    }

    private async extractPdf(filePath: string): Promise<string> {
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);
        return parsed.text ?? '';
    }

    private async extractDocx(filePath: string): Promise<string> {
        const parsed = await mammoth.extractRawText({ path: filePath });
        return parsed.value ?? '';
    }

    private async extractPlainText(filePath: string): Promise<string> {
        return fs.readFile(filePath, 'utf-8');
    }

    private async extractXlsx(filePath: string): Promise<string> {
        const workbook = new Workbook();
        await workbook.xlsx.readFile(filePath);

        const parts: string[] = [];

        workbook.eachSheet(worksheet => {
            const sheetName = worksheet.name;
            const sheetLines: string[] = [`# Лист: ${sheetName}`];

            worksheet.eachRow({ includeEmpty: false }, row => {
                const cells: string[] = [];
                row.eachCell({ includeEmpty: true }, cell => {
                    cells.push(this.cellToString(cell.value));
                });
                const line = cells.join('\t').trim();
                if (line.length > 0) {
                    sheetLines.push(line);
                }
            });

            parts.push(sheetLines.join('\n'));
        });

        return parts.join('\n\n');
    }

    private cellToString(value: unknown): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (value instanceof Date) return value.toISOString();

        if (typeof value === 'object') {
            const record = value as Record<string, unknown>;
            if (typeof record.text === 'string') return record.text;
            if (typeof record.result !== 'undefined') {
                return this.cellToString(record.result);
            }
            if (Array.isArray(record.richText)) {
                return record.richText
                    .map(part => {
                        const fragment = part as { text?: unknown };
                        return typeof fragment.text === 'string'
                            ? fragment.text
                            : '';
                    })
                    .join('');
            }
            if (typeof record.formula === 'string') return record.formula;
        }

        return '';
    }
}
