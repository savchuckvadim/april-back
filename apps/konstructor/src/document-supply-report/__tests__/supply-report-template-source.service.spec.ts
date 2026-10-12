import { NotFoundException } from '@nestjs/common';
import {
    TemplateCandidate,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import {
    SupplyReportTemplateOrigin,
    SupplyReportTemplateSourceService,
} from '../services/template/supply-report-template-source.service';

const DOMAIN = 'gsr.bitrix24.ru';
const BASE = 'konstructor/templates/supply';
const DOMAIN_NEW = `storage/app/${BASE}/${DOMAIN}/sales_report.docx`;
const COMMON_NEW = `storage/app/${BASE}/sales_report.docx`;
const COMMON_OLD = `storage/app/${BASE}/supply_report_gsr.docx`;
const DB_PATH = `storage/app/${BASE}/from-db.docx`;

const candidate = (over: Partial<TemplateCandidate> = {}): TemplateCandidate =>
    ({
        id: '7',
        filePath: DB_PATH,
        portalId: 7n,
        agentId: null,
        contractType: null,
        clientTypes: null,
        supplyTypes: null,
        requiredFields: null,
        optionalFields: null,
        isDefault: true,
        updatedAt: null,
        createdAt: null,
        ...over,
    }) as TemplateCandidate;

describe('SupplyReportTemplateSourceService', () => {
    let getFilePath: jest.Mock;
    let fileExists: jest.Mock;
    let configGet: jest.Mock;
    let resolveSupplyReport: jest.Mock;
    let service: SupplyReportTemplateSourceService;

    beforeEach(() => {
        getFilePath = jest
            .fn()
            .mockImplementation(
                (_type: unknown, subPath: string, fileName: string) =>
                    `storage/app/${subPath}/${fileName}`,
            );
        // по умолчанию на диске лежит только общий новый шаблон
        fileExists = jest
            .fn()
            .mockImplementation((path: string) =>
                Promise.resolve(path === COMMON_NEW),
            );
        configGet = jest.fn().mockReturnValue(undefined);
        resolveSupplyReport = jest.fn();

        service = new SupplyReportTemplateSourceService(
            { getFilePath, fileExists } as never,
            { get: configGet } as never,
            { resolveSupplyReport } as never,
        );
    });

    describe('флаг ВЫКЛЮЧЕН — зонд по storage как до резолвера', () => {
        it('переопределение под домен важнее общего файла', async () => {
            fileExists.mockImplementation((path: string) =>
                Promise.resolve(path === DOMAIN_NEW || path === COMMON_NEW),
            );

            const result = await service.resolve({ domain: DOMAIN });

            expect(result).toEqual({
                path: DOMAIN_NEW,
                origin: SupplyReportTemplateOrigin.LEGACY,
                templateId: null,
            });
        });

        it('без переопределения берётся общий sales_report.docx', async () => {
            const result = await service.resolve({ domain: DOMAIN });

            expect(result.path).toBe(COMMON_NEW);
            expect(result.origin).toBe(SupplyReportTemplateOrigin.LEGACY);
        });

        it('резолвер не вызывается вовсе', async () => {
            await service.resolve({ domain: DOMAIN });

            expect(resolveSupplyReport).not.toHaveBeenCalled();
        });

        it('настройки состава формы при выключенном флаге нет', async () => {
            const result = await service.resolve({ domain: DOMAIN });

            expect(result.fieldOverrides).toBeUndefined();
        });

        it('нет ни одного файла — внятный 404 с общим путём нового шаблона', async () => {
            fileExists.mockResolvedValue(false);

            await expect(service.resolve({ domain: DOMAIN })).rejects.toThrow(
                NotFoundException,
            );
            await expect(service.resolve({ domain: DOMAIN })).rejects.toThrow(
                COMMON_NEW,
            );
        });

        it('старый supply_report_gsr.docx — последний уровень, а не мёртвый код', async () => {
            fileExists.mockImplementation((path: string) =>
                Promise.resolve(path === COMMON_OLD),
            );

            const result = await service.resolve({ domain: DOMAIN });

            expect(result.path).toBe(COMMON_OLD);
        });

        it('новый файл выигрывает у старого, если лежат оба', async () => {
            fileExists.mockResolvedValue(true);

            const result = await service.resolve({ domain: DOMAIN });

            expect(result.path).toBe(DOMAIN_NEW);
        });
    });

    describe('флаг ВКЛЮЧЁН — БД первым уровнем', () => {
        beforeEach(() => {
            configGet.mockReturnValue('true');
        });

        it('строка из БД: берётся её file_path, storage не трогается', async () => {
            resolveSupplyReport.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: { candidate: candidate(), tuple: {}, reason: 'портал' },
                criteria: {},
            });

            const result = await service.resolve({ domain: DOMAIN });

            expect(result.path).toBe(DB_PATH);
            expect(result.origin).toBe(SupplyReportTemplateOrigin.DB);
            expect(result.templateId).toBe('7');
            expect(fileExists).not.toHaveBeenCalled();
        });

        it('настройка состава формы приезжает из той же строки', async () => {
            resolveSupplyReport.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: {
                    candidate: candidate({
                        requiredFields: ['contract_number'],
                        optionalFields: ['sale_date'],
                    }),
                    tuple: {},
                    reason: 'портал',
                },
                criteria: {},
            });

            const result = await service.resolve({ domain: DOMAIN });

            expect(result.fieldOverrides).toEqual({
                requiredCodes: ['contract_number'],
                optionalCodes: ['sale_date'],
            });
        });

        it('строки нет — зонд по storage остаётся ПОСЛЕДНИМ уровнем', async () => {
            resolveSupplyReport.mockResolvedValue({
                source: TemplateResolutionSource.STORAGE_FALLBACK,
                match: null,
                criteria: {},
            });

            const result = await service.resolve({ domain: DOMAIN });

            expect(result.path).toBe(COMMON_NEW);
            expect(result.origin).toBe(
                SupplyReportTemplateOrigin.STORAGE_FALLBACK,
            );
            expect(result.fieldOverrides).toBeUndefined();
        });

        it('признаки прокидываются в резолвер как есть', async () => {
            resolveSupplyReport.mockResolvedValue({
                source: TemplateResolutionSource.STORAGE_FALLBACK,
                match: null,
                criteria: {},
            });

            await service.resolve({
                domain: DOMAIN,
                providerId: 12,
                supplyType: 'internet',
            });

            expect(resolveSupplyReport).toHaveBeenCalledWith({
                domain: DOMAIN,
                providerId: 12,
                supplyType: 'internet',
            });
        });
    });
});
