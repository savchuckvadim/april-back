import { IBXStatus } from '@/modules/bitrix';
import { Stage } from '@app/pbx-install/shared';
import { DealCategoryStageStrategy } from '../../deal/services/categories/deal-category-stage.strategy';
import { InstallStageSyncService } from '../install-stage-sync.service';

/**
 * Поштучная синхронизация стадии (`syncSingleStage`).
 *
 * Контракт, ради которого метод и появился:
 *  - upsert ОДНОЙ стадии: add при отсутствии, update при наличии;
 *  - НИЧЕГО не удаляет — ни статусы Bitrix вне шаблона, ни строки btx_stages
 *    (полный синк считает шаблон исчерпывающим, здесь шаблон сужен до одной
 *    строки, и удаление стёрло бы воронку);
 *  - `reorder` по умолчанию ВКЛЮЧЁН: стадия, вставленная в середину лестницы,
 *    иначе встанет в Bitrix последней, потому что у соседей старые SORT;
 *  - reorder правит ТОЛЬКО SORT и только существующих соседей.
 */

const BX_CATEGORY_ID = 7;
const PORTAL_CATEGORY_ID = 42;

/** Строка шаблона (лист «стадии» Excel). */
const stage = (over: Partial<Stage> = {}): Stage =>
    ({
        id: '13',
        entityTypeId: '2',
        entityType: 'deal',
        parentType: 'sales',
        type: 'P',
        group: 'sales',
        name: 'Не ЦА',
        title: 'Не ЦА',
        bitrixId: 'NOT_CA',
        isActive: true,
        smartBitrixId: 'DEAL_STAGE',
        color: '#2D0B0D',
        code: 'sales_not_ca',
        isNeedUpdate: true,
        order: 14,
        bitrixEnitiyId: '',
        isDefault: 'N',
        ...over,
    }) as Stage;

/** Строка crm.status из Bitrix. */
const bxStatus = (
    statusId: string,
    id: number,
    sort: number,
): Partial<IBXStatus> => ({
    ID: String(id),
    STATUS_ID: statusId,
    NAME: statusId,
    SORT: sort,
});

interface Harness {
    service: InstallStageSyncService;
    bitrix: {
        status: {
            getList: jest.Mock;
            add: jest.Mock;
            update: jest.Mock;
            delete: jest.Mock;
        };
        api: { call: jest.Mock };
    };
    repo: {
        findByCategoryId: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
        deleteByCategoryId: jest.Mock;
    };
    strategy: DealCategoryStageStrategy;
}

const NEW_BX_ID = 555;

/**
 * Stateful-фейк справочника Bitrix: `add` реально кладёт строку в список,
 * и второй `getList` её видит. Это существенно — `bitrixId` для БД сервис
 * берёт из ПЕРЕЧИТАННОГО справочника, а не из шаблона.
 */
const makeHarness = (
    options: {
        bxRows?: Partial<IBXStatus>[];
        portalStages?: { id: number; code: string; bitrixId: string }[];
        /** Bitrix «проглотил» add: ответ есть, строки в справочнике нет. */
        swallowAdd?: boolean;
        /** Bitrix сохранил STATUS_ID не тем, что просили (нормализация). */
        rewriteStatusIdTo?: string;
    } = {},
): Harness => {
    const rows: Partial<IBXStatus>[] = [...(options.bxRows ?? [])];
    const bitrix = {
        status: {
            getList: jest
                .fn()
                .mockImplementation(() =>
                    Promise.resolve({ result: rows.map(r => ({ ...r })) }),
                ),
            add: jest.fn().mockImplementation((fields: Partial<IBXStatus>) => {
                if (!options.swallowAdd) {
                    rows.push({
                        ID: String(NEW_BX_ID),
                        STATUS_ID:
                            options.rewriteStatusIdTo ?? fields.STATUS_ID,
                        NAME: fields.NAME,
                        SORT: fields.SORT,
                    });
                }
                return Promise.resolve({ result: NEW_BX_ID });
            }),
            update: jest.fn().mockResolvedValue({ result: true }),
            delete: jest.fn().mockResolvedValue({ result: true }),
        },
        api: { call: jest.fn() },
    };
    const repo = {
        findByCategoryId: jest
            .fn()
            .mockResolvedValue(options.portalStages ?? []),
        create: jest.fn().mockResolvedValue({ id: 101 }),
        update: jest.fn().mockResolvedValue({ id: 100 }),
        delete: jest.fn(),
        deleteByCategoryId: jest.fn(),
    };
    return {
        service: new InstallStageSyncService(repo as never),
        bitrix,
        repo,
        strategy: new DealCategoryStageStrategy(),
    };
};

