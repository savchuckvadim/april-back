import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';

/**
 * Текст личного сообщения в Битрикс24 о готовом отчёте собственнику
 * (BB-код, как у повестки и дайджеста): заголовок и период, пять цифр
 * шапки, первые абзацы резюме, ссылка на PDF на Диске и где открыть
 * отчёт целиком. Чистая функция — без DI и времени.
 */

export const OWNER_REPORT_MESSAGE_TEXT = {
    title: 'Отчёт по отделу продаж',
    summary: 'Коротко',
    file: 'PDF-отчёт на Диске',
    openInApp:
        'Весь отчёт по разделам — в приложении «Отчёт KPI», вкладка «AI аналитика» → «Отчёт за период».',
    dryRun: '[b]Пробный выпуск[/b]: сообщения получателям не отправлялись.',
    summaryParagraphs: 2,
} as const;

export interface OwnerReportMessageInput {
    report: AiOwnerReportDto;
    /** Ссылка на PDF на Диске портала; null — файл не загрузился. */
    fileUrl: string | null;
}

export function buildOwnerReportMessage(
    input: OwnerReportMessageInput,
): string {
    const { report, fileUrl } = input;
    const { text } = report;
    const lines: string[] = [
        `[b]${OWNER_REPORT_MESSAGE_TEXT.title}: ${text.periodLabel}[/b]`,
        '',
        ...text.tiles.map(tile => `• [b]${tile.value}[/b] — ${tile.label}`),
        '',
        `[b]${OWNER_REPORT_MESSAGE_TEXT.summary}[/b]`,
        ...text.summary.slice(0, OWNER_REPORT_MESSAGE_TEXT.summaryParagraphs),
        '',
    ];
    if (fileUrl) {
        lines.push(`[url=${fileUrl}]${OWNER_REPORT_MESSAGE_TEXT.file}[/url]`);
    }
    lines.push(OWNER_REPORT_MESSAGE_TEXT.openInApp);
    return lines.join('\n');
}
