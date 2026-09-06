import { AuditCallRow } from '../audit/ai-analytics-audit.calc';
import { AuditDataset } from '../audit/ai-analytics-audit.load';
import {
    EMPTY_CELL,
    mdTable,
    renderAuditMarkdown,
} from '../audit/ai-analytics-audit.markdown';
import {
    AuditReportMeta,
    buildAuditReport,
} from '../audit/ai-analytics-audit.report';

const meta: AuditReportMeta = {
    domain: 'x.bitrix24.ru',
    timeZone: 'UTC',
    months: ['2026-07', '2026-08'],
    generatedAt: '2026-09-06',
};

const row = (overrides: Partial<AuditCallRow> = {}): AuditCallRow => ({
    transcriptionId: '1',
    managerId: '7',
    month: '2026-08',
    durationSec: 120,
    callType: 'cold',
    analysisPresent: true,
    versionKey: 'agentVersion=v2',
    fields: {
        nextStepSet: true,
        nextStepDate: false,
        sectionsTotal: 7,
        sectionsWithAlternatives: 3,
        objectionsTotal: 1,
        objectionsWithQuote: 1,
    },
    ...overrides,
});

const dataset = (rows: AuditCallRow[]): AuditDataset => ({
    rows,
    depth: [
        {
            type: 'call-classify',
            firstCreatedAt: new Date('2026-06-15T08:00:00Z'),
            count: 42,
        },
        { type: 'agent-analysis', firstCreatedAt: null, count: 0 },
    ],
    fetchedTranscriptions: rows.length + 1,
    outsideWindow: 1,
});

describe('ai-analytics-audit.markdown', () => {
    it('mdTable рисует заголовок, разделитель и «—» вместо null', () => {
        expect(mdTable(['a', 'b'], [[1, null]])).toBe(
            `| a | b |\n| --- | --- |\n| 1 | ${EMPTY_CELL} |`,
        );
    });

    it('полный отчёт: все разделы, жирные ячейки n ≥ 8, рекомендации', () => {
        const rows = Array.from({ length: 10 }, (_, index) =>
            row({ transcriptionId: String(index + 1) }),
        );
        const markdown = renderAuditMarkdown(
            buildAuditReport(dataset(rows), meta),
        );

        expect(markdown).toContain(
            '# Аудит данных AI-аналитики ОП — x.bitrix24.ru — 2026-09-06',
        );
        for (const heading of [
            '## 1. Покрытие user_id',
            '## 2. Разборы по (менеджер × тип × месяц)',
            '## 3. Доля other / irrelevant',
            '## 4. Длительности',
            '## 5. Разборы по версиям',
            '## 6. Заполненность полей user_result',
            '## 7. Глубина истории ais',
            '## 8. Рекомендация по порогам 4.11 и minDurationSec',
        ]) {
            expect(markdown).toContain(heading);
        }
        expect(markdown).toContain('| 7 | **10** | 10 |');
        expect(markdown).toContain('| 2026-08 | agentVersion=v2 | 10 |');
        expect(markdown).toContain('| call-classify | 2026-06-15 | 42 |');
        expect(markdown).toContain(`| agent-analysis | ${EMPTY_CELL} | 0 |`);
        expect(markdown).toContain('Доля звонков < 300 с — 100 %');
        expect(markdown).toContain('дешёвый контур');
        expect(markdown).toContain('пороги 4.11 оставить');
    });

    it('пустое окно: заглушки вместо таблиц и рекомендация «оценить нельзя»', () => {
        const markdown = renderAuditMarkdown(
            buildAuditReport(dataset([]), meta),
        );
        expect(markdown).toContain('_Разборов в окне нет._');
        expect(markdown).toContain('оценить нельзя');
        expect(markdown).toContain('отложить');
    });
});
