import {
    DEAL_MOVEMENT_CALC_VERSION,
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
    byStatus: {
        moving: 7000,
        stuck: 400,
        abandoned: 1100,
        rolled_back: 12,
        at_risk: 500,
    },
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
                'Движется — 7000 · Без продвижения — 400 · Без внимания — 1100 · Вернулась назад — 12 · Под риском — 500',
                'Сменили статус за ночь: 123, впервые увидели: 4',
            ].join('\n'),
        );
        expect(text).not.toMatch(/at_risk|rolled_back|abandoned|dry-run/);
    });

    it('откуда сроки и сколько сделок проверено по делам Битрикса — строкой после смен', () => {
        const text = formatDealMovementRun(
            status({ stagesByHistory: 6, workProbed: 3200 }),
        );

        expect(text.split('\n')[4]).toBe(
            'Сроки по истории портала — у стадий: 6, у остальных общий порог; звонки и дела Битрикса проверены у сделок: 3200',
        );
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
            heldForNight: false,
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

        // Ручной счёт из админки в ленты не пишет — сколько ждёт ночи.
        const manual = formatDealMovementRun(
            status({
                requestedBy: 'admin',
                notes: {
                    ...notes,
                    heldForNight: true,
                    planned: 0,
                    written: 0,
                    failed: 0,
                    texts: 0,
                    textsFailed: 0,
                },
            }),
        );
        expect(manual).toContain(
            'Ручной счёт в ленту не пишет: до ночи отложено записей — 20; не чаще раза в 3 дня — 5',
        );
        expect(manual).not.toContain('Подсказки');
    });

    it('сводка руководителям: сколько получателей, ушло и не доставлено; пропуск — причиной', () => {
        const sent = formatDealMovementRun(
            status({
                digest: {
                    enabled: true,
                    skipped: null,
                    recipients: 6,
                    sent: 5,
                    failed: 1,
                },
            }),
        );
        expect(sent).toContain(
            'Сводка руководителям: получателей 6, ушло 5, не доставлено 1',
        );
        expect(sent).not.toContain('по аудиту');
        expect(
            formatDealMovementRun(
                status({
                    digest: {
                        enabled: true,
                        skipped: null,
                        recipients: 6,
                        sent: 6,
                        failed: 0,
                        auditForgotten: 4,
                    },
                }),
            ),
        ).toContain(
            'Сводка руководителям: получателей 6, ушло 6, не доставлено 0; забыты по аудиту: 4',
        );
        const manual = formatDealMovementRun(
            status({
                digest: {
                    enabled: true,
                    skipped: 'manual',
                    recipients: 0,
                    sent: 0,
                    failed: 0,
                },
            }),
        );
        expect(manual).toContain(
            'Сводка руководителям: уходит только после ночного счёта',
        );
        expect(manual).not.toMatch(/manual|already_sent/);
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
            calcVersion: DEAL_MOVEMENT_CALC_VERSION,
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
        remindedStep: 2,
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
