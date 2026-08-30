import { PBXService } from '@/modules/pbx';
import {
    PbxZprSmartService,
    ZprSmartInfo,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    PbxSmartItemFieldsService,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import {
    SideFlowBaseDealResolver,
    SideFlowTaskBinderService,
} from '../../shared/side-flow';
import { ZprFlowUseCase } from '../use-cases/zpr-flow.use-case';
import { BxRow } from '../types/zpr-flow-run.type';
import {
    answer,
    ITEM_FIELDS,
    job,
    makeBitrix,
    makeInfo,
    makePortal,
} from './zpr-flow.fixtures';

/**
 * Оркестрация одного джоба ЗПР: self-gate по установке смарта, дотяжка
 * базовой сделки, роутинг план/отчёт и привязка получившегося элемента к
 * задаче. Подсервисы записи здесь настоящие (они и создаются внутри
 * прогона, `new ZprElementWriterService(bitrix, portal)`), фейковый —
 * только клиент Битрикса.
 */
const makeHarness = (over?: {
    /** undefined — смарт установлен; null — не установлен (self-gate). */
    info?: ZprSmartInfo | null;
    openItems?: BxRow[];
    companyDeals?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
    /** null — живые поля прочитать не удалось. */
    itemFields?: SmartItemFields | null;
}) => {
    const spy = makeBitrix({
        openItems: over?.openItems,
        companyDeals: over?.companyDeals,
    });
    const portal = makePortal();

    const pbx = {
        init: () =>
            Promise.resolve({ bitrix: spy.bitrix, PortalModel: portal }),
    } as unknown as PBXService;
    const zprSmart = {
        resolveInfo: () =>
            Promise.resolve(over?.info === undefined ? makeInfo() : over.info),
    } as unknown as PbxZprSmartService;

    const itemFieldsCalls: Array<{ domain: string; entityTypeId: number }> = [];
    const smartItemFields = {
        resolveFields: (domain: string, entityTypeId: number) => {
            itemFieldsCalls.push({ domain, entityTypeId });
            return Promise.resolve(
                over?.itemFields === undefined ? ITEM_FIELDS : over.itemFields,
            );
        },
    } as unknown as PbxSmartItemFieldsService;

    // Привязка к задаче и дотяжка сделки — настоящие: они stateless и
    // берут клиента Битрикса аргументом, подменять их нечем и незачем.
    // Биндер при этом под наблюдением: он общий на две очереди и подписывает
    // логи именем потока, которое обязан передать вызывающий.
    const baseDeal = new SideFlowBaseDealResolver();
    jest.spyOn(baseDeal['logger'], 'log').mockImplementation(() => undefined);
    const taskBinder = new SideFlowTaskBinderService();
    const bind = jest.spyOn(taskBinder, 'bind');
    const useCase = new ZprFlowUseCase(
        pbx,
        zprSmart,
        smartItemFields,
        taskBinder,
        baseDeal,
    );

    // Итоговый лог прогона перехватываем: по нему же проверяется, что
    // telegram-запись на джоб ровно одна и осмысленная.
    const logs: unknown[][] = [];
    jest.spyOn(useCase['logger'], 'log').mockImplementation(
        (...args: unknown[]) => {
            logs.push(args);
        },
    );
    jest.spyOn(useCase['logger'], 'debug').mockImplementation(() => undefined);

    return { useCase, itemFieldsCalls, logs, bind, ...spy };
};

/** Открытый элемент клиента, найденный по базовой сделке. */
const openItem: BxRow = {
    id: 601,
    stageId: 'DT1038_9:PLAN',
    ufCrm7BaseDeal: ['D_100'],
};

describe('ZprFlowUseCase', () => {
    it('план создаёт элемент, отчёт закрывает открытый (роутинг по kind)', async () => {
        const planned = makeHarness();
        const plan = await planned.useCase.handle(job());
        expect(plan).toEqual({ action: 'created', elementId: 501 });
        expect(planned.added).toHaveLength(1);

        const reported = makeHarness({ openItems: [openItem] });
        const report = await reported.useCase.handle(job({ kind: 'report' }));
        expect(report).toEqual({ action: 'closed', elementId: 601 });
        expect(reported.updatedItems).toHaveLength(1);
    });

    it('смарт не установлен — тишина (self-gate)', async () => {
        const { useCase, added, updatedItems } = makeHarness({ info: null });

        const result = await useCase.handle(job());

        expect(result).toEqual({ action: 'skipped', elementId: null });
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(0);
    });

    it('смарт не установлен — ответы никуда не пишутся, джоб пропущен', async () => {
        const { useCase, added, updatedItems } = makeHarness({ info: null });
        const warn = jest
            .spyOn(useCase['logger'], 'warn')
            .mockImplementation(() => undefined);

        const result = await useCase.handle(
            job({ answers: [answer({ purpose: 'plan' })] }),
        );

        expect(result.action).toBe('skipped');
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(0);
        /*
         * Именно warning, а не debug: в проде debug выключен, и потеря
         * ответов менеджера была бы беззвучной. В строке — сколько
         * ответов потеряно.
         */
        expect(warn).toHaveBeenCalled();
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('1 ответ(ов) портальной анкеты');
        expect(message).toContain('записать некуда');
    });

    it('смарт не установлен и ответов нет — предупреждать не о чем', async () => {
        const { useCase } = makeHarness({ info: null });
        const warn = jest
            .spyOn(useCase['logger'], 'warn')
            .mockImplementation(() => undefined);

        await useCase.handle(job());

        // Портал без смарта даёт этот пропуск на каждом отчёте — шуметь
        // в логе нечем, терять тоже нечего.
        expect(warn).not.toHaveBeenCalled();
    });

    // ───────────────────── дотяжка базовой сделки ─────────────────────

    it('дотяжка: сделку создал этот же отчёт — id находится по компании', async () => {
        const { useCase, added } = makeHarness({
            // ASSIGNED_BY_ID строкой — REST отдаёт строки, сравнение числом.
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '8' },
                { ID: '555', ASSIGNED_BY_ID: '8' },
            ],
        });

        const result = await useCase.handle(job({ baseDealId: null }));

        expect(result.action).toBe('created');
        // Свежая (максимальный id) открытая сделка основной воронки.
        expect(added[0].ufCrm7BaseDeal).toEqual(['D_555']);
    });

    it('дотяжка: своя сделка предпочитается чужой даже с меньшим id', async () => {
        const { useCase, added } = makeHarness({
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '8' },
                // Чужая свежее — но правило владельца (25.08) её исключает.
                { ID: '555', ASSIGNED_BY_ID: '3' },
            ],
        });

        await useCase.handle(job({ baseDealId: null }));

        expect(added[0].ufCrm7BaseDeal).toEqual(['D_321']);
    });

    it('дотяжка: только чужие открытые — сделка не подхватывается вовсе', async () => {
        const { useCase, added } = makeHarness({
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '3' },
                { ID: '555', ASSIGNED_BY_ID: '5' },
            ],
        });

        await useCase.handle(job({ baseDealId: null }));

        // Честная деградация: элемент живёт на компании/лиде, чужая сделка
        // не трогается (правило владельца 25.08).
        expect(added[0].ufCrm7BaseDeal).toBeUndefined();
        expect(added[0].ufCrm7Company).toEqual(['CO_431']);
    });

    it('дотяжка не нашла сделку — элемент честно живёт на компании/лиде', async () => {
        const { useCase, added } = makeHarness({ companyDeals: [] });

        await useCase.handle(job({ baseDealId: null }));

        expect(added[0].ufCrm7BaseDeal).toBeUndefined();
        expect(added[0].ufCrm7Company).toEqual(['CO_431']);
    });

    // ───────────────────── привязка элемента к задаче ─────────────────

    it('отчёт с taskId привязывает элемент к задаче (T{hex}_{id} в UF_CRM_TASK)', async () => {
        const { useCase, taskUpdates } = makeHarness({ openItems: [openItem] });

        await useCase.handle(job({ kind: 'report', taskId: 738563 }));

        expect(taskUpdates).toHaveLength(1);
        expect(taskUpdates[0].id).toBe(738563);
        // Существующие привязки сохранены, ссылка на элемент дописана.
        expect(taskUpdates[0].fields.UF_CRM_TASK).toEqual([
            'D_100',
            'CO_431',
            'T40e_601',
        ]);
    });

    it('план привязывается к задаче, СОЗДАННОЙ этим же отчётом', async () => {
        const { useCase, taskUpdates } = makeHarness();

        // planTaskId приезжает из `$result[add_task]` того же батча —
        // раньше плановый элемент ждал привязки до своего закрытия.
        await useCase.handle(
            job({ kind: 'plan', taskId: 738563, planTaskId: 900001 }),
        );

        expect(taskUpdates).toHaveLength(1);
        expect(taskUpdates[0].id).toBe(900001);
        expect(taskUpdates[0].fields.UF_CRM_TASK).toEqual([
            'D_100',
            'CO_431',
            'T40e_501',
        ]);
    });

    it('план без planTaskId (отчёт задачу не заводил) задачу не трогает', async () => {
        const { useCase, taskUpdates } = makeHarness();

        await useCase.handle(job({ kind: 'plan', taskId: 738563 }));

        expect(taskUpdates).toHaveLength(0);
    });

    it('перенос привязывает элемент к ТОЙ ЖЕ задаче', async () => {
        const { useCase, taskUpdates } = makeHarness({ openItems: [openItem] });

        await useCase.handle(
            job({ kind: 'report', isMove: true, taskId: 738563 }),
        );

        // Задача переносится, а не закрывается — элемент у неё тот же.
        expect(taskUpdates).toHaveLength(1);
        expect(taskUpdates[0].id).toBe(738563);
    });

    it('без taskId (легаси-джоб) задача не трогается', async () => {
        const { useCase, taskUpdates } = makeHarness({ openItems: [openItem] });

        await useCase.handle(job({ kind: 'report' }));

        expect(taskUpdates).toHaveLength(0);
    });

    /*
     * Биндер общий на две очереди и подписывает свои логи именем потока —
     * знать его он может только от вызывающего. Не передать имя значит
     * вернуть безликий `[side-flow]`, по которому уже не найти, чей отчёт
     * не привязал элемент.
     */
    it('биндеру передаётся имя потока — им подписан лог привязки', async () => {
        const { useCase, bind } = makeHarness({ openItems: [openItem] });

        await useCase.handle(job({ kind: 'report', taskId: 738563 }));

        expect(bind).toHaveBeenCalledWith(
            expect.anything(),
            738563,
            1038,
            601,
            'zpr-flow',
        );
    });

    // ───────────────────── живые поля элемента ────────────────────────

    it('ответов нет — живые поля не читаются вовсе (горячий путь)', async () => {
        const { useCase, itemFieldsCalls } = makeHarness();

        await useCase.handle(job());

        expect(itemFieldsCalls).toHaveLength(0);
    });

    it('ответы есть — живые поля читаются один раз по домену и типу смарта', async () => {
        const { useCase, itemFieldsCalls, added } = makeHarness();

        await useCase.handle(
            job({ answers: [answer({ purpose: 'plan', value: 'Ждут КП' })] }),
        );

        expect(itemFieldsCalls).toEqual([
            { domain: 'x.bitrix24.ru', entityTypeId: 1038 },
        ]);
        expect(added[0].ufCrm7QObjection).toBe('Ждут КП');
    });

    // ──────────────────────── лог прогона ─────────────────────────────

    it('на прогон приходится ОДИН telegram-лог с исходом', async () => {
        const { useCase, logs } = makeHarness();

        await useCase.handle(job({ kind: 'plan', planTaskId: 900001 }));

        const telegram = logs.filter(
            args => (args[1] as { telegram?: boolean } | undefined)?.telegram,
        );
        expect(telegram).toHaveLength(1);
        expect(telegram[0][1]).toEqual({
            telegram: true,
            domain: 'x.bitrix24.ru',
            operationId: 'op-1',
            kind: 'plan',
            action: 'created',
            elementId: 501,
            planTaskId: 900001,
            boundTaskId: 900001,
        });
    });
});
