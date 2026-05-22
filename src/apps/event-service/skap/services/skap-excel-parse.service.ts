import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import iconv from 'iconv-lite';
import * as path from 'path';
import { Readable } from 'stream';
import {
    SkapParseZipResponseDto,
    SkapParsedFileDto,
    SkapReportRowDto,
} from '../types/skap-report.types';

/**
 * Распакованные Online-файлы: .csv / .txt (cp1251 / UTF-8 BOM) и .xlsx.
 */
@Injectable()
export class SkapExcelParseService {
    /**
     * Один файл (.csv / .txt / .xlsx) → тот же JSON-конверт, что после ZIP.
     */
    async parsePlainUpload(
        buffer: Buffer,
        originalFilename: string,
        dateDdMmYyyy?: string,
    ): Promise<SkapParseZipResponseDto> {
        const parsed = await this.parsePlainFileBuffer(
            buffer,
            originalFilename,
        );
        const date = dateDdMmYyyy?.trim() ?? '';
        const parts = date.split('.');
        const dateFragment =
            parts.length === 3 ? `${parts[2]}.${parts[1]}` : '';
        return {
            date,
            dateFragment,
            files: [parsed],
        };
    }

    /** Буфер файла из ZIP → текст + строки отчёта. */
    parseOnlineRowsFromCsvBuffer(buffer: Buffer): SkapReportRowDto[] {
        const text = this.decodeCsvLikeBuffer(buffer);
        return this.parseOnlineCsv(text);
    }

    private async parsePlainFileBuffer(
        buffer: Buffer,
        originalFilename: string,
    ): Promise<SkapParsedFileDto> {
        const ext = path.extname(originalFilename).toLowerCase();
        const base = path.basename(originalFilename) || 'upload';

        if (ext === '.xlsx') {
            const rows = await this.parseOnlineXlsx(buffer);
            return { relativePath: base, rows };
        }

        if (ext === '.csv' || ext === '.txt' || ext === '') {
            return {
                relativePath: base,
                rows: this.parseOnlineRowsFromCsvBuffer(buffer),
            };
        }

        throw new Error(
            `Неподдерживаемый формат файла: ${ext || '(пусто)'}. Допустимы .csv, .txt, .xlsx`,
        );
    }

    decodeCsvLikeBuffer(buffer: Buffer): string {
        if (
            buffer.length >= 3 &&
            buffer[0] === 0xef &&
            buffer[1] === 0xbb &&
            buffer[2] === 0xbf
        ) {
            return buffer.subarray(3).toString('utf8');
        }
        return iconv.decode(buffer, 'win1251');
    }

    private async parseOnlineXlsx(buffer: Buffer): Promise<SkapReportRowDto[]> {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.read(Readable.from(buffer));
        const ws = wb.worksheets[0];
        if (!ws) {
            return [];
        }
        const out: SkapReportRowDto[] = [];
        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                const t = row.getCell(1).text?.toLowerCase() ?? '';
                if (t.includes('номер карточки рп')) {
                    return;
                }
            }
            const parts = this.rowToSemicolonParts(row);
            if (parts.every(p => !p)) {
                return;
            }
            if (parts.length < 14) {
                return;
            }
            if (parts[0].toLowerCase().includes('номер карточки рп')) {
                return;
            }
            out.push({
                reg: parts[2]?.trim() ?? '',
                login: parts[9]?.trim() ?? '',
                countScap: parts[10]?.trim() ?? '',
                timeMs: this.parseTimedeltaToMs(parts[13]?.trim() ?? '0:00:00'),
            });
        });
        return out;
    }

    private rowToSemicolonParts(row: ExcelJS.Row): string[] {
        const parts: string[] = [];
        for (let c = 1; c <= 14; c++) {
            parts.push(row.getCell(c).text?.trim() ?? '');
        }
        const onlyFirst = parts[0] ?? '';
        if (onlyFirst.includes(';') && parts.slice(1).every(p => !p)) {
            return onlyFirst.split(';').map(s => s.trim());
        }
        return parts;
    }

    private parseOnlineCsv(text: string): SkapReportRowDto[] {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const rows: SkapReportRowDto[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.length) {
                continue;
            }
            if (trimmed.toLowerCase().includes('номер карточки рп')) {
                continue;
            }
            const parts = trimmed.split(';');
            if (parts.length < 14) {
                continue;
            }
            rows.push({
                reg: parts[2]?.trim() ?? '',
                login: parts[9]?.trim() ?? '',
                countScap: parts[10]?.trim() ?? '',
                timeMs: this.parseTimedeltaToMs(parts[13]?.trim() ?? '0:00:00'),
            });
        }
        return rows;
    }

    private parseTimedeltaToMs(timeStr: string): number {
        let days = 0;
        let rest = timeStr.trim();
        const daysMatch = rest.match(/^(\d+)\s+days?\s+/i);
        if (daysMatch) {
            days = parseInt(daysMatch[1], 10);
            rest = rest.slice(daysMatch[0].length);
        }
        const timeParts = rest.split(':');
        if (timeParts.length < 3) {
            return (((days * 24 + 0) * 60 + 0) * 60 + 0) * 1000;
        }
        const hours = parseInt(timeParts[0], 10) || 0;
        const minutes = parseInt(timeParts[1], 10) || 0;
        let seconds = 0;
        let ms = 0;
        const secPart = timeParts[2];
        if (secPart.includes('.')) {
            const [s, m] = secPart.split('.');
            seconds = parseInt(s, 10) || 0;
            ms = parseInt((m || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
        } else {
            seconds = parseInt(secPart, 10) || 0;
        }
        const totalMs =
            (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + ms;
        return totalMs;
    }
}
