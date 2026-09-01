import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
    CallReportWeeklyDataset,
    CallReportWeeklyPresentationRow,
    CallReportWeeklyRow,
    CallReportWeeklySectionRow,
    CallReportWeeklyTranscriptRow,
    WeeklyFiveKItems,
    WeeklyHvostSteps,
} from './call-report-weekly.types';

/** Значение ячейки: обычное либо кликабельная ссылка. */
type CellValue =
    | string
    | number
    | Date
    | null
    | { text: string; hyperlink: string };

/** Описание колонки листа: заголовок, ширина и извлечение значения. */
interface SheetColumn<T> {
    header: string;
    width: number;
    value: (row: T) => CellValue;
    /** Длинный текст: перенос по словам и увеличенная высота строки. */
    wrap?: boolean;
}

/** Ссылки на карточки CRM портала — чтобы из отчёта можно было провалиться. */
class PortalLinks {
    constructor(
        private readonly domain: string,
        private readonly smartEntityTypeId: number | null,
    ) {}

    /** Сделка/лид — владелец звонка. */
    entity(entityType: string | null, entityId: number | null): CellValue {
        if (!entityId) return '';
        if (entityType === 'deal') {
            return {
                text: `Сделка ${entityId}`,
                hyperlink: `https://${this.domain}/crm/deal/details/${entityId}/`,
            };
        }
        if (entityType === 'lead') {
            return {
                text: `Лид ${entityId}`,
                hyperlink: `https://${this.domain}/crm/lead/details/${entityId}/`,
            };
        }
        return '';
    }

    /** Карточка разбора в смарт-процессе «AI-анализ звонков». */
    smartItem(itemId: number | null): CellValue {
        if (!itemId || !this.smartEntityTypeId) return itemId ?? '';
        return {
            text: `Разбор #${itemId}`,
            hyperlink: `https://${this.domain}/crm/type/${this.smartEntityTypeId}/details/${itemId}/`,
        };
    }

    company(companyId: number | null): CellValue {
        if (!companyId) return '';
        return {
            text: `Компания ${companyId}`,
            hyperlink: `https://${this.domain}/crm/company/details/${companyId}/`,
        };
    }

    contact(contactId: number | null): CellValue {
        if (!contactId) return '';
        return {
            text: `Контакт ${contactId}`,
            hyperlink: `https://${this.domain}/crm/contact/details/${contactId}/`,
        };
    }

    /** Карточка сотрудника — «кто звонил». */
    user(userId: number | null): CellValue {
        if (!userId) return '';
        return {
            text: String(userId),
            hyperlink: `https://${this.domain}/company/personal/user/${userId}/`,
        };
    }
}

/**
 * Ячейка Excel вмещает 32767 символов — транскрипт часового разговора в
 * лимит укладывается, но на всякий случай режем с явной пометкой.
 */
const CELL_LIMIT = 32_000;

/** Порог «содержательного» звонка для отдельного листа, секунд. */
const LONG_CALL_SEC = 300;

/** Чеклист хвоста одной строкой: «✓ КП · ✗ цена · — дата». */
function renderHvostChecklist(steps: WeeklyHvostSteps | null): string {
    if (!steps) return '';
    const mark = (value: boolean | null | undefined): string =>
        value === true ? '✓' : value === false ? '✗' : '—';
    return [
        `${mark(steps.desire)} ЖЕЛАНИЕ РАБОТАТЬ`,
        `${mark(steps.offered)} ЧТО ПРЕДЛОЖИЛИ`,
        `${mark(steps.priceReaction)} РЕАКЦИЯ НА ЦЕНУ`,
        `${mark(steps.decisionProcess)} ПРОЦЕСС РЕШЕНИЯ`,
        `${mark(steps.decisionWay)} ВЫХОД НА РЕШЕНИЕ`,
    ].join('\n');
}

/** Чек-лист 5К одной строкой (пять блоков, как в анкете менеджера). */
function renderFiveKChecklist(items: WeeklyFiveKItems | null): string {
    if (!items) return '';
    const mark = (value: boolean | null | undefined): string =>
        value === true ? '✓' : value === false ? '✗' : '—';
    return [
        `${mark(items.client)} КЛИЕНТ`,
        `${mark(items.company)} КОМПАНИЯ`,
        `${mark(items.colleagues)} КОЛЛЕГИ`,
        `${mark(items.competitor)} КОНКУРЕНТ`,
        `${mark(items.criteria)} КРИТЕРИИ ВЫБОРА`,
    ].join('\n');
}

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
};
const STRIPE_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F6FA' },
};

