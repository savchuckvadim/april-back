import {
    DEAL_MOVEMENT_PROBE_NOTE_TEXT,
    DEAL_MOVEMENT_REDIS_KEYS,
    type DealMovementProbeResult,
} from '@lib/sales-ai-analytics';
import { concludeDealMovementProbe } from '../lib/deal-movement-probe.report';
import { DealMovementNoteWriter } from '../services/deal-movement-note.writer';
import { DealMovementProbeService } from '../services/deal-movement-probe.service';
import { CATEGORY, TZ } from './deal-movement.fixture';

const DOMAIN = 'garant.bitrix24.ru';

const timelineMock = (result: unknown = { logMessage: { id: 1 } }) => ({
    addLogMessage: jest.fn().mockResolvedValue({ result }),
    addTimelineComment: jest.fn().mockResolvedValue({ result: 77 }),
});

describe('запись в ленту одной сделки', () => {
    const note = { title: 'Движение сделки: Без продвижения', text: 'Текст' };

    it('комментарий — жирный заголовок и текст одним полем, без автоповтора', async () => {
        const timeline = timelineMock();
        await new DealMovementNoteWriter({ timeline } as never).write(
            9041,
            note,
            'comment',
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            {
                ENTITY_ID: 9041,
                ENTITY_TYPE: 'deal',
                COMMENT: '[b]Движение сделки: Без продвижения[/b]\n\nТекст',
            },
            { retries: 0 },
        );
        expect(timeline.addLogMessage).not.toHaveBeenCalled();
    });

    it('служебная запись журнала — сделка (тип 2), заголовок и текст раздельно', async () => {
        const timeline = timelineMock();
        await new DealMovementNoteWriter({ timeline } as never).write(
            9041,
            note,
            'log_message',
        );
        expect(timeline.addLogMessage).toHaveBeenCalledWith(
            {
                entityTypeId: 2,
                entityId: 9041,
                title: note.title,
                text: note.text,
                iconCode: 'info',
            },
            { retries: 0 },
        );
    });

    it('Битрикс не подтвердил запись — ошибка', async () => {
        const timeline = timelineMock(null);
        await expect(
            new DealMovementNoteWriter({ timeline } as never).write(
                9041,
                note,
                'log_message',
            ),
        ).rejects.toThrow('не подтвердил');
    });
});

describe('выводы проверки записи в ленту', () => {
    it('служебная не сдвигает, комментарий сдвигает в окне своей записи', () => {
        const result = concludeDealMovementProbe({
            before: '2026-11-17T08:12:00.000Z',
            afterLogMessage: '2026-11-17T08:12:00.000Z',
            afterComment: '2026-11-17T10:00:10.000Z',
            logMessageAt: '2026-11-17T10:00:04.000Z',
            commentAt: '2026-11-17T10:00:10.000Z',
        });
        expect(result.logMessageShifts).toBe(false);
        expect(result.commentShifts).toBe(true);
        expect(result.conclusions).toEqual([
            'Служебная запись журнала не сдвигает «последнюю активность» сделки.',
            'Комментарий сдвигает «последнюю активность» сделки.',
            expect.stringContaining('попал в окно своей записи') as unknown,
        ]);
    });

    it('сдвиг вне окна — окно нужно пересмотреть', () => {
        const result = concludeDealMovementProbe({
            before: '2026-11-17T08:12:00.000Z',
            afterLogMessage: '2026-11-17T11:00:00.000Z',
            afterComment: '2026-11-17T11:00:00.000Z',
            logMessageAt: '2026-11-17T10:00:04.000Z',
            commentAt: '2026-11-17T10:00:10.000Z',
        });
        expect(result.conclusions[1]).toContain('окно нужно пересмотреть');
        expect(result.commentShifts).toBe(false);
    });
});

