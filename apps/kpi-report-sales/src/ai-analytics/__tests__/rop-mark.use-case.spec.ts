import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ropMarkSeed } from '@lib/sales-ai-analytics/model/rop-mark';
import {
    AI_ROP_MARK_MESSAGES,
    mondayOfIsoWeek,
} from '../constants/ai-rop-mark.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { isoWeekKey } from '../domain/loaders/period.util';
import { RopMarkUseCase } from '../domain/use-cases/rop-mark.use-case';
import type { AiRopMarkRecord } from '../store/ai-analytics-rop-mark.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

const DOMAIN = 'a.bitrix24.ru';
const DAY = '2026-09-03';
const WEEK = isoWeekKey(DAY);
const NOW = new Date('2026-09-07T00:15:00Z');

const leader = { role: 'op' as const, visibleManagerIds: ['11', '12', '13'] };
const cup = { role: 'cup' as const, visibleManagerIds: null };
const manager = { role: 'manager' as const, visibleManagerIds: ['11'] };

/** Звонки недели: неуверенный тип, лучший балл и обычный — у разных менеджеров. */
const weekRows = () => [
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
const savedPick = (generatedAt = NOW.toISOString()) => ({
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

const mark = (overrides: Partial<AiRopMarkRecord> = {}): AiRopMarkRecord => ({
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

function makeUseCase(
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

describe('RopMarkUseCase.pick', () => {
    it('подбирает три звонка недели и сохраняет набор с зерном домена и недели', async () => {
        const { useCase, store } = makeUseCase();

        const result = await useCase.pick(
            { domain: DOMAIN, requesterUserId: '447', date: DAY },
            leader,
            NOW,
        );

        expect(result.weekKey).toBe(WEEK);
        expect(result.from).toBe(mondayOfIsoWeek(WEEK));
        expect(result.to).toBe('2026-09-06');
        expect(result.calls.map(call => call.reason)).toEqual([
            'uncertain_type',
            'best_score',
            'random',
        ]);
        expect(store.savePick).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: DOMAIN,
                weekKey: WEEK,
                seed: ropMarkSeed(DOMAIN, WEEK),
            }),
        );
    });

    it('звонки подбора получают ссылки на карточки разборов', async () => {
        const { useCase, smartLinks } = makeUseCase();

        const result = await useCase.pick(
            { domain: DOMAIN, requesterUserId: '447', date: DAY },
            leader,
            NOW,
        );

        expect(smartLinks.resolveLinks).toHaveBeenCalledWith(
            DOMAIN,
            result.calls.map(call => call.transcriptionId),
        );
        for (const call of result.calls) {
            expect(call.link).toBe(
                `https://portal/type/9/details/${call.transcriptionId}/`,
            );
        }
    });

    it('до сохранения метки колонки оценки AI не отдаются (слепой режим)', async () => {
        const { useCase } = makeUseCase();

        const result = await useCase.pick(
            { domain: DOMAIN, requesterUserId: '447', date: DAY },
            leader,
            NOW,
        );

        for (const call of result.calls) {
            expect(call.marked).toBe(false);
            expect(call.aiScore).toBeUndefined();
            expect(call.aiCallType).toBeUndefined();
            expect(call.mark).toBeUndefined();
        }
        expect(result.blindNote).toContain('Битрикс');
    });

    it('подбор недели уже сохранён — переиспользуется, звонки заново не грузятся', async () => {
        const { useCase, store, loadLite } = makeUseCase({ pick: savedPick() });

        const result = await useCase.pick(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            leader,
            NOW,
        );

        expect(loadLite).not.toHaveBeenCalled();
        expect(store.savePick).not.toHaveBeenCalled();
        expect(result.calls.map(call => call.transcriptionId)).toEqual([
            '102',
            '103',
        ]);
    });

    it('forceRefresh пересобирает подбор по текущим звонкам недели', async () => {
        const { useCase, store, loadLite } = makeUseCase({ pick: savedPick() });

        await useCase.pick(
            {
                domain: DOMAIN,
                requesterUserId: '447',
                weekKey: WEEK,
                forceRefresh: true,
            },
            leader,
            NOW,
        );

        expect(loadLite).toHaveBeenCalledTimes(1);
        expect(store.savePick).toHaveBeenCalledTimes(1);
    });

    it('менеджеру подбор недоступен — 403', async () => {
        const { useCase } = makeUseCase();

        await expect(
            useCase.pick(
                { domain: DOMAIN, requesterUserId: '11', date: DAY },
                manager,
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('RopMarkUseCase.list', () => {
    it('после сохранения метки звонок отдаётся с оценкой AI и меткой', async () => {
        const { useCase } = makeUseCase({
            pick: savedPick(),
            marks: [mark()],
        });

        const result = await useCase.list(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            leader,
            NOW,
        );

        const [uncertain, best] = result.calls;
        expect(uncertain.marked).toBe(false);
        expect(uncertain.aiScore).toBeUndefined();
        expect(best.marked).toBe(true);
        expect(best.aiScore).toBe(92);
        expect(best.aiCallType).toBe('presentation');
        expect(best.mark).toMatchObject({
            agree: false,
            ropScore: 6,
            sections: ['NEEDS'],
            blind: true,
        });
    });

    it('подбора недели ещё нет — пустой список без падения', async () => {
        const { useCase, store } = makeUseCase();

        const result = await useCase.list(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            cup,
            NOW,
        );

        expect(result.calls).toEqual([]);
        expect(store.listMarks).not.toHaveBeenCalled();
    });

    it('звонки вне периметра руководителя в ответ не попадают', async () => {
        const { useCase } = makeUseCase({ pick: savedPick() });

        const result = await useCase.list(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            { role: 'group', visibleManagerIds: ['13'] },
            NOW,
        );

        expect(result.calls.map(call => call.managerId)).toEqual(['13']);
    });
});

describe('RopMarkUseCase.save', () => {
    const saveDto = {
        domain: DOMAIN,
        requesterUserId: '447',
        weekKey: WEEK,
        transcriptionId: '103',
        agree: false,
        ropScore: 6,
        sections: ['NEEDS'],
        why: 'потребность не выявлена',
        howTo: 'два вопроса до предложения',
    };

    it('первая метка пишется вслепую, причина подбора едет в запись', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        const result = await useCase.save(saveDto, leader, NOW);

        expect(result).toEqual({ id: '9002', replaced: false, blind: true });
        expect(store.saveMark).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: DOMAIN,
                transcriptionId: '103',
                managerId: '13',
                requesterUserId: '447',
                weekKey: WEEK,
                reason: 'best_score',
                agree: false,
                ropScore: 6,
                blind: true,
            }),
        );
    });

    it('повторная метка на тот же звонок заменяет предыдущую и слепой уже не считается', async () => {
        const { useCase, store } = makeUseCase({
            pick: savedPick(),
            marks: [mark()],
        });

        const result = await useCase.save(
            { ...saveDto, agree: true },
            leader,
            NOW,
        );

        expect(result).toMatchObject({ replaced: true, blind: false });
        expect(store.saveMark).toHaveBeenCalledWith(
            expect.objectContaining({ agree: true, blind: false }),
        );
    });

    it('метка принимается только от руководителя, менеджеру — 403', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        await expect(
            useCase.save(saveDto, manager, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(store.saveMark).not.toHaveBeenCalled();
    });

    it('менеджер звонка вне периметра — 403', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        await expect(
            useCase.save(
                saveDto,
                { role: 'group', visibleManagerIds: ['11'] },
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(store.saveMark).not.toHaveBeenCalled();
    });

    it('звонок вне подбора недели метку не принимает — 400', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        await expect(
            useCase.save({ ...saveDto, transcriptionId: '999' }, leader, NOW),
        ).rejects.toThrow(AI_ROP_MARK_MESSAGES.callNotPicked);
        expect(store.saveMark).not.toHaveBeenCalled();
    });

    it('подбора недели нет — метку ставить не по чему (400)', async () => {
        const { useCase } = makeUseCase();

        await expect(useCase.save(saveDto, leader, NOW)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

describe('mondayOfIsoWeek', () => {
    it('ключ недели → её понедельник и обратно', () => {
        // 2026 — год с 53 неделями (1 января четверг), 2024-W09 — обычная.
        for (const weekKey of [
            '2026-W01',
            '2026-W36',
            '2026-W53',
            '2024-W09',
        ]) {
            const monday = mondayOfIsoWeek(weekKey);
            expect(isoWeekKey(monday)).toBe(weekKey);
        }
    });

    it('несуществующая 53-я неделя перетекает в первую неделю следующего года', () => {
        expect(isoWeekKey(mondayOfIsoWeek('2027-W53'))).toBe('2028-W01');
    });
});
