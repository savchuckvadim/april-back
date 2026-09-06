import { AGENT_ANALYSIS_TYPE, AnalyticsCallLiteRow } from '@lib/call-lib';
import { AgendaUseCase } from '../domain/use-cases/agenda.use-case';
import { SmartLinkLoader } from '../domain/loaders/smart-link.loader';
import { buildSmartItemLink } from '../domain/presenter/smart-link.util';
import { applyAgendaPerimeter } from '../domain/presenter/agenda.presenter';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/** Четверг 03.09.2026 15:00 MSK → неделя пн 31.08 — чт 03.09. */
const NOW = new Date('2026-09-03T12:00:00Z');

function weekRows(): AnalyticsCallLiteRow[] {
    return [
        liteRow({
            transcriptionId: 'r1',
            managerId: '10',
            riskFlags: ['promise'],
            sections: [
                {
                    section: 'NEEDS',
                    relevance: 1,
                    score: 4,
                    asWas: 'Мы вам перезвоним',
                    alternatives: [],
                },
            ],
        }),
        liteRow({
            transcriptionId: 'o1',
            managerId: '20',
            objections: [
                {
                    category: 'price',
                    quote: 'Дорого для нас',
                    handled: false,
                    outcome: 'disengaged',
                },
            ],
        }),
        liteRow({
            transcriptionId: 's1',
            managerId: '30',
            sections: [
                {
                    section: 'CLOSE',
                    relevance: 1,
                    score: 2,
                    asWas: 'Ну ладно, до свидания',
                    alternatives: ['Давайте назначим дату'],
                },
            ],
        }),
        liteRow({
            transcriptionId: 's2',
            managerId: '30',
            sections: [
                {
                    section: 'CLOSE',
                    relevance: 1,
                    score: 5,
                    asWas: 'Хорошо',
                    alternatives: [],
                },
            ],
        }),
    ];
}

function feedbackWith(records: object[]): AiAnalyticsFeedbackStore {
    return { listInPeriod: jest.fn().mockResolvedValue(records) } as never;
}

function smartLinksWith(
    entityTypeId: number | null,
    itemByCall: Record<string, string>,
) {
    const aicallSmart = {
        resolveInfo: jest
            .fn()
            .mockResolvedValue(entityTypeId ? { entityTypeId } : null),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            Object.entries(itemByCall).map(
                ([transcription_id, report_item_id]) => ({
                    type: AGENT_ANALYSIS_TYPE,
                    transcription_id,
                    report_item_id,
                }),
            ),
        ),
    };
    return {
        loader: new SmartLinkLoader(aicallSmart as never, aiService as never),
        aiService,
    };
}

describe('AgendaUseCase', () => {
    it('повестка недели: пн — сегодня, 3 звонка по приоритету, ссылка на элемент смарта', async () => {
        const { loader, loadLite } = callsLoaderWith(weekRows());
        const links = smartLinksWith(1054, { r1: '77', o1: '78', s1: '0' });
        const useCase = new AgendaUseCase(
            loader,
            settingsLoaderWith(),
            feedbackWith([
                {
                    kind: 'disagree',
                    managerId: '20',
                    object: 'call:o1',
                    reason: 'отработано',
                },
                {
                    kind: 'view',
                    managerId: '20',
                    object: 'agenda',
                    reason: null,
                },
            ]),
            links.loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.weekKey).toBe('2026-W36');
        expect(loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                from: '2026-08-30T21:00:00.000Z',
                to: '2026-09-03T20:59:59.999Z',
            }),
        );
        expect(
            dto.items.map(item => [item.transcriptionId, item.kind]),
        ).toEqual([
            ['r1', 'risk'],
            ['o1', 'objection'],
            ['s1', 'section'],
        ]);
        expect(dto.items[0].link).toBe('https://d/crm/type/1054/details/77/');
        expect(dto.items[2].link).toBeNull(); // report_item_id = 0
        expect(dto.items[0].charOffset).toBeNull(); // текст не грузится
        expect(links.aiService.findByTranscriptionIds).toHaveBeenCalledWith([
            'r1',
            'o1',
            's1',
        ]);
        expect(dto.disagreements).toEqual([
            { managerId: '20', object: 'call:o1', reason: 'отработано' },
        ]);
        expect(await useCase.resolveWeek('d', NOW)).toEqual({
            weekKey: '2026-W36',
            timeZone: 'Europe/Moscow',
        });
    });

    it('детерминизм: перемешанный вход даёт ту же повестку', async () => {
        const build = async (rows: AnalyticsCallLiteRow[]) =>
            new AgendaUseCase(
                callsLoaderWith(rows).loader,
                settingsLoaderWith(),
                feedbackWith([]),
                smartLinksWith(null, {}).loader,
            ).execute('d', { now: NOW });

        const straight = await build(weekRows());
        const shuffled = await build([...weekRows()].reverse());
        expect(shuffled).toEqual(straight);
        expect(straight.items.every(item => item.link === null)).toBe(true);
    });

    it('applyPerimeter: менеджер видит только свои звонки и несогласия', async () => {
        const useCase = new AgendaUseCase(
            callsLoaderWith(weekRows()).loader,
            settingsLoaderWith(),
            feedbackWith([
                {
                    kind: 'disagree',
                    managerId: '20',
                    object: 'call:o1',
                    reason: null,
                },
                {
                    kind: 'disagree',
                    managerId: null,
                    object: 'pulse',
                    reason: null,
                },
            ]),
            smartLinksWith(null, {}).loader,
        );
        const dto = await useCase.execute('d', { now: NOW });

        const own = applyAgendaPerimeter(dto, {
            role: 'manager',
            visibleManagerIds: ['20'],
        });
        expect(own.items.map(item => item.transcriptionId)).toEqual(['o1']);
        expect(own.disagreements).toEqual([
            { managerId: '20', object: 'call:o1', reason: null },
        ]);
        const all = applyAgendaPerimeter(dto, {
            role: 'cup',
            visibleManagerIds: null,
        });
        expect(all.disagreements).toHaveLength(2);
    });

    it('ссылки fail-open: ошибка смарта/ais → link = null у всех', async () => {
        const loader = new SmartLinkLoader(
            {
                resolveInfo: jest.fn().mockRejectedValue(new Error('no smart')),
            } as never,
            { findByTranscriptionIds: jest.fn() } as never,
        );
        const links = await loader.resolveLinks('d', ['a', 'b']);
        expect([...links.entries()]).toEqual([
            ['a', null],
            ['b', null],
        ]);
        expect(buildSmartItemLink('d', 5, 7)).toBe(
            'https://d/crm/type/5/details/7/',
        );
        expect(buildSmartItemLink('d', null, 7)).toBeNull();
    });
});
