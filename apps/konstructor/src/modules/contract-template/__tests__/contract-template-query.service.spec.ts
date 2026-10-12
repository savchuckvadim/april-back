import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ContractTemplate } from 'generated/prisma';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import type {
    ContractTemplateFindManyFilters,
    ContractTemplatePage,
    ContractTemplateRepository,
} from '../repositories/contract-template.repository';
import { ContractTemplateQueryService } from '../services/contract-template-query.service';

const findManyMock = jest.fn<
    Promise<ContractTemplatePage>,
    [ContractTemplateFindManyFilters, unknown?]
>();
const findAllMock = jest.fn<
    Promise<ContractTemplate[]>,
    [ContractTemplateFindManyFilters]
>();
const findByIdMock = jest.fn<Promise<ContractTemplate | null>, [bigint]>();
const configGetMock = jest.fn<string | undefined, [string]>();

function makeRow(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
    return {
        id: 1n,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        portal_id: 7n,
        agent_id: null,
        contract_type: CONTRACT_LTYPE.SERVICE,
        client_types: null,
        supply_types: null,
        name: 'Шаблон',
        code: 'contract-x',
        file_path: '/storage/a.docx',
        demo_path: null,
        description: null,
        is_default: false,
        is_active: true,
        is_archived: false,
        archived_at: null,
        creator_bitrix_user_id: null,
        ...overrides,
    };
}

function makeService(): ContractTemplateQueryService {
    const repository = {
        findMany: findManyMock,
        findAll: findAllMock,
        findById: findByIdMock,
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        runInTransaction: jest.fn(),
    } as unknown as ContractTemplateRepository;

    const configService = {
        get: configGetMock,
    } as unknown as ConfigService;

    return new ContractTemplateQueryService(repository, configService);
}

beforeEach(() => {
    jest.clearAllMocks();
    configGetMock.mockReturnValue(undefined);
    findManyMock.mockResolvedValue({ rows: [], total: 0 });
    findAllMock.mockResolvedValue([]);
});

describe('ContractTemplateQueryService.getEntityOrFail', () => {
    it('отсутствующий шаблон — 404 с id в сообщении', async () => {
        findByIdMock.mockResolvedValue(null);
        await expect(makeService().getEntityOrFail(99n)).rejects.toThrow(
            NotFoundException,
        );
        await expect(makeService().getEntityOrFail(99n)).rejects.toThrow(/99/);
    });

    it('найденный шаблон возвращается как есть', async () => {
        const row = makeRow();
        findByIdMock.mockResolvedValue(row);
        await expect(makeService().getEntityOrFail(1n)).resolves.toBe(row);
    });
});

describe('ContractTemplateQueryService.buildFilters', () => {
    it('архивные скрыты, пока не попросили обратного', () => {
        expect(makeService().buildFilters({}).is_archived).toBe(false);
        expect(
            makeService().buildFilters({ is_archived: true }).is_archived,
        ).toBe(true);
    });

    it('portal_id и agent_id переводятся в bigint', () => {
        const filters = makeService().buildFilters({
            portal_id: '7',
            agent_id: '42',
        });
        expect(filters.portal_id).toBe(7n);
        expect(filters.agent_id).toBe(42n);
    });

    it('only_common вытесняет portal_id', () => {
        const filters = makeService().buildFilters({
            only_common: true,
            portal_id: '7',
        });
        expect(filters.only_common).toBe(true);
        expect(filters.portal_id).toBeUndefined();
    });

    it('client_type и supply_type в SQL-фильтры НЕ попадают', () => {
        const filters = makeService().buildFilters({
            client_type: ClientTypeEnum.ORG,
            supply_type: SupplyTypeEnum.INTERNET,
        });
        expect(filters).not.toHaveProperty('client_type');
        expect(filters).not.toHaveProperty('supply_type');
    });
});

