import { Logger } from '@nestjs/common';
import { callReportSmartUfName } from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';
import {
    CALL_REPORT_SMART_LONG_FIELD_BYTES,
    CALL_REPORT_SMART_PRIORITY_TEXT_CODES,
    CALL_REPORT_SMART_ROW_TEXT_BUDGET_BYTES,
    CALL_REPORT_SMART_TRANSCRIPT_SLOTS,
} from './call-report-smart-writer.const';
import { CallReportSmartDroppedField } from './call-report-smart-writer.types';

/**
 * Запись полей смарта с деградацией под лимит строки MySQL Битрикса —
 * вынесена из writer'а по лимиту файла; стратегия вариантов прежняя.
 */

/** Один вариант записи: подпись для лога, поля и что из них выброшено. */
interface CallReportSmartWriteVariant {
    label: string;
    fields: Record<string, unknown>;
    dropped: CallReportSmartDroppedField[];
}

/** Итог записи: ответ Битрикса и поля, которые надо допостить в таймлайн. */
export interface CallReportSmartWriteOutcome {
    response: unknown;
    dropped: CallReportSmartDroppedField[];
}

export class CallReportSmartDegradation {
    constructor(
        private readonly smartInfo: CallReportSmartInfo,
        private readonly logger: Logger,
    ) {}

