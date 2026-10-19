import { CallReportReanalysisReportService } from '../services/call-report-reanalysis-report.service';
import { CallReportReanalyzeUseCase } from '../use-cases/call-report-reanalyze.use-case';

/**
 * Общая оснастка спек переразбора истории: записи ais в памяти вместо БД
 * (создание, обновление, выборка по ключам), заглушки повторного прогона,
 * настроек, реестра и очереди. Битрикса среди зависимостей нет вовсе.
 */
export const DOMAIN = 'gsr.bitrix24.ru';
export const NOW = new Date('2026-10-20T01:00:00Z');
export const PERIOD = { domain: DOMAIN, from: '2026-09-01', to: '2026-09-30' };
/** v2.2 — другая серия (разрыв ряда). */
export const OLD_VERSION = 'focus-v2.2-2026-09-08';
/** v2.3 — та же серия, что у текущей v2.4 (минорная правка). */
export const SAME_SERIES_VERSION = 'focus-v2.3-2026-09-25';

/** Типизированная обёртка asymmetric matcher без `any` в литералах. */
export const containing = (value: Record<string, unknown>): unknown =>
    expect.objectContaining(value) as unknown;

export const analysis = (score: number, prompt: string | null) => ({
    callType: 'presentation',
    classifierCallType: 'presentation',
    productive: true,
    weightedScore: score,
    sections: [{ section: 'NEEDS', relevance: 100, score: 7 }],
    objections: [],
    summary: 'резюме',
    ...(prompt === null ? {} : { versions: { prompt } }),
});

const USAGE = {
    tokens: 1200,
    promptTokens: 1000,
    completionTokens: 200,
    calls: 4,
    callsWithUsage: 4,
    model: 'gpt-x',
};

export const liteRow = (id: string, userId: string) => ({
    id,
    domain: DOMAIN,
    callStartedAt: new Date('2026-09-10T10:00:00Z'),
    durationSec: '600',
    entityType: 'deal',
    entityId: '5',
    userId,
    createdAt: new Date('2026-09-10T10:30:00Z'),
});

const pipelineRow = (id: string) => ({
    ...liteRow(id, '317'),
    dedupKey: null,
    activityId: 'a-row',
    callId: null,
    provider: 'yandex',
    status: 'done',
    text: 'расшифровка',
    segments: null,
    updatedAt: null,
});

export const oldRecord = (
    id: string,
    transcriptionId: string,
    prompt: string | null,
) => ({
    id,
    type: 'agent-analysis',
    status: 'done',
    transcription_id: transcriptionId,
    user_result: analysis(70, prompt),
    report_item_id: '500',
    activity_id: 'a-old',
    entity_type: 'deal',
    entity_id: 5,
    user_id: 317,
    tokens_count: 0,
    price: 0,
});

export interface FixtureOptions {
    rows?: ReturnType<typeof liteRow>[];
    records?: Record<string, unknown>[];
    allowedUserIds?: number[] | null;
    recent?: { tokens_count: number; price: number }[];
    rerun?: 'ok' | 'null' | 'throw';
}

interface KeyFilter {
    transcriptionIds?: string[];
    activityIds?: string[];
}

export function makeUseCase(options: FixtureOptions = {}) {
    // Память вместо БД: записи ais одного домена.
    const db: Record<string, unknown>[] = [...(options.records ?? [])];
    let nextId = 100;
    const aiService = {
        findByDomainTypeKeys: jest
            .fn()
            .mockImplementation(
                (_domain: string, type: string, keys: KeyFilter) =>
                    Promise.resolve(
                        db.filter(
                            record =>
                                record.type === type &&
                                ((keys.transcriptionIds?.includes(
                                    String(record.transcription_id),
                                ) ??
                                    false) ||
                                    (keys.activityIds?.includes(
                                        String(record.activity_id),
                                    ) ??
                                        false)),
                        ),
                    ),
            ),
        findByDomainTypesInPeriod: jest
            .fn()
            .mockResolvedValue(options.recent ?? []),
        create: jest.fn().mockImplementation((dto: Record<string, unknown>) => {
            const record = { id: String(nextId++), ...dto };
            db.push(record);
            return Promise.resolve({ id: record.id });
        }),
        update: jest
            .fn()
            .mockImplementation(
                (id: string, patch: Record<string, unknown>) => {
                    const record = db.find(item => item.id === id);
                    if (record) Object.assign(record, patch);
                    return Promise.resolve({});
                },
            ),
    };
    const transcriptionStore = {
        findDoneInPeriodLite: jest.fn().mockResolvedValue(options.rows ?? []),
    };
    const rerunService = {
        rerun: jest
            .fn()
            .mockImplementation(
                ({ transcriptionId }: { transcriptionId: string }) => {
                    if (options.rerun === 'throw')
                        return Promise.reject(new Error('модель упала'));
                    if (options.rerun === 'null') return Promise.resolve(null);
                    return Promise.resolve({
                        row: pipelineRow(transcriptionId),
                        dto: { ...analysis(60, null), usage: USAGE },
                        usage: { tokens_count: 1200, price: 1.8 },
                    });
                },
            ),
    };
    const settingsService = {
        resolve: jest.fn().mockResolvedValue({
            allowedUserIds:
                options.allowedUserIds === undefined
                    ? [317]
                    : options.allowedUserIds,
            deepAnalysisModel: 'gpt-x',
        }),
    };
    const callTypeRegistry = {
        resolve: jest
            .fn()
            .mockResolvedValue({ codes: ['cold', 'presentation'] }),
    };
    const queueDispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'job' }),
    };
    const useCase = new CallReportReanalyzeUseCase(
        aiService as never,
        transcriptionStore as never,
        rerunService as never,
        settingsService as never,
        callTypeRegistry as never,
        new CallReportReanalysisReportService(aiService as never),
        queueDispatcher as never,
    );
    const ofType = (type: string) => db.filter(record => record.type === type);
    /** Первый аргумент n-го вызова повторного прогона. */
    const rerunCall = (index: number) =>
        (
            rerunService.rerun.mock.calls[index] as [
                { transcriptionId: string },
            ]
        )[0];
    return {
        useCase,
        db,
        ofType,
        aiService,
        rerunService,
        rerunCall,
        queueDispatcher,
    };
}
