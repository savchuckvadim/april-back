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
 * Запись «Презентация состоялась» в ленте `pres_comments` (ОП Комментарии
 * после презентаций).
 *
 * Раньше в ленту уезжал только комментарий отчёта, а договорённость о
 * следующем шаге («Хвост») жила в одном поле на клиенте и перезатиралась
 * следующей презентацией — в ИСТОРИИ презентаций её не было вовсе.
 * Теперь хвост дописывается в ту же запись: одна строка ленты, лимит не
 * трогаем.
 */
const COMMENTS = 'UF_CRM_PRES_COMMENTS';
const XVOST = 'UF_CRM_OP_PRESENTATION_XVOST';

/**
 * Портал: лента `pres_comments` есть на сделке и компании, «Хвост» — на
 * лиде (там его пишет фрейм анкеты). Остальные коды не установлены и
 * молча пропускаются моделью.
 */
const makePortal = (over: { xvostOnLead?: boolean } = {}) => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (entity: string, code: string) => {
        if (code === 'pres_comments') {
            return { bitrixId: 'PRES_COMMENTS', items: [] };
        }
        if (
            code === 'op_presentation_xvost' &&
            entity === 'lead' &&
            (over.xvostOnLead ?? true)
        ) {
            return { bitrixId: 'OP_PRESENTATION_XVOST', items: [] };
        }
        return undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getPortal: () => ({ domain: 'd.b24.ru' }),
});

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
            lead: {
                ID: '42',
                [XVOST]: 'Созвон в пятницу, ждём решение собственника',
            },
            currentPresDeal: null,
            ...((over.init as object) ?? {}),
        } as never,
        new Date('2026-08-14T09:00:00.000Z'),
    );

/** Первая (свежая) запись ленты `pres_comments` целевой сущности. */
const commentOf = (
    ctx: EventReportContext,
    portal: unknown = makePortal(),
    deal: Record<string, unknown> | null = null,
): string => {
    const out = new EventReportEntityFieldsModel(
        portal as never,
        ctx,
        EEventReportEntityType.DEAL,
        { deal, role: EDealRole.BASE, presentationHappenedHere: true },
    ).toFields();
    return ((out[COMMENTS] as string[] | undefined) ?? [])[0] ?? '';
};

describe('Запись «Презентация состоялась» в pres_comments', () => {
    it('в ленту уезжает и событие, и хвост анкеты', () => {
        const line = commentOf(makeCtx());
        expect(line).toContain('Презентация состоялась: ООО Ромашка');
        expect(line).toContain(
            'Хвост: Созвон в пятницу, ждём решение собственника',
        );
    });

    /*
     * Запись ленты — ОДНА строка с разделителем « — »: pres_comments —
     * МНОЖЕСТВЕННОЕ поле, а грид таких полей рисует любые внутренние
     * переносы подчёркиванием. `%0A` не спасает: батч уходит JSON-телом,
     * сервер декодирует его в настоящий `\n` (инцидент 31.08 — «ОП
     * История» вся в `_`). См. toMultiFieldEntryText.
     */
    it('многострочный хвост схлопывается в одну строку « — », без %0A и сырых переносов', () => {
        const ctx = makeCtx({
            init: {
                lead: {
                    ID: '42',
                    [XVOST]: 'дожать:\n- КП\r\n- договор',
                },
            },
        });
        const line = commentOf(ctx);
        expect(line).toContain(' — Хвост: дожать: — - КП — - договор');
        expect(line).not.toContain('%0A');
        expect(line).not.toMatch(/[\r\n]/);
    });

    it('хвоста нет — запись прежняя, без пустого хвоста', () => {
        const ctx = makeCtx({ init: { lead: { ID: '42', [XVOST]: '   ' } } });
        const line = commentOf(ctx);
        expect(line).toContain('Презентация состоялась: ООО Ромашка');
        expect(line).not.toContain('Хвост');
    });

    it('лида в контексте нет (работа от компании) — запись прежняя', () => {
        const line = commentOf(makeCtx({ init: { lead: null } }));
        expect(line).toContain('Презентация состоялась: ООО Ромашка');
        expect(line).not.toContain('Хвост');
    });

    it('поле хвоста не установлено на портале — запись прежняя', () => {
        const portal = makePortal({ xvostOnLead: false });
        const line = commentOf(makeCtx(), portal);
        expect(line).toContain('Презентация состоялась: ООО Ромашка');
        expect(line).not.toContain('Хвост');
    });

    /*
     * Лимит ленты не трогаем (PRES_COMMENTS_LIMIT = 15): хвост дописывается
     * В ТУ ЖЕ запись, число записей не растёт.
     */
    it('лента остаётся одной записью на презентацию, старое не теряется', () => {
        const out = new EventReportEntityFieldsModel(
            makePortal() as never,
            makeCtx(),
            EEventReportEntityType.DEAL,
            {
                deal: {
                    ID: '500',
                    [COMMENTS]: ['01.08.2026 10:00:00 Презентация состоялась'],
                },
                role: EDealRole.BASE,
                presentationHappenedHere: true,
            },
        ).toFields();
        const comments = out[COMMENTS] as string[];
        expect(comments).toHaveLength(2);
        expect(comments[0]).toContain('Хвост:');
        expect(comments[1]).toBe('01.08.2026 10:00:00 Презентация состоялась');
    });

    it('без проведённой презентации записи нет вовсе', () => {
        const ctx = makeCtx({
            dto: { presentation: { isPresentationDone: false } },
        });
        expect(commentOf(ctx)).toBe('');
    });
});
