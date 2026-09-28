import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { buildEventHistoryParts } from '../services/history/event-history-comment.builder';
import { buildEventReportTimelineComment } from '../services/timeline/event-report-timeline.formatter';
import { buildEventTaskDescription } from '../services/task/event-task-description.builder';
import {
    ActingManagerMark,
    actingManagerLabel,
    actingManagerName,
    actingManagerNote,
    userProfileUrl,
    withActingManagerNote,
} from '../services/acting-manager/acting-manager.mark';
import { buildActingManagerNotification } from '../services/acting-manager/acting-manager-notification.formatter';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * РЕЖИМ РУКОВОДИТЕЛЯ: пометка «кто отчитался за сотрудника».
 *
 * Отчёт идёт от имени сотрудника, поэтому всё чувствительное (сделки,
 * задачи, KPI) здесь не проверяется — оно не меняется. Проверяется одно:
 * пометка одинаково читается в истории, таймлайне, задаче и KPI и не
 * появляется в обычном отчёте.
 */
const NOW = new Date('2026-09-28T09:00:00.000Z');
const DOMAIN = 'example.bitrix24.ru';

const HEAD: ActingManagerMark = {
    id: 481,
    name: 'Иванов Иван',
    isConfirmedHead: true,
};

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: () => null,
});

