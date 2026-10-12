import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    DocumentTemplateKind,
    TemplateResolutionSource,
} from '../document-template.criteria';
import { ResolvedTemplate } from '../document-template.service';
import {
    toDiagnosticsDto,
    toResolvedTemplateDto,
} from '../lib/resolved-template.mapper';

describe('toResolvedTemplateDto', () => {
    const fallback: ResolvedTemplate = {
        source: TemplateResolutionSource.STORAGE_FALLBACK,
        match: null,
        criteria: {
            portalId: BigInt(7),
            agentId: null,
            contractType: null,
            clientType: null,
            supplyType: null,
        },
    };

    it('все bigint уходят строками — иначе JSON.stringify падает', () => {
        const dto = toResolvedTemplateDto({
            ...fallback,
            criteria: {
                ...fallback.criteria,
                portalId: BigInt('9007199254740993'),
                agentId: BigInt(42),
            },
        });

        // Значение выше 2^53: именно поэтому строка, а не number.
        expect(dto.criteria.portalId).toBe('9007199254740993');
        expect(dto.criteria.agentId).toBe('42');
        expect(() => JSON.stringify(dto)).not.toThrow();
    });

    it('откат на storage: templateId null и причина про storage', () => {
        const dto = toResolvedTemplateDto(fallback);

        expect(dto.templateId).toBeNull();
        expect(dto.source).toBe(TemplateResolutionSource.STORAGE_FALLBACK);
        expect(dto.reason).toContain('storage');
    });

    it('попадание в БД: id и reason берутся из победителя', () => {
        const dto = toResolvedTemplateDto({
            source: TemplateResolutionSource.DB,
            match: {
                candidate: {
                    id: '42',
                    filePath: 'konstructor/templates/any.docx',
                    portalId: BigInt(7),
                    agentId: BigInt(5),
                    contractType: CONTRACT_LTYPE.ABON,
                    clientTypes: [ClientTypeEnum.ORG],
                    supplyTypes: [SupplyTypeEnum.INTERNET],
                    isDefault: false,
                    updatedAt: null,
                    createdAt: null,
                },
                tuple: {
                    portalExact: 1,
                    agentExact: 1,
                    supplyExact: 1,
                    clientExact: 1,
                    isDefault: 0,
                    recency: 0,
                },
                reason: 'Подобран по: портал, поставщик',
            },
            criteria: {
                portalId: BigInt(7),
                agentId: BigInt(5),
                contractType: CONTRACT_LTYPE.ABON,
                clientType: ClientTypeEnum.ORG,
                supplyType: SupplyTypeEnum.INTERNET,
            },
        });

        expect(dto.templateId).toBe('42');
        expect(dto.reason).toBe('Подобран по: портал, поставщик');
        expect(dto.criteria.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(dto.criteria.clientType).toBe(ClientTypeEnum.ORG);
        expect(dto.criteria.supplyType).toBe(SupplyTypeEnum.INTERNET);
    });

    it('портал не найден — portalId null, а не строка "null"', () => {
        const dto = toResolvedTemplateDto({
            ...fallback,
            criteria: { ...fallback.criteria, portalId: null },
        });

        expect(dto.criteria.portalId).toBeNull();
    });

    it('undefined-признаки нормализуются в null', () => {
        const dto = toResolvedTemplateDto({
            ...fallback,
            criteria: {
                portalId: null,
                agentId: null,
                // В домене это опциональные поля — в ответе всегда null.
                contractType: undefined,
                clientType: undefined,
                supplyType: undefined,
            },
        });

        expect(dto.criteria.contractType).toBeNull();
        expect(dto.criteria.clientType).toBeNull();
        expect(dto.criteria.supplyType).toBeNull();
    });
});

describe('toDiagnosticsDto', () => {
    it('переносит отчёт как есть, id уже строки', () => {
        const dto = toDiagnosticsDto({
            portalId: '7',
            ambiguous: [
                {
                    kind: DocumentTemplateKind.CONTRACT,
                    portalId: '7',
                    agentId: null,
                    contractType: CONTRACT_LTYPE.ABON,
                    clientTypes: null,
                    supplyTypes: null,
                    defaultCount: 2,
                    templateIds: ['1', '2'],
                    isCommon: false,
                },
            ],
            reliesOnCommon: [DocumentTemplateKind.INVOICE],
        });

        expect(dto.portalId).toBe('7');
        expect(dto.ambiguous).toHaveLength(1);
        expect(dto.reliesOnCommon).toEqual([DocumentTemplateKind.INVOICE]);
        expect(() => JSON.stringify(dto)).not.toThrow();
    });

    it('пустой отчёт', () => {
        const dto = toDiagnosticsDto({
            portalId: null,
            ambiguous: [],
            reliesOnCommon: [],
        });

        expect(dto).toEqual({
            portalId: null,
            ambiguous: [],
            reliesOnCommon: [],
        });
    });
});
