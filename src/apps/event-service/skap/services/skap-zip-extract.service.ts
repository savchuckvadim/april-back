import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SkapExcelParseService } from './skap-excel-parse.service';
import {
    SkapParseZipResponseDto,
    SkapParsedFileDto,
} from '../types/skap-report.types';

/**
 * Только ZIP: распаковка и поиск *.Online.csv по фрагменту даты.
 */
@Injectable()
export class SkapZipExtractService {
    private readonly logger = new Logger(SkapZipExtractService.name);

    constructor(private readonly excelParse: SkapExcelParseService) {}

    /**
     * Распаковывает ZIP, ищет *.Online.csv с фрагментом даты в имени,
     * отдаёт строки через {@link SkapExcelParseService}.
     */
    async parseZipBuffer(
        zipBuffer: Buffer,
        dateDdMmYyyy: string,
    ): Promise<SkapParseZipResponseDto> {
        const parts = dateDdMmYyyy.split('.');
        if (parts.length !== 3) {
            throw new Error(
                `Ожидается дата в формате DD.MM.YYYY, получено: ${dateDdMmYyyy}`,
            );
        }
        const dateFragment = `${parts[2]}.${parts[1]}`;

        const extractRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), 'skap-zip-'),
        );
        try {
            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(extractRoot, true);

            const allFiles = await this.listFilesRecursive(extractRoot);
            const targets = allFiles.filter(
                f =>
                    f.toLowerCase().includes('.online.csv') &&
                    path.basename(f).includes(dateFragment),
            );

            const files: SkapParsedFileDto[] = [];
            for (const abs of targets) {
                const rel = path.relative(extractRoot, abs);
                const buf = await fs.readFile(abs);
                const rows = this.excelParse.parseOnlineRowsFromCsvBuffer(buf);
                files.push({
                    relativePath: rel.split(path.sep).join('/'),
                    rows,
                });
            }

            return {
                date: dateDdMmYyyy,
                dateFragment,
                files,
            };
        } finally {
            await fs
                .rm(extractRoot, { recursive: true, force: true })
                .catch(err =>
                    this.logger.warn(
                        `Не удалось удалить ${extractRoot}: ${err}`,
                    ),
                );
        }
    }

    private async listFilesRecursive(root: string): Promise<string[]> {
        const out: string[] = [];
        const walk = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) {
                    await walk(p);
                } else {
                    out.push(p);
                }
            }
        };
        await walk(root);
        return out;
    }
}
