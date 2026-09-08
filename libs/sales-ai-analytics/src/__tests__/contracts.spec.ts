import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_KINDS,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
    isAiAnalyticsFeedbackKind,
} from '../contracts/feedback.types';
import {
    AnalysisVersions,
    comparableFrom,
    comparableFromVersions,
    versionDate,
} from '../contracts/versions.types';
import { SkillSnapshot } from '../contracts/snapshot.types';
import { SalesAiAnalyticsModule } from '../sales-ai-analytics.module';
import * as publicApi from '../index';

describe('versions.types', () => {
    it('comparableFrom — максимум из дат разрывов', () => {
        expect(comparableFrom(['2026-08-24', '2026-09-05', '2026-01-01'])).toBe(
            '2026-09-05',
        );
    });

    it('принимает строки версий с датой внутри, игнорирует строки без даты', () => {
        expect(
            comparableFrom([
                'focus-v2.1-2026-09-05',
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

    it('comparableFromVersions — по всем пяти полям', () => {
        const versions: AnalysisVersions = {
            prompt: 'focus-v2.1-2026-09-05',
            rubric: 'sections-7-v1',
            registry: 'deadbeef',
            attribution: '2026-08-24',
            classifier: '2026-09-05',
        };
        expect(comparableFromVersions(versions)).toBe('2026-09-05');
        expect(
            comparableFromVersions({ ...versions, attribution: '2026-10-01' }),
        ).toBe('2026-10-01');
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

    it('index.ts реэкспортирует модуль, модель и контракты', () => {
        expect(publicApi.SalesAiAnalyticsModule).toBe(SalesAiAnalyticsModule);
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
