import {
    dealMovementVerdict,
    type DealMovementRunStatus,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import {
    buildDealMovementSnapshot,
    formatDealMovementFailure,
    formatDealMovementRun,
} from '../lib/deal-movement-report';
import {
    decodeDealMovementEntry,
    encodeDealMovementEntry,
} from '../lib/deal-movement-state.codec';
import { buildDealMovementDossier } from '../lib/deal-movement-dossier.mapper';
import { dealRow } from './deal-movement.fixture';

const status = (
    fields: Partial<DealMovementRunStatus> = {},
): DealMovementRunStatus => ({
    domain: 'garant.bitrix24.ru',
    mode: 'count',
    requestedBy: 'nightly',
    phase: 'saved',
    startedAt: '2026-11-17T23:27:00.000Z',
    updatedAt: '2026-11-17T23:30:00.000Z',
    finished: false,
    openTotal: 9012,
    evaluated: 9012,
    capped: false,
    baseline: false,
    firstSeen: 4,
    byStatus: { moving: 7000, stuck: 1500, rolled_back: 12, at_risk: 500 },
    changed: 123,
    snapshotDay: '2026-11-18',
    warnings: [],
    error: null,
    ...fields,
});

describe('итог ночи в Telegram', () => {
    it('портал, режим, оценено, счёт по статусам, смены — по-русски, без кодов', () => {
        const text = formatDealMovementRun(status());

        expect(text).toBe(
            [
                '📊 Движение сделок · garant.bitrix24.ru · счёт с сохранением',
                'Открытых сделок: 9012, оценено: 9012',
                'Движется — 7000 · Застряла — 1500 · Откатилась — 12 · Под риском — 500',
                'Сменили статус за ночь: 123, впервые увидели: 4',
            ].join('\n'),
        );
        expect(text).not.toMatch(/at_risk|rolled_back|dry-run/);
    });

    it('базовая линия и предупреждения — отдельными строками', () => {
        const text = formatDealMovementRun(
            status({
                mode: 'dry-run',
                baseline: true,
                warnings: ['открытых сделок 12000 больше потолка 10000'],
            }),
        );

        expect(text).toContain('подсчёт без сохранения');
        expect(text).toContain('Базовая линия');
        expect(text).toContain('⚠️ открытых сделок 12000 больше потолка 10000');
    });

    it('записи в ленту: выключено, «записали бы» у подсчёта, итог у счёта', () => {
        const notes = {
            enabled: true,
            kind: 'comment' as const,
            planned: 100,
            written: 97,
            failed: 3,
            deferredLimit: 20,
            deferredQuiet: 5,
            texts: 48,
            textsFailed: 2,
        };

        expect(
            formatDealMovementRun(
                status({ notes: { ...notes, enabled: false, kind: null } }),
            ),
        ).toContain('Запись в ленту сделок выключена');
        expect(
            formatDealMovementRun(status({ mode: 'dry-run', notes })),
        ).toContain(
            'Записали бы в ленту: 100; отложили бы: лимит ночи — 20, не чаще раза в 3 дня — 5',
        );
        const text = formatDealMovementRun(status({ notes }));
        expect(text).toContain(
            'Записи в ленту: записано 97 из 100, не удалось 3; отложено: лимит ночи — 20, не чаще раза в 3 дня — 5',
        );
        expect(text).toContain(
            'Подсказки «что сделать»: 48, без подсказки по вине модели: 2',
        );
        expect(text).not.toMatch(/comment|log_message/);
    });

    it('сбой — одной строкой с причиной', () => {
        expect(
            formatDealMovementFailure('gsr.bitrix24.ru', 'нет воронки'),
        ).toBe(
            '❌ Движение сделок · gsr.bitrix24.ru: счёт не удался — нет воронки',
        );
    });
});

describe('дневной снимок', () => {
    it('итог ночи и смены статуса с причинами словами', () => {
        const row = dealRow(9041, { stageOrder: 5 });
        const verdict = dealMovementVerdict(
            buildDealMovementDossier(
                row,
                [{ at: '2026-11-15T09:00:00.000Z', fromOrder: 7, toOrder: 5 }],
                [],
            ),
            '2026-11-17T23:30:00.000Z',
        );

        const snapshot = buildDealMovementSnapshot({
            status: status(),
            day: '2026-11-18',
            changes: [
                {
                    dealId: '9041',
                    title: row.title,
                    assignedById: 7,
                    amount: 100_000,
                    from: 'moving',
                    to: 'rolled_back',
                    reasons: verdict.reasons,
                },
            ],
            verdicts: new Map([['9041', verdict]]),
            notified: new Set(['9041']),
        });

        expect(snapshot).toMatchObject({
            day: '2026-11-18',
            mode: 'count',
            calcVersion: 'deal-movement-1.0.0',
            openTotal: 9012,
            evaluated: 9012,
            changesTotal: 1,
            changes: [
                {
                    dealId: '9041',
                    from: 'moving',
                    to: 'rolled_back',
                    reasons: ['стадия сделки вернулась назад'],
                    notified: true,
                },
            ],
        });
        // Прогон до второй волны — без итога записей.
        expect(snapshot.notes).toBeUndefined();
    });
});

describe('запись состояния сделки в Redis', () => {
    const entry: DealMovementStateEntry = {
        status: 'at_risk',
        notifiedStatus: 'at_risk',
        reasons: ['step_overdue'],
        stageCode: 'sales_pres',
        amount: 150000,
        assignedById: 42,
        lastActivityAt: '2026-11-16T09:00:00.000Z',
        changedAt: '2026-11-17T23:30:00.000Z',
        notifiedAt: null,
        checkedAt: '2026-11-17T23:30:00.000Z',
    };

    it('кодирование обратимо', () => {
        expect(decodeDealMovementEntry(encodeDealMovementEntry(entry))).toEqual(
            entry,
        );
    });

    it('битая или чужая запись — null; незнакомые причины отбрасываются', () => {
        expect(decodeDealMovementEntry('{не json')).toBeNull();
        expect(
            decodeDealMovementEntry(JSON.stringify({ ...entry, status: 'ok' })),
        ).toBeNull();
        expect(
            decodeDealMovementEntry(
                JSON.stringify({
                    ...entry,
                    reasons: ['step_overdue', 'чужое'],
                }),
            )?.reasons,
        ).toEqual(['step_overdue']);
    });
});
