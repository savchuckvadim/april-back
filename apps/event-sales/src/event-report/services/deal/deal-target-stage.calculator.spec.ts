import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    getSalesBaseTargetStageCode,
    getXoTargetStageCode,
    getPresentationTargetStageCode,
    composeStageId,
    detectEventFromBaseStage,
    BaseStageInput,
} from './deal-target-stage.calculator';

const stage = (code: string, bitrixId: string) => ({
    bitrixId,
    code,
    name: code,
    order: 0,
});

const baseCategory: IPCategory = {
    bitrixId: 17,
    code: 'sales_base',
    name: 'ОП Основная',
    stages: [
        stage('sales_new', 'NEW'),
        stage('sales_cold', 'PREPARATION'),
        stage('sales_warm', 'WARM'),
        stage('sales_pres', 'PRES'),
        stage('sales_refine', 'REFINE'),
        stage('sales_offer_create', 'OFFER_CREATE'),
        stage('sales_document_send', 'DOCUMENT_SEND'),
        stage('sales_in_progress', 'HOT'),
        stage('sales_money_await', 'PAY'),
        stage('sales_success', 'WON'),
        stage('sales_fail', 'LOSE'),
        stage('sales_double', 'APOLOGY'),
        stage('sales_not_ca', 'NOT_CA'),
    ],
} as unknown as IPCategory;

const xoCategory: IPCategory = {
    bitrixId: 32,
    code: 'sales_xo',
    name: 'ОП Холодные',
    stages: [
        stage('cold_pending', 'PENDING'),
        stage('cold_success', 'WON'),
        stage('cold_fail', 'LOSE'),
        stage('cold_noresult', 'NORESULT'),
    ],
} as unknown as IPCategory;

const presCategory: IPCategory = {
    bitrixId: 48,
    code: 'sales_presentation',
    name: 'ОП Презентации',
    stages: [
        stage('spres_plan', 'PLAN'),
        stage('spres_pending', 'PENDING'),
        stage('spres_success', 'WON'),
        stage('spres_fail', 'LOSE'),
        stage('spres_noresult', 'NORESULT'),
    ],
} as unknown as IPCategory;

/** Вход по умолчанию: ничего не произошло, флаги сняты. */
const baseInput = (patch: Partial<BaseStageInput> = {}): BaseStageInput => ({
    category: baseCategory,
    currentStageEvent: null,
    planEventType: null,
    reportEventType: null,
    isResult: true,
    isUnplanned: false,
    isSuccess: false,
    isFail: false,
    isNoResult: false,
    isNotCa: false,
    refineStageOnPlan: false,
    ...patch,
});

