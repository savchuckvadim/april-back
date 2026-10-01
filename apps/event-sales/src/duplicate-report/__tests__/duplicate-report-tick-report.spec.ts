import { summarizeDuplicateReport } from '../lib/duplicate-report-summary';
import {
    DuplicateReportOutcome,
    formatDuplicateReportTick,
    shouldNotifyDuplicateTick,
} from '../lib/duplicate-report-tick-report';
import { classifyClient } from '../lib/duplicate-classify';
import { DuplicateReportRunResult } from '../types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    makeClientInput,
    makeDeal,
} from './fixtures/duplicate-report.fixture';

const result = (
    patch: Partial<DuplicateReportRunResult> = {},
): DuplicateReportRunResult => ({
    domain: 'a.bitrix24.ru',
    countOnly: false,
    scanned: 812,
    clients: 12,
    deals: 26,
    decide: 3,
    join: 9,
    newThisWeek: 2,
    recipients: 4,
    tasksCreated: 4,
    tasksClosed: 3,
    warnings: [],
    ...patch,
});

describe('отчёт крона по дублям в Telegram', () => {
    it('портал с задачами: цифры отчёта и сколько задач поставлено', () => {
        const text = formatDuplicateReportTick([
            { kind: 'ran', domain: 'a.bitrix24.ru', result: result() },
        ]);
        expect(text).toContain(
            '✅ a.bitrix24.ru: клиентов 12, сделок 26, решить руководителю 3, новых за неделю 2',
        );
        expect(text).toContain('задач поставлено 4 из 4, прошлых закрыто 3');
    });

    it('«только считать» — без задач, но видно, скольким ушло бы', () => {
        const text = formatDuplicateReportTick([
            {
                kind: 'ran',
                domain: 'a.bitrix24.ru',
                result: result({ countOnly: true, tasksCreated: 0 }),
            },
        ]);
        expect(text).toContain('⏸ a.bitrix24.ru');
        expect(text).toContain('получателей было бы: 4');
    });

    it('дублей нет — короткая строка; предупреждения сворачиваются после трёх', () => {
        const text = formatDuplicateReportTick([
            {
                kind: 'ran',
                domain: 'a.bitrix24.ru',
                result: result({
                    clients: 0,
                    warnings: ['w1', 'w2', 'w3', 'w4', 'w5'],
                }),
            },
        ]);
        expect(text).toContain(
            '✅ a.bitrix24.ru: открытых сделок 812, дублей нет',
        );
        expect(text).toContain('⚠ w3');
        expect(text).not.toContain('⚠ w4');
        expect(text).toContain('… и ещё предупреждений: 2');
    });

    it('ошибка портала и ждущие порталы', () => {
        const outcomes: DuplicateReportOutcome[] = [
            {
                kind: 'failed',
                domain: 'b.bitrix24.ru',
                error: 'portal not found',
            },
            { kind: 'waiting', domain: 'c.bitrix24.ru' },
        ];
        const text = formatDuplicateReportTick(outcomes);
        expect(text).toContain('❌ b.bitrix24.ru: ошибка — portal not found');
        expect(text).toContain('⏳ ждут своего дня и часа: 1');
    });

    it('в Telegram — только если хоть один портал прогнан или упал', () => {
        expect(
            shouldNotifyDuplicateTick([{ kind: 'waiting', domain: 'a' }]),
        ).toBe(false);
        expect(
            shouldNotifyDuplicateTick([
                { kind: 'waiting', domain: 'a' },
                { kind: 'failed', domain: 'b', error: 'x' },
            ]),
        ).toBe(true);
    });

    it('сводка прогона: клиенты, сделки, решить, новые; задач — ноль до доставки', () => {
        const decide = classifyClient(
            makeClientInput([
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, { assignedById: 12, openTasks: 1 }),
                makeDeal(3),
            ]),
            CLASSIFY_OPTIONS,
        );
        const join = classifyClient(
            makeClientInput([makeDeal(4), makeDeal(5)]),
            CLASSIFY_OPTIONS,
        );
        expect(
            summarizeDuplicateReport({
                domain: 'a.bitrix24.ru',
                countOnly: true,
                scanned: 40,
                clients: [decide, join],
                recipients: 2,
                warnings: [],
            }),
        ).toEqual({
            domain: 'a.bitrix24.ru',
            countOnly: true,
            scanned: 40,
            clients: 2,
            deals: 5,
            decide: 1,
            join: 1,
            newThisWeek: 0,
            recipients: 2,
            tasksCreated: 0,
            tasksClosed: 0,
            warnings: [],
        });
    });
});
