import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ContractTemplate, Prisma } from 'generated/prisma';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { ContractTemplateScope } from '../dto/contract-template.enums';
import type { CreateContractTemplateBodyDto } from '../dto/create-contract-template.dto';
import type { ContractTemplateRepository } from '../repositories/contract-template.repository';
import type { ContractTemplateAgentService } from '../services/contract-template-agent.service';
import type { ContractTemplateFilesService } from '../services/contract-template-files.service';
import type { ContractTemplateQueryService } from '../services/contract-template-query.service';
import { ContractTemplateService } from '../services/contract-template.service';

// Моки объявлены отдельными const-ами и утверждения делаются по ним
// (expect(createMock)), а не по repo.create: @typescript-eslint/unbound-method
// иначе валит линт на обращении к методу через объект.
const createMock = jest.fn<Promise<ContractTemplate>, [unknown, unknown?]>();
const updateMock = jest.fn<
    Promise<ContractTemplate>,
    [bigint, Prisma.ContractTemplateUpdateInput, unknown?]
>();
const updateManyMock = jest.fn<Promise<number>, [unknown, unknown, unknown?]>();
const deleteMock = jest.fn<Promise<void>, [bigint]>();
const runInTransactionMock = jest.fn();
const getEntityOrFailMock = jest.fn<Promise<ContractTemplate>, [bigint]>();
const toDtoMock = jest.fn();
const assertCreateUploadsMock = jest.fn();
const saveCreateUploadsMock = jest.fn();
const replaceUploadMock = jest.fn<Promise<string>, [unknown, string | null]>();
const removeStoredFileMock = jest.fn<Promise<void>, [string | null]>();
const assertScopeAgentMock = jest.fn<
    Promise<void>,
    [bigint | null, bigint | null]
>();
const assertAgentBelongsToPortalMock = jest.fn<
    Promise<void>,
    [bigint, bigint]
>();

const TX = Symbol('tx');