describe('getSalesBaseTargetStageCode', () => {
    it('isSuccess побеждает все остальные сигналы', () => {
        expect(
            getSalesBaseTargetStageCode(
                baseInput({
                    currentStageEvent: 'warm',
                    planEventType: 'presentation',
                    reportEventType: 'warm',
                    isSuccess: true,
                }),
            ),
        ).toBe('WON');
    });

    it('plan=presentation двигает на pres-стадию', () => {
        expect(
            getSalesBaseTargetStageCode(
                baseInput({
                    currentStageEvent: 'warm',
                    planEventType: 'presentation',
                    reportEventType: 'warm',
                }),
            ),
        ).toBe('PRES');
    });

    it('берёт максимум по «лестнице» из current/plan/report', () => {
        expect(
            getSalesBaseTargetStageCode(
                baseInput({
                    currentStageEvent: 'hot',
                    planEventType: 'warm',
                    reportEventType: 'presentation',
                }),
            ),
        ).toBe('HOT');
    });

    it('isUnplanned добавляет presentation в кандидаты', () => {
        expect(
            getSalesBaseTargetStageCode(
                baseInput({
                    currentStageEvent: 'warm',
                    reportEventType: 'warm',
                    isUnplanned: true,
                }),
            ),
        ).toBe('PRES');
    });

    it('ни одного сигнала и без финального статуса — стадии нет', () => {
        expect(getSalesBaseTargetStageCode(baseInput())).toBeNull();
    });

    /*
     * «Доработка» стоит МЕЖДУ презентацией и документами: клиента дорабатывают
     * (узнают компанию, ИНН) после презентации и до подготовки документов.
     */
    describe('место «Доработки» в лестнице', () => {
        it('доработка выше презентации', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'presentation',
                        planEventType: 'refine',
                    }),
                ),
            ).toBe('REFINE');
        });

        it('документы выше доработки — сделка идёт вперёд', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'refine',
                        planEventType: 'document',
                    }),
                ),
            ).toBe('OFFER_CREATE');
        });

        it('с документов доработка не откатывает сделку назад', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'document',
                        planEventType: 'refine',
                    }),
                ),
            ).toBe('OFFER_CREATE');
        });
    });

    /*
     * Настройка портала `refine_stage_on_plan_enabled` (02.09.2026):
     * единственное исключение из «нельзя понизить».
     */
    describe('настройка «Доработка всегда при плане»', () => {
        it('с решения план «Доработка» откатывает сделку на «Доработку»', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'hot',
                        planEventType: 'refine',
                        refineStageOnPlan: true,
                    }),
                ),
            ).toBe('REFINE');
        });

        it('отчёт по решению + план «Доработка» — план побеждает', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'hot',
                        reportEventType: 'hot',
                        planEventType: 'refine',
                        refineStageOnPlan: true,
                    }),
                ),
            ).toBe('REFINE');
        });

        it('финалы перебивают исключение: отказ с планом доработки — отказ', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'hot',
                        planEventType: 'refine',
                        isFail: true,
                        refineStageOnPlan: true,
                    }),
                ),
            ).toBe('LOSE');
        });

        it('другой план исключения не касается — лестница как всегда', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'hot',
                        planEventType: 'warm',
                        refineStageOnPlan: true,
                    }),
                ),
            ).toBe('HOT');
        });

        it('без настройки — прежнее поведение, сделка остаётся на решении', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'hot',
                        planEventType: 'refine',
                    }),
                ),
            ).toBe('HOT');
        });
    });

    describe('отказные финалы', () => {
        it('обычный отказ по результату разговора → «Отказ»', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'warm',
                        reportEventType: 'warm',
                        isFail: true,
                    }),
                ),
            ).toBe('LOSE');
        });

        it('отказ по нерезультативному отчёту → «Не состоялась»', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'warm',
                        reportEventType: 'warm',
                        isResult: false,
                        isNoResult: true,
                        isFail: true,
                    }),
                ),
            ).toBe('APOLOGY');
        });

        it('нецелевой клиент → «Не ЦА» даже при нерезультативном отчёте', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        currentStageEvent: 'warm',
                        reportEventType: 'warm',
                        isResult: false,
                        isNoResult: true,
                        isFail: true,
                        isNotCa: true,
                    }),
                ),
            ).toBe('NOT_CA');
        });

        it('продажа перебивает любой отказной признак', () => {
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        reportEventType: 'warm',
                        isSuccess: true,
                        isFail: true,
                        isNotCa: true,
                    }),
                ),
            ).toBe('WON');
        });

        /*
         * Отказ обязан закрыть сделку, даже если стадия «Не ЦА»/«Не
         * состоялась» ещё не установлена на портале: иначе менеджер шлёт
         * отказ, а сделка молча остаётся открытой.
         */
        it('нет стадии «Не ЦА» на портале — стадия не резолвится, а не подменяется', () => {
            const withoutNotCa = {
                ...baseCategory,
                stages: baseCategory.stages.filter(
                    st => st.code !== 'sales_not_ca',
                ),
            } as IPCategory;
            expect(
                getSalesBaseTargetStageCode(
                    baseInput({
                        category: withoutNotCa,
                        reportEventType: 'warm',
                        isFail: true,
                        isNotCa: true,
                    }),
                ),
            ).toBeNull();
        });
    });
});

describe('detectEventFromBaseStage', () => {
    it('стадия доработки распознаётся как событие refine', () => {
        expect(detectEventFromBaseStage(baseCategory, 'C17:REFINE')).toBe(
            'refine',
        );
    });

    it('стадия документов распознаётся как событие document', () => {
        expect(detectEventFromBaseStage(baseCategory, 'C17:OFFER_CREATE')).toBe(
            'document',
        );
    });

    it('стадия вне лестницы событий — null', () => {
        expect(detectEventFromBaseStage(baseCategory, 'C17:NOT_CA')).toBeNull();
    });
});

