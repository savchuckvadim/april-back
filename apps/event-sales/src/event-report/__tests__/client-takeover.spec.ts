import { IBXDeal } from '@/modules/bitrix';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    ClientTakeoverInput,
    decideClientTakeover,
} from '../services/takeover/client-takeover';
import {
    getDuplicateCloseStageCode,
    getSalesBaseTargetStageCode,
    getXoTakeoverStageCode,
} from '../services/deal/deal-target-stage.calculator';
import { EVENT_REPORT_EVENT_TYPE } from '../types/event-report.event-codes';

/**
 * Перехват работы у ботов обзвона (gsr 12.11.2026, «Бот Манго»): работу
 * забирает дозвонившийся, лишние сделки ботов закрываются дублями.
 */
const BOT = 643;
const MANAGER = 557;
const COLLEAGUE = 39;
const BASE_CATEGORY = '97';
const XO_CATEGORY = '99';
const LINK = 'UF_CRM_TO_BASE_SALES';

const deal = (
    id: number,
    owner: number,
    modified: string,
    extra: Record<string, unknown> = {},
): IBXDeal =>
    ({
        ID: String(id),
        ASSIGNED_BY_ID: String(owner),
        CATEGORY_ID: BASE_CATEGORY,
        DATE_MODIFY: modified,
        ...extra,
    }) as unknown as IBXDeal;

const xoDeal = (id: number, baseId: number): IBXDeal =>
    deal(id, BOT, '2026-10-28T11:31:14+03:00', {
        CATEGORY_ID: XO_CATEGORY,
        [LINK]: String(baseId),
    });

const input = (
    overrides: Partial<ClientTakeoverInput>,
): ClientTakeoverInput => ({
    currentBaseDeal: null,
    baseDeals: [],
    activeDeals: [],
    xoCategoryId: XO_CATEGORY,
    linkKey: LINK,
    botOwnerIds: [BOT],
    force: false,
    protectedStageIds: new Set<string>(),
    reporterId: MANAGER,
    ...overrides,
});

describe('decideClientTakeover', () => {
    const older = deal(215223, BOT, '2026-11-12T14:54:29+03:00');
    const fresher = deal(217605, BOT, '2026-11-12T15:20:00+03:00');
    const xoOfOlder = xoDeal(215225, 215223);

    it('своей основной нет — забирается САМАЯ СВЕЖАЯ сделка бота, остальные — дубли с их ХО', () => {
        const result = decideClientTakeover(
            input({
                baseDeals: [older, fresher],
                activeDeals: [older, fresher, xoOfOlder],
            }),
        );

        expect(result?.takenDeal?.ID).toBe('217605');
        expect(result?.duplicateDeals.map(d => d.ID)).toEqual(['215223']);
        expect(result?.duplicateXoDeals.map(d => d.ID)).toEqual(['215225']);
        expect(result?.botOwnerIds).toEqual([BOT]);
    });

    it('ХО-сделка забранной сделки в дубли не попадает', () => {
        const result = decideClientTakeover(
            input({
                baseDeals: [older],
                activeDeals: [older, xoOfOlder],
            }),
        );

        expect(result?.takenDeal?.ID).toBe('215223');
        expect(result?.duplicateXoDeals).toEqual([]);
    });

    it('одинаковая дата изменения — свежей считается сделка с большим ID', () => {
        const a = deal(100, BOT, '2026-11-12T15:00:00+03:00');
        const b = deal(200, BOT, '2026-11-12T15:00:00+03:00');

        const result = decideClientTakeover(input({ baseDeals: [b, a] }));

        expect(result?.takenDeal?.ID).toBe('200');
    });

    it('у менеджера своя открытая основная — она остаётся, сделки бота закрываются дублями', () => {
        const own = deal(218027, MANAGER, '2026-11-12T15:25:04+03:00');

        const result = decideClientTakeover(
            input({ currentBaseDeal: own, baseDeals: [own, older] }),
        );

        expect(result?.takenDeal).toBeNull();
        expect(result?.duplicateDeals.map(d => d.ID)).toEqual(['215223']);
    });

    it('основная уже выбрана и это сделка бота (открыли из неё) — забирается она, а не свежая', () => {
        const result = decideClientTakeover(
            input({ currentBaseDeal: older, baseDeals: [older, fresher] }),
        );

        expect(result?.takenDeal?.ID).toBe('215223');
        expect(result?.duplicateDeals.map(d => d.ID)).toEqual(['217605']);
    });

    it('сделку живого коллеги не трогаем: ботов среди владельцев нет — решения нет', () => {
        const colleague = deal(217817, COLLEAGUE, '2026-11-12T15:24:52+03:00');

        expect(
            decideClientTakeover(input({ baseDeals: [colleague] })),
        ).toBeNull();
    });

    it('сделка коллеги рядом со сделкой бота — забирается только сделка бота', () => {
        const colleague = deal(217817, COLLEAGUE, '2026-11-12T15:30:00+03:00');

        const result = decideClientTakeover(
            input({ baseDeals: [older, colleague] }),
        );

        expect(result?.takenDeal?.ID).toBe('215223');
        expect(result?.duplicateDeals).toEqual([]);
    });

    it('ботов в настройке нет — перехвата нет', () => {
        expect(
            decideClientTakeover(
                input({ botOwnerIds: [], baseDeals: [older] }),
            ),
        ).toBeNull();
    });

    it('отчитывается сам бот — перехвата нет', () => {
        expect(
            decideClientTakeover(
                input({ reporterId: BOT, baseDeals: [older] }),
            ),
        ).toBeNull();
    });

    it('ответственный отчёта не известен — перехвата нет', () => {
        expect(
            decideClientTakeover(
                input({ reporterId: null, baseDeals: [older] }),
            ),
        ).toBeNull();
    });
});

