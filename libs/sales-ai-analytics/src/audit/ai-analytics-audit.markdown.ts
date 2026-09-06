/**
 * Рендер отчёта аудита в markdown (таблицы + раздел рекомендаций).
 * Только чистые функции над моделью AuditReport.
 */
import { dateKeyOf } from './ai-analytics-audit.time';
import { NOISE_CALL_TYPES, pct } from './ai-analytics-audit.calc';
import { AuditReport } from './ai-analytics-audit.report';

type Cell = string | number | null;

/** Пустое значение в таблице. */
export const EMPTY_CELL = '—';

function fmt(value: Cell): string {
    return value === null ? EMPTY_CELL : String(value);
}

function fmtPct(value: number | null): string {
    return value === null ? EMPTY_CELL : `${value} %`;
}

/** Markdown-таблица; пустые ячейки — «—». */
export function mdTable(headers: string[], rows: Cell[][]): string {
    const line = (cells: Cell[]): string => `| ${cells.map(fmt).join(' | ')} |`;
    return [
        line(headers),
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map(line),
    ].join('\n');
}

function coverageSection(report: AuditReport): string {
    return mdTable(
        [
            'Месяц',
            'Звонков',
            'С менеджером',
            'Доля',
            'Разборов',
            'Разборов с менеджером',
        ],
        report.coverage.map(row => [
            row.month,
            row.total,
            row.withManager,
            fmtPct(row.withManagerPct),
            row.analyzed,
            row.analyzedWithManager,
        ]),
    );
}

function pivotSection(report: AuditReport): string {
    if (!report.pivots.length) return '_Разборов в окне нет._';
    const minN = report.rules.cellMinN;
    return report.pivots
        .map(pivot => {
            const table = mdTable(
                ['Менеджер', ...pivot.typeOrder, 'Всего'],
                pivot.managers.map(manager => [
                    manager.managerId,
                    ...pivot.typeOrder.map(type => {
                        const n = manager.byType[type] ?? 0;
                        return n >= minN ? `**${n}**` : n;
                    }),
                    manager.total,
                ]),
            );
            return (
                `#### ${pivot.month}\n\n${table}\n\n` +
                `Доля разборов месяца в ячейках с n ≥ ${minN}: ${fmtPct(pivot.inCellsWithMinNPct)}.`
            );
        })
        .join('\n\n');
}

function noiseSection(report: AuditReport): string {
    return mdTable(
        [
            'Месяц',
            'Звонков',
            'С типом',
            ...NOISE_CALL_TYPES.flatMap(type => [type, `${type}, доля`]),
        ],
        report.noise.map(row => [
            row.month,
            row.total,
            row.typed,
            ...NOISE_CALL_TYPES.flatMap(type => [
                row.byType[type].n,
                fmtPct(row.byType[type].pct),
            ]),
        ]),
    );
}

function durationSection(report: AuditReport): string {
    const shortSec = report.rules.shortCallSec;
    const headers = [
        'Период',
        'С длительностью',
        'Без длительности',
        'p10, с',
        'p50, с',
        'p90, с',
        `< ${shortSec} с`,
        'Доля коротких',
    ];
    const toRow = (label: string, stats: AuditReport['duration']): Cell[] => [
        label,
        stats.n,
        stats.missing,
        stats.p10,
        stats.p50,
        stats.p90,
        stats.shortCount,
        fmtPct(stats.shortPct),
    ];
    return mdTable(headers, [
        ...report.durationByMonth.map(stats => toRow(stats.month, stats)),
        toRow('Всё окно', report.duration),
    ]);
}

function versionsSection(report: AuditReport): string {
    if (!report.versions.length) return '_Разборов в окне нет._';
    return mdTable(
        ['Месяц', 'Версия разбора', 'Разборов'],
        report.versions.map(row => [row.month, row.versionKey, row.n]),
    );
}