describe('getXoTargetStageCode', () => {
    it('reportEventType=xo + isResult → cold_success', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: false,
                isResult: true,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('WON');
    });

    it('reportEventType=xo + isFail + !isResult → cold_noresult', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: false,
                isResult: false,
                isSuccess: false,
                isFail: true,
            }),
        ).toBe('NORESULT');
    });

    it('reportEventType=xo + isExpired → cold_pending', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: true,
                isResult: false,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('PENDING');
    });

    it('reportEventType≠xo → null (не обновляем xo-сделку)', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'warm',
                isExpired: false,
                isResult: true,
                isSuccess: false,
                isFail: false,
            }),
        ).toBeNull();
    });
});

describe('getPresentationTargetStageCode', () => {
    it('plan → spres_plan', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'plan',
                isResult: false,
            }),
        ).toBe('PLAN');
    });

    it('done → spres_success', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'done',
                isResult: true,
            }),
        ).toBe('WON');
    });

    it('fail + isResult → spres_fail', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'fail',
                isResult: true,
            }),
        ).toBe('LOSE');
    });

    it('fail + !isResult → spres_noresult', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'fail',
                isResult: false,
            }),
        ).toBe('NORESULT');
    });

    it('expired → spres_pending', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'expired',
                isResult: false,
            }),
        ).toBe('PENDING');
    });
});

describe('composeStageId', () => {
    it('собирает STAGE_ID Bitrix-формата', () => {
        expect(composeStageId(17, 'WARM')).toBe('C17:WARM');
    });
});

describe('getSalesBaseTargetStageCode — воронка без ступени «Доработка»', () => {
    /** Воронка ОП, где стадии sales_refine нет (состояние живёт полями). */
    const noRefineCategory = {
        ...baseCategory,
        stages: baseCategory.stages.filter(s => s.code !== 'sales_refine'),
    } as IPCategory;
    const input = (patch: Partial<BaseStageInput> = {}) =>
        baseInput({ category: noRefineCategory, ...patch });

    it('план refine с презентации — сделка остаётся на презентации', () => {
        expect(
            getSalesBaseTargetStageCode(
                input({ currentStageEvent: 'presentation', planEventType: 'refine' }),
            ),
        ).toBe('PRES');
    });

    it('план refine с холодной — на холодной', () => {
        expect(
            getSalesBaseTargetStageCode(
                input({ currentStageEvent: 'xo', planEventType: 'refine' }),
            ),
        ).toBe('PREPARATION');
    });

    it('отчёт refine + план warm — максимум без ступени refine', () => {
        expect(
            getSalesBaseTargetStageCode(
                input({
                    currentStageEvent: 'presentation',
                    reportEventType: 'refine',
                    planEventType: 'warm',
                }),
            ),
        ).toBe('PRES');
    });

    it('настройка «Доработка всегда» без ступени — лестница как без настройки', () => {
        expect(
            getSalesBaseTargetStageCode(
                input({
                    currentStageEvent: 'document',
                    planEventType: 'refine',
                    refineStageOnPlan: true,
                }),
            ),
        ).toBe('OFFER_CREATE');
    });

    it('только план refine и ничего больше — null (двигать некуда)', () => {
        expect(
            getSalesBaseTargetStageCode(input({ planEventType: 'refine' })),
        ).toBeNull();
    });

    it('финал с планом refine без ступени — финал', () => {
        expect(
            getSalesBaseTargetStageCode(
                input({ planEventType: 'refine', isFail: true }),
            ),
        ).toBe('LOSE');
    });

    it('другая отсутствующая стадия по-прежнему даёт null', () => {
        const noHot = {
            ...baseCategory,
            stages: baseCategory.stages.filter(s => s.code !== 'sales_in_progress'),
        } as IPCategory;
        expect(
            getSalesBaseTargetStageCode(
                baseInput({ category: noHot, planEventType: 'hot' }),
            ),
        ).toBeNull();
    });
});
