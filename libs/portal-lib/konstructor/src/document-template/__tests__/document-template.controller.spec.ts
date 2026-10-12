import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    DocumentTemplateKind,
    TemplateCriteria,
    TemplateResolutionSource,
} from '../document-template.criteria';
import { DocumentTemplateController } from '../document-template.controller';
import {
    DocumentTemplateService,
    ResolvedTemplate,
} from '../document-template.service';
import { DocumentTemplateDiagnosticsService } from '../document-template-diagnostics.service';

const DOMAIN = 'gsr.bitrix24.ru';

const criteria = (over: Partial<TemplateCriteria> = {}): TemplateCriteria => ({
    portalId: BigInt(7),
    agentId: null,
    contractType: null,
    clientType: null,
    supplyType: null,
    ...over,
});

const dbHit = (over: Partial<TemplateCriteria> = {}): ResolvedTemplate => ({
    source: TemplateResolutionSource.DB,
    match: {
        candidate: {
            id: '42',
            filePath: 'konstructor/templates/any.docx',
            portalId: BigInt(7),
            agentId: null,
            contractType: CONTRACT_LTYPE.ABON,
            clientTypes: null,
            supplyTypes: null,
            isDefault: true,
            updatedAt: null,
            createdAt: null,
        },
        tuple: {
            portalExact: 1,
            agentExact: 0,
            supplyExact: 0,
            clientExact: 0,
            isDefault: 1,
            recency: 0,
        },
        reason: 'Подобран по: портал, любой поставщик, по умолчанию',
    },
    criteria: criteria(over),
});

const storageFallback = (): ResolvedTemplate => ({
    source: TemplateResolutionSource.STORAGE_FALLBACK,
    match: null,
    criteria: criteria(),
});