    /**
     * Запись с деградацией под лимит строки MySQL Битрикса.
     *
     * ФИЗИКА ЛИМИТА (прод-уроки 05–10.08.2026, зафиксировано скиллом
     * .claude/skills/bitrix-field-limits): UF-поля смарта — колонки одной
     * строки таблицы b_crm_dynamic_items_{typeId}; InnoDB даёт ~8126 байт
     * на строку. Каждое текстовое поле ДЛИННЕЕ ~768 байт занимает в строке
     * фиксированный 768-байтовый префикс НЕЗАВИСИМО от длины — поэтому
     * обрезка длинного текста до 1-2к символов НЕ помогает (проверено:
     * 10.08 все три старых варианта упали подряд). Помогает только
     * УМЕНЬШЕНИЕ ЧИСЛА длинных полей либо укорачивание до <700 байт.
     *
     * Стратегия (что выброшено — постится полным текстом в таймлайн
     * элемента, см. CallReportSmartTimelineWriter; транскрипт при выбросе
     * уходит в таймлайн ЦЕЛИКОМ кусками — клиент платит за транскрибацию
     * и обязан видеть весь текст):
     *   1) все поля как есть;
     *   2) без TRANSCRIPT_N (−4 длинных поля; полный текст — в таймлайн);
     *   3) остаются только приоритетные тексты, ужатые до <700 байт,
     *      остальные длинные — в таймлайн;
     *   4) только числа/enum/связи + SUMMARY <700 байт.
     * Иная ошибка (не row size) пробрасывается сразу.
     */
    async write(
        fields: Record<string, unknown>,
        write: (fields: Record<string, unknown>) => Promise<unknown>,
    ): Promise<CallReportSmartWriteOutcome> {
        const variants = this.variants(fields);
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            try {
                const response = await write(variant.fields);
                return { response, dropped: variant.dropped };
            } catch (error) {
                const hasNext = i + 1 < variants.length;
                if (!this.isRowSizeError(error) || !hasNext) throw error;
                this.logger.warn(
                    `Строка смарта не влезла в лимит Bitrix (${variant.label}) — ` +
                        `повторяю: ${variants[i + 1].label}`,
                );
            }
        }
        // Недостижимо: последний вариант либо вернулся, либо бросил.
        throw new Error('writeWithDegradation: нет вариантов записи');
    }

    /**
     * Детект «Row size too large» и в message, и в теле ответа Bitrix:
     * AxiosError.message — это «Request failed with status code 400», сам
     * текст MySQL-ошибки лежит в response.data.error_description
     * (прод-урок 06.08.2026: детект только по message деградацию не включал).
     */
    private isRowSizeError(error: unknown): boolean {
        const axiosLike = error as {
            message?: string;
            response?: { data?: unknown };
        };
        let responseText = '';
        try {
            responseText = JSON.stringify(axiosLike?.response?.data ?? '');
        } catch {
            // Циклическая структура в data — детектим только по message.
            responseText = '';
        }
        return `${axiosLike?.message ?? ''} ${responseText}`.includes(
            'Row size too large',
        );
    }

    /** Варианты записи от полного к минимальному (для row size лимита). */
    private variants(
        fields: Record<string, unknown>,
    ): CallReportSmartWriteVariant[] {
        const transcriptKeys = CALL_REPORT_SMART_TRANSCRIPT_SLOTS.map(index =>
            this.ufName(`TRANSCRIPT_${index}`),
        );
        const priorityKeys = CALL_REPORT_SMART_PRIORITY_TEXT_CODES.map(code =>
            this.ufName(code),
        );
        const byteLength = (value: string): number =>
            Buffer.byteLength(value, 'utf8');
        /** Обрезка строки до лимита БАЙТ по границе символов. */
        const shrinkTo = (value: string, limitBytes: number): string => {
            let result = value;
            while (byteLength(result) > limitBytes - 2 && result.length > 1) {
                result = result.slice(
                    0,
                    Math.max(
                        1,
                        Math.floor(
                            (result.length * (limitBytes - 2)) /
                                byteLength(result),
                        ),
                    ),
                );
            }
            return `${result}…`;
        };
        const shrink = (value: string): string =>
            shrinkTo(value, CALL_REPORT_SMART_LONG_FIELD_BYTES);
        const isLongText = (value: unknown): value is string =>
            typeof value === 'string' &&
            byteLength(value) > CALL_REPORT_SMART_LONG_FIELD_BYTES;

        const withoutTranscript: Record<string, unknown> = {};
        const droppedTranscript: CallReportSmartDroppedField[] = [];
        for (const [key, value] of Object.entries(fields)) {
            if (transcriptKeys.includes(key)) {
                droppedTranscript.push({ key, value: String(value) });
            } else {
                withoutTranscript[key] = value;
            }
        }

        const prioritized: Record<string, unknown> = {};
        const droppedPrioritized: CallReportSmartDroppedField[] = [
            ...droppedTranscript,
        ];
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (!isLongText(value)) {
                prioritized[key] = value;
                continue;
            }
            // Длинный текст: приоритетный — ужимается до <700 байт (полный
            // уходит в таймлайн), остальные — целиком в таймлайн.
            droppedPrioritized.push({ key, value });
            if (priorityKeys.includes(key)) {
                prioritized[key] = shrink(value);
            }
        }

        // БЮДЖЕТНОЕ УЖАТИЕ (прод-урок 27.08.2026: «оценка есть, а разбора
        // нет»). Раньше следующим шагом после транскрипта длинные
        // НЕприоритетные тексты выбрасывались целиком — и в карточке
        // пустели именно разборы разделов и 5К, самое ценное для РОПа.
        // Теперь тексты не выбрасываются, а ужимаются под общий бюджет
        // строки: каждому текстовому полю достаётся равная доля, полные
        // версии по-прежнему уходят в таймлайн (и в недельный Excel).
        // Несколько запросов подряд эту физику не обходят: лимит — на
        // ШИРИНУ СТРОКИ таблицы, а не на размер одного запроса.
        const budgeted: Record<string, unknown> = {};
        const droppedBudgeted: CallReportSmartDroppedField[] = [
            ...droppedTranscript,
        ];
        const textEntries = Object.entries(withoutTranscript).filter(
            ([, value]) => typeof value === 'string' && byteLength(value) > 120,
        );
        const perFieldBudget = textEntries.length
            ? Math.min(
                  CALL_REPORT_SMART_LONG_FIELD_BYTES,
                  Math.max(
                      200,
                      Math.floor(
                          CALL_REPORT_SMART_ROW_TEXT_BUDGET_BYTES /
                              textEntries.length,
                      ),
                  ),
              )
            : CALL_REPORT_SMART_LONG_FIELD_BYTES;
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (
                typeof value !== 'string' ||
                byteLength(value) <= perFieldBudget
            ) {
                budgeted[key] = value;
                continue;
            }
            droppedBudgeted.push({ key, value });
            budgeted[key] = shrinkTo(value, perFieldBudget);
        }

        const summaryKey = this.ufName('SUMMARY');
        const minimal: Record<string, unknown> = {};
        const droppedMinimal: CallReportSmartDroppedField[] = [
            ...droppedTranscript,
        ];
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (typeof value !== 'string' || byteLength(value) <= 255) {
                minimal[key] = value;
                continue;
            }
            droppedMinimal.push({ key, value });
            if (key === summaryKey) {
                minimal[key] = shrink(value);
            }
        }

        return [
            { label: 'все поля', fields, dropped: [] },
            {
                label: 'без транскрипта',
                fields: withoutTranscript,
                dropped: droppedTranscript,
            },
            {
                label: 'все тексты ужаты под бюджет строки',
                fields: budgeted,
                dropped: droppedBudgeted,
            },
            {
                label: 'приоритетные тексты <700 байт, остальное — в таймлайн',
                fields: prioritized,
                dropped: droppedPrioritized,
            },
            {
                label: 'минимум: числа/enum + краткое резюме',
                fields: minimal,
                dropped: droppedMinimal,
            },
        ];
    }

    private ufName(code: string): string {
        return callReportSmartUfName(this.smartInfo, code);
    }
}
