import type { ManagerDigestCard } from '@lib/sales-ai-analytics';
import {
    digestCardHash,
    PeriodDigestCardStore,
} from '../services/period-digest-card.store';

const DOMAIN = 'garant.bitrix24.ru';
const NOW = new Date('2026-11-17T10:00:00Z');

const card = (managerId: string, note = ''): ManagerDigestCard =>
    ({
        schemaVersion: 1,
        period: {
            kind: 'month',
            key: '2026-10',
            from: '2026-10-01',
            to: '2026-10-31',
        },
        managerId,
        managerName: `Менеджер ${managerId}${note}`,
        metrics: {},
        recommendations: [],
        forRop: { discuss: [], listen: [] },
    }) as unknown as ManagerDigestCard;

const record = (
    id: string,
    userId: number,
    payload: unknown,
    inputsHash = 'old',
    status = 'done',
) => ({
    id,
    user_id: userId,
    status,
    user_result: {
        managerId: String(userId),
        paramsVersion: '',
        inputsHash,
        generatedAt: '2026-11-10T10:00:00Z',
        payload,
    },
});

const build = (records: unknown[]) => {
    const ai = {
        findByDomainTypeKeys: jest.fn().mockResolvedValue(records),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
        update: jest.fn().mockResolvedValue({}),
    };
    return { ai, store: new PeriodDigestCardStore(ai as never) };
};

describe('карточки итогов периода в ais', () => {
    it('чтение: тип по виду, ключ периода; по менеджеру — действующая запись, чужие пропускаются', async () => {
        const { ai, store } = build([
            record('5', 10, card('10', ' старая')),
            record('7', 10, card('10')),
            record('6', 11, { foreign: true }),
        ]);

        const cards = await store.read(DOMAIN, 'month', '2026-10');

        expect(ai.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            'ai-analytics-manager-month-digest',
            { activityIds: ['2026-10'] },
        );
        expect([...cards.keys()]).toEqual(['10']);
        expect(cards.get('10')?.managerName).toBe('Менеджер 10');
    });

    it('запись: новая — создаётся, изменилась — обновляется, совпала — не трогается', async () => {
        const same = card('12');
        const { ai, store } = build([
            record('7', 10, card('10', ' прошлый расчёт')),
            record('8', 12, same, digestCardHash(same)),
        ]);

        const saved = await store.save(
            DOMAIN,
            [card('10'), card('11'), same],
            NOW,
        );

        expect(saved).toEqual({ created: 1, updated: 1, unchanged: 1 });
        const [updatedId, patch] = ai.update.mock.calls[0] as [
            string,
            { user_result: Record<string, unknown>; model: string },
        ];
        expect(updatedId).toBe('7');
        expect(patch.model).toBe('period-digest-1.0.0');
        expect(patch.user_result).toMatchObject({
            managerId: '10',
            inputsHash: digestCardHash(card('10')),
            generatedAt: NOW.toISOString(),
        });
        expect(ai.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'ai-analytics',
                app: 'ai-analytics',
                type: 'ai-analytics-manager-month-digest',
                status: 'done',
                activity_id: '2026-10',
                user_id: 11,
                domain: DOMAIN,
            }),
        );
    });

    it('нечего записывать — в ais не ходит', async () => {
        const { ai, store } = build([]);

        expect(await store.save(DOMAIN, [], NOW)).toEqual({
            created: 0,
            updated: 0,
            unchanged: 0,
        });
        expect(ai.findByDomainTypeKeys).not.toHaveBeenCalled();
    });
});