function makeRow(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
    return {
        id: 10n,
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

function makeService(): ContractTemplateService {
    const repository = {
        create: createMock,
        update: updateMock,
        updateMany: updateManyMock,
        delete: deleteMock,
        runInTransaction: runInTransactionMock,
        findMany: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
    } as unknown as ContractTemplateRepository;

    const queryService = {
        getEntityOrFail: getEntityOrFailMock,
        toDto: toDtoMock,
    } as unknown as ContractTemplateQueryService;

    const filesService = {
        assertCreateUploads: assertCreateUploadsMock,
        saveCreateUploads: saveCreateUploadsMock,
        replaceUpload: replaceUploadMock,
        removeStoredFile: removeStoredFileMock,
    } as unknown as ContractTemplateFilesService;

    const agentService = {
        assertScopeAgent: assertScopeAgentMock,
        assertAgentBelongsToPortal: assertAgentBelongsToPortalMock,
    } as unknown as ContractTemplateAgentService;

    return new ContractTemplateService(
        repository,
        queryService,
        filesService,
        agentService,
    );
}

/** Доступ к полю payload-а без `any` — Prisma-типы допускают обёртки. */
function field(
    data: Prisma.ContractTemplateUpdateInput,
    key: keyof Prisma.ContractTemplateUpdateInput,
): unknown {
    return data[key];
}

beforeEach(() => {
    jest.clearAllMocks();
    toDtoMock.mockImplementation((row: unknown) => row);
    saveCreateUploadsMock.mockResolvedValue({
        file_path: '/storage/new.docx',
        demo_path: null,
    });
    assertScopeAgentMock.mockResolvedValue(undefined);
    updateManyMock.mockResolvedValue(0);
    // Транзакция в юните — просто вызов колбэка: проверяем, что обе записи
    // идут внутрь одного и того же tx-клиента.
    runInTransactionMock.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(TX),
    );
});

describe('ContractTemplateService.create', () => {
    const body: CreateContractTemplateBodyDto = {
        name: 'Шаблон услуг',
        contract_type: CONTRACT_LTYPE.SERVICE,
        scope: ContractTemplateScope.PORTAL,
        portal_id: '7',
        client_types: [ClientTypeEnum.ORG_STATE],
    };
    const uploads = { file: { originalname: 'a.docx' } as Express.Multer.File };

    it('пишет created_at и updated_at ЯВНО: у колонок нет дефолта и нет @updatedAt', async () => {
        createMock.mockResolvedValue(makeRow());
        await makeService().create(body, uploads);

        expect(createMock).toHaveBeenCalledTimes(1);
        const data = createMock.mock
            .calls[0][0] as Prisma.ContractTemplateCreateInput;
        expect(data.created_at).toBeInstanceOf(Date);
        expect(data.updated_at).toBeInstanceOf(Date);
        expect(data.created_at).toEqual(data.updated_at);
    });

    it('client_types сериализуются JSON-ом, пустые списки — в NULL', async () => {
        createMock.mockResolvedValue(makeRow());
        await makeService().create(body, uploads);
        const data = createMock.mock
            .calls[0][0] as Prisma.ContractTemplateCreateInput;
        expect(data.client_types).toBe('["org_state"]');
        expect(data.supply_types).toBeNull();
    });

    it('валидация файлов и поставщика идёт ДО записи в хранилище', async () => {
        createMock.mockResolvedValue(makeRow());
        await makeService().create(body, uploads);

        const assertOrder = assertCreateUploadsMock.mock.invocationCallOrder[0];
        const agentOrder = assertScopeAgentMock.mock.invocationCallOrder[0];
        const saveOrder = saveCreateUploadsMock.mock.invocationCallOrder[0];
        expect(assertOrder).toBeLessThan(saveOrder);
        expect(agentOrder).toBeLessThan(saveOrder);
    });

    it('scope=common с portal_id — ошибка, файлы не сохраняются', async () => {
        await expect(
            makeService().create(
                {
                    ...body,
                    scope: ContractTemplateScope.COMMON,
                    portal_id: '7',
                },
                uploads,
            ),
        ).rejects.toThrow(BadRequestException);
        expect(saveCreateUploadsMock).not.toHaveBeenCalled();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('scope=portal без portal_id — ошибка', async () => {
        await expect(
            makeService().create(
                {
                    ...body,
                    scope: ContractTemplateScope.PORTAL,
                    portal_id: undefined,
                },
                uploads,
            ),
        ).rejects.toThrow(/scope=portal нужен portal_id/);
    });

    it('scope=provider без agent_id — ошибка', async () => {
        await expect(
            makeService().create(
                {
                    ...body,
                    scope: ContractTemplateScope.PROVIDER,
                    portal_id: '7',
                    agent_id: undefined,
                },
                uploads,
            ),
        ).rejects.toThrow(/нужны и portal_id, и agent_id/);
    });

    it('is_default=true снимает флаг у остальных в ТОЙ ЖЕ области с contract_type', async () => {
        createMock.mockResolvedValue(makeRow({ is_default: true }));
        await makeService().create({ ...body, is_default: true }, uploads);

        expect(updateManyMock).toHaveBeenCalledTimes(1);
        const [where, data, tx] = updateManyMock.mock.calls[0];
        expect(where).toMatchObject({
            id: { not: 10n },
            portal_id: 7n,
            agent_id: null,
            contract_type: CONTRACT_LTYPE.SERVICE,
            is_default: true,
            is_archived: false,
        });
        expect(data).toMatchObject({ is_default: false });
        expect(tx).toBe(TX);
    });

    it('обычный шаблон чужие флаги не трогает', async () => {
        createMock.mockResolvedValue(makeRow({ is_default: false }));
        await makeService().create(body, uploads);
        expect(updateManyMock).not.toHaveBeenCalled();
    });
});

describe('ContractTemplateService.update', () => {
    it('пишет updated_at ЯВНО даже когда остальных полей нет', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow());
        updateMock.mockResolvedValue(makeRow());

        await makeService().update(10n, {});

        const data = updateMock.mock.calls[0][1];
        expect(field(data, 'updated_at')).toBeInstanceOf(Date);
    });

    it('не передано поле — колонка не затирается', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow());
        updateMock.mockResolvedValue(makeRow());

        await makeService().update(10n, { name: 'Новое' });

        const data = updateMock.mock.calls[0][1];
        expect(field(data, 'name')).toBe('Новое');
        expect(Object.keys(data).sort()).toEqual(['name', 'updated_at']);
    });

    it('«поставщик без портала» запрещён', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({ portal_id: 7n, agent_id: 42n }),
        );

        await expect(
            makeService().update(10n, { portal_id: '' }),
        ).rejects.toThrow(/Нельзя оставить поставщика без портала/);
        expect(updateMock).not.toHaveBeenCalled();
    });

    it('переданный поставщик проверяется на принадлежность порталу', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow());
        updateMock.mockResolvedValue(makeRow());

        await makeService().update(10n, { agent_id: '42' });

        expect(assertScopeAgentMock).toHaveBeenCalledWith(42n, 7n);
    });

    it('смена типа договора: флаг снимается в области НОВОГО типа', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({ is_default: true, contract_type: CONTRACT_LTYPE.ABON }),
        );
        updateMock.mockResolvedValue(makeRow());

        await makeService().update(10n, {
            contract_type: CONTRACT_LTYPE.LIC,
        });

        const [where] = updateManyMock.mock.calls[0];
        expect(where).toMatchObject({ contract_type: CONTRACT_LTYPE.LIC });
    });

    it('новый файл заменяет старый через files-сервис', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow());
        updateMock.mockResolvedValue(makeRow());
        replaceUploadMock.mockResolvedValue('/storage/b.docx');

        const file = { originalname: 'b.docx' } as Express.Multer.File;
        await makeService().update(10n, {}, { file });

        expect(replaceUploadMock).toHaveBeenCalledWith(file, '/storage/a.docx');
        expect(field(updateMock.mock.calls[0][1], 'file_path')).toBe(
            '/storage/b.docx',
        );
    });

    it('несуществующий шаблон — 404 из query-сервиса', async () => {
        getEntityOrFailMock.mockRejectedValue(new NotFoundException());
        await expect(makeService().update(99n, {})).rejects.toThrow(
            NotFoundException,
        );
    });
});

