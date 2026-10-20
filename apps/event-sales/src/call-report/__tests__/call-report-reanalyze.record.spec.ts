import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    buildReanalysisRecord,
    estimateReanalysisCost,
    pairsBySeries,
} from '../use-cases/call-report-reanalyze.record';

/**
 * Запись переразбора копирует ссылки старой записи и несёт reanalysisOf;
 * оценка dryRun честна без учёта токенов; пары отчёта собираются по
 * активной записи с reanalysisOf и её старой записи, группа — серия.
 */
const ROW = {
    id: 't-1',
    dedupKey: null,
    domain: 'gsr.bitrix24.ru',
    activityId: 'a-row',
    callId: null,
    callStartedAt: new Date('2026-09-10T10:00:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'текст',
    segments: null,
    durationSec: '600',
    entityType: 'deal',
    entityId: '5',
    userId: '317',
    createdAt: null,
    updatedAt: null,
};

const VERSIONS = {
    prompt: CALL_REPORT_PROMPT_VERSION,
    rubric: 'sections-7-v1',
    registry: 'abc',
    attribution: '2026-08-24',
    classifier: '2026-09-05',
};

describe('buildReanalysisRecord', () => {
    it('копирует report_item_id, activity_id, entity_type, entity_id, user_id старой записи; пишет reanalysisOf и версии', () => {
        const record = buildReanalysisRecord({
            row: ROW,
            old: {
                id: '41',
                user_result: { classifierCallType: 'cold' },
                report_item_id: '500',
                activity_id: 'a-old',
                entity_type: 'lead',
                entity_id: 77,
                user_id: 317,
            },
            dto: {
                callType: 'presentation',
                summary: 'итог',
                score: 7,
                needsFound: true,
                presentationDone: true,
            },
            versions: VERSIONS,
            usage: { tokens_count: 1200, price: 1.8 },
            model: 'gpt-x',
        });

        expect(record).toMatchObject({
            type: 'agent-analysis',
            status: 'done',
            provider: 'call-report-reanalyzer',
            model: 'gpt-x',
            app: 'call-report',
            result: 'итог',
            tokens_count: 1200,
            price: 1.8,
            report_item_id: '500',
            in_report: true,
            activity_id: 'a-old',
            entity_type: 'lead',
            entity_id: 77,
            user_id: 317,
            transcription_id: 't-1',
            domain: 'gsr.bitrix24.ru',
        });
        expect(record.user_result).toMatchObject({
            reanalysisOf: '41',
            agentName: 'call-report-reanalyzer',
            versions: VERSIONS,
            classifierCallType: 'cold',
            classifierMismatch: true,
        });
    });

    it('без карточки и владельца у старой записи — ссылки из строки, in_report = false, модель — провайдер', () => {
        const record = buildReanalysisRecord({
            row: ROW,
            old: { id: '41', user_result: {}, report_item_id: '' },
            dto: {
                callType: 'presentation',
                summary: 'итог',
                needsFound: false,
                presentationDone: false,
            },
            versions: VERSIONS,
            usage: {},
            model: null,
        });
        expect(record).toMatchObject({
            model: 'call-report-reanalyzer',
            in_report: false,
            activity_id: 'a-row',
            entity_type: 'deal',
            entity_id: 5,
        });
        expect(record.report_item_id).toBeUndefined();
        expect(record.user_id).toBeUndefined();
        expect(record.tokens_count).toBeUndefined();
    });
});

describe('estimateReanalysisCost', () => {
    it('среднее по записям с токенами × кандидаты; записи без токенов не считаются', () => {
        const estimate = estimateReanalysisCost(
            [
                { tokens_count: 1000, price: 1.5 },
                { tokens_count: 3000, price: 4.5 },
                { tokens_count: 0, price: 0 },
            ],
            10,
        );
        expect(estimate).toMatchObject({
            basedOnRecords: 2,
            avgTokens: 2000,
            avgPrice: 3,
            estimatedTokens: 20000,
            estimatedPrice: 30,
        });
    });

    it('учёта токенов нет — честно «оценки нет»', () => {
        const estimate = estimateReanalysisCost(
            [{ tokens_count: 0, price: 0 }],
            5,
        );
        expect(estimate).toMatchObject({
            basedOnRecords: 0,
            avgTokens: null,
            estimatedPrice: null,
        });
        expect(estimate.message).toContain('Оценки нет');
    });
});

describe('pairsBySeries', () => {
    const analysis = (
        score: number,
        prompt?: string,
        reanalysisOf?: string,
    ) => ({
        callType: 'presentation',
        weightedScore: score,
        sections: [{ section: 'NEEDS', relevance: 100, score: 7 }],
        ...(prompt ? { versions: { prompt } } : {}),
        ...(reanalysisOf ? { reanalysisOf } : {}),
    });

    it('пара — активная запись с reanalysisOf и её старая; группы по серии старого промпта, без версий — null', () => {
        const pairs = pairsBySeries([
            {
                id: '1',
                type: 'agent-analysis',
                status: 'superseded',
                transcription_id: 't-1',
                user_result: analysis(70, 'focus-v2.2-2026-09-08'),
            },
            {
                id: '9',
                type: 'agent-analysis',
                status: 'done',
                transcription_id: 't-1',
                user_result: analysis(60, CALL_REPORT_PROMPT_VERSION, '1'),
            },
            {
                id: '2',
                type: 'agent-analysis',
                status: 'superseded',
                transcription_id: 't-2',
                user_result: analysis(50),
            },
            {
                id: '8',
                type: 'agent-analysis',
                status: 'done',
                transcription_id: 't-2',
                user_result: analysis(80, CALL_REPORT_PROMPT_VERSION, '2'),
            },
            // Обычный разбор без переразбора — пары нет.
            {
                id: '3',
                type: 'agent-analysis',
                status: 'done',
                transcription_id: 't-3',
                user_result: analysis(40, CALL_REPORT_PROMPT_VERSION),
            },
        ]);

        // v2.2 — в общей серии накопленной истории от 25.06.
        expect([...pairs.keys()]).toEqual(['2026-06-25', null]);
        expect(pairs.get('2026-06-25')).toHaveLength(1);
        expect(pairs.get('2026-06-25')?.[0]).toMatchObject({
            key: 't-1',
            firstPromptVersion: 'focus-v2.2-2026-09-08',
            first: { scales: { score: 7 } },
            second: { scales: { score: 6 } },
        });
        expect(pairs.get(null)?.[0]).toMatchObject({
            key: 't-2',
            firstPromptVersion: null,
        });
    });
});
