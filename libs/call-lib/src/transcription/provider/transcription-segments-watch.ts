import type { Logger } from '@nestjs/common';

/** Тревога о пропавших таймкодах — не чаще раза в час на портал и распознаватель. */
export const SEGMENTS_ALERT_INTERVAL_MS = 60 * 60_000;

/** Что известно о распознавании, вернувшем текст без таймкодов. */
export interface MissingSegmentsReport {
    domain: string;
    /** Кто распознавал, как в журнале: «Vibecode (модель)». */
    stepName: string;
    fileName: string;
}

/**
 * Сторож пропавших таймкодов. Распознаватель может вернуть текст без
 * сегментов: модель не знает `verbose_json` (клиент откатился на простой
 * текст) или ответила 200 без `segments`. Раньше это проходило молча —
 * разбор получал текст без времени реплик, цитаты оставались без привязки
 * (16.11.2026: VibeCode сменил модель транскрибации).
 *
 * В телеграм уходит одно сообщение в час на пару «портал + распознаватель»,
 * остальные случаи пишутся в журнал. Счёт в памяти процесса: распознаёт
 * один воркер event-sales, после перезапуска первое сообщение придёт снова.
 */
export class TranscriptionSegmentsWatch {
    private readonly lastAlertAt = new Map<string, number>();

    constructor(
        private readonly logger: Pick<Logger, 'warn'>,
        private readonly now: () => number = Date.now,
    ) {}

    report(input: MissingSegmentsReport): void {
        const key = `${input.domain}|${input.stepName}`;
        const now = this.now();
        const last = this.lastAlertAt.get(key);
        const meta = { domain: input.domain, fileName: input.fileName };
        const text =
            `Распознавание без таймкодов: ${input.stepName}, портал ${input.domain}. ` +
            'Текст звонка получен, но время реплик не пришло — цитаты в разборе ' +
            'и подсветка на странице звонка останутся без привязки ко времени.';
        if (last !== undefined && now - last < SEGMENTS_ALERT_INTERVAL_MS) {
            this.logger.warn(text, meta);
            return;
        }
        this.lastAlertAt.set(key, now);
        this.logger.warn(
            `${text} Повторное сообщение по этому порталу — не раньше чем через час.`,
            { ...meta, telegram: true },
        );
    }
}
