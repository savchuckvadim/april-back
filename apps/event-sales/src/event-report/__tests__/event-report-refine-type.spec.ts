import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import {
    detectEventFromBaseStage,
    getSalesBaseTargetStageCode,
} from '../services/deal/deal-target-stage.calculator';
import {
    EnumTaskEventType,
    EventTaskDto,
} from '../dto/event-sale-flow/task.dto';
import { PlanTypeDto } from '../dto/event-sale-flow/plan.dto';
import { EnumEventPlanCode } from '../types/plan-types';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Тип звонка «Доработка» (`refine`): клиента дорабатывают после презентации
 * — узнают компанию, ИНН, реквизиты — и только потом готовят документы.
 *
 * Контракт:
 *  - стадия воронки sales_refine между «Презентация» и «Документы»,
 *    лестница не понижается;
 *  - в сводке KPI считается «Звонком» (call) с префиксом имени
 *    «Доработка: », в ленте истории — своим item'ом refine
 *    (historyItems-override);
 *  - рабочий статус — обычный in_work (без спец-веток);
 *  - финал отказа наследует название: «Отказ: Доработка — {причина}»;
 *  - задача плана: «🔧 Доработка  …», приоритет ОБЫЧНЫЙ (не HIGH).
 */
const NOW = new Date('2026-08-18T09:00:00.000Z');

const makePortal = () => ({ getTimezone: () => 'Europe/Moscow' });

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            ...((over.dto as object) ?? {}),
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 1024,
            lead: null,
            company: null,
            currentPresDeal: null,
            ...((over.init as object) ?? {}),
        } as never,
        NOW,
    );

const build = (ctx: EventReportContext) =>
    new EventReportKpiPayloadBuilder(
        makePortal() as never,
        ctx,
        deals,
    ).buildAll();

/** Воронка ОП со стадией «Доработка». */
const CATEGORY = {
    bitrixId: '3',
    stages: [
        { code: 'sales_warm', bitrixId: 'WARM' },
        { code: 'sales_pres', bitrixId: 'PRESENTATION' },
        { code: 'sales_refine', bitrixId: 'REFINE' },
        { code: 'sales_offer_create', bitrixId: 'OFFER_CREATE' },
        { code: 'sales_document_send', bitrixId: 'DOCUMENT_SEND' },
        { code: 'sales_in_progress', bitrixId: 'IN_PROSRESS' },
        { code: 'sales_money_await', bitrixId: 'MONEY_AWAIT' },
    ],
} as never;

/** Флаги финала по умолчанию сняты — тесты лестницы про них не про то. */
const STAGE_FLAGS = {
    isResult: true,
    isUnplanned: false,
    isSuccess: false,
    isFail: false,
    isNoResult: false,
    isNotCa: false,
} as const;

describe('Доработка — лестница стадий', () => {
    it('план refine поднимает сделку на стадию REFINE', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: CATEGORY,
                currentStageEvent: 'warm',
                planEventType: 'refine',
                reportEventType: 'warm',
                ...STAGE_FLAGS,
            }),
        ).toBe('REFINE');
    });

    it('сделка на sales_refine + отчёт warm — лестница НЕ понижается', () => {
        const currentStageEvent = detectEventFromBaseStage(
            CATEGORY,
            'C3:REFINE',
        );
        expect(currentStageEvent).toBe('refine');
        expect(
            getSalesBaseTargetStageCode({
                category: CATEGORY,
                currentStageEvent,
                planEventType: 'warm',
                reportEventType: 'warm',
                ...STAGE_FLAGS,
            }),
        ).toBe('REFINE');
    });

    it('доработка выше презентации, но ниже документов, решения и оплаты', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: CATEGORY,
                currentStageEvent: 'presentation',
                planEventType: 'refine',
                reportEventType: null,
                ...STAGE_FLAGS,
            }),
        ).toBe('REFINE');
        expect(
            getSalesBaseTargetStageCode({
                category: CATEGORY,
                currentStageEvent: 'refine',
                planEventType: 'hot',
                reportEventType: null,
                ...STAGE_FLAGS,
            }),
        ).toBe('IN_PROSRESS');
        /*
         * Клиента дорабатывают ДО документов: если сделка уже на документах,
         * план «доработка» её назад не откатывает.
         */
        expect(
            getSalesBaseTargetStageCode({
                category: CATEGORY,
                currentStageEvent: 'document',
                planEventType: 'refine',
                reportEventType: null,
                ...STAGE_FLAGS,
            }),
        ).toBe('OFFER_CREATE');
    });

    it('стадия sales_refine не сконфигурирована на портале → null (graceful)', () => {
        const withoutRefine = {
            bitrixId: '3',
            stages: [{ code: 'sales_warm', bitrixId: 'WARM' }],
        } as never;
        expect(
            getSalesBaseTargetStageCode({
                category: withoutRefine,
                currentStageEvent: null,
                planEventType: 'refine',
                reportEventType: null,
                ...STAGE_FLAGS,
            }),
        ).toBeNull();
    });
});

