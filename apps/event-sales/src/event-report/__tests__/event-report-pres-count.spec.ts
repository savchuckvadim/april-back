import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesPresentationDealService } from '../services/deal/sales-presentation-deal.service';
import { EEventReportEntityType } from '../services/init/event-report-init.types';

/**
 * `pres_count` — «сколько презентаций проведено».
 *
 * Смысл поля зависит от того, ЧЬЁ оно:
 *  - КОМПАНИЯ — сквозной счётчик клиента: копится через все её сделки;
 *  - основная сделка / лид — копится, пока работа ведётся;
 *  - pres-сделка — сама «элемент презентации»: 1 (состоялась) либо 0
 *    (заведена под план), без накопления.
 *
 * Раньше сброс до 0/1 выводился из общих флагов контекста, и обычный
 * сценарий «отчитались по презентации и тут же запланировали следующую»
 * ставил состоявшейся презентации 0.
 */
// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date;
// юнит-тест воспроизводит это состояние явно.
dayjs.extend(utc);
dayjs.extend(timezone);

const PRES_COUNT_KEY = 'UF_CRM_PRES_COUNT';

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'pres_count'
            ? { bitrixId: 'PRES_COUNT', items: [] }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getPortal: () => ({ domain: 'd.b24.ru' }),
});

/** Контекст отчёта «презентация состоялась». */
const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            presentation: { isPresentationDone: true },
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            report: { resultStatus: 'result' },
            ...over,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            currentPresDeal: null,
            ...((over.init as object) ?? {}),
        } as never,
        new Date('2026-08-10T09:00:00.000Z'),
    );

type DealOptions = ConstructorParameters<
    typeof EventReportEntityFieldsModel
>[3];

const fieldsOf = (
    ctx: EventReportContext,
    entityType: (typeof EEventReportEntityType)[keyof typeof EEventReportEntityType],
    dealOptions: DealOptions = null,
) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        entityType,
        dealOptions,
    ).toFields();

describe('pres_count — счётчик проведённых презентаций', () => {
    it('КОМПАНИЯ: счётчик копится (две презентации по разным сделкам → 2)', () => {
        // Первая презентация: у компании поле ещё пустое.
        const first = fieldsOf(
            makeCtx({ init: { company: { ID: '7' } } }),
            EEventReportEntityType.COMPANY,
        );
        expect(first[PRES_COUNT_KEY]).toBe(1);

        // Вторая презентация — уже по ДРУГОЙ сделке того же клиента:
        // компания приходит с записанной единицей и обязана стать двойкой.
        const second = fieldsOf(
            makeCtx({
                init: { company: { ID: '7', [PRES_COUNT_KEY]: 1 } },
            }),
            EEventReportEntityType.COMPANY,
        );
        expect(second[PRES_COUNT_KEY]).toBe(2);
    });

    it('КОМПАНИЯ: счётчик копится и когда план — снова презентация', () => {
        // Сценарий, который ломал прошлую реализацию: отчёт по презентации
        // и планирование следующей в одном отчёте.
        const fields = fieldsOf(
            makeCtx({
                plan: {
                    isPlanned: true,
                    isActive: true,
                    type: { current: { code: 'presentation' } },
                },
                init: { company: { ID: '7', [PRES_COUNT_KEY]: 4 } },
            }),
            EEventReportEntityType.COMPANY,
        );
        expect(fields[PRES_COUNT_KEY]).toBe(5);
    });

    it('ОСНОВНАЯ сделка: счётчик копится, пока сделка ведётся', () => {
        const fields = fieldsOf(makeCtx(), EEventReportEntityType.DEAL, {
            deal: { ID: '100', [PRES_COUNT_KEY]: 2 },
            role: EDealRole.BASE,
        });
        expect(fields[PRES_COUNT_KEY]).toBe(3);
    });

    it('ЛИД: счётчик копится', () => {
        const ctx = makeCtx({
            init: {
                entityType: 'lead',
                entityId: 42,
                company: null,
                lead: { ID: '42', [PRES_COUNT_KEY]: 1 },
            },
        });
        expect(fieldsOf(ctx, EEventReportEntityType.LEAD)[PRES_COUNT_KEY]).toBe(
            2,
        );
    });

    /*
     * Pres-сделка — сам «элемент презентации»: не копится. Прошлая
     * реализация обнуляла её по флагам контекста, и «отчитались + сразу
     * запланировали следующую» давало состоявшейся презентации 0.
     */
    it('PRES-сделка: состоявшаяся презентация = 1, даже если планируется следующая', () => {
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'presentation' } },
            },
        });
        const fields = fieldsOf(ctx, EEventReportEntityType.DEAL, {
            deal: { ID: '900', [PRES_COUNT_KEY]: 1 },
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: true,
        });
        expect(fields[PRES_COUNT_KEY]).toBe(1);
    });

    it('PRES-сделка под план: презентации ещё не было → 0', () => {
        const fields = fieldsOf(makeCtx(), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: false,
        });
        expect(fields[PRES_COUNT_KEY]).toBe(0);
    });

    /*
     * Сквозной прогон реального flow: отчёт по презентации + план следующей.
     * Обновляемая сделка получает 1, новая плановая — 0.
     */
    it('flow: обновляемой pres-сделке 1, новой плановой 0', () => {
        const calls: { method: string; args: unknown[] }[] = [];
        const bitrix = {
            batch: {
                deal: {
                    set: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'set', args }),
                    update: (_cmd: string, ...args: unknown[]) =>
                        calls.push({ method: 'update', args }),
                },
            },
        };
        const portal = {
            ...makePortal(),
            getDealCategoryByCode: () => ({
                bitrixId: '5',
                stages: [
                    // «Презентация состоялась» ложится в spres_success.
                    { code: 'spres_success', bitrixId: 'DONE' },
                    { code: 'spres_plan', bitrixId: 'PLAN' },
                ],
            }),
        };

        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'presentation' } },
            },
            init: {
                company: { ID: '7' },
                currentPresDeal: { ID: '900', [PRES_COUNT_KEY]: 1 },
            },
        });

        new SalesPresentationDealService(
            bitrix as never,
            portal as never,
        ).queue(ctx, 'D_100');

        const updated = calls.find(c => c.method === 'update')
            ?.args[1] as Record<string, unknown>;
        const created = calls.find(c => c.method === 'set')?.args[0] as Record<
            string,
            unknown
        >;
        expect(updated[PRES_COUNT_KEY]).toBe(1);
        expect(created[PRES_COUNT_KEY]).toBe(0);
    });
});
