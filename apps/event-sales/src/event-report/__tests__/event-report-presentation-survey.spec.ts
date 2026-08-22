import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EEventReportEntityType } from '../services/init/event-report-init.types';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Анкета после презентации («Хвост», «Пять К» + девять детальных «5К»).
 *
 * Значения пишет фрейм прямо в ЛИД; event-report при проведённой
 * презентации переносит «последнюю проведённую» на pres-сделку и основную
 * сделку. Скаляры перезаписываются (смысл — последняя), пустота не
 * затирает, неустановленное поле молча пропускается. Источник — лид,
 * DTO отчёта не расширяется.
 */
const XVOST = 'UF_CRM_OP_PRESENTATION_XVOST';
const FIVE_K = 'UF_CRM_OP_PRESENTATION_5K';
const CLIENT_WHAT = 'UF_CRM_OP_5K_CLIENT_WHAT';

/**
 * Портал: сводные установлены на лиде и сделке, детальные «5К» — только на
 * лиде (текущее состояние порталов). `withDetailedOnDeal` моделирует
 * будущее, где владелец завёл детальные и на сделках.
 */
const makePortal = (withDetailedOnDeal = false) => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (entity: string, code: string) => {
        const survey =
            code === 'op_presentation_xvost' || code === 'op_presentation_5k';
        const detailed = code.startsWith('op_5k_');
        if (survey && (entity === 'lead' || entity === 'deal')) {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        if (detailed && entity === 'lead') {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        if (detailed && entity === 'deal' && withDetailedOnDeal) {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        return undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getPortal: () => ({ domain: 'd.b24.ru' }),
});

/** Лид с заполненной анкетой — как его оставил фрейм. */
const SURVEY_LEAD = {
    ID: '42',
    [XVOST]: 'Дожать по хвосту через неделю',
    [FIVE_K]: 'Сводка 5К по последней презентации',
    [CLIENT_WHAT]: 'Хочет замену Консультанта',
};

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            presentation: { isPresentationDone: true },
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            report: { resultStatus: 'result' },
            ...((over.dto as object) ?? {}),
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 500,
            lead: SURVEY_LEAD,
            currentPresDeal: null,
            ...((over.init as object) ?? {}),
        } as never,
        new Date('2026-08-14T09:00:00.000Z'),
    );

const fieldsOf = (
    ctx: EventReportContext,
    role: (typeof EDealRole)[keyof typeof EDealRole],
    deal: Record<string, unknown> | null = null,
    portal: unknown = makePortal(),
    presentationHappenedHere = true,
) =>
    new EventReportEntityFieldsModel(
        portal as never,
        ctx,
        EEventReportEntityType.DEAL,
        { deal, role, presentationHappenedHere },
    ).toFields();

describe('Перенос анкеты после презентации (лид → сделки)', () => {
    it.each([EDealRole.BASE, EDealRole.PRESENTATION] as const)(
        'роль %s: сводные ответы переносятся с лида',
        role => {
            const out = fieldsOf(makeCtx(), role);
            expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
            expect(out[FIVE_K]).toBe('Сводка 5К по последней презентации');
        },
    );

    /*
     * У каждой презентации СВОЯ запись: плановая pres-сделка, создаваемая
     * тем же отчётом (отчитались + запланировали следующую), ответы НЕ
     * получает — у будущей презентации их ещё нет.
     */
    it('плановая pres-сделка того же отчёта анкету НЕ получает', () => {
        const out = fieldsOf(
            makeCtx(),
            EDealRole.PRESENTATION,
            null,
            makePortal(),
            false, // presentationHappenedHere: сделка заведена под план
        );
        expect(out[XVOST]).toBeUndefined();
        expect(out[FIVE_K]).toBeUndefined();
    });

    it('основная сделка получает анкету независимо от флага pres-сделки', () => {
        const out = fieldsOf(
            makeCtx(),
            EDealRole.BASE,
            null,
            makePortal(),
            false,
        );
        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
    });

    /*
     * Поля сделок уезжают batch-командой: сырой `\n` многострочных ответов
     * доехал бы подчёркиванием. Перенос экранирует через toBatchText.
     */
    it('многострочный ответ доезжает на сделку с %0A, без сырых переносов', () => {
        const ctx = makeCtx({
            init: {
                lead: {
                    ID: '42',
                    [XVOST]: 'дожать:\n- хвост\r\n- договор',
                },
            },
        });
        const out = fieldsOf(ctx, EDealRole.BASE);
        expect(out[XVOST]).toBe('дожать:%0A- хвост%0A- договор');
        expect(String(out[XVOST])).not.toMatch(/[\r\n]/);
    });

    it('скаляр ПЕРЕЗАПИСЫВАЕТСЯ: на сделке остаётся ответ последней презентации', () => {
        const out = fieldsOf(makeCtx(), EDealRole.BASE, {
            ID: '100',
            [XVOST]: 'Старый хвост прошлой презентации',
        });
        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
    });

    it('пустой ответ на лиде НЕ затирает сделку', () => {
        const ctx = makeCtx({
            init: { lead: { ID: '42', [XVOST]: '   ', [FIVE_K]: '' } },
        });
        const out = fieldsOf(ctx, EDealRole.BASE);
        expect(out[XVOST]).toBeUndefined();
        expect(out[FIVE_K]).toBeUndefined();
    });

    it('детальные «5К» на сделке не установлены → молча пропущены', () => {
        const out = fieldsOf(makeCtx(), EDealRole.PRESENTATION);
        expect(out[CLIENT_WHAT]).toBeUndefined();
    });

    it('владелец завёл детальные на сделке → перенос подхватывает без правки кода', () => {
        const out = fieldsOf(
            makeCtx(),
            EDealRole.PRESENTATION,
            null,
            makePortal(true),
        );
        expect(out[CLIENT_WHAT]).toBe('Хочет замену Консультанта');
    });

    it('без проведённой презентации перенос не выполняется', () => {
        const ctx = makeCtx({
            dto: { presentation: { isPresentationDone: false } },
        });
        const out = fieldsOf(ctx, EDealRole.BASE);
        expect(out[XVOST]).toBeUndefined();
    });

    it('лида в контексте нет (работа от компании без лида) → пропуск', () => {
        const ctx = makeCtx({ init: { lead: null } });
        const out = fieldsOf(ctx, EDealRole.BASE);
        expect(out[XVOST]).toBeUndefined();
    });

    it.each([EDealRole.XO, EDealRole.TMC] as const)(
        'роль %s к презентации отношения не имеет — анкета не переносится',
        role => {
            const out = fieldsOf(makeCtx(), role);
            expect(out[XVOST]).toBeUndefined();
        },
    );

    /*
     * На ЛИД анкета не пишется: значения там и так живут, а перезапись
     * снапшотом init-фазы могла бы откатить ответ, сохранённый фреймом
     * после чтения.
     */
    it('на сам лид анкета не переносится (защита от отката снапшотом)', () => {
        const ctx = makeCtx({
            init: { entityType: 'lead', entityId: 42, lead: SURVEY_LEAD },
        });
        const out = new EventReportEntityFieldsModel(
            makePortal() as never,
            ctx,
            EEventReportEntityType.LEAD,
            null,
        ).toFields();
        expect(out[XVOST]).toBeUndefined();
        expect(out[FIVE_K]).toBeUndefined();
    });
});
