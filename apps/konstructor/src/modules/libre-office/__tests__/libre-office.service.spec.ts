import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LibreOfficeMode } from '../config/libre-office.config';
import { LibreOfficeBusyError } from '../errors/libre-office.errors';
import { LibreOfficeService } from '../libre-office.service';
import { LibreOfficeEndpointPool } from '../services/libre-office-endpoint-pool.service';
import { LibreOfficeExecConverter } from '../services/libre-office-exec.converter';
import { LibreOfficeHttpConverter } from '../services/libre-office-http.converter';
import {
    MetricsStub,
    asMetrics,
    libreOfficeConfig,
    stubMetrics,
    stubResolver,
} from './libre-office.fixtures';

describe('LibreOfficeService', () => {
    let dir: string;
    let docxPath: string;
    let http: { convert: jest.Mock };
    let exec: { convert: jest.Mock };
    let metrics: MetricsStub;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'libre-office-facade-'));
        docxPath = join(dir, 'offer.docx');
        await writeFile(docxPath, 'x');
        http = { convert: jest.fn().mockResolvedValue('http.pdf') };
        exec = { convert: jest.fn().mockResolvedValue('exec.pdf') };
        metrics = stubMetrics();
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    function build(mode: LibreOfficeMode): LibreOfficeService {
        const config = libreOfficeConfig({
            mode,
            endpoints: ['http://a:3000'],
        });
        return new LibreOfficeService(
            config,
            http as unknown as LibreOfficeHttpConverter,
            exec as unknown as LibreOfficeExecConverter,
            new LibreOfficeEndpointPool(
                config,
                stubResolver(() => Promise.resolve(config.endpoints)),
            ),
            asMetrics(metrics),
        );
    }

    it('в режиме http использует HTTP-конвертер', async () => {
        await expect(build('http').convertToPdf(docxPath)).resolves.toBe(
            'http.pdf',
        );

        expect(http.convert).toHaveBeenCalledWith(docxPath, dir, undefined);
        expect(exec.convert).not.toHaveBeenCalled();
    });

    it('в режиме exec использует локальный soffice', async () => {
        await expect(build('exec').convertToPdf(docxPath)).resolves.toBe(
            'exec.pdf',
        );

        expect(exec.convert).toHaveBeenCalledWith(docxPath, dir, undefined);
        expect(http.convert).not.toHaveBeenCalled();
    });

    it('прокидывает сигнал отмены в конвертер', async () => {
        const controller = new AbortController();

        await build('http').convertToPdf(
            docxPath,
            undefined,
            controller.signal,
        );

        expect(http.convert).toHaveBeenCalledWith(
            docxPath,
            dir,
            controller.signal,
        );
    });

    it('падает, если исходного файла нет', async () => {
        await expect(
            build('http').convertToPdf(join(dir, 'нет-такого.docx')),
        ).rejects.toThrow('Input file not found');
    });

    it('создаёт выходную папку, если её ещё нет', async () => {
        const outputDir = join(dir, 'nested', 'pdf');

        await build('http').convertToPdf(docxPath, outputDir);

        expect(existsSync(outputDir)).toBe(true);
        expect(http.convert).toHaveBeenCalledWith(
            docxPath,
            outputDir,
            undefined,
        );
    });

    it('отдаёт статистику пула для диагностики', () => {
        expect(build('http').poolStats()).toEqual({
            endpoints: 1,
            capacity: 1,
            active: 0,
            pending: 0,
            cooling: 0,
        });
    });

    describe('метрики', () => {
        it('пишет успешную конвертацию и состояние пула', async () => {
            await build('http').convertToPdf(docxPath);

            expect(metrics.observeConversion).toHaveBeenCalledWith(
                expect.any(Number),
                'ok',
            );
            expect(metrics.countError).not.toHaveBeenCalled();
            expect(metrics.syncPool).toHaveBeenCalledWith(
                expect.objectContaining({ capacity: 1 }),
            );
        });

        it('размечает ошибку по причине', async () => {
            http.convert.mockRejectedValue(new LibreOfficeBusyError(5, 5));

            await expect(
                build('http').convertToPdf(docxPath),
            ).rejects.toThrow();

            expect(metrics.observeConversion).toHaveBeenCalledWith(
                expect.any(Number),
                'error',
            );
            expect(metrics.countError).toHaveBeenCalledWith('busy');
            expect(metrics.syncPool).toHaveBeenCalled();
        });
    });
});