const run = (h: Harness, over: Record<string, unknown> = {}) =>
    h.service.syncSingleStage({
        bitrix: h.bitrix as never,
        entityTypeId: 2,
        bxCategoryId: BX_CATEGORY_ID,
        portalCategoryId: PORTAL_CATEGORY_ID,
        stage: stage(),
        templateStages: [stage()],
        strategy: h.strategy,
        ...over,
    });

describe('InstallStageSyncService.syncSingleStage', () => {
    describe('стадии нет в Bitrix', () => {
        it('заводит статус с полным набором полей и отдаёт created', async () => {
            const h = makeHarness();
            const result = await run(h);

            expect(h.bitrix.status.add).toHaveBeenCalledTimes(1);
            expect(h.bitrix.status.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    ENTITY_ID: `DEAL_STAGE_${BX_CATEGORY_ID}`,
                    STATUS_ID: `C${BX_CATEGORY_ID}:NOT_CA`,
                    NAME: 'Не ЦА',
                    SORT: 14,
                    COLOR: '#2D0B0D',
                }),
            );
            expect(h.bitrix.status.update).not.toHaveBeenCalled();
            expect(result.bxAction).toBe('created');
            expect(result.statusId).toBe(`C${BX_CATEGORY_ID}:NOT_CA`);
            expect(result.bxId).toBe(555);
        });

        /* Семантика — единственный признак «отрицательная стадия» в Bitrix. */
        it('прокидывает SEMANTICS для отказной стадии шаблона', async () => {
            const h = makeHarness();
            await run(h, { stage: stage({ type: 'F' }) });

            expect(h.bitrix.status.add).toHaveBeenCalledWith(
                expect.objectContaining({ SEMANTICS: 'F' }),
            );
        });

        it('промежуточной стадии SEMANTICS не шлёт (дефолт Bitrix)', async () => {
            const h = makeHarness();
            await run(h, { stage: stage({ type: 'P' }) });

            const addMock = h.bitrix.status.add as jest.Mock<
                Promise<unknown>,
                [Record<string, unknown>]
            >;
            const [fields] = addMock.mock.calls[0];
            expect(fields).not.toHaveProperty('SEMANTICS');
        });

        it('создаёт строку в btx_stages', async () => {
            const h = makeHarness();
            const result = await run(h);

            expect(h.repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'sales_not_ca',
                    bitrixId: 'NOT_CA',
                    name: 'Не ЦА',
                    color: '#2D0B0D',
                }),
            );
            expect(h.repo.update).not.toHaveBeenCalled();
            expect(result.portalAction).toBe('created');
            expect(result.portalStageId).toBe(101);
        });
    });

    /*
     * `btx_stages.bitrixId` — это суффикс STATUS_ID, из которого рантайм
     * собирает `C{cat}:{bitrixId}`. Записанное «на веру» значение, которого
     * в Bitrix нет, тихо ломает движение сделок: сервисы не резолвят стадию
     * и молча не двигают сделку. Поэтому значение берётся из Bitrix.
     */
    describe('bitrixId приезжает из Bitrix, а не из шаблона', () => {
        it('справочник перечитывается ПОСЛЕ применения стадии', async () => {
            const h = makeHarness();
            await run(h);

            expect(h.bitrix.status.getList).toHaveBeenCalledTimes(2);
        });

        it('Bitrix сохранил другой STATUS_ID — в БД уезжает его значение', async () => {
            const h = makeHarness({
                rewriteStatusIdTo: `C${BX_CATEGORY_ID}:NOT_CA_1`,
            });
            await run(h);

            expect(h.repo.create).toHaveBeenCalledWith(
                expect.objectContaining({ bitrixId: 'NOT_CA_1' }),
            );
        });

        it('Bitrix стадию не принял — строка в БД не пишется, операция падает', async () => {
            const h = makeHarness({ swallowAdd: true });

            await expect(run(h)).rejects.toThrow(/не найдена в Bitrix/);
            expect(h.repo.create).not.toHaveBeenCalled();
            expect(h.repo.update).not.toHaveBeenCalled();
        });

        it('у дефолтной воронки префикса нет — bitrixId пишется как есть', async () => {
            const h = makeHarness();
            await run(h, { bxCategoryId: 0 });

            expect(h.repo.create).toHaveBeenCalledWith(
                expect.objectContaining({ bitrixId: 'NOT_CA' }),
            );
        });
    });

    describe('стадия уже есть', () => {
        it('обновляет статус по его ID и не добавляет новый', async () => {
            const h = makeHarness({
                bxRows: [bxStatus(`C${BX_CATEGORY_ID}:NOT_CA`, 900, 99)],
            });
            const result = await run(h);

            expect(h.bitrix.status.add).not.toHaveBeenCalled();
            expect(h.bitrix.status.update).toHaveBeenCalledWith(
                '900',
                expect.objectContaining({ NAME: 'Не ЦА', SORT: 14 }),
            );
            expect(result.bxAction).toBe('updated');
            expect(result.bxId).toBe('900');
        });

        it('обновляет строку btx_stages, найденную по code', async () => {
            const h = makeHarness({
                portalStages: [
                    { id: 77, code: 'sales_not_ca', bitrixId: 'NOT_CA' },
                ],
            });
            const result = await run(h);

            expect(h.repo.update).toHaveBeenCalledWith(
                77,
                expect.objectContaining({ code: 'sales_not_ca' }),
            );
            expect(h.repo.create).not.toHaveBeenCalled();
            expect(result.portalAction).toBe('updated');
        });
    });

    /*
     * Главное отличие от syncStagesForCategory: тот считает переданный список
     * исчерпывающим шаблоном и вычищает всё лишнее. Поштучной операции такое
     * поведение снесло бы всю воронку, кроме одной стадии.
     */
    describe('ничего не удаляет', () => {
        it('не трогает статусы Bitrix вне шаблонной строки', async () => {
            const h = makeHarness({
                bxRows: [
                    bxStatus(`C${BX_CATEGORY_ID}:NEW`, 1, 1),
                    bxStatus(`C${BX_CATEGORY_ID}:LOSE`, 2, 12),
                ],
            });
            await run(h);

            expect(h.bitrix.status.delete).not.toHaveBeenCalled();
            expect(h.bitrix.api.call).not.toHaveBeenCalled();
        });

        it('не удаляет строки btx_stages вне шаблонной строки', async () => {
            const h = makeHarness({
                portalStages: [
                    { id: 1, code: 'sales_new', bitrixId: 'NEW' },
                    { id: 2, code: 'sales_fail', bitrixId: 'LOSE' },
                ],
            });
            await run(h);

            expect(h.repo.delete).not.toHaveBeenCalled();
            expect(h.repo.deleteByCategoryId).not.toHaveBeenCalled();
        });
    });

    describe('reorder', () => {
        const ladder = [
            stage({ code: 'sales_pres', bitrixId: 'PRESENTATION', order: 4 }),
            stage({ code: 'sales_refine', bitrixId: 'REFINE', order: 5 }),
            stage({
                code: 'sales_offer_create',
                bitrixId: 'OFFER_CREATE',
                order: 6,
            }),
            stage(),
        ];

        /*
         * Кейс переезда «Доработки»: в Bitrix у неё старый SORT 7, у
         * документов 5. Без пересчёта стадия визуально осталась бы после
         * документов.
         */
        it('по умолчанию правит SORT соседей, у которых он разошёлся с шаблоном', async () => {
            const h = makeHarness({
                bxRows: [
                    bxStatus(`C${BX_CATEGORY_ID}:PRESENTATION`, 10, 4),
                    bxStatus(`C${BX_CATEGORY_ID}:REFINE`, 11, 7),
                    bxStatus(`C${BX_CATEGORY_ID}:OFFER_CREATE`, 12, 5),
                ],
            });
            const result = await run(h, { templateStages: ladder });

            expect(h.bitrix.status.update).toHaveBeenCalledWith('11', {
                SORT: 5,
            });
            expect(h.bitrix.status.update).toHaveBeenCalledWith('12', {
                SORT: 6,
            });
            expect(result.reorderedStatusIds).toEqual([
                `C${BX_CATEGORY_ID}:REFINE`,
                `C${BX_CATEGORY_ID}:OFFER_CREATE`,
            ]);
        });

        it('не дёргает соседа, у которого SORT уже верный', async () => {
            const h = makeHarness({
                bxRows: [bxStatus(`C${BX_CATEGORY_ID}:PRESENTATION`, 10, 4)],
            });
            const result = await run(h, { templateStages: ladder });

            expect(result.reorderedStatusIds).not.toContain(
                `C${BX_CATEGORY_ID}:PRESENTATION`,
            );
        });

        /* Поштучная операция не заводит соседей — для этого есть полный install. */
        it('не создаёт стадии шаблона, которых нет на портале', async () => {
            const h = makeHarness();
            const result = await run(h, { templateStages: ladder });

            expect(h.bitrix.status.add).toHaveBeenCalledTimes(1);
            expect(result.reorderedStatusIds).toEqual([]);
        });

        it('reorder=false оставляет соседей нетронутыми', async () => {
            const h = makeHarness({
                bxRows: [
                    bxStatus(`C${BX_CATEGORY_ID}:REFINE`, 11, 7),
                    bxStatus(`C${BX_CATEGORY_ID}:OFFER_CREATE`, 12, 5),
                ],
            });
            const result = await run(h, {
                templateStages: ladder,
                reorder: false,
            });

            expect(h.bitrix.status.update).not.toHaveBeenCalled();
            expect(result.reorderedStatusIds).toEqual([]);
        });

        /* SORT целевой стадии уже выставлен на шаге upsert — второй раз не шлём. */
        it('не переобновляет SORT самой синхронизируемой стадии', async () => {
            const h = makeHarness({
                bxRows: [bxStatus(`C${BX_CATEGORY_ID}:NOT_CA`, 900, 1)],
            });
            const result = await run(h, { templateStages: ladder });

            expect(result.reorderedStatusIds).not.toContain(
                `C${BX_CATEGORY_ID}:NOT_CA`,
            );
            const sortOnlyCalls = h.bitrix.status.update.mock.calls.filter(
                ([id]) => id === '900',
            );
            expect(sortOnlyCalls).toHaveLength(1);
        });
    });

    /* Дефолтная воронка сделки живёт без префикса категории в STATUS_ID. */
    it('для дефолтной воронки (bxCategoryId=0) STATUS_ID идёт без префикса', async () => {
        const h = makeHarness();
        const result = await run(h, { bxCategoryId: 0 });

        expect(result.statusId).toBe('NOT_CA');
        expect(h.bitrix.status.add).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 'DEAL_STAGE',
                STATUS_ID: 'NOT_CA',
            }),
        );
    });
});
