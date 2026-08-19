import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { BitrixDateTime, ETimeZone } from '@/shared/lib/date';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { EventReportEntityHistoryService } from '../services/history/event-report-entity-history.service';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import {
    getSalesBaseTargetStageCode,
    getXoTargetStageCode,
} from '../services/deal/deal-target-stage.calculator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    EnumTaskEventType,
    EventTaskDto,
} from '../dto/event-sale-flow/task.dto';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date;
// юнит-тест воспроизводит это состояние явно.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Заявка — не холодный обзвон.
 *
 * `xo` — клиент нас не ждёт; `xoRequest` — заявка с сайта; `xoLead` — входящий
 * лид/обращение. По воронке все три ходят одинаково (холодная стадия,
 * воронка ХО), а в KPI обязаны писаться РАЗНЫМИ кодами события: иначе
 * руководитель не отличит холодный обзвон от обработки заявки.
 *
 * Тест закрывает всю цепочку отчёта: контекст → KPI-payload → стадии →
 * таймлайн.
 */
const NOW = new Date('2026-08-10T09:00:00.000Z');

const makePortal = () => ({ getTimezone: () => 'Europe/Moscow' });

const makeCtx = (eventType: string) =>
    new EventReportContext(
        {
            currentTask: { eventType, name: 'ООО Ромашка' },
            report: { resultStatus: 'result' },
        } as never,
        makePortal() as never,
        { entityType: 'deal', entityId: 500, currentPresDeal: null } as never,
        NOW,
    );

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const buildKpi = (eventType: string) =>
    new EventReportKpiPayloadBuilder(
        makePortal() as never,
        makeCtx(eventType),
        deals,
    ).buildAll();

/** Воронка ОП и воронка ХО с полным набором нужных стадий. */
const salesBaseCategory = {
    stages: [
        { code: 'sales_plan', bitrixId: 'PLAN' },
        { code: 'sales_cold', bitrixId: 'COLD' },
        { code: 'sales_warm', bitrixId: 'WARM' },
    ],
} as never;

const xoCategory = {
    stages: [
        { code: 'cold_pending', bitrixId: 'PENDING' },
        { code: 'cold_success', bitrixId: 'XSUCCESS' },
        { code: 'cold_noresult', bitrixId: 'XNORESULT' },
    ],
} as never;