describe('ContractTemplateQueryService.findMany', () => {
    it('без фильтров по спискам страница нарезается в SQL', async () => {
        findManyMock.mockResolvedValue({
            rows: [makeRow()],
            total: 12,
        });

        const page = await makeService().findMany({ take: 5, skip: 5 });

        expect(findManyMock).toHaveBeenCalledWith(expect.anything(), {
            take: 5,
            skip: 5,
        });
        expect(findAllMock).not.toHaveBeenCalled();
        expect(page.total).toBe(12);
        expect(page.take).toBe(5);
        expect(page.skip).toBe(5);
        expect(page.items).toHaveLength(1);
    });

    it('take/skip по умолчанию — 50 и 0', async () => {
        await makeService().findMany({});
        expect(findManyMock).toHaveBeenCalledWith(expect.anything(), {
            take: 50,
            skip: 0,
        });
    });

    it('фильтр по client_type уводит выборку в findAll: total из SQL соврал бы', async () => {
        findAllMock.mockResolvedValue([
            makeRow({ id: 1n, client_types: '["org"]' }),
            makeRow({ id: 2n, client_types: '["fiz"]' }),
            makeRow({ id: 3n, client_types: null }),
        ]);

        const page = await makeService().findMany({
            client_type: ClientTypeEnum.ORG,
        });

        expect(findAllMock).toHaveBeenCalledTimes(1);
        expect(findManyMock).not.toHaveBeenCalled();
        // org + «для любого» (NULL), но не fiz.
        expect(page.total).toBe(2);
        expect(page.items.map(item => item.id)).toEqual(['1', '3']);
    });

    it('total после TS-фильтрации считается ПОСЛЕ неё, страница режется в памяти', async () => {
        findAllMock.mockResolvedValue([
            makeRow({ id: 1n, supply_types: '["internet"]' }),
            makeRow({ id: 2n, supply_types: '["internet"]' }),
            makeRow({ id: 3n, supply_types: '["proxima"]' }),
        ]);

        const page = await makeService().findMany({
            supply_type: SupplyTypeEnum.INTERNET,
            take: 1,
            skip: 1,
        });

        expect(page.total).toBe(2);
        expect(page.items.map(item => item.id)).toEqual(['2']);
    });
});

describe('ContractTemplateQueryService.findCommon / findByPortal', () => {
    it('findCommon запрашивает только общие', async () => {
        await makeService().findCommon({});
        expect(findManyMock.mock.calls[0][0].only_common).toBe(true);
    });

    it('findByPortal берёт портал И общие — общие не теряются', async () => {
        await makeService().findByPortal(7n, {});
        const filters = findManyMock.mock.calls[0][0];
        expect(filters.portal_id_or_common).toBe(7n);
        expect(filters.portal_id).toBeUndefined();
        expect(filters.only_common).toBeUndefined();
    });

    it('findByPortal игнорирует portal_id и only_common из query', async () => {
        await makeService().findByPortal(7n, {
            portal_id: '99',
            only_common: true,
        });
        const filters = findManyMock.mock.calls[0][0];
        expect(filters.portal_id_or_common).toBe(7n);
        expect(filters.only_common).toBeUndefined();
    });
});

describe('ContractTemplateQueryService.getFileForDownload', () => {
    it('отдаёт путь шаблона и имя', async () => {
        findByIdMock.mockResolvedValue(makeRow());
        await expect(makeService().getFileForDownload(1n)).resolves.toEqual({
            file_path: '/storage/a.docx',
            name: 'Шаблон',
        });
    });

    it('демо не загружено — 404 с понятным текстом', async () => {
        findByIdMock.mockResolvedValue(makeRow({ demo_path: null }));
        await expect(
            makeService().getFileForDownload(1n, true),
        ).rejects.toThrow(/Демонстрационный файл не загружен/);
    });

    it('демо есть — отдаётся его путь', async () => {
        findByIdMock.mockResolvedValue(
            makeRow({ demo_path: '/storage/a-demo.docx' }),
        );
        await expect(
            makeService().getFileForDownload(1n, true),
        ).resolves.toMatchObject({ file_path: '/storage/a-demo.docx' });
    });
});
