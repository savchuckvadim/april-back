import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SupplyReportTemplate } from 'generated/prisma';
import {
    ClientTypeEnum,
    SupplyReportTemplateScope,
} from '../dto/supply-report-template.enums';
import type { SupplyReportTemplateTxClient } from '../repositories/supply-report-template.repository';
import { SupplyReportTemplateCrudService } from '../services/supply-report-template-crud.service';
import { SupplyReportTemplateFilesService } from '../services/supply-report-template-files.service';
import { SupplyReportTemplateScopeService } from '../services/supply-report-template-scope.service';
import {
    TX,
    type Payload,
    docx,
    mockFn,
    row,
} from './supply-report-template.fixtures';

describe('SupplyReportTemplateCrudService', () => {
    // Моки — отдельными переменными, и ожидания строятся на них:
    // expect(repo.method) ломает @typescript-eslint/unbound-method.
    let create: jest.Mock<
        Promise<SupplyReportTemplate>,
        [Payload, SupplyReportTemplateTxClient?]
    >;
    let update: jest.Mock<
        Promise<SupplyReportTemplate>,
        [bigint, Payload, SupplyReportTemplateTxClient?]
    >;
    let updateMany: jest.Mock<
        Promise<number>,
        [Payload, Payload, SupplyReportTemplateTxClient?]
    >;
    let remove: jest.Mock<Promise<void>, [bigint]>;
    let runInTransaction: jest.Mock<
        Promise<unknown>,
        [(tx: SupplyReportTemplateTxClient) => Promise<unknown>]
    >;
    let findById: jest.Mock<Promise<SupplyReportTemplate | null>, [bigint]>;
    let agentsFindUnique: jest.Mock<
        Promise<{ id: bigint; portalId: bigint } | null>,
        [Payload]
    >;
    let saveFile: jest.Mock<Promise<string>, [Buffer, string, string, string]>;
    let deleteFile: jest.Mock<Promise<void>, [string]>;
    let toDto: jest.Mock<{ id: string }, [SupplyReportTemplate]>;
    let service: SupplyReportTemplateCrudService;

    beforeEach(() => {
        create = mockFn();
        create.mockImplementation((data: Payload) =>
            Promise.resolve(row(data as Partial<SupplyReportTemplate>)),
        );

        update = mockFn();
        update.mockResolvedValue(row());

        updateMany = mockFn();
        updateMany.mockResolvedValue(0);

        remove = mockFn();
        remove.mockResolvedValue(undefined);

        runInTransaction = mockFn();
        runInTransaction.mockImplementation(
            (fn: (tx: SupplyReportTemplateTxClient) => Promise<unknown>) =>
                fn(TX),
        );

        findById = mockFn();
        findById.mockResolvedValue(row());

        agentsFindUnique = mockFn();
        agentsFindUnique.mockResolvedValue(null);

        saveFile = mockFn();
        saveFile.mockResolvedValue(
            'konstructor/supply-report-templates/new.docx',
        );

        deleteFile = mockFn();
        deleteFile.mockResolvedValue(undefined);

        toDto = mockFn();
        toDto.mockImplementation((entity: SupplyReportTemplate) => ({
            id: String(entity.id),
        }));

        const repository = {
            findById,
            create,
            update,
            delete: remove,
            updateMany,
            runInTransaction,
        };

        // Соседние сервисы — реальные: их собственная логика (валидация
        // файлов, инварианты области) часть проверяемого поведения. Наружу
        // замокано только то, что ходит в инфраструктуру.
        const filesService = new SupplyReportTemplateFilesService({
            saveFile,
            deleteFile,
        } as never);
        const scopeService = new SupplyReportTemplateScopeService(
            repository as never,
            { agents: { findUnique: agentsFindUnique } } as never,
        );

        service = new SupplyReportTemplateCrudService(
            repository as never,
            { toDto, getRowOrFail: findByIdOrFail } as never,
            filesService,
            scopeService,
        );

        async function findByIdOrFail(
            id: bigint,
        ): Promise<SupplyReportTemplate> {
            const found = await findById(id);
            if (!found) {
                throw new NotFoundException(`не найден ${id}`);
            }
            return found;
        }
    });

    describe('create', () => {
        const body = {
            name: 'Отчёт о поставке, интернет',
            scope: SupplyReportTemplateScope.COMMON,
        };

        it('created_at и updated_at пишутся ЯВНО: у колонок нет DB-дефолта', async () => {
            await service.create(body, { file: docx() });

            const data: Payload = create.mock.calls[0][0];
            expect(data.created_at).toBeInstanceOf(Date);
            expect(data.updated_at).toBeInstanceOf(Date);
        });

        it('пустые списки сериализуются в NULL, а не в "[]"', async () => {
            await service.create(
                {
                    ...body,
                    client_types: [],
                    supply_types: [],
                    required_fields: [],
                    optional_fields: [],
                },
                { file: docx() },
            );

            const data: Payload = create.mock.calls[0][0];
            expect(data.client_types).toBeNull();
            expect(data.supply_types).toBeNull();
            expect(data.required_fields).toBeNull();
            expect(data.optional_fields).toBeNull();
        });

        it('заполненные списки уходят JSON-ом', async () => {
            await service.create(
                {
                    ...body,
                    client_types: [ClientTypeEnum.ORG_STATE],
                    required_fields: ['sale_date'],
                },
                { file: docx() },
            );

            const data: Payload = create.mock.calls[0][0];
            expect(data.client_types).toBe(JSON.stringify(['org_state']));
            expect(data.required_fields).toBe(JSON.stringify(['sale_date']));
        });

        it('code генерируется, а не берётся из тела запроса', async () => {
            await service.create(body, { file: docx() });
            expect(String(create.mock.calls[0][0].code)).toMatch(
                /^supply-report-/,
            );
        });

        it('без файла — 400, запись не создаётся', async () => {
            await expect(service.create(body, {})).rejects.toThrow(
                BadRequestException,
            );
            expect(create).not.toHaveBeenCalled();
        });

        it('битый файл (без PK-подписи) — 400', async () => {
            const broken = {
                ...docx(),
                buffer: Buffer.from([0x00, 0x01]),
            } as Express.Multer.File;
            await expect(
                service.create(body, { file: broken }),
            ).rejects.toThrow(BadRequestException);
            expect(saveFile).not.toHaveBeenCalled();
        });

        it('scope=common с portal_id — 400, файл не сохраняется', async () => {
            await expect(
                service.create({ ...body, portal_id: '7' }, { file: docx() }),
            ).rejects.toThrow(BadRequestException);
            expect(saveFile).not.toHaveBeenCalled();
        });

        it('поставщик чужого портала — 400', async () => {
            agentsFindUnique.mockResolvedValue({ id: 42n, portalId: 99n });

            await expect(
                service.create(
                    {
                        name: 'x',
                        scope: SupplyReportTemplateScope.PROVIDER,
                        portal_id: '7',
                        agent_id: '42',
                    },
                    { file: docx() },
                ),
            ).rejects.toThrow(BadRequestException);
            expect(create).not.toHaveBeenCalled();
        });

        it('несуществующий поставщик — 404', async () => {
            agentsFindUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        name: 'x',
                        scope: SupplyReportTemplateScope.PROVIDER,
                        portal_id: '7',
                        agent_id: '42',
                    },
                    { file: docx() },
                ),
            ).rejects.toThrow(NotFoundException);
        });

        it('свой поставщик проходит, портал и агент пишутся скалярами', async () => {
            agentsFindUnique.mockResolvedValue({ id: 42n, portalId: 7n });

            await service.create(
                {
                    name: 'x',
                    scope: SupplyReportTemplateScope.PROVIDER,
                    portal_id: '7',
                    agent_id: '42',
                },
                { file: docx() },
            );

            const data: Payload = create.mock.calls[0][0];
            expect(data.portal_id).toBe(7n);
            expect(data.agent_id).toBe(42n);
        });

        it('is_default снимает флаг у остальных ОБЛАСТИ в той же транзакции', async () => {
            create.mockResolvedValue(row({ id: 5n, is_default: true }));

            await service.create(
                { ...body, is_default: true },
                { file: docx() },
            );

            expect(runInTransaction).toHaveBeenCalledTimes(1);
            expect(updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: { not: 5n },
                    portal_id: null,
                    agent_id: null,
                }),
                expect.objectContaining({ is_default: false }),
                TX,
            );
        });

        it('без is_default флаги у других не трогаются', async () => {
            await service.create(body, { file: docx() });
            expect(updateMany).not.toHaveBeenCalled();
        });

        it('демо-файл сохраняется отдельным файлом', async () => {
            await service.create(body, {
                file: docx(),
                demo: docx('demo.docx'),
            });
            expect(saveFile).toHaveBeenCalledTimes(2);
        });

        it('битое демо отклоняется ДО сохранения основного файла', async () => {
            const brokenDemo = {
                ...docx('demo.docx'),
                buffer: Buffer.from([0x00]),
            } as Express.Multer.File;

            await expect(
                service.create(body, { file: docx(), demo: brokenDemo }),
            ).rejects.toThrow(BadRequestException);
            expect(saveFile).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('updated_at пишется всегда, created_at не затирается', async () => {
            await service.update(42n, { name: 'новое' });

            const [id, data] = update.mock.calls[0];
            expect(id).toBe(42n);
            expect(data.updated_at).toBeInstanceOf(Date);
            expect(data).not.toHaveProperty('created_at');
        });

        it('непереданные поля не попадают в UPDATE («не менять»)', async () => {
            await service.update(42n, { name: 'новое' });

            const data: Payload = update.mock.calls[0][1];
            expect(data).not.toHaveProperty('client_types');
            expect(data).not.toHaveProperty('required_fields');
            expect(data).not.toHaveProperty('is_active');
        });

        it('пустой список сбрасывает колонку в NULL', async () => {
            await service.update(42n, { required_fields: [] });
            expect(update.mock.calls[0][1].required_fields).toBeNull();
        });

        it('несуществующий шаблон — 404', async () => {
            findById.mockResolvedValue(null);
            await expect(service.update(42n, { name: 'x' })).rejects.toThrow(
                NotFoundException,
            );
            expect(update).not.toHaveBeenCalled();
        });

        it('поставщик без портала — 400', async () => {
            findById.mockResolvedValue(row({ portal_id: null }));
            await expect(
                service.update(42n, { agent_id: '42' }),
            ).rejects.toThrow(BadRequestException);
        });

        it('замена файла удаляет предыдущий', async () => {
            findById.mockResolvedValue(row({ file_path: 'old.docx' }));
            await service.update(42n, {}, { file: docx() });

            expect(saveFile).toHaveBeenCalledTimes(1);
            expect(deleteFile).toHaveBeenCalledWith('old.docx');
        });
    });

    describe('флаги состояния', () => {
        it('setDefault снимает флаг у остальных области, кроме самого шаблона', async () => {
            findById.mockResolvedValue(
                row({ id: 42n, portal_id: 7n, agent_id: 42n }),
            );

            await service.setDefault(42n, true);

            expect(updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: { not: 42n },
                    portal_id: 7n,
                    agent_id: 42n,
                }),
                expect.objectContaining({ is_default: false }),
                TX,
            );
        });

        it('setDefault(false) чужие флаги не трогает', async () => {
            await service.setDefault(42n, false);
            expect(updateMany).not.toHaveBeenCalled();
        });

        it('область по умолчанию НЕ содержит contract_type', async () => {
            findById.mockResolvedValue(row({ portal_id: 7n }));
            await service.setDefault(42n, true);
            expect(updateMany.mock.calls[0][0]).not.toHaveProperty(
                'contract_type',
            );
        });

        it('архивация снимает флаг «по умолчанию» и ставит archived_at', async () => {
            await service.setArchived(42n, true);

            const data: Payload = update.mock.calls[0][1];
            expect(data.is_archived).toBe(true);
            expect(data.is_default).toBe(false);
            expect(data.archived_at).toBeInstanceOf(Date);
        });

        it('разархивация чистит archived_at и флаг «по умолчанию» не возвращает', async () => {
            await service.setArchived(42n, false);

            const data: Payload = update.mock.calls[0][1];
            expect(data.is_archived).toBe(false);
            expect(data.archived_at).toBeNull();
            expect(data).not.toHaveProperty('is_default');
        });

        it('снятие портала уводит и поставщика: общий шаблон без агента', async () => {
            await service.setPortal(42n, null);

            const data: Payload = update.mock.calls[0][1];
            expect(data.portal_id).toBeNull();
            expect(data.agent_id).toBeNull();
        });

        it('привязка портала поставщика не трогает', async () => {
            await service.setPortal(42n, '7');

            const data: Payload = update.mock.calls[0][1];
            expect(data.portal_id).toBe(7n);
            expect(data).not.toHaveProperty('agent_id');
        });

        it('setAgent без портала у шаблона — 400', async () => {
            findById.mockResolvedValue(row({ portal_id: null }));
            await expect(service.setAgent(42n, '42')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('setAgent(null) снимает привязку без проверки портала', async () => {
            findById.mockResolvedValue(row({ portal_id: null }));
            await service.setAgent(42n, null);
            expect(update.mock.calls[0][1].agent_id).toBeNull();
        });

        it('setActive(false) пишет флаг и updated_at', async () => {
            await service.setActive(42n, false);

            const data: Payload = update.mock.calls[0][1];
            expect(data.is_active).toBe(false);
            expect(data.updated_at).toBeInstanceOf(Date);
        });
    });

    describe('delete', () => {
        it('удаляет оба файла и строку', async () => {
            findById.mockResolvedValue(
                row({ file_path: 'a.docx', demo_path: 'b.docx' }),
            );

            await service.delete(42n);

            expect(deleteFile).toHaveBeenCalledWith('a.docx');
            expect(deleteFile).toHaveBeenCalledWith('b.docx');
            expect(remove).toHaveBeenCalledWith(42n);
        });

        it('падение удаления файла не мешает удалить строку', async () => {
            deleteFile.mockRejectedValue(new Error('нет прав'));
            await expect(service.delete(42n)).resolves.toBeUndefined();
            expect(remove).toHaveBeenCalledWith(42n);
        });
    });

    describe('getFileForDownload', () => {
        it('отдаёт путь основного файла', async () => {
            await expect(service.getFileForDownload(42n)).resolves.toEqual({
                file_path: 'konstructor/supply-report-templates/a.docx',
                name: 'Отчёт о поставке, интернет',
            });
        });

        it('демо не загружено — 404, а не подмена основным файлом', async () => {
            await expect(service.getFileForDownload(42n, true)).rejects.toThrow(
                NotFoundException,
            );
        });
    });
});
