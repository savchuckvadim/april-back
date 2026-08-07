import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
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
        entityType: 'company',
        entityId: 42,
        nowDate: new Date('2026-08-05T10:00:00Z'),
        reportEventType: 'Презентация',
        planEventType: 'Звонок',
        reportComment: 'Комментарий менеджера',
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
        expect(payload.COMMENT).toContain('Отчёт по событию: Презентация');
        expect(payload.COMMENT).toContain('План: Звонок');
        expect(payload.COMMENT).toContain('Комментарий: Комментарий менеджера');
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