describe('DocumentTemplateController', () => {
    // Моки — отдельными const-ами, и assert-ы на них:
    // expect(repo.method) ломает @typescript-eslint/unbound-method.
    let resolveContract: jest.Mock;
    let resolveSupplyReport: jest.Mock;
    let resolveInvoice: jest.Mock;
    let findAmbiguities: jest.Mock;
    let controller: DocumentTemplateController;

    beforeEach(() => {
        resolveContract = jest.fn();
        resolveSupplyReport = jest.fn();
        resolveInvoice = jest.fn();
        findAmbiguities = jest.fn();

        const service = {
            resolveContract,
            resolveSupplyReport,
            resolveInvoice,
        } as unknown as DocumentTemplateService;

        const diagnostics = {
            findAmbiguities,
        } as unknown as DocumentTemplateDiagnosticsService;

        controller = new DocumentTemplateController(service, diagnostics);
    });

    describe('GET resolve/contract', () => {
        it('попадание в БД: отдаёт id строкой, источник db и причину', async () => {
            resolveContract.mockResolvedValue(
                dbHit({ contractType: CONTRACT_LTYPE.ABON }),
            );

            const result = await controller.resolveContract({
                domain: DOMAIN,
                contractType: CONTRACT_LTYPE.ABON,
            });

            expect(result.source).toBe(TemplateResolutionSource.DB);
            expect(result.templateId).toBe('42');
            expect(result.reason).toContain('Подобран по');
            expect(resolveContract).toHaveBeenCalledWith({
                domain: DOMAIN,
                contractType: CONTRACT_LTYPE.ABON,
            });
        });

        it('bigint-поля критериев уходят СТРОКАМИ (BigInt не сериализуется в JSON)', async () => {
            resolveContract.mockResolvedValue(
                dbHit({
                    agentId: BigInt(42),
                    contractType: CONTRACT_LTYPE.LIC,
                    clientType: ClientTypeEnum.ORG,
                    supplyType: SupplyTypeEnum.INTERNET,
                }),
            );

            const result = await controller.resolveContract({
                domain: DOMAIN,
                contractType: CONTRACT_LTYPE.LIC,
            });

            expect(result.criteria.portalId).toBe('7');
            expect(result.criteria.agentId).toBe('42');
            expect(typeof result.criteria.portalId).toBe('string');
            expect(typeof result.criteria.agentId).toBe('string');
            // JSON.stringify и есть та операция, на которой падал бы BigInt.
            expect(() => JSON.stringify(result)).not.toThrow();
        });

        it('400 от сервиса пробрасывается как есть (нет типа договора)', async () => {
            resolveContract.mockRejectedValue(
                new BadRequestException('Не передан тип договора'),
            );

            await expect(
                controller.resolveContract({
                    domain: DOMAIN,
                } as never),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('404 от сервиса пробрасывается: шаблоны есть, но под этот тип нет', async () => {
            resolveContract.mockRejectedValue(
                new NotFoundException('У портала нет шаблона договора'),
            );

            await expect(
                controller.resolveContract({
                    domain: DOMAIN,
                    contractType: CONTRACT_LTYPE.KEY,
                }),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('GET resolve/supply-report', () => {
        it('откат на storage: templateId null, причина объясняет режим', async () => {
            resolveSupplyReport.mockResolvedValue(storageFallback());

            const result = await controller.resolveSupplyReport({
                domain: DOMAIN,
            });

            expect(result.source).toBe(
                TemplateResolutionSource.STORAGE_FALLBACK,
            );
            expect(result.templateId).toBeNull();
            expect(result.reason).toContain('storage');
            expect(resolveSupplyReport).toHaveBeenCalledWith({
                domain: DOMAIN,
            });
        });

        it('портал по домену не найден — критерии отдают portalId null, без ошибки', async () => {
            resolveSupplyReport.mockResolvedValue({
                ...storageFallback(),
                criteria: criteria({ portalId: null }),
            });

            const result = await controller.resolveSupplyReport({
                domain: 'unknown.example.com',
            });

            expect(result.criteria.portalId).toBeNull();
        });
    });

    describe('GET resolve/invoice', () => {
        it('попадание в БД', async () => {
            resolveInvoice.mockResolvedValue(dbHit());

            const result = await controller.resolveInvoice({ domain: DOMAIN });

            expect(result.templateId).toBe('42');
            expect(resolveInvoice).toHaveBeenCalledWith({ domain: DOMAIN });
        });
    });

    describe('GET diagnostics/ambiguous', () => {
        it('portalId не передан — в сервис уходит null (справочник целиком)', async () => {
            findAmbiguities.mockResolvedValue({
                portalId: null,
                ambiguous: [],
                reliesOnCommon: [],
            });

            const result = await controller.findAmbiguous({});

            expect(findAmbiguities).toHaveBeenCalledWith(null);
            expect(result.ambiguous).toEqual([]);
        });

        it('portalId передан числом — в сервис уходит BigInt', async () => {
            findAmbiguities.mockResolvedValue({
                portalId: '7',
                ambiguous: [],
                reliesOnCommon: [DocumentTemplateKind.SUPPLY_REPORT],
            });

            const result = await controller.findAmbiguous({ portalId: 7 });

            expect(findAmbiguities).toHaveBeenCalledWith(BigInt(7));
            expect(result.portalId).toBe('7');
            expect(result.reliesOnCommon).toEqual([
                DocumentTemplateKind.SUPPLY_REPORT,
            ]);
        });

        it('конфликтный ящик доезжает до ответа целиком', async () => {
            findAmbiguities.mockResolvedValue({
                portalId: null,
                ambiguous: [
                    {
                        kind: DocumentTemplateKind.CONTRACT,
                        portalId: null,
                        agentId: null,
                        contractType: CONTRACT_LTYPE.ABON,
                        clientTypes: null,
                        supplyTypes: null,
                        defaultCount: 2,
                        templateIds: ['17', '42'],
                        isCommon: true,
                    },
                ],
                reliesOnCommon: [],
            });

            const result = await controller.findAmbiguous({});

            expect(result.ambiguous).toHaveLength(1);
            expect(result.ambiguous[0].defaultCount).toBe(2);
            expect(result.ambiguous[0].templateIds).toEqual(['17', '42']);
            expect(result.ambiguous[0].isCommon).toBe(true);
            expect(() => JSON.stringify(result)).not.toThrow();
        });
    });
});
