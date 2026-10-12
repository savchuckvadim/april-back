import { NotFoundException } from '@nestjs/common';
import { StorageType } from '@lib/core/storage';
import {
    TemplateCandidate,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import {
    ContractTemplateOrigin,
    ContractTemplateSourceService,
} from '../services/contract-template-source.service';

/** Файл-шаблон, который использовался на все порталы до резолвера. */
const LEGACY_PATH = 'storage/app/konstructor/templates/contract/template.docx';
const DB_PATH = 'storage/app/konstructor/templates/contract/gsr-abon.docx';

const dto = (over: Partial<ContractGenerateDto> = {}): ContractGenerateDto =>
    ({
        domain: 'gsr.bitrix24.ru',
        providerId: 12,
        contractType: CONTRACT_LTYPE.ABON,
        clientType: ClientTypeEnum.ORG,
        supply: { type: SupplyTypeEnum.INTERNET },
        ...over,
    }) as unknown as ContractGenerateDto;

const candidate = (over: Partial<TemplateCandidate> = {}): TemplateCandidate =>
    ({
        id: '42',
        filePath: DB_PATH,
        portalId: 7n,
        agentId: null,
        contractType: CONTRACT_LTYPE.ABON,
        clientTypes: null,
        supplyTypes: null,
        isDefault: true,
        updatedAt: null,
        createdAt: null,
        ...over,
    }) as TemplateCandidate;

describe('ContractTemplateSourceService', () => {
    // Моки — отдельными const: assert на repo.method ломает
    // @typescript-eslint/unbound-method (см. CLAUDE.md).
    let getFilePath: jest.Mock;
    let configGet: jest.Mock;
    let resolveContract: jest.Mock;
    let service: ContractTemplateSourceService;

    beforeEach(() => {
        getFilePath = jest.fn().mockReturnValue(LEGACY_PATH);
        configGet = jest.fn().mockReturnValue(undefined);
        resolveContract = jest.fn();

        service = new ContractTemplateSourceService(
            { getFilePath } as never,
            { get: configGet } as never,
            { resolveContract } as never,
        );
    });

    describe('флаг ВЫКЛЮЧЕН — легаси-путь не тронут', () => {
        it('без переменной окружения отдаёт тот же единственный файл', async () => {
            const result = await service.resolve(dto());

            expect(result).toEqual({
                path: LEGACY_PATH,
                origin: ContractTemplateOrigin.LEGACY,
                templateId: null,
            });
            expect(getFilePath).toHaveBeenCalledWith(
                StorageType.APP,
                'konstructor/templates/contract',
                'template.docx',
            );
        });

        it('резолвер НЕ вызывается: ни запроса в БД, ни нового отказа', async () => {
            await service.resolve(dto());

            expect(resolveContract).not.toHaveBeenCalled();
        });

        // Опечатка в env не должна включать новый путь молча.
        it.each(['false', '0', 'yes', 'on', '', 'ДА', 'truthy'])(
            'значение %p оставляет легаси-путь',
            async raw => {
                configGet.mockReturnValue(raw);

                const result = await service.resolve(dto());

                expect(result.origin).toBe(ContractTemplateOrigin.LEGACY);
                expect(resolveContract).not.toHaveBeenCalled();
            },
        );
    });

    describe('флаг ВКЛЮЧЁН', () => {
        beforeEach(() => {
            configGet.mockReturnValue('true');
        });

        it('попадание в БД: берётся file_path найденной строки', async () => {
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: { candidate: candidate(), tuple: {}, reason: 'портал' },
                criteria: {},
            });

            const result = await service.resolve(dto());

            expect(result).toEqual({
                path: DB_PATH,
                origin: ContractTemplateOrigin.DB,
                templateId: '42',
            });
            // файл из storage не трогаем вовсе
            expect(getFilePath).not.toHaveBeenCalled();
        });

        it('признаки уходят в резолвер из DTO, тип поставки — из supply.type', async () => {
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: { candidate: candidate(), tuple: {}, reason: 'портал' },
                criteria: {},
            });

            await service.resolve(dto());

            expect(resolveContract).toHaveBeenCalledWith({
                domain: 'gsr.bitrix24.ru',
                providerId: 12,
                contractType: CONTRACT_LTYPE.ABON,
                clientType: ClientTypeEnum.ORG,
                supplyType: SupplyTypeEnum.INTERNET,
            });
        });

        it('storage-fallback: у портала нет шаблонов — тот же легаси-файл', async () => {
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.STORAGE_FALLBACK,
                match: null,
                criteria: {},
            });

            const result = await service.resolve(dto());

            expect(result).toEqual({
                path: LEGACY_PATH,
                origin: ContractTemplateOrigin.STORAGE_FALLBACK,
                templateId: null,
            });
            expect(getFilePath).toHaveBeenCalledWith(
                StorageType.APP,
                'konstructor/templates/contract',
                'template.docx',
            );
        });

        it('source=DB без победителя тоже уводит на файл, а не на undefined-путь', async () => {
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: null,
                criteria: {},
            });

            const result = await service.resolve(dto());

            expect(result.path).toBe(LEGACY_PATH);
            expect(result.origin).toBe(ContractTemplateOrigin.STORAGE_FALLBACK);
        });

        it('отказ резолвера НЕ глушится: шаблона под тип договора нет — это пробел настройки', async () => {
            resolveContract.mockRejectedValue(
                new NotFoundException('нет шаблона под тип'),
            );

            await expect(service.resolve(dto())).rejects.toBeInstanceOf(
                NotFoundException,
            );
            // подменять юридический документ универсальным файлом нельзя
            expect(getFilePath).not.toHaveBeenCalled();
        });

        it('флаг читается на каждый вызов, а не кэшируется в конструкторе', async () => {
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: { candidate: candidate(), tuple: {}, reason: 'портал' },
                criteria: {},
            });

            await service.resolve(dto());
            configGet.mockReturnValue('false');
            const afterOff = await service.resolve(dto());

            expect(afterOff.origin).toBe(ContractTemplateOrigin.LEGACY);
            expect(configGet).toHaveBeenCalledWith('USE_DB_CONTRACT_TEMPLATES');
        });

        it('значение 1 тоже включает подбор', async () => {
            configGet.mockReturnValue('1');
            resolveContract.mockResolvedValue({
                source: TemplateResolutionSource.DB,
                match: { candidate: candidate(), tuple: {}, reason: 'портал' },
                criteria: {},
            });

            const result = await service.resolve(dto());

            expect(result.origin).toBe(ContractTemplateOrigin.DB);
        });
    });
});