function fieldsSection(report: AuditReport): string {
    const { fields } = report;
    return mdTable(
        ['Поле', 'Знаменатель', 'Заполнено', 'Доля'],
        [
            [
                'nextStep.set = true',
                `разборов: ${fields.analyzed}`,
                fields.nextStep.set,
                fmtPct(pct(fields.nextStep.set, fields.analyzed)),
            ],
            [
                'nextStep.date',
                `разборов: ${fields.analyzed}`,
                fields.nextStep.withDate,
                fmtPct(fields.nextStep.withDatePctOfAnalyzed),
            ],
            [
                'nextStep.date среди set = true',
                `set: ${fields.nextStep.set}`,
                fields.nextStep.withDate,
                fmtPct(fields.nextStep.withDatePctOfSet),
            ],
            [
                'sections[].alternatives (непустой массив)',
                `разделов: ${fields.sections.total}`,
                fields.sections.withAlternatives,
                fmtPct(fields.sections.withAlternativesPct),
            ],
            [
                'разборы хотя бы с одним alternatives',
                `разборов: ${fields.analyzed}`,
                fields.sections.callsWithAny,
                fmtPct(fields.sections.callsWithAnyPct),
            ],
            [
                'objections[].quote',
                `возражений: ${fields.objections.total} (в ${fields.objections.callsWithObjections} разборах)`,
                fields.objections.withQuote,
                fmtPct(fields.objections.withQuotePct),
            ],
        ],
    );
}

function depthSection(report: AuditReport): string {
    return mdTable(
        ['Тип ais', 'Первая запись', 'Всего записей по домену'],
        report.depth.map(row => [
            row.type,
            row.firstCreatedAt
                ? dateKeyOf(row.firstCreatedAt, report.meta.timeZone)
                : null,
            row.count,
        ]),
    );
}

function headerSection(report: AuditReport): string {
    const { meta, totals, rules } = report;
    return [
        `# Аудит данных AI-аналитики ОП — ${meta.domain} — ${meta.generatedAt}`,
        '',
        `Окно: ${meta.months[0]} … ${meta.months[meta.months.length - 1]} (${meta.months.length} мес.), часовой пояс ${meta.timeZone}.`,
        'Выборка: transcriptions со status = done и dedup_key (автоконвейер), месяц по call_started_at, иначе created_at; ' +
            'тип звонка — agent-analysis.callType, иначе call-classify.',
        '',
        `- Загружено строк: ${totals.fetchedTranscriptions}, вне окна: ${totals.outsideWindow}, в окне: ${totals.calls}.`,
        `- С менеджером (user_id): ${totals.withManager}; с глубоким разбором (agent-analysis): ${totals.analyzed}.`,
        `- Порог ячейки n ≥ ${rules.cellMinN}; короткий звонок < ${rules.shortCallSec} с.`,
    ].join('\n');
}

export function renderAuditMarkdown(report: AuditReport): string {
    const minN = report.rules.cellMinN;
    return [
        headerSection(report),
        '## 1. Покрытие user_id в transcriptions по месяцам',
        coverageSection(report),
        '## 2. Разборы по (менеджер × тип × месяц)',
        `Жирным — ячейки с n ≥ ${minN}. Доля разборов окна в таких ячейках: ${fmtPct(report.analyzedInCellsPct)}; ` +
            `без разреза по типу (менеджер × месяц): ${fmtPct(report.analyzedByManagerMonthPct)}.`,
        pivotSection(report),
        '## 3. Доля other / irrelevant по месяцам',
        'Доля считается от звонков с известным типом.',
        noiseSection(report),
        '## 4. Длительности',
        durationSection(report),
        '## 5. Разборы по версиям',
        'Ключ версии: user_result.versions (prompt;rubric;registry;attribution;classifier), иначе agentVersion, иначе unknown.',
        versionsSection(report),
        '## 6. Заполненность полей user_result',
        fieldsSection(report),
        '## 7. Глубина истории ais',
        depthSection(report),
        '## 8. Рекомендация по порогам 4.11 и minDurationSec',
        report.recommendation.lines.map(line => `- ${line}`).join('\n'),
        '',
    ].join('\n\n');
}
