import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import {
    daysBetween,
    nightsReadEnd,
    toDealMovementCallPoints,
} from '../deal-movement-period.loader';
import { DealMovementSnapshotsReader } from '../deal-movement-snapshots.reader';
import { DealMovementOverviewRequestDto } from '../dto/deal-movement-request.dto';

const snapshotRecord = (
    id: string,
    day: string,
    status = 'done',
    payload: Record<string, unknown> = {},
) => ({
    id,
    status,
    activity_id: day,
    user_result: {
        managerId: null,
        payload: {
            day,
            mode: 'count',
            openTotal: 1,
            evaluated: 1,
            changesTotal: 0,
            byStatus: { rolled_back: 0, stuck: 0, at_risk: 0, moving: 1 },
            changes: [],
            warnings: [],
            ...payload,
        },
    },
});

describe('выборка периода витрины', () => {
    it('дни периода и хвост проверки — не дальше сегодня', () => {
        expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
            '2026-10-30',
            '2026-10-31',
            '2026-11-01',
            '2026-11-02',
        ]);
        expect(nightsReadEnd('2026-11-01', '2026-11-20')).toBe('2026-11-20');
        expect(nightsReadEnd('2026-10-01', '2026-11-20')).toBe('2026-11-01');
        // Конец периода в будущем — конец периода.
        expect(nightsReadEnd('2026-11-30', '2026-11-20')).toBe('2026-11-30');
    });

    it('звонки: только разобранные с продвижением 1–5, оценка по шкале 1–10', () => {
        const row = (
            transcriptionId: string,
            dealProgress: number | null,
            analysisPresent = true,
        ): DatedLiteRow =>
            ({
                transcriptionId,
                managerId: '0447',
                analysisPresent,
                score: 72,
                callStartedAt: new Date('2026-11-03T10:00:00.000Z'),
                methodology: { dealProgress },
            }) as unknown as DatedLiteRow;

        const points = toDealMovementCallPoints([
            row('a', 4),
            row('b', null),
            row('c', 7),
            row('d', 5, false),
        ]);

        expect(points).toEqual([
            {
                transcriptionId: 'a',
                managerId: '447',
                at: '2026-11-03T10:00:00.000Z',
                score: 7.2,
                progress: 4,
            },
        ]);
    });

    it('снимки: действующая запись на день, старый снимок читается, чужое — мимо', async () => {
        const findByDomainTypeKeys = jest.fn().mockResolvedValue([
            snapshotRecord('1', '2026-11-18', 'superseded'),
            snapshotRecord('2', '2026-11-18', 'done', { openTotal: 7 }),
            snapshotRecord('3', '2026-11-17'),
            {
                id: '4',
                status: 'done',
                activity_id: '2026-11-16',
                user_result: { payload: { day: '2026-11-16' } },
            },
        ]);
        const reader = new DealMovementSnapshotsReader({
            findByDomainTypeKeys,
        } as never);

        const nights = await reader.nights('d.bitrix24.ru', [
            '2026-11-16',
            '2026-11-17',
            '2026-11-18',
        ]);

        expect(nights.map(item => [item.day, item.openTotal])).toEqual([
            ['2026-11-17', 1],
            ['2026-11-18', 7],
        ]);
        expect(nights[0]).toMatchObject({
            form: 1,
            totals: null,
            byManager: null,
        });
        expect(findByDomainTypeKeys).toHaveBeenCalledWith(
            'd.bitrix24.ru',
            'ai-analytics-deal-movement',
            { activityIds: ['2026-11-16', '2026-11-17', '2026-11-18'] },
        );
    });

    it('запрос обзора: период длиннее 92 дней — ошибка с понятным текстом', async () => {
        const dto = plainToInstance(DealMovementOverviewRequestDto, {
            domain: 'd.bitrix24.ru',
            requesterUserId: '1',
            from: '2026-01-01',
            to: '2026-11-20',
        });

        const errors = await validate(dto);

        expect(errors.map(error => error.property)).toEqual(['to']);
        expect(Object.values(errors[0].constraints ?? {})).toContain(
            'Период — не длиннее 92 дней, начало не позже конца',
        );
    });
});