const stage = (code: string, bitrixId: string) => ({
    bitrixId,
    code,
    name: code,
    order: 0,
});

/** Воронка ОП gsr: «Прозвон»/«Дозвон» на портале есть, у нас не сопоставлены. */
const baseCategory = {
    bitrixId: 97,
    code: 'sales_base',
    name: 'ОП Основная',
    stages: [
        stage('sales_cold', 'COLD'),
        stage('sales_warm', 'WARM'),
        stage('sales_pres', 'PRESENTATION'),
        stage('sales_double', 'APOLOGY'),
    ],
} as unknown as IPCategory;

const xoCategory = {
    bitrixId: 99,
    code: 'sales_xo',
    name: 'ОП Холодные',
    stages: [stage('cold_success', 'WON'), stage('cold_noresult', 'NORESULT')],
} as unknown as IPCategory;

describe('стадии перехвата', () => {
    it('ХО-сделка забранной работы — «успех»', () => {
        expect(getXoTakeoverStageCode(xoCategory)).toBe('WON');
    });

    it('«Дубль» не установлен — дубль основной в «Не состоялась», ХО — «без результата»', () => {
        expect(getDuplicateCloseStageCode(baseCategory, 'base')).toBe(
            'APOLOGY',
        );
        expect(getDuplicateCloseStageCode(xoCategory, 'xo')).toBe('NORESULT');
    });

    it('«Дубль» установлен — дубль основной в «Дубль»', () => {
        const withDuplicate = {
            ...baseCategory,
            stages: [
                ...baseCategory.stages,
                stage('sales_duplicate', 'DUPLICATE'),
            ],
        } as unknown as IPCategory;
        expect(getDuplicateCloseStageCode(withDuplicate, 'base')).toBe(
            'DUPLICATE',
        );
    });

    it('стадии закрытия в воронке нет — null (дубль не закрываем вслепую)', () => {
        const bare = { ...baseCategory, stages: [stage('sales_cold', 'COLD')] };
        expect(
            getDuplicateCloseStageCode(bare as unknown as IPCategory, 'base'),
        ).toBeNull();
    });
});

/**
 * Неизвестная нам стадия («Прозвон» gsr) на лестницу не влияет: сделка
 * встаёт по тому, о чём отчитались и что запланировали (решение 12.11.2026).
 */
