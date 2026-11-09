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
                tone: 'neutral',
            },
        ],
        attention: [
            {
                tone: 'bad',
                title: 'Отложено без даты возврата: 54 из 70 (77 %)',
                action: 'Требовать дату следующего контакта в CRM.',
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
        funnel: {
            rows: [
                {
                    code: 'followup',
                    label: 'После показа и КП: доработка, решение, оплата',
                    calls: 46,
                    advanced: '5 из 46 (11 %)',
                    undecided: '41 из 46 (89 %)',
                    refused: '0 из 46 (0 %)',
                    noContact: '0 из 46 (0 %)',
                    invoiceAgreed: '1 из 46 (2 %)',
                },
            ],
            chain: null,
            afterOffer:
                'Из 46 разговоров после показа и КП 41 (89 %) закончились переносом или «подумаем»; согласие на счёт — 1.',
            invoice: 'Согласие на счёт прозвучало в 1 разговоре периода.',
        },
        crmFunnel: {
            rows: [{ label: 'Показы по CRM', value: 50, previous: 41 }],
            conversions: 'Счета к показам — 30 %.',
            note: 'Отношения событий за период.',
        },
        presentations: {
            intro: 'Показов за период — 50; шаг вперёд после показа — 28 из 50 (56 %).',
            rows: [
                { label: 'Показ под задачи клиента', value: '20 из 50 (40 %)' },
            ],
            comparison:
                'Показ под задачи клиента двигает разговор дальше в 59 % случаев против 26 % при шаблонной подаче (20 показов и 30 показов).',
            sections: [
                {
                    label: 'Выявление потребностей',
                    value: '6,4 из 10 (по 50 показам)',
                },
            ],
            people: null,
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
        glossary: [
            { term: 'Шаг вперёд', meaning: 'Назначен показ или выдан доступ.' },
        ],
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
        expect(texts).toContain('собран 2 ноября 2026');
        expect(texts).toContain(
            'выводы написаны моделью по посчитанным фактам',
        );
        expect(texts).toContain('На что обратить внимание');
        expect(texts).toContain('Как читать отчёт');
        // Воронка и презентации — новые разделы 09.11.2026.
        expect(texts).toContain('Воронка и конверсии');
        expect(texts).toContain('41 из 46 (89 %)');
        expect(texts).toContain('Воронка по CRM');
        expect(texts).toContain('Презентации');
        expect(texts).toContain('против 26 % при шаблонной подаче');
    });
});
