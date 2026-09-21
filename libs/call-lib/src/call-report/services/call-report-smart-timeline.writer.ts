import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    callReportSmartUfName,
    CALL_REPORT_SECTION_CODES,
    CALL_REPORT_SMART_FIELDS,
} from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';
import {
    CALL_REPORT_SMART_COMMENT_PART_SIZE,
    CALL_REPORT_SMART_OVERFLOW_ORDER_CODES,
    CALL_REPORT_SMART_TRANSCRIPT_SLOTS,
} from './call-report-smart-writer.const';
import {
    CallReportSmartDroppedField,
    CallReportSmartItemInput,
} from './call-report-smart-writer.types';

/**
 * Таймлайн элемента смарта для полей, не поместившихся в строку (полные
 * тексты и транскрипт) — вынесен из writer'а по лимиту файла. Fail-open.
 */
export class CallReportSmartTimelineWriter {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly smartInfo: CallReportSmartInfo,
        private readonly logger: Logger,
    ) {}

    /**
     * Не поместившееся в поля — полным текстом в таймлайн элемента
     * (порядок владельца 10.08.2026: резюме GigaChat → рекомендации →
     * остальное). ТРАНСКРИПТ ГАРАНТИРОВАН (решение владельца 16.08.2026:
     * «за транскрибацию платим, клиент обязан видеть весь текст»):
     * выброшенные TRANSCRIPT_N склеиваются и постятся в таймлайн ЦЕЛИКОМ
     * кусками — кроме случая, когда вызывающая сторона уже постит диалог
     * (input.transcriptInTimeline). Разборы разделов (*_ANALYSIS/_ADVICE)
     * не постятся: intake пишет их в таймлайн отдельными комментами
     * всегда. Fail-open.
     */
    async postDropped(
        itemId: number,
        dropped: CallReportSmartDroppedField[],
        input: CallReportSmartItemInput,
        options: { isCreate: boolean },
    ): Promise<void> {
        if (!dropped.length) return;
        // Разборы разделов GREETING_ANALYSIS/…_ADVICE не постим — intake
        // постит их отдельными комментами всегда.
        const sectionKeys = new Set(
            CALL_REPORT_SECTION_CODES.flatMap(section => [
                this.ufName(`${section}_ANALYSIS`),
                this.ufName(`${section}_ADVICE`),
            ]),
        );
        const transcriptKeys = new Set(
            CALL_REPORT_SMART_TRANSCRIPT_SLOTS.map(index =>
                this.ufName(`TRANSCRIPT_${index}`),
            ),
        );
        const skip = (key: string): boolean =>
            transcriptKeys.has(key) || sectionKeys.has(key);

        // Транскрипт первым (окажется НИЖЕ остальных записей таймлайна).
        // ТОЛЬКО при создании элемента: на update транскрипт либо уже в
        // полях (лёг при создании и частичный update его не затирает),
        // либо уже запощен создателем — повторный пост был бы дублем
        // (кейс «каркас создал → intake обновил», оба с деградацией).
        const droppedTranscript = dropped.filter(field =>
            transcriptKeys.has(field.key),
        );
        if (
            droppedTranscript.length &&
            options.isCreate &&
            !input.transcriptInTimeline
        ) {
            await this.postFullTranscript(itemId, droppedTranscript);
        }
        const order = CALL_REPORT_SMART_OVERFLOW_ORDER_CODES.map(code =>
            this.ufName(code),
        );
        const rank = (key: string): number => {
            const index = order.indexOf(key);
            return index === -1 ? order.length : index;
        };
        const postable = dropped
            .filter(field => !skip(field.key))
            .sort((a, b) => rank(a.key) - rank(b.key));

        for (const field of postable) {
            const title = this.fieldTitleByKey(field.key);
            const parts = this.splitForComment(field.value);
            for (let i = 0; i < parts.length; i++) {
                const partLabel =
                    parts.length > 1 ? ` (часть ${i + 1}/${parts.length})` : '';
                await this.bitrix.timeline
                    .addTimelineComment({
                        ENTITY_ID: itemId,
                        ENTITY_TYPE: `DYNAMIC_${this.smartInfo.entityTypeId}`,
                        COMMENT: `📎 [b]${title}[/b]${partLabel} — полностью (в поле элемента не поместилось):\n\n${parts[i]}`,
                        AUTHOR_ID: '1',
                    })
                    .catch((error: Error) =>
                        this.logger.warn(
                            `Полный текст «${title}» не запощен в таймлайн #${itemId}: ${error.message}`,
                        ),
                    );
            }
        }
        this.logger.log(
            `Элемент #${itemId}: ${postable.length} полей ушли полным текстом в таймлайн (row size лимит)`,
        );
    }

    /**
     * Полный транскрипт в таймлайн элемента: выброшенные TRANSCRIPT_N
     * склеиваются в исходный текст (нарезались подряд кусками по 40к) и
     * постятся частями. Части постятся в ОБРАТНОМ порядке — таймлайн
     * показывает новое сверху, так часть 1 оказывается первой при чтении
     * сверху вниз. Fail-open на каждую часть.
     */
    private async postFullTranscript(
        itemId: number,
        droppedTranscript: CallReportSmartDroppedField[],
    ): Promise<void> {
        const fullText = [...droppedTranscript]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(field => field.value)
            .join('');
        if (!fullText.trim()) return;
        const parts = this.splitForComment(fullText);
        for (let i = parts.length - 1; i >= 0; i--) {
            const partLabel =
                parts.length > 1 ? ` — часть ${i + 1} из ${parts.length}` : '';
            await this.bitrix.timeline
                .addTimelineComment({
                    ENTITY_ID: itemId,
                    ENTITY_TYPE: `DYNAMIC_${this.smartInfo.entityTypeId}`,
                    COMMENT: `📜 [b]Транскрипт звонка[/b]${partLabel}:\n\n${parts[i]}`,
                    AUTHOR_ID: '1',
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Транскрипт (часть ${i + 1}) не запощен в таймлайн #${itemId}: ${error.message}`,
                    ),
                );
        }
        this.logger.log(
            `Элемент #${itemId}: полный транскрипт ушёл в таймлайн ${parts.length} частями (в поля не поместился)`,
        );
    }

    /** Русское название поля по его UF-ключу (для заголовка коммента). */
    private fieldTitleByKey(key: string): string {
        const code = Object.keys(this.smartInfo.ufKeyByCode ?? {}).find(
            fieldCode => this.ufName(fieldCode) === key,
        );
        const byConfig = CALL_REPORT_SMART_FIELDS.find(
            field => this.ufName(field.code) === key || field.code === code,
        );
        return byConfig?.name ?? code ?? key;
    }

    /** Длинный текст → части для комментов таймлайна. */
    private splitForComment(
        value: string,
        partSize = CALL_REPORT_SMART_COMMENT_PART_SIZE,
    ): string[] {
        if (value.length <= partSize) return [value];
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += partSize) {
            parts.push(value.slice(i, i + partSize));
        }
        return parts;
    }

    private ufName(code: string): string {
        return callReportSmartUfName(this.smartInfo, code);
    }
}