describe('Доработка — KPI-записи', () => {
    const reportCtx = () =>
        makeCtx({
            dto: {
                currentTask: { eventType: 'refine', name: 'ООО Ромашка' },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                },
            },
        });

    it('в сводке — call с префиксом «Доработка: », история — своим item', () => {
        const report = build(reportCtx()).find(p => !p.dedup);
        expect(report!.items.event_type).toBe('call');
        expect(report!.name).toBe('Доработка: ООО Ромашка');
        // Имя дублируется в event_title через assemble.
        expect(report!.values.event_title).toBe('Доработка: ООО Ромашка');
        // История различает доработку своим item'ом.
        expect(report!.historyItems).toEqual({ event_type: 'refine' });
        // Обычный рабочий статус — спец-веток у доработки нет.
        expect(report!.items.op_work_status).toBe('op_status_in_work');
    });

    it('план доработки: call + префикс + history-override', () => {
        const ctx = makeCtx({
            dto: {
                report: { resultStatus: 'result' },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    name: 'Дозакрыть возражения',
                    type: { current: { code: 'refine' } },
                },
            },
        });
        const plan = build(ctx).find(p => p.items.event_action === 'plan');
        expect(plan!.items.event_type).toBe('call');
        expect(plan!.name).toBe('Доработка: Дозакрыть возражения');
        expect(plan!.historyItems).toEqual({ event_type: 'refine' });
    });

    it('обычный звонок historyItems не получает', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'warm', name: 'ООО Ромашка' },
                report: { resultStatus: 'result' },
            },
        });
        const report = build(ctx).find(p => !p.dedup);
        expect(report!.historyItems).toBeUndefined();
    });

    it('финал отказа по доработке: «Отказ: Доработка — {причина}»', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'refine', name: 'ООО Ромашка' },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'fail' } },
                    failReason: {
                        current: { code: 'nomoney', name: 'Нет денег' },
                    },
                },
            },
        });
        const final = build(ctx).find(p => p.items.event_type === 'ev_fail');
        expect(final!.name).toBe('Отказ: Доработка — Нет денег');
    });
});

describe('Доработка — DTO и задача плана', () => {
    it('валидация DTO пропускает refine в задаче и в плане', async () => {
        const task = plainToInstance(EventTaskDto, {
            id: 1,
            eventType: 'refine',
        });
        const taskErrors = await validate(task, {
            skipMissingProperties: true,
        });
        expect(taskErrors.filter(e => e.property === 'eventType')).toHaveLength(
            0,
        );

        const planType = plainToInstance(PlanTypeDto, {
            id: 0,
            code: 'refine',
            name: 'Доработка',
            isActive: true,
        });
        const planErrors = await validate(planType, {
            skipMissingProperties: true,
        });
        expect(planErrors.filter(e => e.property === 'code')).toHaveLength(0);
        expect(EnumEventPlanCode.REFINE).toBe('refine');
        expect(EnumTaskEventType.REFINE).toBe('refine');
    });

    it('задача плана: «🔧 Доработка  …», приоритет ОБЫЧНЫЙ (не HIGH)', () => {
        const calls: { method: string; args: unknown[] }[] = [];
        const bitrix = {
            batch: {
                task: {
                    add: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'add', args }),
                    update: () => undefined,
                    complete: () => undefined,
                },
            },
        };
        const portal = {
            getSalesTaskGroupId: () => 77,
            getEntityFieldByCode: () => undefined,
            getFieldBitrixId: (f: { bitrixId: string }) => f.bitrixId,
        };

        new EventReportTaskFlowService(bitrix as never, portal as never).queue(
            {
                isExpired: false,
                isNew: false,
                isPlanned: true,
                isResult: true,
                entityType: 'deal',
                entityId: 500,
                planResponsibleId: 5,
                planCreatedById: 5,
                planDeadline: {
                    toTaskDeadline: () => '2026-08-25 10:00:00',
                    toCrmDateTime: () => '25.08.2026 10:00:00',
                },
                planEventName: 'Дозакрыть возражения',
                reportComment: '',
                planEventType: 'refine',
                reportEventType: 'warm',
                currentTask: null,
                ownerDeal: null,
                dto: { plan: { type: { current: { name: 'Доработка' } } } },
            } as never,
            deals,
        );

        const fields = calls[0].args[0] as Record<string, unknown>;
        expect(fields.TITLE).toBe('🔧 Доработка  Дозакрыть возражения');
        // MEDIUM=1: доработка не входит в IMPORTANT_PLAN_TYPES.
        expect(fields.PRIORITY).toBe(1);
    });
});
