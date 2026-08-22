import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXDateTime } from '@lib/portal-lib/pbx-domain/date/pbx-datetime';
import { EventReportEntityHistoryService } from '../services/history/event-report-entity-history.service';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date;
// юнит-тест воспроизводит это состояние явно.
dayjs.extend(utc);
dayjs.extend(timezone);

describe('EventReportEntityHistoryService', () => {
    const makeBitrix = () => {
        const addTimelineComment = jest.fn();
        const bitrix = {
            batch: { timeline: { addTimelineComment } },
        };
        return { bitrix, addTimelineComment };
    };

    const portal = {
        getTimezone: () => 'Europe/Moscow',
    };

    const makeCtx = (overrides: Record<string, unknown> = {}) => ({
        isGsirk: true,
        // Форматирование дат идёт через контекст (ctx.dateTime) — фейковый
        // контекст обязан отдавать ту же обёртку, что и настоящий.
        dateTime: new PBXDateTime(portal as never),
        entityType: 'company',
        entityId: 42,
        nowDate: new Date('2026-08-05T10:00:00Z'),
        reportEventType: 'presentation',
        planEventType: 'warm',
        reportComment: 'Комментарий менеджера',
        planDeadline: { toRuHumanDateTime: () => '28 мая 14:30' },
        ...overrides,
    });

    it('ставит batch-команду crm.timeline.comment.add с плоскими полями (без вложенного fields)', () => {
        const { bitrix, addTimelineComment } = makeBitrix();
        const service = new EventReportEntityHistoryService(
            bitrix as never,
            portal as never,
        );

        service.queue(makeCtx() as never);

        expect(addTimelineComment).toHaveBeenCalledTimes(1);
        const [cmd, payload] = addTimelineComment.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(cmd).toBe('add_history_42');
        // Репозиторий сам оборачивает payload в { fields } — сервис обязан
        // передавать поля плоско, иначе получится { fields: { fields: … } }.
        expect(payload.fields).toBeUndefined();
        expect(payload.ENTITY_TYPE).toBe('company');
        expect(payload.ENTITY_ID).toBe(42);
        // Формат: без слова «Отчёт», тип склоняется, план — с датой,
        // переносы — batch-safe (%0A), первой строкой — когда произошло.
        expect(payload.COMMENT).toContain('05.08.2026 13:00:00');
        expect(payload.COMMENT).toContain(
            'Презентация проведена: Комментарий менеджера',
        );
        expect(payload.COMMENT).toContain(
            'Запланирован Звонок на 28 мая 14:30',
        );
        expect(payload.COMMENT).not.toContain('Отчёт');
        expect(payload.COMMENT).not.toContain('\n');
        expect(payload.COMMENT).toContain('%0A');
    });

    it('не пишет в таймлайн вне gsirk-портала', () => {
        const { bitrix, addTimelineComment } = makeBitrix();
        const service = new EventReportEntityHistoryService(
            bitrix as never,
            portal as never,
        );

        service.queue(makeCtx({ isGsirk: false }) as never);

        expect(addTimelineComment).not.toHaveBeenCalled();
    });

    it('не пишет в таймлайн без entityId', () => {
        const { bitrix, addTimelineComment } = makeBitrix();
        const service = new EventReportEntityHistoryService(
            bitrix as never,
            portal as never,
        );

        service.queue(makeCtx({ entityId: 0 }) as never);

        expect(addTimelineComment).not.toHaveBeenCalled();
    });

    it.each(['lead', 'deal'] as const)(
        'пишет таймлайн владельца %s с его ENTITY_TYPE',
        entityType => {
            const { bitrix, addTimelineComment } = makeBitrix();
            const service = new EventReportEntityHistoryService(
                bitrix as never,
                portal as never,
            );

            service.queue(makeCtx({ entityType }) as never);

            expect(addTimelineComment).toHaveBeenCalledTimes(1);
            const [, payload] = addTimelineComment.mock.calls[0] as [
                string,
                Record<string, unknown>,
            ];
            expect(payload.ENTITY_TYPE).toBe(entityType);
            expect(payload.ENTITY_ID).toBe(42);
        },
    );
});
