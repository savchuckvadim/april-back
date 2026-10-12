import type { ContractTemplate } from 'generated/prisma';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    buildContractTemplateBaseUrl,
    buildContractTemplateDemoUrl,
    buildContractTemplateDownloadUrl,
    mapContractTemplateToResponseDto,
} from '../utils/contract-template.mapper';

const CREATED_AT = new Date('2026-09-15T10:00:00.000Z');
const UPDATED_AT = new Date('2026-10-01T10:00:00.000Z');

function makeRow(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
    return {
        id: 9007199254740993n,
        created_at: CREATED_AT,
        updated_at: UPDATED_AT,
        portal_id: 7n,
        agent_id: 42n,
        contract_type: CONTRACT_LTYPE.LIC,
        client_types: '["org","ip"]',
        supply_types: '["internet"]',
        name: 'Договор лицензии',
        code: 'contract-abc',
        file_path: '/storage/app/konstructor/contract-templates/a.docx',
        demo_path: '/storage/app/konstructor/contract-templates/a-demo.docx',
        description: 'Редакция от 01.10.2026',
        is_default: true,
        is_active: true,
        is_archived: false,
        archived_at: null,
        creator_bitrix_user_id: 1n,
        ...overrides,
    };
}

describe('buildContractTemplateBaseUrl', () => {
    it('убирает хвостовые слэши', () => {
        expect(buildContractTemplateBaseUrl('https://a.ru///')).toBe(
            'https://a.ru',
        );
    });

    it('незаданный APP_URL сводится к относительной ссылке, а не к «undefined/...»', () => {
        expect(buildContractTemplateBaseUrl(undefined)).toBe('');
        expect(buildContractTemplateBaseUrl('   ')).toBe('');
    });
});

describe('buildContractTemplateDownloadUrl / DemoUrl', () => {
    it('ссылка собирается из базы, префикса модуля и id', () => {
        expect(buildContractTemplateDownloadUrl('https://a.ru', 42n)).toBe(
            'https://a.ru/api/contract-templates/42/download',
        );
    });

    it('без базы ссылка относительная и корректная', () => {
        expect(buildContractTemplateDownloadUrl('', 42n)).toBe(
            '/api/contract-templates/42/download',
        );
    });

    it('демо-ссылка есть только при загруженном демо', () => {
        expect(
            buildContractTemplateDemoUrl('https://a.ru', 42n, '/x/a.docx'),
        ).toBe('https://a.ru/api/contract-templates/42/download?demo=1');
        expect(
            buildContractTemplateDemoUrl('https://a.ru', 42n, null),
        ).toBeNull();
    });
});

describe('mapContractTemplateToResponseDto', () => {
    it('КАЖДЫЙ bigint становится строкой — BigInt не сериализуется в JSON', () => {
        const dto = mapContractTemplateToResponseDto(makeRow(), 'https://a.ru');

        expect(dto.id).toBe('9007199254740993');
        expect(dto.portal_id).toBe('7');
        expect(dto.agent_id).toBe('42');
        expect(dto.creator_bitrix_user_id).toBe('1');

        for (const value of Object.values(dto)) {
            expect(typeof value).not.toBe('bigint');
        }
        // Контрольная проверка: сериализация не падает.
        expect(() => JSON.stringify(dto)).not.toThrow();
    });

    it('id выше 2^53 не теряет точность при приведении к строке', () => {
        const dto = mapContractTemplateToResponseDto(
            makeRow({ id: 9007199254740993n }),
            '',
        );
        expect(dto.id).toBe('9007199254740993');
        // Именно поэтому id уходит строкой: через number последняя цифра
        // теряется (9007199254740993 → 9007199254740992).
        expect(String(Number(dto.id))).toBe('9007199254740992');
    });

    it('NULL-овые bigint остаются null, а не строкой «null»', () => {
        const dto = mapContractTemplateToResponseDto(
            makeRow({
                portal_id: null,
                agent_id: null,
                creator_bitrix_user_id: null,
            }),
            '',
        );
        expect(dto.portal_id).toBeNull();
        expect(dto.agent_id).toBeNull();
        expect(dto.creator_bitrix_user_id).toBeNull();
    });

    it('JSON-списки разбираются в массивы кодов', () => {
        const dto = mapContractTemplateToResponseDto(makeRow(), '');
        expect(dto.client_types).toEqual([
            ClientTypeEnum.ORG,
            ClientTypeEnum.IP,
        ]);
        expect(dto.supply_types).toEqual([SupplyTypeEnum.INTERNET]);
    });

    it('NULL в списках — «для любого»', () => {
        const dto = mapContractTemplateToResponseDto(
            makeRow({ client_types: null, supply_types: null }),
            '',
        );
        expect(dto.client_types).toBeNull();
        expect(dto.supply_types).toBeNull();
    });

    it('ссылки на файл и демо попадают в DTO', () => {
        const dto = mapContractTemplateToResponseDto(makeRow(), 'https://a.ru');
        expect(dto.template_url).toBe(
            'https://a.ru/api/contract-templates/9007199254740993/download',
        );
        expect(dto.demo_url).toBe(
            'https://a.ru/api/contract-templates/9007199254740993/download?demo=1',
        );
    });

    it('без демо-файла demo_url = null', () => {
        const dto = mapContractTemplateToResponseDto(
            makeRow({ demo_path: null }),
            '',
        );
        expect(dto.demo_url).toBeNull();
    });

    it('наружу не утекают пути файлов в хранилище', () => {
        const dto = mapContractTemplateToResponseDto(makeRow(), '');
        expect(JSON.stringify(dto)).not.toContain('/storage/app/');
    });

    it('даты и флаги переносятся как есть', () => {
        const dto = mapContractTemplateToResponseDto(makeRow(), '');
        expect(dto.created_at).toBe(CREATED_AT);
        expect(dto.updated_at).toBe(UPDATED_AT);
        expect(dto.contract_type).toBe(CONTRACT_LTYPE.LIC);
        expect(dto.is_default).toBe(true);
        expect(dto.is_archived).toBe(false);
        expect(dto.archived_at).toBeNull();
    });
});
