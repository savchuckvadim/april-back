import { RequesterAccessService } from '../../domain/access/requester-access.service';
import { FeedbackUseCase } from '../../domain/use-cases/feedback.use-case';
import { settingsLoaderWith } from './lite-row.fixture';

/**
 * Стенд FeedbackUseCase: моки стора обратной связи, снапшотов стиля и
 * кэша витрины + реальный RequesterAccessService (ради assertVisible;
 * структура и кэш доступа не нужны). Календарь — Europe/Moscow.
 */
export function makeFeedbackUseCase(
    records: object[] = [],
    styleSnapshot: object | null = null,
) {
    const store = {
        add: jest.fn().mockResolvedValue('9001'),
        listInPeriod: jest.fn().mockResolvedValue(records),
        supersede: jest.fn((ids: readonly string[]) =>
            Promise.resolve([...ids]),
        ),
    };
    const snapshots = {
        latest: jest.fn().mockResolvedValue(styleSnapshot),
        upsert: jest.fn().mockResolvedValue({
            id: '1',
            supersededIds: [],
            written: 1,
        }),
    };
    const cache = { resetByPattern: jest.fn().mockResolvedValue(1) };
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        {} as never,
    );
    return {
        useCase: new FeedbackUseCase(
            store as never,
            access,
            settingsLoaderWith(),
            snapshots as never,
            cache as never,
        ),
        store,
        snapshots,
        cache,
    };
}

export const FEEDBACK_LEADER = {
    role: 'op' as const,
    visibleManagerIds: ['10', '20', '447'],
};
export const FEEDBACK_MANAGER = {
    role: 'manager' as const,
    visibleManagerIds: ['512'],
};
export const FEEDBACK_CUP = {
    role: 'cup' as const,
    visibleManagerIds: null,
};
