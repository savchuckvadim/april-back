import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from '@lib/call-lib/ai/ai-record-types.const';
import {
    AI_BATCH_SIZE,
    AuditAiRow,
    AuditDb,
    AuditTranscriptionRow,
    buildAuditRow,
    buildAuditRows,
    latestAiByTranscription,
    loadAuditDataset,
} from '../audit/ai-analytics-audit.load';
import { windowLowerBound } from '../audit/ai-analytics-audit.time';

const TZ = 'UTC';

const transcription = (
    overrides: Partial<AuditTranscriptionRow> = {},
): AuditTranscriptionRow => ({
    id: 1n,
    userId: '7',
    duration: '600',
    callStartedAt: new Date('2026-08-10T10:00:00Z'),
    createdAt: new Date('2026-08-11T10:00:00Z'),
    ...overrides,
});

const ai = (overrides: Partial<AuditAiRow> = {}): AuditAiRow => ({
    id: 10n,
    transcriptionId: 1n,
    type: AGENT_ANALYSIS_TYPE,
    result: null,
    userResult: { callType: 'presentation', agentVersion: 'v2' },
    ...overrides,
});

describe('ai-analytics-audit.load', () => {
    describe('latestAiByTranscription', () => {
        it('на каждый тип оставляет запись с наибольшим id', () => {
            const map = latestAiByTranscription([
                ai({ id: 12n, userResult: { callType: 'call' } }),
                ai({ id: 11n, userResult: { callType: 'cold' } }),
                ai({ id: 5n, type: CALL_CLASSIFY_TYPE, result: 'cold' }),
                ai({ id: 7n, transcriptionId: 2n }),
            ]);
            expect(map.get('1')?.get(AGENT_ANALYSIS_TYPE)?.id).toBe(12n);
            expect(map.get('1')?.get(CALL_CLASSIFY_TYPE)?.id).toBe(5n);
            expect(map.get('2')?.get(AGENT_ANALYSIS_TYPE)?.id).toBe(7n);
        });
    });

    describe('buildAuditRow', () => {
        it('без дат — null', () => {
            expect(
                buildAuditRow(
                    transcription({ callStartedAt: null, createdAt: null }),
                    undefined,
                    TZ,
                ),
            ).toBeNull();
        });

        it('месяц по call_started_at, иначе по created_at', () => {
            expect(buildAuditRow(transcription(), undefined, TZ)?.month).toBe(
                '2026-08',
            );
            expect(
                buildAuditRow(
                    transcription({
                        callStartedAt: null,
                        createdAt: new Date('2026-07-31T23:00:00Z'),
                    }),
                    undefined,
                    TZ,
                )?.month,
            ).toBe('2026-07');
        });

        it('тип: разбор агента → user_result классификатора → result классификатора', () => {
            const byType = new Map<string, AuditAiRow>([
                [AGENT_ANALYSIS_TYPE, ai()],
                [
                    CALL_CLASSIFY_TYPE,
                    ai({
                        type: CALL_CLASSIFY_TYPE,
                        result: 'call',
                        userResult: { callType: 'cold' },
                    }),
                ],
            ]);
            expect(buildAuditRow(transcription(), byType, TZ)?.callType).toBe(
                'presentation',
            );

            byType.set(AGENT_ANALYSIS_TYPE, ai({ userResult: {} }));
            expect(buildAuditRow(transcription(), byType, TZ)?.callType).toBe(
                'cold',
            );

            byType.delete(AGENT_ANALYSIS_TYPE);
            byType.set(
                CALL_CLASSIFY_TYPE,
                ai({
                    type: CALL_CLASSIFY_TYPE,
                    result: 'call',
                    userResult: null,
                }),
            );
            expect(buildAuditRow(transcription(), byType, TZ)?.callType).toBe(
                'call',
            );
        });

        it('заполняет менеджера, длительность, версию и поля разбора', () => {
            const byType = new Map<string, AuditAiRow>([
                [
                    AGENT_ANALYSIS_TYPE,
                    ai({
                        userResult: {
                            callType: 'cold',
                            versions: { prompt: 'p' },
                            nextStep: { set: true, date: '2026-09-01' },
                            sections: [{ alternatives: ['a'] }],
                            objections: [{ quote: 'q' }],
                        },
                    }),
                ],
            ]);
            expect(buildAuditRow(transcription(), byType, TZ)).toEqual({
                transcriptionId: '1',
                managerId: '7',
                month: '2026-08',
                durationSec: 600,
                callType: 'cold',
                analysisPresent: true,
                versionKey:
                    'prompt=p;rubric=?;registry=?;attribution=?;classifier=?',
                fields: {
                    nextStepSet: true,
                    nextStepDate: true,
                    sectionsTotal: 1,
                    sectionsWithAlternatives: 1,
                    objectionsTotal: 1,
                    objectionsWithQuote: 1,
                },
            });
        });

        it('без записей ais — нет разбора, тип и версия null', () => {
            expect(
                buildAuditRow(transcription({ duration: null }), undefined, TZ),
            ).toEqual({
                transcriptionId: '1',
                managerId: '7',
                month: '2026-08',
                durationSec: null,
                callType: null,
                analysisPresent: false,
                versionKey: null,
                fields: null,
            });
        });
    });

    describe('buildAuditRows', () => {
        it('оставляет строки окна, остальные считает как outsideWindow', () => {
            const result = buildAuditRows(
                [
                    transcription({ id: 1n }),
                    transcription({
                        id: 2n,
                        callStartedAt: new Date('2026-05-01T00:00:00Z'),
                    }),
                    transcription({
                        id: 3n,
                        callStartedAt: null,
                        createdAt: null,
                    }),
                ],
                [ai({ transcriptionId: 1n })],
                { domain: 'x', months: ['2026-07', '2026-08'], timeZone: TZ },
            );
            expect(result.rows.map(row => row.transcriptionId)).toEqual(['1']);
            expect(result.rows[0].analysisPresent).toBe(true);
            expect(result.outsideWindow).toBe(2);
        });
    });

    describe('loadAuditDataset', () => {
        it('грузит транскрипции от нижней границы, ais порциями и глубину по типам', async () => {
            const total = AI_BATCH_SIZE * 2 + 1;
            const transcriptions = Array.from({ length: total }, (_, index) =>
                transcription({ id: BigInt(index + 1) }),
            );
            const calls: {
                from?: Date;
                batches: number[];
                depthTypes: string[];
            } = { batches: [], depthTypes: [] };
            const db: AuditDb = {
                findDoneTranscriptions: (_domain, from) => {
                    calls.from = from;
                    return Promise.resolve(transcriptions);
                },
                findAiRecords: ids => {
                    calls.batches.push(ids.length);
                    return Promise.resolve(
                        ids.map(id => ai({ id, transcriptionId: id })),
                    );
                },
                aiDepth: (_domain, type) => {
                    calls.depthTypes.push(type);
                    return Promise.resolve({
                        type,
                        firstCreatedAt: new Date('2026-06-01T00:00:00Z'),
                        count: 5,
                    });
                },
            };

            const dataset = await loadAuditDataset(db, {
                domain: 'x',
                months: ['2026-07', '2026-08'],
                timeZone: TZ,
            });

            expect(calls.from).toEqual(windowLowerBound('2026-07'));
            expect(calls.batches).toEqual([AI_BATCH_SIZE, AI_BATCH_SIZE, 1]);
            expect(calls.depthTypes).toEqual([
                CALL_CLASSIFY_TYPE,
                AGENT_ANALYSIS_TYPE,
            ]);
            expect(dataset.fetchedTranscriptions).toBe(total);
            expect(dataset.rows).toHaveLength(total);
            expect(dataset.rows.every(row => row.analysisPresent)).toBe(true);
            expect(dataset.depth).toHaveLength(2);
        });
    });
});
