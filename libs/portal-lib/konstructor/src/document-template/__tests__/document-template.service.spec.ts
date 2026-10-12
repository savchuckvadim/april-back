import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    DocumentTemplateKind,
    TemplateCandidate,
    TemplateResolutionSource,
} from '../document-template.criteria';
import { DocumentTemplateRepository } from '../document-template.repository';
import { DocumentTemplateService } from '../document-template.service';

const DOMAIN = 'gsr.bitrix24.ru';
const PORTAL_ID = 7;

const candidate = (
    over: Partial<TemplateCandidate> & { id: string },
): TemplateCandidate => ({
    filePath: 'konstructor/templates/any.docx',
    portalId: null,
    agentId: null,
    contractType: null,
    clientTypes: null,
    supplyTypes: null,
    isDefault: false,
    updatedAt: null,
    createdAt: null,
    ...over,
});

describe('DocumentTemplateService', () => {
    let findCandidates: jest.Mock;
    let hasAnyForPortal: jest.Mock;
    let repository: jest.Mocked<DocumentTemplateRepository>;
    let portalStore: { getPortalByDomain: jest.Mock };
    let service: DocumentTemplateService;

    beforeEach(() => {
        findCandidates = jest.fn();
        hasAnyForPortal = jest.fn();
        repository = {
            findCandidates,
            hasAnyForPortal,
        } as unknown as jest.Mocked<DocumentTemplateRepository>;

        portalStore = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: PORTAL_ID }),
        };

        service = new DocumentTemplateService(repository, portalStore as never);
    });

    describe('buildCriteria', () => {
        it('переводит domain в portal_id', async () => {
            const criteria = await service.buildCriteria({ domain: DOMAIN });
            expect(criteria.portalId).toBe(BigInt(PORTAL_ID));
        });

        it('портал не найден — ищем только среди общих, без исключения', async () => {
            portalStore.getPortalByDomain.mockResolvedValue(null);
            const criteria = await service.buildCriteria({ domain: DOMAIN });
            expect(criteria.portalId).toBeNull();
        });

        it.each([
            ['ноль', 0],
            ['отрицательный', -1],
            ['NaN', Number.NaN],
            ['null', null],
            ['undefined', undefined],
        ])(
            'providerId=%s трактуется как «поставщик не выбран»',
            async (_name, providerId) => {
                const criteria = await service.buildCriteria({
                    domain: DOMAIN,
                    providerId: providerId as number | null,
                });
                expect(criteria.agentId).toBeNull();
            },
        );

        it('положительный providerId становится agentId', async () => {
            const criteria = await service.buildCriteria({
                domain: DOMAIN,
                providerId: 42,
            });
            expect(criteria.agentId).toBe(42n);
        });

        it('тип клиента принимается и строкой, и объектом {code}', async () => {
            const asString = await service.buildCriteria({
                domain: DOMAIN,
                clientType: 'fiz',
            });
            const asObject = await service.buildCriteria({
                domain: DOMAIN,
                clientType: { code: 'fiz' },
            });
            expect(asString.clientType).toBe(ClientTypeEnum.FIZ);
            expect(asObject.clientType).toBe(ClientTypeEnum.FIZ);
        });

        it('мусор в типе клиента не становится критерием', async () => {
            const criteria = await service.buildCriteria({
                domain: DOMAIN,
                clientType: 'нечто',
            });
            expect(criteria.clientType).toBeNull();
        });

        it('тип поставки сверяется со справочником (в DTO он без валидации)', async () => {
            const ok = await service.buildCriteria({
                domain: DOMAIN,
                supplyType: 'proxima',
            });
            const junk = await service.buildCriteria({
                domain: DOMAIN,
                supplyType: 'нечто',
            });
            expect(ok.supplyType).toBe(SupplyTypeEnum.PROXIMA);
            expect(junk.supplyType).toBeNull();
        });
    });

    describe('resolveContract', () => {
        it('без типа договора — 400: шаблона «по умолчанию» не существует', async () => {
            await expect(
                service.resolveContract({ domain: DOMAIN }),
            ).rejects.toThrow(BadRequestException);
            expect(findCandidates).not.toHaveBeenCalled();
        });

        it('нашёлся шаблон — отдаём его с источником db', async () => {
            findCandidates.mockResolvedValue([
                candidate({ id: '1', portalId: BigInt(PORTAL_ID) }),
            ]);

            const result = await service.resolveContract({
                domain: DOMAIN,
                contractType: CONTRACT_LTYPE.LIC,
            });

            expect(result.source).toBe(TemplateResolutionSource.DB);
            expect(result.match?.candidate.id).toBe('1');
            expect(findCandidates).toHaveBeenCalledWith(
                DocumentTemplateKind.CONTRACT,
                expect.objectContaining({ contractType: CONTRACT_LTYPE.LIC }),
            );
        });

        it('у портала шаблонов нет вовсе — законный откат на файл storage', async () => {
            findCandidates.mockResolvedValue([]);
            hasAnyForPortal.mockResolvedValue(false);

            const result = await service.resolveContract({
                domain: DOMAIN,
                contractType: CONTRACT_LTYPE.ABON,
            });

            expect(result.source).toBe(
                TemplateResolutionSource.STORAGE_FALLBACK,
            );
            expect(result.match).toBeNull();
        });

        it('шаблоны есть, но не под этот тип — 404, а НЕ подмена универсальным', async () => {
            findCandidates.mockResolvedValue([]);
            hasAnyForPortal.mockResolvedValue(true);

            await expect(
                service.resolveContract({
                    domain: DOMAIN,
                    contractType: CONTRACT_LTYPE.KEY,
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('resolveSupplyReport', () => {
        it('нет шаблона — откат на файл (сегодня отчёт всегда из файла)', async () => {
            findCandidates.mockResolvedValue([]);

            const result = await service.resolveSupplyReport({
                domain: DOMAIN,
            });

            expect(result.source).toBe(
                TemplateResolutionSource.STORAGE_FALLBACK,
            );
            expect(hasAnyForPortal).not.toHaveBeenCalled();
        });
    });

    describe('resolveInvoice', () => {
        it('у счёта отката на файл нет — отдаём пустой match', async () => {
            findCandidates.mockResolvedValue([]);

            const result = await service.resolveInvoice({ domain: DOMAIN });

            expect(result.source).toBe(TemplateResolutionSource.DB);
            expect(result.match).toBeNull();
        });

        it('выбирает шаблон поставщика, а не портальный универсальный', async () => {
            findCandidates.mockResolvedValue([
                candidate({ id: 'wide', portalId: BigInt(PORTAL_ID) }),
                candidate({
                    id: 'byAgent',
                    portalId: BigInt(PORTAL_ID),
                    agentId: 42n,
                }),
            ]);

            const result = await service.resolveInvoice({
                domain: DOMAIN,
                providerId: 42,
            });

            expect(result.match?.candidate.id).toBe('byAgent');
        });
    });
});