/**
 * Построение книги Excel по данным недельного отчёта.
 *
 * Оформление задаётся здесь и только здесь (одна ответственность):
 * фиксированные ширины колонок, закреплённая шапка, автофильтр,
 * чередование полос и фиксированная высота строк — чтобы таблица
 * открывалась «ровненькой» без ручной подгонки.
 */
@Injectable()
export class CallReportExcelBuilder {
    /** Готовый xlsx-файл в виде буфера. */
    async build(dataset: CallReportWeeklyDataset): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AI-анализ звонков';
        workbook.created = dataset.to;
        const links = new PortalLinks(
            dataset.domain,
            dataset.smartEntityTypeId,
        );

        this.addSummarySheet(workbook, dataset);
        this.addSheet<CallReportWeeklyRow>(
            workbook,
            'Звонки',
            this.callColumns(links),
            dataset.rows,
        );
        // Звонки от 5 минут — предметный разговор, а не «недозвон/уточнение»;
        // РОПу нужен отдельный срез именно по ним.
        this.addSheet<CallReportWeeklyRow>(
            workbook,
            'Звонки от 5 минут',
            this.callColumns(links),
            dataset.rows.filter(row => (row.durationSec ?? 0) >= LONG_CALL_SEC),
        );
        this.addSheet<CallReportWeeklyPresentationRow>(
            workbook,
            'Презентации (хвост и 5К)',
            this.presentationColumns(links),
            dataset.presentations,
        );
        this.addSheet<CallReportWeeklySectionRow>(
            workbook,
            'Разделы разговора',
            this.sectionColumns(),
            dataset.sections,
        );
        this.addSheet<CallReportWeeklyTranscriptRow>(
            workbook,
            'Транскрипции',
            this.transcriptColumns(links),
            dataset.transcripts,
        );

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    /** Лист с шапкой, автофильтром, полосами и фиксированной геометрией. */
    private addSheet<T>(
        workbook: ExcelJS.Workbook,
        name: string,
        columns: SheetColumn<T>[],
        rows: T[],
    ): void {
        const sheet = workbook.addWorksheet(name, {
            views: [{ state: 'frozen', ySplit: 1 }],
            properties: { defaultRowHeight: 18 },
        });
        sheet.columns = columns.map(column => ({
            header: column.header,
            width: column.width,
        }));

        const header = sheet.getRow(1);
        header.height = 32;
        header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        header.fill = HEADER_FILL;
        header.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true,
        };

        rows.forEach((item, index) => {
            const row = sheet.addRow(
                columns.map(column => this.cellValue(column.value(item))),
            );
            // Фиксированная высота: длинные тексты не растягивают строку —
            // ячейка скроллится, таблица остаётся читаемой.
            row.height = 30;
            row.alignment = { vertical: 'top', wrapText: true };
            if (index % 2 === 1) row.fill = STRIPE_FILL;
            columns.forEach((column, columnIndex) => {
                const cell = row.getCell(columnIndex + 1);
                cell.border = {
                    bottom: { style: 'hair', color: { argb: 'FFD9E1EA' } },
                };
                if (!column.wrap) {
                    cell.alignment = { vertical: 'top', wrapText: false };
                }
                // Ссылка на карточку CRM — синий подчёркнутый текст.
                const value: unknown = cell.value;
                if (
                    value &&
                    typeof value === 'object' &&
                    'hyperlink' in (value as Record<string, unknown>)
                ) {
                    cell.font = {
                        color: { argb: 'FF0B57D0' },
                        underline: true,
                    };
                }
            });
        });

