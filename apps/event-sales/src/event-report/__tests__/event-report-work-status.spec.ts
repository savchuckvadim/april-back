import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { findPbxSalesEventField } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { EventReportContext } from '../services/context/event-report.context';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import {
    EEventReportEntityType,
    EventReportEntityType,
} from '../services/init/event-report-init.types';
import { OpEntityWorkStatusCode } from '../types/event-report.event-codes';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * «ОП Статус Работы» обязан поддерживаться при ЛЮБОМ event-report
 * (todo2508-02 №9): активный план = клиент в работе, даже когда отчётный
 * workStatus не выбирался (чистый план после отказа). Одна модель обслуживает
 * компанию, лид и сделки — фикс автоматически чинит все сущности, включая
 * СОЗДАВАЕМУЮ отчётом сделку.
 *
 * Прод-баг 09.09.2026: резолвер возвращал item-коды поля `op_work_status`
 * СПИСКА «ОП KPI» (`op_status_in_work` и др.), а искал их в поле КАРТОЧКИ —
 * там другие коды. Совпадали только «Продажа» и «Отказ», поэтому в карточку
 * писались ровно эти два статуса, а остальные четыре молча терялись.
 */
const NOW = new Date('2026-08-25T09:00:00.000Z');

/**
 * Справочник поля КАРТОЧКИ `op_work_status` — ровно как на портале
 * (bitrixfield_id 394 у alfacentr). Хардкод намеренный: он фиксирует
 * реальность базы, а отдельный тест ниже сверяет с ним шаблон portal-lib.
 */
const WORK_STATUS_ITEMS = [
    { code: 'work', name: 'В работе', bitrixId: 1393 },
    { code: 'long', name: 'Отложена', bitrixId: 1395 },
    { code: 'in_progress', name: 'В решении', bitrixId: 1397 },
    { code: 'money_await', name: 'В оплате', bitrixId: 1399 },
    { code: 'op_status_success', name: 'Продажа', bitrixId: 1401 },
    { code: 'op_status_fail', name: 'Отказ', bitrixId: 1403 },
] as const;

const WORK_STATUS_FIELD = {
    bitrixId: 'OP_WORK_STATUS',
    items: WORK_STATUS_ITEMS,
};

/** bitrixId → item-код: чем именно резолвер заполнил карточку. */
const CODE_BY_BITRIX_ID = new Map<unknown, string>(
    WORK_STATUS_ITEMS.map(item => [item.bitrixId, item.code]),
);

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'x.bitrix24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_work_status' ? WORK_STATUS_FIELD : undefined,
    getFieldItemByCode: (
        field: { items: ReadonlyArray<{ code: string; bitrixId: number }> },
        itemCode: string,
    ) => field.items.find(item => item.code === itemCode),
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const makeCtx = (dto: Record<string, unknown>) =>
    new EventReportContext(
        { domain: 'x.bitrix24.ru', ...dto } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 431,
            lead: null,
            company: null,
            currentPresDeal: null,
        } as never,
        NOW,
    );

const fieldsFor = (
    ctx: EventReportContext,
    entityType: EventReportEntityType = EEventReportEntityType.COMPANY,
) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        entityType,
        entityType === EEventReportEntityType.DEAL
            ? { deal: null, role: EDealRole.BASE }
            : null,
    ).toFields();

/** Какой item-код реально записан в карточку (undefined — поле не тронуто). */
const writtenStatusCode = (dto: Record<string, unknown>): string | undefined =>
    CODE_BY_BITRIX_ID.get(fieldsFor(makeCtx(dto)).UF_CRM_OP_WORK_STATUS);

/** DTO активного плана заданного типа события. */
const planDto = (typeCode: string) => ({
    plan: {
        isPlanned: true,
        isActive: true,
        name: 'план',
        type: { current: { code: typeCode, name: typeCode } },
    },
    report: {},
});

/** DTO отчёта с выбранным статусом работы и без плана. */
const reportDto = (workStatusCode: string) => ({
    report: { workStatus: { current: { code: workStatusCode } } },
});