describe('ContractTemplateService.archive / unarchive', () => {
    it('archive ставит is_archived, archived_at и снимает is_default', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow({ is_default: true }));
        updateMock.mockResolvedValue(makeRow({ is_archived: true }));

        await makeService().archive(10n);

        const data = updateMock.mock.calls[0][1];
        expect(field(data, 'is_archived')).toBe(true);
        expect(field(data, 'archived_at')).toBeInstanceOf(Date);
        expect(field(data, 'is_default')).toBe(false);
        expect(field(data, 'updated_at')).toBeInstanceOf(Date);
    });

    it('unarchive снимает флаг и ОЧИЩАЕТ archived_at', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({ is_archived: true, archived_at: new Date() }),
        );
        updateMock.mockResolvedValue(makeRow());

        await makeService().unarchive(10n);

        const data = updateMock.mock.calls[0][1];
        expect(field(data, 'is_archived')).toBe(false);
        expect(field(data, 'archived_at')).toBeNull();
        expect(field(data, 'updated_at')).toBeInstanceOf(Date);
    });

    it('unarchive НЕ возвращает is_default', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow({ is_archived: true }));
        updateMock.mockResolvedValue(makeRow());

        await makeService().unarchive(10n);

        expect(updateMock.mock.calls[0][1]).not.toHaveProperty('is_default');
    });

    it('архив несуществующего шаблона — 404 до записи', async () => {
        getEntityOrFailMock.mockRejectedValue(new NotFoundException());
        await expect(makeService().archive(99n)).rejects.toThrow(
            NotFoundException,
        );
        expect(updateMock).not.toHaveBeenCalled();
    });
});

describe('ContractTemplateService.setDefault / setPortal / setAgent', () => {
    it('setDefault(true) чистит область по сохранённому типу договора', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({ contract_type: CONTRACT_LTYPE.KEY, agent_id: 42n }),
        );
        updateMock.mockResolvedValue(makeRow({ is_default: true }));

        await makeService().setDefault(10n, true);

        const [where, , tx] = updateManyMock.mock.calls[0];
        expect(where).toMatchObject({
            portal_id: 7n,
            agent_id: 42n,
            contract_type: CONTRACT_LTYPE.KEY,
        });
        expect(tx).toBe(TX);
    });

    it('setDefault(false) чужие флаги не трогает', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow({ is_default: true }));
        updateMock.mockResolvedValue(makeRow());

        await makeService().setDefault(10n, false);

        expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('снятие портала уводит с ним и поставщика', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({ portal_id: 7n, agent_id: 42n }),
        );
        updateMock.mockResolvedValue(makeRow());

        await makeService().setPortal(10n, null);

        const data = updateMock.mock.calls[0][1];
        expect(field(data, 'portal_id')).toBeNull();
        expect(field(data, 'agent_id')).toBeNull();
    });

    it('поставщик на общем шаблоне запрещён', async () => {
        getEntityOrFailMock.mockResolvedValue(makeRow({ portal_id: null }));

        await expect(makeService().setAgent(10n, '42')).rejects.toThrow(
            /Сначала привяжите портал/,
        );
        expect(updateMock).not.toHaveBeenCalled();
    });
});

describe('ContractTemplateService.delete', () => {
    it('удаляет оба файла и строку', async () => {
        getEntityOrFailMock.mockResolvedValue(
            makeRow({
                file_path: '/storage/a.docx',
                demo_path: '/storage/a-demo.docx',
            }),
        );
        deleteMock.mockResolvedValue(undefined);
        removeStoredFileMock.mockResolvedValue(undefined);

        await makeService().delete(10n);

        expect(removeStoredFileMock).toHaveBeenCalledWith('/storage/a.docx');
        expect(removeStoredFileMock).toHaveBeenCalledWith(
            '/storage/a-demo.docx',
        );
        expect(deleteMock).toHaveBeenCalledWith(10n);
    });
});
