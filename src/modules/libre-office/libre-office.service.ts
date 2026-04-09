import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { basename, dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

const execAsync = promisify(exec);

/** Локальный soffice или HTTP-сервис (например Gotenberg с LibreOffice внутри). */
export type LibreOfficeMode = 'exec' | 'http';

@Injectable()
export class LibreOfficeService {
    private readonly logger = new Logger(LibreOfficeService.name);
    private readonly mode: LibreOfficeMode;
    private readonly httpBaseUrl: string;

    constructor(private readonly configService: ConfigService) {
        const mode = this.configService
            .get<string>('LIBREOFFICE_MODE', 'exec')
            .toLowerCase()
            .trim();
        this.mode = mode === 'http' ? 'http' : 'exec';
        this.httpBaseUrl = this.configService
            .get<string>('LIBREOFFICE_HTTP_URL', 'http://127.0.0.1:33030')
            .replace(/\/$/, '');
    }

    /**
     * DOCX → PDF.
     * - exec: локальный `soffice` (как в контейнере API с установленным LibreOffice).
     * - http: POST на Gotenberg `/forms/libreoffice/convert` (см. docker-compose-dev.yml).
     */
    async convertToPdf(inputPath: string, outputDir?: string): Promise<string> {
        if (!existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }

        if (this.mode === 'http') {
            return this.convertToPdfViaHttp(inputPath, outputDir);
        }

        return this.convertToPdfViaExec(inputPath, outputDir);
    }

    private async convertToPdfViaExec(
        inputPath: string,
        outputDir?: string,
    ): Promise<string> {
        const outputFolder = outputDir || dirname(inputPath);
        if (!existsSync(outputFolder)) {
            mkdirSync(outputFolder, { recursive: true });
        }

        const command = `soffice --headless --convert-to pdf --outdir "${outputFolder}" "${inputPath}"`;

        this.logger.log(`Executing command: ${command}`);
        try {
            await execAsync(command);
            const outputFilePath = join(
                outputFolder,
                this.replaceExtension(basename(inputPath), '.pdf'),
            );
            if (!existsSync(outputFilePath)) {
                throw new Error('Conversion failed: PDF not found');
            }
            return outputFilePath;
        } catch (error) {
            this.logger.error('LibreOffice conversion error', error);
            throw error;
        }
    }

    private async convertToPdfViaHttp(
        inputPath: string,
        outputDir?: string,
    ): Promise<string> {
        const outputFolder = outputDir || dirname(inputPath);
        if (!existsSync(outputFolder)) {
            mkdirSync(outputFolder, { recursive: true });
        }

        const name = basename(inputPath);
        const docxBuf = await readFile(inputPath);
        const form = new FormData();
        form.append('files', new Blob([new Uint8Array(docxBuf)]), name);

        const url = `${this.httpBaseUrl}/forms/libreoffice/convert`;
        this.logger.log(`POST ${url} (${name})`);

        const res = await fetch(url, { method: 'POST', body: form });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(
                `LibreOffice HTTP convert failed (${res.status}): ${text.slice(0, 500)}`,
            );
        }

        const pdfBuf = Buffer.from(await res.arrayBuffer());
        const pdfName = this.replaceExtension(name, '.pdf');
        const outputFilePath = join(outputFolder, pdfName);
        await writeFile(outputFilePath, pdfBuf);
        return outputFilePath;
    }

    private replaceExtension(filePath: string, newExt: string): string {
        return filePath.replace(/\.[^/.]+$/, newExt);
    }
}