describe('сделка в стадии, которой нет в сопоставлении', () => {
    const baseInput = {
        category: baseCategory,
        currentStageEvent: null,
        reportEventType: null,
        isResult: true,
        isUnplanned: false,
        isSuccess: false,
        isFail: false,
        isNoResult: false,
        isNotCa: false,
        refineStageOnPlan: false,
    };

    it('запланирован звонок — «Переговоры»', () => {
        expect(
            getSalesBaseTargetStageCode({
                ...baseInput,
                planEventType: EVENT_REPORT_EVENT_TYPE.warm,
            }),
        ).toBe('WARM');
    });

    it('спонтанная презентация и звонок по плану — «Презентация»', () => {
        expect(
            getSalesBaseTargetStageCode({
                ...baseInput,
                planEventType: EVENT_REPORT_EVENT_TYPE.warm,
                isUnplanned: true,
            }),
        ).toBe('PRESENTATION');
    });

    it('ни плана, ни события отчёта — сделку не двигаем', () => {
        expect(
            getSalesBaseTargetStageCode({ ...baseInput, planEventType: null }),
        ).toBeNull();
    });
});

/**
 * Режим «вся работа — отчитавшемуся» (report_takeover_force, gsr 12.11.2026):
 * забирается работа любого сотрудника и сделки без ответственного, кроме
 * защищённых стадий.
 */
describe('decideClientTakeover — вся работа отчитавшемуся (force)', () => {
    const colleague = deal(217817, COLLEAGUE, '2026-11-12T15:24:52+03:00');
    const orphan = deal(217823, 0, '2026-11-12T14:40:02+03:00');
    const bot = deal(215239, BOT, '2026-11-12T14:54:09+03:00');
    const force = (overrides: Partial<ClientTakeoverInput>) =>
        input({ force: true, botOwnerIds: [], ...overrides });

    it('забирается самая свежая сделка коллеги, сделка без ответственного — дубль', () => {
        const result = decideClientTakeover(
            force({ baseDeals: [orphan, colleague] }),
        );

        expect(result?.mode).toBe('force');
        expect(result?.takenDeal?.ID).toBe('217817');
        expect(result?.duplicateDeals.map(d => d.ID)).toEqual(['217823']);
    });

    it('боты в force-режиме тоже перехватываются', () => {
        const result = decideClientTakeover(
            force({ botOwnerIds: [BOT], baseDeals: [bot, colleague] }),
        );

        expect(result?.takenDeal?.ID).toBe('217817');
        expect(result?.duplicateDeals.map(d => d.ID)).toEqual(['215239']);
    });

    it('своя основная у менеджера — остаётся, чужие закрываются дублями', () => {
        const own = deal(218139, MANAGER, '2026-11-12T16:29:45+03:00');

        const result = decideClientTakeover(
            force({
                currentBaseDeal: own,
                baseDeals: [own, colleague, orphan],
            }),
        );

        expect(result?.takenDeal).toBeNull();
        expect(result?.duplicateDeals.map(d => d.ID).sort()).toEqual([
            '217817',
            '217823',
        ]);
    });

    it('сделка коллеги на защищённой стадии не забирается и не закрывается — только предупреждение', () => {
        const late = deal(300, COLLEAGUE, '2026-11-12T17:00:00+03:00', {
            STAGE_ID: 'C97:MONEY_AWAIT',
        });

        const result = decideClientTakeover(
            force({
                baseDeals: [late, orphan],
                protectedStageIds: new Set(['C97:MONEY_AWAIT']),
            }),
        );

        expect(result?.takenDeal?.ID).toBe('217823');
        expect(result?.duplicateDeals).toEqual([]);
        expect(result?.protectedDeals.map(d => d.ID)).toEqual(['300']);
    });

    it('у клиента только защищённая сделка коллеги — решение есть, но забирать нечего', () => {
        const late = deal(300, COLLEAGUE, '2026-11-12T17:00:00+03:00', {
            STAGE_ID: 'C97:MONEY_AWAIT',
        });

        const result = decideClientTakeover(
            force({
                baseDeals: [late],
                protectedStageIds: new Set(['C97:MONEY_AWAIT']),
            }),
        );

        expect(result?.takenDeal).toBeNull();
        expect(result?.duplicateDeals).toEqual([]);
        expect(result?.protectedDeals.map(d => d.ID)).toEqual(['300']);
    });

    it('без force и без ботов — правило 25.08: чужое не трогаем', () => {
        expect(
            decideClientTakeover(
                input({ botOwnerIds: [], baseDeals: [colleague] }),
            ),
        ).toBeNull();
    });
});
