import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_KINDS,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
    isAiAnalyticsFeedbackKind,
} from '../contracts/feedback.types';
import {
    AI_ANALYSIS_SERIES_START,
    AnalysisVersions,
    comparableFrom,
    comparableFromVersions,
    PROMPT_SERIES_START,
    versionDate,
    versionFieldSeriesDate,
    versionSeriesDate,
} from '../contracts/versions.types';
import {
    SkillSnapshot,
    SnapshotEnvelope,
    SnapshotUsage,
} from '../contracts/snapshot.types';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../contracts/snapshot-kinds.const';
import * as publicApi from '../index';

describe('versions.types', () => {
    it('comparableFrom — максимум из дат разрывов', () => {
        expect(comparableFrom(['2026-08-24', '2026-09-05', '2026-01-01'])).toBe(
            '2026-09-05',
        );
    });

    it('принимает строки версий с датой внутри, игнорирует строки без даты', () => {
        // Версия по существу без записи в таблице серий — дата из строки.
        expect(
            comparableFrom([
                'focus-v9.0-2026-09-05',
                'sections-7-v1',
                '2026-08-24',
                'abc123hash',
            ]),
        ).toBe('2026-09-05');
        expect(versionDate('focus-v2.1-2026-09-05')).toBe('2026-09-05');
        expect(versionDate('sections-7-v1')).toBeNull();
    });

    it('нет дат → пустая строка', () => {
        expect(comparableFrom([])).toBe('');
        expect(comparableFrom(['sections-7-v1'])).toBe('');
    });

    /**
     * Серии сравнимости (решения владельца 19–20.10.2026): вся накопленная
     * история — одна серия от 25.06.2026; минорная версия несёт свою дату,
     * но граница берётся из таблицы серий.
     */
    it('versionSeriesDate — дата серии из таблицы, иначе дата из строки', () => {
        expect(AI_ANALYSIS_SERIES_START).toBe('2026-06-25');
        for (const version of Object.keys(PROMPT_SERIES_START)) {
            expect(versionSeriesDate(version)).toBe(AI_ANALYSIS_SERIES_START);
        }
        expect(Object.keys(PROMPT_SERIES_START)).toEqual([
            'focus-v2.1-2026-09-05',
            'focus-v2.2-2026-09-08',
            'focus-v2.3-2026-09-25',
            'focus-v2.4-2026-10-20',
            // v2.5 (21.10.2026): отменены флаги promise и client_negative —
            // минорная правка, та же серия.
            'focus-v2.5-2026-10-21',
            // v2.6 (21.10.2026): блок приглашения на мероприятие — только
            // для звонков нового типа, оценки остальных не меняются.
            'focus-v2.6-2026-10-21',
        ]);
        expect(versionDate('focus-v2.6-2026-10-21')).toBe('2026-10-21');
        // Версия без записи — прежнее поведение: дата из строки.
        expect(versionSeriesDate('focus-v3.0-2026-11-01')).toBe('2026-11-01');
        expect(versionSeriesDate('sections-7-v1')).toBeNull();
    });

    it('comparableFrom: версии общей серии не сдвигают границу, правка по существу — рвёт', () => {
        expect(comparableFrom(['sections-7-v1', 'focus-v2.3-2026-09-25'])).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        expect(comparableFrom(['sections-7-v1', 'focus-v2.4-2026-10-20'])).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        // Правка по существу (нет записи в таблице) — рвёт ряд как раньше.
        expect(comparableFrom(['sections-7-v1', 'focus-v3.0-2026-11-01'])).toBe(
            '2026-11-01',
        );
    });

    it('голая дата события настроек в comparableFrom не попадает под таблицы полей', () => {
        // 05.09 — дата классификатора в таблице поля, но как дата события
        // настроек она остаётся собой.
        expect(comparableFrom(['2026-09-05'])).toBe('2026-09-05');
        expect(versionFieldSeriesDate('classifier', '2026-09-05')).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        // 21.10.2026: новый код event_invite у классификатора — минорная.
        expect(versionFieldSeriesDate('classifier', '2026-10-21')).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        expect(comparableFrom(['2026-10-21'])).toBe('2026-10-21');
        expect(versionFieldSeriesDate('attribution', '2026-08-24')).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        expect(versionFieldSeriesDate('attribution', '2026-11-01')).toBe(
            '2026-11-01',
        );
        expect(versionFieldSeriesDate('rubric', 'sections-7-v1')).toBeNull();
    });

    it('comparableFromVersions — по всем пяти полям с учётом серий', () => {
        const versions: AnalysisVersions = {
            prompt: 'focus-v2.1-2026-09-05',
            rubric: 'sections-7-v1',
            registry: 'deadbeef',
            attribution: '2026-08-24',
            classifier: '2026-09-05',
        };
        expect(comparableFromVersions(versions)).toBe(AI_ANALYSIS_SERIES_START);
        expect(
            comparableFromVersions({ ...versions, attribution: '2026-10-01' }),
        ).toBe('2026-10-01');
        // Неполный набор и версия по существу — дата из строки.
        expect(
            comparableFromVersions({ prompt: 'focus-v9.0-2026-09-25' }),
        ).toBe('2026-09-25');
        expect(comparableFromVersions({})).toBe('');
    });
});

