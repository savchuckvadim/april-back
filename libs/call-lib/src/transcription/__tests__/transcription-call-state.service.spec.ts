import {
    TranscriptionPipelineStateRow,
    TranscriptionRepository,
} from '../repository/transcription.repository';
import { TranscriptionCallStateService } from '../services/transcription-call-state.service';

const DOMAIN = 'demo.bitrix24.ru';

const row = (
    activityId: string,
    patch: Partial<TranscriptionPipelineStateRow> = {},
): TranscriptionPipelineStateRow => ({
    id: BigInt(100 + Number(activityId)),
    dedup_key: `${DOMAIN}:${activityId}`,
    activity_id: activityId,
    status: 'done',
    call_started_at: new Date('2026-11-16T09:00:00.000Z'),
    duration: '312',
    user_id: '7',
    updated_at: new Date('2026-11-16T09:20:00.000Z'),
    ...patch,
});

function setup(rows: TranscriptionPipelineStateRow[]) {
    const findPipelineStatesByDedupKeys = jest.fn<
        Promise<TranscriptionPipelineStateRow[]>,
        [readonly string[]]
    >(() => Promise.resolve(rows));
    const repository = {
        findPipelineStatesByDedupKeys,
    } as unknown as TranscriptionRepository;
    return {
        service: new TranscriptionCallStateService(repository),
        findPipelineStatesByDedupKeys,
    };
}

describe('TranscriptionCallStateService', () => {
    it('отдаёт состояние по номеру дела и спрашивает базу ключами портала', async () => {
        const { service, findPipelineStatesByDedupKeys } = setup([
            row('501'),
            row('502', { status: 'queued', duration: null }),
        ]);

        const states = await service.byActivity(DOMAIN, [501, '502', 503]);

        expect(findPipelineStatesByDedupKeys).toHaveBeenCalledWith([
            `${DOMAIN}:501`,
            `${DOMAIN}:502`,
            `${DOMAIN}:503`,
        ]);
        expect(states.get('501')).toEqual({
            id: '601',
            activityId: '501',
            status: 'done',
            callStartedAt: new Date('2026-11-16T09:00:00.000Z'),
            durationSec: '312',
            userId: '7',
            updatedAt: new Date('2026-11-16T09:20:00.000Z'),
        });
        expect(states.get('502')?.status).toBe('queued');
        // До звонка 503 конвейер не дошёл — его в ответе нет.
        expect(states.has('503')).toBe(false);
    });

    it('без годных номеров дел в базу не ходит', async () => {
        const { service, findPipelineStatesByDedupKeys } = setup([]);

        const states = await service.byActivity(DOMAIN, [0, -5, 'abc', '']);

        expect(states.size).toBe(0);
        expect(findPipelineStatesByDedupKeys).not.toHaveBeenCalled();
    });

    it('строку чужого портала и строку без ключа не отдаёт', async () => {
        const { service } = setup([
            row('501', { dedup_key: 'other.bitrix24.ru:501' }),
            row('502', { dedup_key: null }),
        ]);

        const states = await service.byActivity(DOMAIN, [501, 502]);

        expect(states.size).toBe(0);
    });

    it('повторы номера дела дают один ключ запроса', async () => {
        const { service, findPipelineStatesByDedupKeys } = setup([row('501')]);

        await service.byActivity(DOMAIN, [501, '501', 501]);

        expect(findPipelineStatesByDedupKeys).toHaveBeenCalledWith([
            `${DOMAIN}:501`,
        ]);
    });
});
