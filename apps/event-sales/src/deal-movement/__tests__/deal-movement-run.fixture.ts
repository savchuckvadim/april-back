import {
    DEAL_MOVEMENT_CALC_VERSION,
    dealMovementVerdict,
    type DealMovementNotesSummary,
    type DealMovementRunStatus,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import {
    buildDealMovementDossier,
    toNightDeal,
} from '../lib/deal-movement-dossier.mapper';
import type { DealMovementEvaluation } from '../services/deal-movement-evaluator.service';
import { DealMovementPublishService } from '../services/deal-movement-publish.service';
import { DealMovementRunService } from '../services/deal-movement-run.service';
import type {
    DealMovementDigestOptions,
    DealMovementNotesOptions,
} from '../types/deal-movement.types';
import { dealRow } from './deal-movement.fixture';

export const DOMAIN = 'garant.bitrix24.ru';
/** 02:27 МСК 18.11 — ночь портала. */
export const NOW = new Date('2026-11-17T23:27:00.000Z');

/** Две сделки: 1 — откатилась, 2 — спокойная. */
export const evaluation = (): DealMovementEvaluation => {
    const rows = [dealRow(1, { stageOrder: 5 }), dealRow(2)];
    const transitions = new Map([
        [1, [{ at: '2026-11-15T09:00:00.000Z', fromOrder: 7, toOrder: 5 }]],
    ]);
    const deals = rows.map(row =>
        toNightDeal(
            row,
            dealMovementVerdict(
                buildDealMovementDossier(
                    row,
                    transitions.get(row.dealId) ?? [],
                    [],
                ),
                NOW.toISOString(),
            ),
        ),
    );
    return {
        openTotal: 2,
        deals,
        verdicts: new Map(
            deals.map(deal => [deal.verdict.dealId, deal.verdict]),
        ),
        pointers: new Map(),
        carryOver: [],
        capped: false,
        stagesByHistory: 0,
        workProbed: 0,
        warnings: [],
    };
};

export const entry = (
    status: DealMovementStateEntry['status'],
): DealMovementStateEntry => ({
    status,
    notifiedStatus: status,
    reasons: [],
    stageCode: 'sales_pres',
    amount: null,
    assignedById: 7,
    lastActivityAt: null,
    changedAt: null,
    notifiedAt: null,
    checkedAt: '2026-11-16T23:30:00.000Z',
});

/** Запись в ленту по умолчанию выключена. */
export const NOTES_OFF: DealMovementNotesOptions = {
    write: false,
    kind: 'comment',
    maxNotes: 100,
    maxTexts: 50,
};
export const NOTES_ON: DealMovementNotesOptions = { ...NOTES_OFF, write: true };

/** Сводка руководителям по умолчанию выключена. */
export const DIGEST_OFF: DealMovementDigestOptions = {
    enabled: false,
    mode: 'new_only',
    weekday: 1,
    top: 15,
};
export const DIGEST_ON: DealMovementDigestOptions = {
    ...DIGEST_OFF,
    enabled: true,
};

export interface RunSetup {
    lock?: string | null;
    lastRunAt?: string | null;
    /** Версия расчёта в метке счёта; по умолчанию — нынешняя. */
    lastRunCalc?: string;
    previous?: Map<string, DealMovementStateEntry>;
    evaluate?: jest.Mock;
    notes?: DealMovementNotesOptions;
    digest?: DealMovementDigestOptions;
    /** Сколько записей ещё можно этой ночью. */
    remaining?: number;
    /** Каким сделкам запись в ленту «ушла». */
    written?: string[];
}

interface NotesWriteInput {
    summary: DealMovementNotesSummary;
    onProgress: () => Promise<void>;
}

/** Сервис прогона на заглушках; `order` — порядок сохранений. */
export const buildRun = (setup: RunSetup = {}) => {
    const statuses: DealMovementRunStatus[] = [];
    const order: string[] = [];
    const runState = {
        lock: jest
            .fn()
            .mockResolvedValue(setup.lock === undefined ? 'token' : setup.lock),
        unlock: jest.fn().mockResolvedValue(undefined),
        extend: jest.fn().mockResolvedValue(undefined),
        saveStatus: jest.fn((status: DealMovementRunStatus) => {
            statuses.push(
                JSON.parse(JSON.stringify(status)) as DealMovementRunStatus,
            );
            return Promise.resolve();
        }),
        lastRun: jest.fn().mockResolvedValue(
            setup.lastRunAt
                ? {
                      day: '2026-11-17',
                      at: setup.lastRunAt,
                      calc: setup.lastRunCalc ?? DEAL_MOVEMENT_CALC_VERSION,
                  }
                : null,
        ),
        markRun: jest.fn(() => {
            order.push('mark');
            return Promise.resolve();
        }),
    };
    const stateStore = {
        load: jest.fn().mockResolvedValue(setup.previous ?? new Map()),
        save: jest.fn(() => {
            order.push('state');
            return Promise.resolve();
        }),
    };
    const snapshots = {
        save: jest.fn(() => {
            order.push('snapshot');
            return Promise.resolve('501');
        }),
    };
    const evaluator = {
        evaluate:
            setup.evaluate ??
            jest.fn(
                async (
                    _domain: string,
                    _options: unknown,
                    _now: Date,
                    onPhase: (phase: string) => Promise<void>,
                ) => {
                    await onPhase('deals');
                    return evaluation();
                },
            ),
    };
    const settings = {
        resolve: jest.fn().mockResolvedValue({
            notes: setup.notes ?? NOTES_OFF,
            digest: setup.digest ?? DIGEST_OFF,
        }),
    };
    const digest = {
        send: jest.fn(() => {
            order.push('digest');
            return Promise.resolve({
                enabled: true,
                skipped: null,
                recipients: 3,
                sent: 2,
                failed: 1,
            });
        }),
    };
    const notes = {
        remaining: jest.fn().mockResolvedValue(setup.remaining ?? 0),
        write: jest.fn(async (input: NotesWriteInput) => {
            order.push('notes');
            input.summary.written = (setup.written ?? []).length;
            await input.onProgress();
            return {
                written: new Set(setup.written ?? []),
                warnings: ['не удалось записать в ленту сделки 7: тест'],
            };
        }),
    };
    const service = new DealMovementRunService(
        settings as never,
        evaluator as never,
        runState as never,
        stateStore as never,
        snapshots as never,
        notes as never,
        new DealMovementPublishService(notes as never, digest as never),
    );
    return {
        service,
        runState,
        stateStore,
        snapshots,
        statuses,
        notes,
        digest,
        evaluator,
        order,
    };
};