describe('Типы события «заявка» (xoRequest / xoLead)', () => {
    it('DTO принимает новые коды и не теряет старые', () => {
        const values = Object.values(EnumTaskEventType);
        expect(values).toEqual(
            expect.arrayContaining([
                'xo',
                'xoRequest',
                'xoLead',
                'warm',
                'presentation',
                'hot',
                'moneyAwait',
                'ss',
                'in_progress',
                'money_await',
                'event',
                'supply',
            ]),
        );
    });

    /*
     * Enum задачи — это ещё и ВАЛИДАТОР входа: глобальный ValidationPipe
     * рубит отсутствующее в нём значение в 400 до всякой бизнес-логики.
     * Отсюда обязательное правило: набор здесь = набор кодов фрейма,
     * иначе отчёт вообще не доедет до бэка.
     */
    it.each([
        'xo',
        'xoRequest',
        'xoLead',
        'warm',
        'presentation',
        'hot',
        'moneyAwait',
        'ss',
        'in_progress',
        'money_await',
        'event',
        'supply',
    ])('валидация DTO пропускает код фрейма %s', async eventType => {
        const dto = plainToInstance(EventTaskDto, { id: 1, eventType });
        const errors = await validate(dto, { skipMissingProperties: true });
        expect(errors.filter(e => e.property === 'eventType')).toHaveLength(0);
    });

    it('валидация DTO режет код вне контракта', async () => {
        const dto = plainToInstance(EventTaskDto, {
            id: 1,
            eventType: 'чтототакое',
        });
        const errors = await validate(dto, { skipMissingProperties: true });
        expect(
            errors.filter(e => e.property === 'eventType').length,
        ).toBeGreaterThan(0);
    });

    it.each([
        ['xo', 'xo'],
        ['xoRequest', 'xoRequest'],
        ['xoLead', 'xoLead'],
        // Старые коды фрейма продолжают сводиться к алфавиту отчётности.
        ['cold', 'xo'],
        ['in_progress', 'hot'],
        ['money_await', 'moneyAwait'],
        ['ss', 'warm'],
    ])('контекст: код задачи %s → тип события %s', (raw, expected) => {
        expect(makeCtx(raw).reportEventType).toBe(expected);
    });

    /*
     * Раньше несведённый код проезжал строкой и не совпадал ни с лестницей
     * стадий, ни с маппингом KPI — отчёт уходил успешно, а записи молча
     * пропадали. Теперь тип всегда валиден.
     */
    it('контекст: неизвестный код не теряется, а трактуется как разговор', () => {
        expect(makeCtx('чтототакое').reportEventType).toBe('warm');
    });

    it.each([
        ['xo', 'xo'],
        ['xoRequest', 'site'],
        ['xoLead', 'come_call'],
    ])('KPI: тип %s пишется кодом события %s', (eventType, expectedItem) => {
        const payloads = buildKpi(eventType);
        expect(payloads).toHaveLength(1);
        expect(payloads[0].items.event_type).toBe(expectedItem);
        expect(payloads[0].items.event_action).toBe('done');
    });

    it('KPI: заявка НЕ сливается с холодным обзвоном', () => {
        const site = buildKpi('xoRequest')[0].items.event_type;
        const lead = buildKpi('xoLead')[0].items.event_type;
        const cold = buildKpi('xo')[0].items.event_type;
        expect(new Set([site, lead, cold]).size).toBe(3);
    });

    it('KPI: неизвестный код всё равно даёт запись (никогда не null)', () => {
        const payloads = buildKpi('чтототакое');
        expect(payloads).toHaveLength(1);
        expect(payloads[0].items.event_type).toBe('call');
    });

    it.each(['xo', 'xoRequest', 'xoLead'] as const)(
        'стадии: %s держит основную сделку на холодной стадии',
        eventType => {
            expect(
                getSalesBaseTargetStageCode({
                    category: salesBaseCategory,
                    currentStageEvent: null,
                    planEventType: null,
                    reportEventType: eventType,
                    isResult: true,
                    isUnplanned: false,
                    isSuccess: false,
                    isFail: false,
                }),
            ).toBe('COLD');
        },
    );

    it.each(['xo', 'xoRequest', 'xoLead'] as const)(
        'стадии: отчёт %s двигает воронку ХО (раньше двигал только литерал xo)',
        eventType => {
            expect(
                getXoTargetStageCode({
                    category: xoCategory,
                    reportEventType: eventType,
                    isExpired: false,
                    isResult: true,
                    isSuccess: false,
                    isFail: false,
                }),
            ).toBe('XSUCCESS');
        },
    );

    /*
     * КОНТРАКТ ЗАГОЛОВКА в обратную сторону: фронт узнаёт вид холодной
     * работы ТОЛЬКО по слову в TITLE задачи. Справочник планов знает
     * единственный холодный код `cold`, поэтому при планировании следующего
     * звонка вид обязан унаследоваться от события, по которому отчитались —
     * иначе «Заявка» пропадает из заголовка и следующая задача читается как
     * обычный холодный обзвон.
     */
    it.each([
        ['xoRequest', 'Холодный обзвон. Заявка.  ООО Ромашка'],
        ['xoLead', 'Холодный обзвон. Лид.  ООО Ромашка'],
        ['xo', 'Холодный обзвон  ООО Ромашка'],
        // Не холодный отчёт → вид не наследуется, обычный ХО.
        ['warm', 'Холодный обзвон  ООО Ромашка'],
    ])(
        'задача: отчёт %s + план «cold» → заголовок «%s»',
        (reportEventType, expectedTitle) => {
            const calls: { method: string; args: unknown[] }[] = [];
            const bitrix = {
                batch: {
                    task: {
                        add: (_cmd: string, ...args: unknown[]) =>
                            calls.push({ method: 'task.add', args }),
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

            new EventReportTaskFlowService(
                bitrix as never,
                portal as never,
            ).queue(
                {
                    isExpired: false,
                    isNew: false,
                    isPlanned: true,
                    isResult: true,
                    entityType: 'deal',
                    entityId: 500,
                    planResponsibleId: 5,
                    planCreatedById: 5,
                    planDeadline: BitrixDateTime.fromPortalInput(
                        '2026-08-15T10:00:00',
                        ETimeZone.EUROPE_MOSCOW,
                    ),
                    planEventName: 'ООО Ромашка',
                    reportComment: '',
                    // План из справочника: холодный код там один — `cold`→`xo`.
                    planEventType: 'xo',
                    reportEventType,
                    currentTask: null,
                    ownerDeal: null,
                    dto: { plan: { type: { current: { name: 'Холодный' } } } },
                } as never,
                deals,
            );

            const fields = calls[0].args[0] as Record<string, unknown>;
            expect(fields.TITLE).toBe(expectedTitle);
        },
    );

    /*
     * ПЕРЕНОС события (isExpired + есть текущая задача) обязан менять только
     * дедлайн. Задача остаётся ТА ЖЕ, значит и слово вида в её заголовке
     * остаётся — заявка после переноса не превращается в холодный обзвон.
     */
    it('перенос: правится только дедлайн, заголовок задачи не трогается', () => {
        const calls: { method: string; args: unknown[] }[] = [];
        const bitrix = {
            batch: {
                task: {
                    add: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'add', args }),
                    update: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'update', args }),
                    complete: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'complete', args }),
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
                isExpired: true,
                isNew: false,
                isPlanned: true,
                isResult: false,
                entityType: 'deal',
                entityId: 500,
                planResponsibleId: 5,
                planCreatedById: 5,
                planDeadline: BitrixDateTime.fromPortalInput(
                    '2026-08-20T10:00:00',
                    ETimeZone.EUROPE_MOSCOW,
                ),
                planEventName: 'ООО Ромашка',
                reportComment: '',
                planEventType: 'xo',
                reportEventType: 'xoRequest',
                currentTask: {
                    id: 900,
                    title: 'Холодный обзвон. Заявка.  ООО Ромашка',
                },
                ownerDeal: null,
                dto: { plan: { type: { current: { name: 'Холодный' } } } },
            } as never,
            deals,
        );

        // Единственная команда — update дедлайна; новой задачи нет.
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('update');
        const fields = calls[0].args[1] as Record<string, unknown>;
        // Дедлайн уходит в server-time Москва (формат tasks.task.*), а не
        // сырой строкой фронта.
        expect(fields.DEADLINE).toBe('2026-08-20 10:00:00');
        expect(fields.TITLE).toBeUndefined();
    });

    it('таймлайн: пишется русское название типа, а не сырой код', () => {
        const addTimelineComment = jest.fn();
        const service = new EventReportEntityHistoryService(
            { batch: { timeline: { addTimelineComment } } } as never,
            makePortal() as never,
        );

        service.queue({
            isGsirk: true,
            entityType: 'lead',
            entityId: 42,
            nowDate: NOW,
            reportEventType: 'xoRequest',
            planEventType: 'xoLead',
            reportComment: '',
        } as never);

        const [, payload] = addTimelineComment.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(payload.COMMENT).toContain('Заявка отработана');
        expect(payload.COMMENT).toContain('Запланирована работа по лиду');
    });
});