const makeCtx = (mark: ActingManagerMark | null) => {
    const ctx = new EventReportContext(
        {
            domain: DOMAIN,
            currentTask: { eventType: 'warm', name: 'Уточнить бюджет' },
            report: {
                resultStatus: 'result',
                description: 'Договорились о встрече',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: { responsibility: { ID: 231 }, createdBy: { ID: 481 } },
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 431,
            company: { ID: '431', TITLE: 'ООО Ромашка' },
            lead: null,
            currentBaseDeal: { ID: '5512', ASSIGNED_BY_ID: '231' },
            currentPresDeal: null,
        } as never,
        NOW,
    );
    ctx.setActingManager(mark);
    return ctx;
};

const deals: DealFlowResult = {
    baseDealId: '5512',
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

describe('Пометка режима руководителя: подписи', () => {
    it('подтверждённый руководитель называется руководителем', () => {
        expect(actingManagerLabel(HEAD)).toBe('Отчитался руководитель');
        expect(actingManagerNote(HEAD)).toBe(
            'Отчитался руководитель: Иванов Иван',
        );
    });

    it('неподтверждённая роль — нейтральная подпись без слова «руководитель»', () => {
        const mark = { ...HEAD, isConfirmedHead: false };
        expect(actingManagerNote(mark)).toBe('Отчёт отправил: Иванов Иван');
    });

    it('без имени — подпись с идентификатором, а не пустота', () => {
        expect(actingManagerName({ ...HEAD, name: '  ' })).toBe(
            'сотрудник #481',
        );
    });

    it('ссылка на профиль ведёт на портал клиента', () => {
        expect(userProfileUrl(DOMAIN, 481)).toBe(
            'https://example.bitrix24.ru/company/personal/user/481/',
        );
    });

    it('комментарий с пометкой: пометка в хвосте; нет комментария — одна пометка', () => {
        expect(withActingManagerNote('Перезвонить', 'Отчёт отправил: А')).toBe(
            'Перезвонить (Отчёт отправил: А)',
        );
        expect(withActingManagerNote('', 'Отчёт отправил: А')).toBe(
            'Отчёт отправил: А',
        );
        expect(withActingManagerNote('Перезвонить', '')).toBe('Перезвонить');
    });
});

describe('Пометка режима руководителя: контекст отчёта', () => {
    it('обычный отчёт — пометки нет', () => {
        const ctx = makeCtx(null);
        expect(ctx.actingManager).toBeNull();
        expect(ctx.actingManagerNote).toBe('');
    });

    it('комментарий менеджера пометкой НЕ подменяется', () => {
        // Комментарий читают причина доработки и поля отказа — подпись
        // руководителя не должна попасть туда словами клиента.
        const ctx = makeCtx(HEAD);
        expect(ctx.reportComment).toBe('Договорились о встрече');
        expect(ctx.actingManagerNote).toBe(
            'Отчитался руководитель: Иванов Иван',
        );
    });

    it('работа остаётся за сотрудником: ответственный — из плана', () => {
        const ctx = makeCtx(HEAD);
        expect(ctx.planResponsibleId).toBe(231);
        expect(ctx.workResponsibleId).toBe(231);
    });
});

describe('Пометка режима руководителя: история карточки', () => {
    it('пометка идёт сразу за «что сделано»', () => {
        const parts = buildEventHistoryParts(makeCtx(HEAD));
        expect(parts[0]).toContain('Договорились о встрече');
        expect(parts[1]).toBe('Отчитался руководитель: Иванов Иван');
    });

    it('обычный отчёт — строки пометки нет', () => {
        const parts = buildEventHistoryParts(makeCtx(null));
        expect(parts.join('|')).not.toContain('Отчитался руководитель');
        expect(parts.join('|')).not.toContain('Отчёт отправил');
    });
});

describe('Пометка режима руководителя: таймлайн', () => {
    const source = {
        domain: DOMAIN,
        happenedAt: '28 сентября 2026',
        reportEventType: 'warm',
        reportEventName: 'Уточнить бюджет',
        isResult: true,
        reportContact: null,
        planEventType: null,
        planEventName: '',
        planAt: null,
        isExpired: false,
        planContact: null,
        isUnplannedPresentation: false,
        comment: 'Договорились о встрече',
        outcome: null,
        cards: [],
    };

    it('строка со ссылкой на профиль руководителя', () => {
        const comment = buildEventReportTimelineComment({
            ...source,
            actingManager: {
                id: 481,
                name: 'Иванов Иван',
                label: 'Отчитался руководитель',
                profileUrl: userProfileUrl(DOMAIN, 481),
            },
        });
        const lines = comment.split('\n');
        const markLine = lines.find(line =>
            line.startsWith('Отчитался руководитель:'),
        );
        expect(markLine).toBeDefined();
        expect(markLine).toContain('/company/personal/user/481/');
        expect(markLine).toContain('Иванов Иван');
        // Пометка — до комментария: сначала «кто», потом «что сказал».
        expect(lines.indexOf(markLine as string)).toBeLessThan(
            lines.findIndex(line => line.startsWith('Комментарий:')),
        );
    });

    it('обычный отчёт — строки нет', () => {
        expect(buildEventReportTimelineComment(source)).not.toContain(
            'Отчитался руководитель',
        );
    });
});

describe('Пометка режима руководителя: описание новой задачи', () => {
    const base = {
        domain: DOMAIN,
        company: { ID: '431', TITLE: 'ООО Ромашка' } as never,
        lead: null,
        contacts: [],
        baseDeal: { id: 5512, title: 'Продажа' },
        comment: 'Договорились о встрече',
    };

    it('отдельный блок со ссылкой на профиль — последним', () => {
        const description = buildEventTaskDescription({
            ...base,
            actingManager: {
                label: 'Отчитался руководитель',
                name: 'Иванов Иван',
                profileUrl: userProfileUrl(DOMAIN, 481),
            },
        });
        expect(description).toContain('Отчитался руководитель');
        expect(description).toContain(
            '[URL=https://example.bitrix24.ru/company/personal/user/481/]Иванов Иван[/URL]',
        );
        expect(description.indexOf('Отчитался руководитель')).toBeGreaterThan(
            description.indexOf('Комментарий по прошлому событию'),
        );
    });

    it('обычный отчёт — блока нет, описание прежнее', () => {
        const plain = buildEventTaskDescription(base);
        expect(plain).not.toContain('Отчитался руководитель');
        expect(
            buildEventTaskDescription({ ...base, actingManager: null }),
        ).toBe(plain);
    });
});

describe('Пометка режима руководителя: KPI', () => {
    const build = (ctx: EventReportContext) =>
        new EventReportKpiPayloadBuilder(
            makePortal() as never,
            ctx,
            deals,
        ).buildAll();

    it('комментарий записи несёт пометку, KPI остаётся сотруднику', () => {
        const payloads = build(makeCtx(HEAD));
        expect(payloads.length).toBeGreaterThan(0);
        for (const payload of payloads) {
            expect(payload.values.responsible).toBe(231);
            expect(payload.values.su).toBe(231);
            expect(String(payload.values.manager_comment)).toContain(
                'Иванов Иван',
            );
        }
    });

    it('обычный отчёт — комментарий без пометки', () => {
        for (const payload of build(makeCtx(null))) {
            expect(String(payload.values.manager_comment)).not.toContain(
                'Отчитался руководитель',
            );
        }
    });
});

describe('Уведомление сотруднику', () => {
    const source = {
        domain: DOMAIN,
        manager: HEAD,
        reportEventType: 'presentation',
        reportEventName: 'Разбор договора',
        isResult: true,
        planEventType: 'warm',
        planAt: '30 сентября 16:20',
        isExpired: false,
        outcome: null,
        card: { section: 'company', id: 431, title: 'ООО Ромашка' },
    };

    it('называет руководителя, клиента, что сделано и следующий шаг', () => {
        const message = buildActingManagerNotification(source);
        const lines = message.split('\n');
        expect(lines[0]).toContain('Руководитель');
        expect(lines[0]).toContain('Иванов Иван');
        expect(lines[0]).toContain('отчитался по вашему делу');
        expect(message).toContain(
            '[URL=https://example.bitrix24.ru/crm/company/details/431/]ООО Ромашка[/URL]',
        );
        expect(message).toContain('Что сделано:');
        expect(message).toContain('«Разбор договора»');
        expect(message).toContain('Следующий шаг:');
        expect(message).toContain('на 30 сентября 16:20');
    });

    it('финал: итог работы назван словами', () => {
        const message = buildActingManagerNotification({
            ...source,
            planEventType: null,
            planAt: null,
            outcome: 'fail',
        });
        expect(message).toContain('Итог работы: Отказ');
        expect(message).not.toContain('Следующий шаг');
    });

    it('неподтверждённая роль — без слова «руководитель»', () => {
        const message = buildActingManagerNotification({
            ...source,
            manager: { ...HEAD, isConfirmedHead: false },
        });
        expect(message.split('\n')[0]).toContain('Сотрудник');
        expect(message).not.toContain('Руководитель');
    });

    it('нет карточки клиента — строка клиента не печатается', () => {
        const message = buildActingManagerNotification({
            ...source,
            card: null,
        });
        expect(message).not.toContain('Клиент:');
    });
});