describe('op_work_status: поддерживается при любом отчёте', () => {
    it('чистый план без отчётного статуса → «В работе» (компания)', () => {
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                name: 'цук',
                type: { current: { code: 'call', name: 'Звонок' } },
            },
            report: {},
        });
        expect(ctx.isPlanned).toBe(true);
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBe(1393);
    });

    it('та же ветка чинит СОЗДАВАЕМУЮ сделку (роль base)', () => {
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'call', name: 'Звонок' } },
            },
            report: {},
        });
        const fields = fieldsFor(ctx, EEventReportEntityType.DEAL);
        expect(fields.UF_CRM_OP_WORK_STATUS).toBe(1393);
    });

    it('отказ по-прежнему пишет «Отказ», план его не перебивает', () => {
        const ctx = makeCtx({
            plan: { isPlanned: true, isActive: true },
            report: { workStatus: { current: { code: 'fail' } } },
        });
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBe(1403);
    });

    it('нет ни плана, ни финала — статус не утверждается', () => {
        const ctx = makeCtx({ report: {} });
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBeUndefined();
    });
});

/**
 * Шесть статусов карточки: каждый обязан не только «резолвиться», но и
 * НАЙТИСЬ в справочнике поля — именно на этом шаге прод терял четыре из
 * шести значений.
 */
describe('op_work_status: все шесть статусов карточки записываются', () => {
    const CASES: ReadonlyArray<{
        title: string;
        dto: Record<string, unknown>;
        code: OpEntityWorkStatusCode;
        bitrixId: number;
    }> = [
        {
            title: 'продажа → «Продажа»',
            dto: reportDto('success'),
            code: 'op_status_success',
            bitrixId: 1401,
        },
        {
            title: 'отказ → «Отказ»',
            dto: reportDto('fail'),
            code: 'op_status_fail',
            bitrixId: 1403,
        },
        {
            title: 'отложено → «Отложена»',
            dto: reportDto('setAside'),
            code: 'long',
            bitrixId: 1395,
        },
        {
            title: 'план «звонок по решению» → «В решении»',
            dto: planDto('hot'),
            code: 'in_progress',
            bitrixId: 1397,
        },
        {
            title: 'план «звонок по оплате» → «В оплате»',
            dto: planDto('moneyAwait'),
            code: 'money_await',
            bitrixId: 1399,
        },
        {
            title: 'в работе → «В работе»',
            dto: reportDto('inJob'),
            code: 'work',
            bitrixId: 1393,
        },
    ];

    it.each(CASES)('$title', ({ dto, code, bitrixId }) => {
        expect(fieldsFor(makeCtx(dto)).UF_CRM_OP_WORK_STATUS).toBe(bitrixId);
        expect(writtenStatusCode(dto)).toBe(code);
    });

    it('шаблон portal-lib описывает справочник поля так же, как база', () => {
        const templateItems = findPbxSalesEventField('op_work_status')?.items;
        expect(templateItems).toBeDefined();
        expect(templateItems?.map(item => item.code).sort()).toEqual(
            WORK_STATUS_ITEMS.map(item => item.code).sort(),
        );
        // Названия обязаны совпасть с базой: по ним поле переустанавливается.
        const nameByCode = new Map(
            templateItems?.map(item => [item.code, item.name]),
        );
        WORK_STATUS_ITEMS.forEach(item => {
            expect(nameByCode.get(item.code)).toBe(item.name);
        });
    });

    /**
     * СТРАХОВКА от повторения прод-бага: множество кодов, которые резолвер
     * возвращает для карточки, обязано быть подмножеством кодов item'ов
     * поля из шаблона. Коды KPI-списка (`op_status_in_work`,
     * `op_status_in_long`, `op_status_in_progress`, `op_status_money_await`)
     * сюда попасть не могут — тест упадёт.
     */
    it('коды резолвера ⊆ коды item’ов поля карточки', () => {
        const templateCodes = new Set(
            findPbxSalesEventField('op_work_status')?.items.map(
                item => item.code,
            ) ?? [],
        );
        const resolved = CASES.map(({ dto }) => writtenStatusCode(dto));

        expect(resolved).toHaveLength(CASES.length);
        resolved.forEach(code => {
            expect(code).toBeDefined();
            expect(templateCodes.has(code as OpEntityWorkStatusCode)).toBe(
                true,
            );
        });
        // Все шесть статусов различны — ни один смысл не потерян.
        expect(new Set(resolved).size).toBe(CASES.length);
    });
});