describe('feedback.types', () => {
    it('константы ais-записи по контракту 4', () => {
        expect(AI_ANALYTICS_FEEDBACK_TYPE).toBe('ai-analytics-feedback');
        expect(AI_ANALYTICS_FEEDBACK_APP).toBe('ai-analytics');
        expect(AI_ANALYTICS_FEEDBACK_PROVIDER).toBe('ai-analytics');
        expect(AI_ANALYTICS_FEEDBACK_KINDS).toEqual([
            'view',
            'useful',
            'not_useful',
            'disagree',
            'alert_sent',
            'alert_handled',
            'digest_sent',
            'agenda_sent',
            'rop_mark',
            'recommendation_issued',
            'recommendation_done',
        ]);
    });

    it('isAiAnalyticsFeedbackKind — type guard', () => {
        expect(isAiAnalyticsFeedbackKind('disagree')).toBe(true);
        expect(isAiAnalyticsFeedbackKind('like')).toBe(false);
        expect(isAiAnalyticsFeedbackKind(42)).toBe(false);
    });
});

describe('snapshot.types и публичный API', () => {
    it('SkillSnapshot собирается из MetricValue и AnalysisVersions', () => {
        const snapshot: SkillSnapshot = {
            domain: 'gsirk.bitrix24.ru',
            managerId: '7',
            periodKey: '2026-09',
            versions: {
                prompt: 'p',
                rubric: 'r',
                registry: 'h',
                attribution: '2026-08-24',
                classifier: '2026-09-05',
            },
            metrics: {
                'section:needs': {
                    value: 6.5,
                    n: 20,
                    confidence: { level: 'ok' },
                },
            },
        };
        expect(snapshot.metrics['section:needs'].n).toBe(20);
    });

    it('SnapshotEnvelope принимает необязательный usage — колонки расхода ais', () => {
        const plain: SnapshotEnvelope<{ n: number }> = {
            domain: 'gsirk.bitrix24.ru',
            type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
            periodKey: '2026-09-01_2026-09-07_10_20',
            managerId: null,
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'params-1',
            inputsHash: 'a1b2c3d4',
            generatedAt: '2026-09-07T01:45:00.000Z',
            payload: { n: 7 },
        };
        const usage: SnapshotUsage = { tokensCount: 1500, price: 3 };
        const withUsage: SnapshotEnvelope<{ n: number }> = { ...plain, usage };

        expect(plain.usage).toBeUndefined();
        expect(withUsage.usage).toEqual(usage);
        // Модель не вызывали — обе колонки остаются NULL; модель
        // провайдера в usage не входит (она в нагрузке резюме).
        const idle: SnapshotUsage = { tokensCount: null, price: null };
        expect(Object.keys(idle)).toEqual(['tokensCount', 'price']);
        expect(Object.values(idle)).toEqual([null, null]);
    });

    it('index.ts реэкспортирует модель и контракты', () => {
        expect(typeof publicApi.wilsonInterval).toBe('function');
        expect(typeof publicApi.confidenceFor).toBe('function');
        expect(typeof publicApi.rateMetric).toBe('function');
        expect(typeof publicApi.scoreMetric).toBe('function');
        expect(typeof publicApi.xmrLimits).toBe('function');
        expect(typeof publicApi.parseWorkCalendar).toBe('function');
        expect(typeof publicApi.toPortalDate).toBe('function');
        expect(typeof publicApi.isWorkday).toBe('function');
        expect(typeof publicApi.lastWorkdays).toBe('function');
        expect(typeof publicApi.previousWorkday).toBe('function');
        expect(typeof publicApi.computePulse).toBe('function');
        expect(typeof publicApi.buildAgenda).toBe('function');
        expect(typeof publicApi.buildMorningDigest).toBe('function');
        expect(typeof publicApi.comparableFrom).toBe('function');
        expect(publicApi.AI_ANALYTICS_THRESHOLDS.z90).toBe(1.645);
        expect(publicApi.DEFAULT_WORK_CALENDAR.timeZone).toBe('Europe/Moscow');
        expect(publicApi.AI_ANALYTICS_FEEDBACK_TYPE).toBe(
            'ai-analytics-feedback',
        );
    });
});