        if (rows.length) {
            sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: columns.length },
            };
        }
    }

    /** Первый лист-обложка: период, итоги, пояснение зачем этот файл. */
    private addSummarySheet(
        workbook: ExcelJS.Workbook,
        dataset: CallReportWeeklyDataset,
    ): void {
        const sheet = workbook.addWorksheet('Сводка');
        sheet.columns = [{ width: 42 }, { width: 70 }];
        const analyzed = dataset.rows.filter(row => row.analyzed);
        const scored = analyzed.filter(row => typeof row.score === 'number');
        const averageScore = scored.length
            ? (
                  scored.reduce((sum, row) => sum + (row.score ?? 0), 0) /
                  scored.length
              ).toFixed(1)
            : '—';
        const withNextStep = analyzed.filter(row => row.nextStepSet).length;
        const lines: [string, string | number][] = [
            ['Портал', dataset.domain],
            [
                'Период',
                `${this.formatDate(dataset.from)} — ${this.formatDate(dataset.to)}`,
            ],
            ['Звонков в отчёте', dataset.rows.length],
            ['Из них разобрано AI', analyzed.length],
            ['Средняя оценка звонка', averageScore],
            [
                'Со следующим шагом',
                analyzed.length
                    ? `${withNextStep} из ${analyzed.length} (${Math.round(
                          (withNextStep / analyzed.length) * 100,
                      )}%)`
                    : '—',
            ],
            [
                'Презентаций с пройденным хвостом',
                `${analyzed.filter(row => row.hvostDone === true).length} из ` +
                    `${analyzed.filter(row => row.hvostDone !== null).length}`,
            ],
            [
                'Презентаций с закрытыми 5К',
                `${analyzed.filter(row => row.fiveKDone === true).length} из ` +
                    `${analyzed.filter(row => row.fiveKDone !== null).length}`,
            ],
        ];

        const title = sheet.addRow(['Недельный отчёт по звонкам', '']);
        title.font = { bold: true, size: 14 };
        title.height = 26;
        sheet.addRow([]);
        for (const [label, value] of lines) {
            const row = sheet.addRow([label, value]);
            row.getCell(1).font = { bold: true };
            row.height = 20;
        }
        sheet.addRow([]);
        const note = sheet.addRow([
            'Зачем этот файл',
            'Карточка смарт-процесса вмещает только выжимки: строка таблицы ' +
                'Битрикса ограничена по размеру, поэтому длинные разборы в ней ' +
                'ужимаются. Здесь — полные тексты: разборы разделов, речь, ' +
                'хвост и 5К, сверка с отчётом менеджера и транскрипт.',
        ]);
        note.height = 60;
        note.getCell(1).font = { bold: true };
        note.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }

    private callColumns(
        links: PortalLinks,
    ): SheetColumn<CallReportWeeklyRow>[] {
        const yesNo = (value: boolean | null): string =>
            value === true ? 'да' : value === false ? 'нет' : '';
        return [
            { header: 'Дата звонка', width: 18, value: row => row.callDate },
            {
                header: 'Менеджер (ID)',
                width: 14,
                value: row => links.user(row.managerId),
            },
            { header: 'Длит., мин', width: 11, value: row => row.durationMin },
            {
                header: 'Объект CRM',
                width: 18,
                value: row => links.entity(row.entityType, row.entityId),
            },
            {
                header: 'Компания',
                width: 18,
                value: row => links.company(row.companyId),
            },
            {
                header: 'Контакт',
                width: 18,
                value: row => links.contact(row.contactId),
            },
            {
                header: 'Карточка разбора',
                width: 18,
                value: row => links.smartItem(row.smartItemId),
            },
            {
                header: 'ID активности',
                width: 14,
                value: row => row.activityId,
            },
            { header: 'Тип звонка', width: 18, value: row => row.callType },
            {
                header: 'Разобран AI',
                width: 12,
                value: row => (row.analyzed ? 'да' : 'нет'),
            },
            {
                header: 'Результативный',
                width: 14,
                value: row => yesNo(row.productive),
            },
            { header: 'Оценка', width: 9, value: row => row.score },
            {
                header: 'Взвеш. 0-100',
                width: 13,
                value: row => row.weightedScore,
            },
            {
                header: 'Скрипт, %',
                width: 11,
                value: row => row.scriptCompliance,
            },
            {
                header: 'Приоритет разбора',
                width: 17,
                value: row => row.coachingPriority,
            },
            {
                header: 'С кем говорили',
                width: 16,
                value: row => row.interlocutorRole,
            },
            {
                header: 'Специальность',
                width: 15,
                value: row => row.specialist,
            },
            { header: 'Тон клиента', width: 13, value: row => row.sentiment },
            {
                header: 'Речь менеджера, %',
                width: 17,
                value: row => row.talkRatioPct,
            },
            { header: 'Вопросов', width: 11, value: row => row.questionsCount },
            {
                header: 'Шаг назначен',
                width: 13,
                value: row => yesNo(row.nextStepSet),
            },
            {
                header: 'Следующий шаг',
                width: 40,
                value: row => row.nextStep,
                wrap: true,
            },
            { header: 'Дата шага', width: 13, value: row => row.nextStepDate },
            {
                header: 'Хвост пройден',
                width: 14,
                value: row => yesNo(row.hvostDone),
            },
            {
                header: '5К закрыто',
                width: 12,
                value: row => yesNo(row.fiveKDone),
            },
            {
                header: 'Хвост: чеклист AI',
                width: 46,
                value: row => renderHvostChecklist(row.hvostSteps),
                wrap: true,
            },
            {
                header: '5К: чеклист AI',
                width: 46,
                value: row => renderFiveKChecklist(row.fiveKItems),
                wrap: true,
            },
            {
                header: 'Резюме звонка',
                width: 60,
                value: row => row.summary,
                wrap: true,
            },
            {
                header: 'Объяснение оценки',
                width: 50,
                value: row => row.scoreExplanation,
                wrap: true,
            },
            {
                header: 'Потребности',
                width: 40,
                value: row => row.needs,
                wrap: true,
            },
            {
                header: 'Предложенные продукты',
                width: 34,
                value: row => row.productsOffered,
                wrap: true,
            },
            {
                header: 'Возражения и отработка',
                width: 50,
                value: row => row.objections,
                wrap: true,
            },
            {
                header: 'Категория отказа',
                width: 18,
                value: row => row.refusalCategory,
            },
            {
                header: 'Риск-флаги',
                width: 26,
                value: row => row.riskFlags,
                wrap: true,
            },
            {
                header: 'Рекомендации по сделке',
                width: 50,
                value: row => row.recommendations,
                wrap: true,
            },
            {
                header: 'Рекомендации сотруднику',
                width: 50,
                value: row => row.employeeRecommendations,
                wrap: true,
            },
            {
                header: 'Анализ речи (полный)',
                width: 60,
                value: row => row.speechAnalysis,
                wrap: true,
            },
            {
                header: 'Хвост: разбор AI (полный)',
                width: 60,
                value: row => row.hvostAnalysis,
                wrap: true,
            },
            {
                header: '5К: разбор AI (полный)',
                width: 60,
                value: row => row.fiveKAnalysis,
                wrap: true,
            },
            {
                header: 'Сверка с отчётом менеджера',
                width: 60,
                value: row => row.reportComparison,
                wrap: true,
            },
            {
                header: 'Транскрипт',
                width: 80,
                value: row => row.transcript,
                wrap: true,
            },
        ];
    }

    /**
     * Лист «Презентации»: по одной строке на звонок с методологическим
     * разбором. Каждый пункт чеклиста — отдельная колонка, чтобы РОП мог
     * отфильтровать «все, где не назначена дата решения».
     */
    private presentationColumns(
        links: PortalLinks,
    ): SheetColumn<CallReportWeeklyPresentationRow>[] {
        const mark = (value: boolean | null | undefined): string =>
            value === true ? 'да' : value === false ? 'нет' : '';
        return [
            { header: 'Дата звонка', width: 18, value: row => row.callDate },
            {
                header: 'Менеджер (ID)',
                width: 14,
                value: row => links.user(row.managerId),
            },
            { header: 'Длит., мин', width: 11, value: row => row.durationMin },
            {
                header: 'Объект CRM',
                width: 18,
                value: row => links.entity(row.entityType, row.entityId),
            },
            {
                header: 'Карточка разбора',
                width: 18,
                value: row => links.smartItem(row.smartItemId),
            },
            // Тип показываем, но лист не фильтруется по нему: классификатор
            // иногда ставит «другое», а хвост/5К при этом разобраны.
            { header: 'Тип звонка', width: 16, value: row => row.callType },
            { header: 'Оценка', width: 9, value: row => row.score },
            {
                header: 'Хвост пройден',
                width: 14,
                value: row => mark(row.hvostDone),
            },
            {
                header: 'ХВОСТ: желание работать',
                width: 22,
                value: row => mark(row.hvostSteps?.desire),
            },
            {
                header: 'ХВОСТ: что предложили',
                width: 21,
                value: row => mark(row.hvostSteps?.offered),
            },
            {
                header: 'ХВОСТ: реакция на цену',
                width: 21,
                value: row => mark(row.hvostSteps?.priceReaction),
            },
            {
                header: 'ХВОСТ: процесс решения',
                width: 21,
                value: row => mark(row.hvostSteps?.decisionProcess),
            },
            {
                header: 'ХВОСТ: выход на решение',
                width: 22,
                value: row => mark(row.hvostSteps?.decisionWay),
            },
            {
                header: '5К закрыто',
                width: 12,
                value: row => mark(row.fiveKDone),
            },
            {
                header: 'КЛИЕНТ',
                width: 12,
                value: row => mark(row.fiveKItems?.client),
            },
            {
                header: 'КОМПАНИЯ',
                width: 13,
                value: row => mark(row.fiveKItems?.company),
            },
            {
                header: 'КОЛЛЕГИ',
                width: 12,
                value: row => mark(row.fiveKItems?.colleagues),
            },
            {
                header: 'КОНКУРЕНТ',
                width: 13,
                value: row => mark(row.fiveKItems?.competitor),
            },
            {
                header: 'КРИТЕРИИ ВЫБОРА',
                width: 17,
                value: row => mark(row.fiveKItems?.criteria),
            },
            {
                header: 'Шаг назначен',
                width: 13,
                value: row => mark(row.nextStepSet),
            },
            {
                header: 'Следующий шаг',
                width: 40,
                value: row => row.nextStep,
                wrap: true,
            },
            { header: 'Дата шага', width: 13, value: row => row.nextStepDate },
            {
                header: 'Хвост: разбор AI (полный)',
                width: 60,
                value: row => row.hvostAnalysis,
                wrap: true,
            },
            {
                header: '5К: разбор AI (полный)',
                width: 60,
                value: row => row.fiveKAnalysis,
                wrap: true,
            },
            {
                header: 'Сверка с отчётом менеджера',
                width: 60,
                value: row => row.reportComparison,
                wrap: true,
            },
        ];
    }

    /** Лист «Транскрипции»: полный текст кусками (длинные звонки). */
    private transcriptColumns(
        links: PortalLinks,
    ): SheetColumn<CallReportWeeklyTranscriptRow>[] {
        return [
            { header: 'Дата звонка', width: 18, value: row => row.callDate },
            {
                header: 'Менеджер (ID)',
                width: 14,
                value: row => links.user(row.managerId),
            },
            { header: 'Длит., мин', width: 11, value: row => row.durationMin },
            {
                header: 'Объект CRM',
                width: 18,
                value: row => links.entity(row.entityType, row.entityId),
            },
            {
                header: 'Карточка разбора',
                width: 18,
                value: row => links.smartItem(row.smartItemId),
            },
            { header: 'Тип звонка', width: 16, value: row => row.callType },
            {
                header: 'ID активности',
                width: 14,
                value: row => row.activityId,
            },
            {
                header: 'Часть',
                width: 9,
                value: row => `${row.part}/${row.partsTotal}`,
            },
            {
                header: 'Текст расшифровки',
                width: 120,
                value: row => row.text,
                wrap: true,
            },
        ];
    }

    private sectionColumns(): SheetColumn<CallReportWeeklySectionRow>[] {
        return [
            { header: 'Дата звонка', width: 18, value: row => row.callDate },
            { header: 'Менеджер (ID)', width: 14, value: row => row.managerId },
            {
                header: 'ID активности',
                width: 14,
                value: row => row.activityId,
            },
            { header: 'Тип звонка', width: 18, value: row => row.callType },
            { header: 'Раздел', width: 20, value: row => row.section },
            { header: 'Актуальность', width: 14, value: row => row.relevance },
            { header: 'Оценка', width: 9, value: row => row.score },
            {
                header: 'Разбор (полный)',
                width: 80,
                value: row => row.analysis,
                wrap: true,
            },
            {
                header: 'Рекомендации',
                width: 60,
                value: row => row.advice,
                wrap: true,
            },
        ];
    }

    /**
     * Пустое → пустая ячейка; длинный текст режем под лимит Excel;
     * ссылки отдаём как есть (ExcelJS сам делает их кликабельными).
     */
    private cellValue(value: CellValue): CellValue {
        if (value === null || value === undefined) return null;
        if (typeof value === 'object' && !(value instanceof Date)) {
            return value;
        }
        if (typeof value !== 'string') return value;
        if (value.length <= CELL_LIMIT) return value;
        return `${value.slice(0, CELL_LIMIT)}\n… текст обрезан под лимит ячейки Excel`;
    }

    private formatDate(value: Date): string {
        return value.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Europe/Moscow',
        });
    }
}
