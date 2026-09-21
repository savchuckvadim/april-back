import { Logger } from '@nestjs/common';
import { buildCrmRefValue } from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    callReportSmartUfName,
    CALL_REPORT_SMART_FIELDS,
} from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';
import { CALL_REPORT_SMART_LONG_FIELD_BYTES } from './call-report-smart-writer.const';

/**
 * Накопитель полей элемента смарта: форматы значений Битрикса (enum по id,
 * boolean 1/0, crm-ссылки, короткие тексты) — вынесен из writer'а по лимиту.
 *
 * Форматы значений (проверено по боевому коду):
 * - crm-поля (DEAL_*) — ссылка на сделку в формате самого поля;
 * - enumeration — числовой id значения (маппинг из resolver'а);
 * - boolean — 1/0; связи parentId{etid}/companyId/contactId — числа.
 */
export class CallReportSmartFieldSet {
    private readonly fields: Record<string, unknown> = {};

    constructor(
        private readonly smartInfo: CallReportSmartInfo,
        private readonly logger: Logger,
    ) {}

    /** Поля элемента в формате crm.item.add/update (тот же объект). */
    toItemFields(): Partial<IBXItem> {
        return this.fields as Partial<IBXItem>;
    }

    /** Системное поле элемента (title, parentId{N}, companyId, …) как есть. */
    setRaw(key: string, value: unknown): void {
        this.fields[key] = value;
    }

    ufName(code: string): string {
        // Общий с читателем связей резолв ключа (call-report-smart.config):
        // зеркало PortalDB/PortalModel, иначе сборка по typeId.
        return callReportSmartUfName(this.smartInfo, code);
    }

    set(code: string, value: string | number | undefined): void {
        if (value === undefined || value === '') return;
        this.fields[this.ufName(code)] = this.coerceScalar(code, value);
    }

    /**
     * Защита от «Array» и «[object Object]» в текстовых полях карточки.
     *
     * Битрикс — PHP: массив, попавший в строковое поле, сохраняется как
     * литерал «Array» (боевой кейс 27.08.2026: «Предложенные продукты:
     * Array»). Из LLM значения иногда приезжают структурой там, где
     * ожидалась строка, поэтому приводим к тексту в единственной точке
     * записи и громко логируем, чтобы чинить источник.
     */
    private coerceScalar(
        code: string,
        value: string | number | undefined,
    ): string | number | undefined {
        if (typeof value === 'string' || typeof value === 'number') {
            return value;
        }
        const raw: unknown = value;
        if (Array.isArray(raw)) {
            const text = raw
                .map(item =>
                    typeof item === 'object' && item !== null
                        ? JSON.stringify(item)
                        : String(item as string | number | boolean),
                )
                .filter(Boolean)
                .join('\n');
            this.logger.warn(
                `Поле ${code}: пришёл массив вместо строки — склеил по ` +
                    `строкам (иначе Битрикс сохранил бы «Array»)`,
            );
            return text || undefined;
        }
        if (raw !== null && typeof raw === 'object') {
            this.logger.warn(
                `Поле ${code}: пришёл объект вместо строки — записываю JSON`,
            );
            return JSON.stringify(raw);
        }
        return undefined;
    }

    setBool(code: string, value: boolean | undefined): void {
        if (value === undefined) return;
        this.fields[this.ufName(code)] = value ? 1 : 0;
    }

    /**
     * Короткое текстовое поле: значение всегда ужимается до порога
     * «длинного» поля (<700 байт) — такие поля не платят 768-байтовый
     * префикс row size и безопасны в любом количестве. Полные тексты
     * вызывающий публикует в таймлайн сам.
     */
    setShortText(code: string, value: string | undefined): void {
        const trimmed = value?.trim();
        if (!trimmed) return;
        this.set(code, this.shrinkToShortField(trimmed));
    }

    /** Ужать строку до лимита короткого поля по БАЙТАМ (граница символов). */
    private shrinkToShortField(value: string): string {
        const limit = CALL_REPORT_SMART_LONG_FIELD_BYTES - 2;
        if (Buffer.byteLength(value, 'utf8') <= limit) return value;
        let result = value;
        while (Buffer.byteLength(result, 'utf8') > limit) {
            result = result.slice(
                0,
                Math.floor(
                    (result.length * limit) / Buffer.byteLength(result, 'utf8'),
                ),
            );
        }
        return `${result}…`;
    }

    /**
     * crm-поле со ссылкой на сделку.
     *
     * ФОРМАТ ЗАДАЁТ САМ БИТРИКС (прод-инцидент 27.08.2026: «нашли сделку
     * ОП Презентации, а поле пустое»): если поле привязано к ОДНОМУ типу
     * сущности (наши DEAL_MAIN/DEAL_PRESENTATION/DEAL_XO — только DEAL),
     * хранится ГОЛЫЙ id — `1024`; значение `D_1024` такое поле молча
     * отбрасывает. Префикс нужен только полям с несколькими типами.
     * Привязки берём из того же реестра, по которому установщик создаёт
     * поля, — формат и настройка поля не могут разъехаться.
     */
    setCrmDeal(code: string, dealId: number | undefined): void {
        if (!dealId) return;
        const definition = CALL_REPORT_SMART_FIELDS.find(
            field => field.code === code,
        );
        const allowedTypes = definition?.crmEntities ?? [];
        const value = buildCrmRefValue(allowedTypes, 'DEAL', dealId);
        // МНОЖЕСТВЕННОСТЬ ТОЖЕ ЗАДАЁТ ПОЛЕ (прод-алерт 28.08.2026):
        // наши crm-поля одиночные (multiple='N'), а массив в такое поле
        // PHP-Битрикс приводит к строке и сохраняет литерал «Array» —
        // ровно это возвращалось в эхе элемента.
        this.fields[this.ufName(code)] = definition?.isMultiple
            ? [value]
            : value;
    }

    /** Multi-enum: массив числовых id значений; неизвестные коды — warn и skip. */
    setMultiEnum(code: string, xmlIds: string[] | undefined): void {
        if (!xmlIds?.length) return;
        const mapping = this.smartInfo.enumItems[code] ?? {};
        const ids: number[] = [];
        for (const xmlId of xmlIds) {
            const enumId = mapping[xmlId];
            if (enumId === undefined) {
                this.logger.warn(
                    `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
                );
                continue;
            }
            ids.push(enumId);
        }
        if (ids.length) this.fields[this.ufName(code)] = ids;
    }

    /** Enum пишется числовым id значения; неизвестный код — warn и skip. */
    setEnum(code: string, xmlId: string | undefined): void {
        if (!xmlId) return;
        const enumId = this.smartInfo.enumItems[code]?.[xmlId];
        if (enumId === undefined) {
            this.logger.warn(
                `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
            );
            return;
        }
        this.fields[this.ufName(code)] = enumId;
    }
}
