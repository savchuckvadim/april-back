import { Logger } from '@nestjs/common';
import {
    createElement,
    isValidElement,
    type ReactElement,
    type ReactNode,
} from 'react';

// @react-pdf/renderer — ESM-only, под jest не грузится: примитивы —
// строковые теги, рендер — заглушка. Шрифты лежат в @lib/pdf-render и
// тоже идут через этот мок (Font.register).
jest.mock('@react-pdf/renderer', () => ({
    Document: 'DOCUMENT',
    Page: 'PAGE',
    Text: 'TEXT',
    View: 'VIEW',
    StyleSheet: { create: <T>(styles: T): T => styles },
    Font: {
        register: (): void => undefined,
        registerHyphenationCallback: (): void => undefined,
    },
    renderToBuffer: (): Promise<Buffer> =>
        Promise.resolve(Buffer.from('%PDF-1.7 mock')),
}));

import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import { OwnerReportPdfService } from '../owner-report-pdf.service';
import { OwnerReportPdfDocument } from '../pdf/OwnerReportPdfDocument';

/** Тексты дерева элементов (мок отдаёт строковые теги, поэтому дерево — обычные элементы React). */
function collectTexts(node: ReactNode, into: string[] = []): string[] {
    if (typeof node === 'string') into.push(node);
    else if (typeof node === 'number') into.push(String(node));
    else if (Array.isArray(node))
        (node as ReactNode[]).forEach(item => collectTexts(item, into));
    else if (isValidElement(node)) {
        const element = node as ReactElement<{ children?: ReactNode }>;
        const type = element.type;
        if (typeof type === 'function') {
            collectTexts(
                (type as (props: unknown) => ReactNode)(
                    element.props as unknown,
                ),
                into,
            );
        } else {
            collectTexts(element.props.children, into);
        }
    }
    return into;
}

const report = (): AiOwnerReportDto => ({
    kind: 'month',
    periodKey: '2026-10',
    from: '2026-10-01',
    to: '2026-10-31',
    generatedAt: '2026-11-02T06:05:00.000Z',
    source: 'model',
    narrativeReason: null,
    availablePeriods: ['2026-10'],
    text: {
        title: 'Управленческий отчёт по отделу продаж за месяц',
        periodLabel: '1–31 октября 2026',
        tiles: [
            {
                code: 'analyzed',
                value: '312',
                label: 'разговоров разобрано',
                compare: null,
            },
        ],
        summary: ['Деньги застревают на дожиме.', 'Второй абзац.'],
        summarySource: 'model',
        overview: {
            outcomes: [{ label: 'Отложено без даты', calls: 120, pct: '38 %' }],
            typeGroups: [],
            weeks: [],
            notes: ['Рабочие дни без звонков: 12 октября.'],
        },
        leaks: [
            {
                code: 'postponed_no_date',
                title: 'Отложено без даты возврата',
                scale: '120 из 312 (38 %)',
                money: null,
                nature: 'Процесс',
                action: 'Требовать дату',
                text: 'Абзац утечки.',
                source: 'template',
                exampleLinks: [],
            },
        ],
        management: {
            rows: [],
            verdict: 'Управляется частично',
            verdictText: 'Проверено 9 из 9.',
        },
        objections: { intro: 'Возражений не было.', rows: [], coldTop: null },
        issues: { intro: 'Сбоев нет.', rows: [] },
        controlMetrics: [],
        managers: [
            {
                managerId: '7',
                name: 'Надежда',
                headline: 'Ядро продаж',
                cells: { calls: '145 (46 %)' },
                strengths: ['даёт 23 из 52 продвижений'],
                risks: [],
                conclusion: 'Вывод.',
                source: 'model',
            },
        ],
        methodology: ['Период 1–31 октября 2026.'],
    },
});

describe('OwnerReportPdfService', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('рендерит PDF из DTO и даёт имя файла по виду и ключу периода', async () => {
        const result = await new OwnerReportPdfService().render(
            report(),
            'Europe/Moscow',
        );
        expect(result.buffer.toString()).toContain('%PDF');
        expect(result.filename).toBe('sales-report-month-2026-10.pdf');
    });

    it('документ несёт заголовок, плитки, резюме, утечку и сотрудника', () => {
        const texts = collectTexts(
            createElement(OwnerReportPdfDocument, {
                report: report(),
                generatedAtText: '2 ноября 2026',
            }),
        ).join(' | ');
        expect(texts).toContain(
            'Управленческий отчёт по отделу продаж за месяц',
        );
        expect(texts).toContain('312');
        expect(texts).toContain('Деньги застревают на дожиме.');
        expect(texts).toContain('Отложено без даты возврата');
        expect(texts).toContain('Надежда');
        expect(texts).toContain('Собран 2 ноября 2026');
        expect(texts).toContain('написано моделью по фактам');
    });
});
