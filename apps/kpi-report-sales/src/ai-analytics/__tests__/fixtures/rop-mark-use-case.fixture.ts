import { ropMarkSeed } from '@lib/sales-ai-analytics/model/rop-mark';
import { RequesterAccessService } from '../../domain/access/requester-access.service';
import { isoWeekKey } from '../../domain/loaders/period.util';
import { RopMarkUseCase } from '../../domain/use-cases/rop-mark.use-case';
import type { AiRopMarkRecord } from '../../store/ai-analytics-rop-mark.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './lite-row.fixture';

/* Общий стенд спеков RopMarkUseCase: неделя, роли, подбор, метки, фабрика. */

export const DOMAIN = 'a.bitrix24.ru';
export const DAY = '2026-09-03';
export const WEEK = isoWeekKey(DAY);
export const NOW = new Date('2026-09-07T00:15:00Z');

export const leader = {
    role: 'op' as const,
    visibleManagerIds: ['11', '12', '13'],
};
export const cup = { role: 'cup' as const, visibleManagerIds: null };
export const manager = { role: 'manager' as const, visibleManagerIds: ['11'] };
/** Суперпользователь вендора: как RequesterAccessService его отдаёт. */
export const vendor = {
    role: 'cup' as const,
    visibleManagerIds: null,
    isSuperUser: true,
};

/** Звонки недели: неуверенный тип, лучший балл и обычный — у разных менеджеров. */
export const weekRows = () => [
    liteRow({
        transcriptionId: '101',
        managerId: '11',
        callType: 'cold',
        score: 40,
        callStartedAt: new Date('2026-09-01T08:00:00Z'),
    }),
    liteRow({
        transcriptionId: '102',
        managerId: '12',
        callType: 'other',
        score: 35,
        callStartedAt: new Date('2026-09-02T08:00:00Z'),
    }),
    liteRow({
        transcriptionId: '103',
        managerId: '13',
        callType: 'presentation',
        score: 92,
        callStartedAt: new Date('2026-09-03T08:00:00Z'),
    }),
];

/** Сохранённый подбор недели в форме стора. */
export const savedPick = (generatedAt = NOW.toISOString()) => ({
    id: '900',
    createdAt: NOW,
    weekKey: WEEK,
    seed: ropMarkSeed(DOMAIN, WEEK),
    generatedAt,
    calls: [
        {
            transcriptionId: '102',
            managerId: '12',
            callType: 'other',
            score: 35,
            reason: 'uncertain_type' as const,
        },
        {
            transcriptionId: '103',
            managerId: '13',
            callType: 'presentation',
            score: 92,
            reason: 'best_score' as const,
        },
    ],
});

export const mark = (
    overrides: Partial<AiRopMarkRecord> = {},
): AiRopMarkRecord => ({
    id: '9001',
    createdAt: new Date('2026-09-07T09:10:00Z'),
    transcriptionId: '103',
    managerId: '13',
    requesterUserId: '447',
    agree: false,
    ropScore: 6,
    sections: ['NEEDS'],
    why: 'потребность не выявлена',
    howTo: 'два вопроса до предложения',
    reason: 'best_score',
    blind: true,
    weekKey: WEEK,
    ...overrides,
});

export function makeUseCase(
    options: { pick?: unknown; marks?: AiRopMarkRecord[] } = {},
) {
    const store = {
        loadPick: jest.fn().mockResolvedValue(options.pick ?? null),
        savePick: jest.fn().mockResolvedValue({ id: '900', supersededIds: [] }),
        listMarks: jest.fn().mockResolvedValue(options.marks ?? []),
        saveMark: jest.fn().mockResolvedValue({ id: '9002', replacedIds: [] }),
    };
    const { loader, loadLite } = callsLoaderWith(weekRows());
    // Реальный сервис доступа ради assertLeader/assertVisible; структура не нужна.
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        {} as never,
    );
    const smartLinks = {
        resolveLinks: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(
                    ids.map(id => [id, `https://portal/type/9/details/${id}/`]),
                ),
            ),
        ),
    };
    return {
        useCase: new RopMarkUseCase(
            store as never,
            access,
            settingsLoaderWith(),
            loader,
            smartLinks as never,
        ),
        store,
        loadLite,
        smartLinks,
    };
}