/** Сделка портала: «последняя активность» по очереди трёх чтений. */
const buildProbe = (deal: Record<string, unknown> | Error) => {
    // Время портала (Москва): 11:12 → 08:12 UTC, 13:00:10 → 10:00:10 UTC.
    const activity = [
        '2026-11-17 11:12:00',
        '2026-11-17 11:12:00',
        '2026-11-17 13:00:10',
    ];
    const get = jest.fn(() =>
        deal instanceof Error
            ? Promise.reject(deal)
            : Promise.resolve({
                  result: { ...deal, LAST_ACTIVITY_TIME: activity.shift() },
              }),
    );
    const timeline = timelineMock();
    const bitrix = { deal: { get }, timeline };
    const portal = {
        getDealCategoryByCode: jest.fn().mockReturnValue(CATEGORY),
        getTimezone: () => TZ,
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portal }),
    };
    const saved: DealMovementProbeResult[] = [];
    const redis = {
        set: jest.fn((_key: string, value: string) => {
            saved.push(JSON.parse(value) as DealMovementProbeResult);
            return Promise.resolve('OK');
        }),
    };
    const service = new DealMovementProbeService(
        pbx as never,
        { getClient: () => redis } as never,
    );
    return { service, timeline, redis, saved };
};

describe('проверка записи в ленту на одной сделке', () => {
    it('служебная запись → чтение → комментарий → чтение; три момента и выводы в Redis', async () => {
        const { service, timeline, redis, saved } = buildProbe({
            ID: 9041,
            CATEGORY_ID: '7',
            CLOSED: 'N',
        });

        const result = await service.run(
            { domain: DOMAIN, dealId: 9041, requestedBy: 'admin' },
            0,
        );

        expect(timeline.addLogMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 9041,
                text: DEAL_MOVEMENT_PROBE_NOTE_TEXT,
            }),
            { retries: 0 },
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({ COMMENT: DEAL_MOVEMENT_PROBE_NOTE_TEXT }),
            { retries: 0 },
        );
        expect(result).toMatchObject({
            phase: 'done',
            moments: {
                before: '2026-11-17T08:12:00.000Z',
                afterLogMessage: '2026-11-17T08:12:00.000Z',
                afterComment: '2026-11-17T10:00:10.000Z',
            },
            logMessageShifts: false,
            commentShifts: true,
            error: null,
        });
        expect(redis.set).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.probe(DOMAIN),
            expect.any(String),
            'EX',
            14 * 24 * 60 * 60,
        );
        expect(saved[0]?.phase).toBe('running');
        expect(saved.at(-1)?.phase).toBe('done');
    });

    it('сделка чужой воронки или закрыта — отказ словами, записей нет', async () => {
        const foreign = buildProbe({ ID: 1, CATEGORY_ID: '0', CLOSED: 'N' });
        const refused = await foreign.service.run(
            { domain: DOMAIN, dealId: 1, requestedBy: 'admin' },
            0,
        );
        expect(refused).toMatchObject({ phase: 'refused' });
        expect(refused.error).toContain('не из воронки «ОП Основная»');
        expect(foreign.timeline.addLogMessage).not.toHaveBeenCalled();

        const closed = buildProbe({ ID: 2, CATEGORY_ID: '7', CLOSED: 'Y' });
        const result = await closed.service.run(
            { domain: DOMAIN, dealId: 2, requestedBy: 'admin' },
            0,
        );
        expect(result.error).toContain('закрыта');
        expect(closed.timeline.addTimelineComment).not.toHaveBeenCalled();
    });

    it('сделку не прочитать — отказ; сбой записи — «failed» с причиной', async () => {
        const missing = buildProbe(new Error('Not found'));
        expect(
            await missing.service.run(
                { domain: DOMAIN, dealId: 5, requestedBy: 'admin' },
                0,
            ),
        ).toMatchObject({ phase: 'refused' });

        const broken = buildProbe({ ID: 3, CATEGORY_ID: '7', CLOSED: 'N' });
        broken.timeline.addLogMessage.mockRejectedValue(
            new Error('ACCESS_DENIED'),
        );
        const result = await broken.service.run(
            { domain: DOMAIN, dealId: 3, requestedBy: 'admin' },
            0,
        );
        expect(result).toMatchObject({
            phase: 'failed',
            error: 'ACCESS_DENIED',
        });
        expect(result.finishedAt).not.toBeNull();
    });
});
