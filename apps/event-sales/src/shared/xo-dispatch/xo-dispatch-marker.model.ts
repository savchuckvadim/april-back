import { Dayjs } from 'dayjs';
import {
    PbxEntityType,
    PortalModel,
} from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';

type BxRow = Record<string, unknown>;

/** Коды маркер-полей двухфазной подстраховки. */
export const XO_DISPATCH_MARKER_CODES = {
    /** Ставится ДО отправки хука. */
    queuedAt: 'op_xo_revive_queued_at',
    /** Ставится ПОСЛЕ того, как хук принят буфером. */
    sentAt: 'op_xo_revive_sent_at',
} as const;

/** Прочитанные метки одной сущности. */
export interface XoDispatchMarkers {
    queuedAt: Dayjs | null;
    sentAt: Dayjs | null;
}

/**
 * Ждёт ли элемент доставки, то есть «взят в очередь, но хук не доехал».
 *
 * СРАВНИВАЕМ ВРЕМЯ, А НЕ НАЛИЧИЕ — и это принципиально. По наличию
 * («queued есть, sent пуст») пара маркеров одноразовая: после первой
 * успешной отправки `sent_at` заполнен навсегда, и чтобы отправить клиента
 * в ХО повторно, кто-то обязан маркеры ЧИСТИТЬ. У реанимации отказников
 * такой чистильщик есть (повторный отказ), а у ручной отправки лида или
 * компании — нет, и элемент завис бы навсегда.
 *
 * По времени повторная отправка перевзводит подстраховку сама: робот
 * пишет свежий `queued_at`, тот оказывается новее старого `sent_at`, и
 * элемент снова «ждёт доставки». Чистить не нужно ничего.
 *
 * Равенство считаем ДОСТАВЛЕННЫМ: `sent_at` пишется всегда после
 * `queued_at`, и совпадение до секунды означает удачную отправку, а не
 * зависший элемент.
 */
export function isXoDispatchPending(markers: XoDispatchMarkers): boolean {
    if (!markers.queuedAt) return false;
    if (!markers.sentAt) return true;
    return markers.queuedAt.isAfter(markers.sentAt);
}

/**
 * Чтение и запись маркеров подстраховки на любой сущности.
 *
 * Поля объявлены на лиде, компании и сделке, поэтому `entityType` —
 * параметр: одни и те же маркеры нужны реанимации отказников (сделки) и
 * кронам ручной отправки (лид, компания, сделка).
 *
 * НЕ @Injectable: чистая модель рядом с PortalModel (CLAUDE.md).
 */
export class XoDispatchMarkerModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly entityType: PbxEntityType,
    ) {}

    /** Метки из строки Битрикса; поля нет или пусто → null. */
    read(row: BxRow, timezone: ETimeZone): XoDispatchMarkers {
        return {
            queuedAt: this.valueOf(row, 'queuedAt', timezone),
            sentAt: this.valueOf(row, 'sentAt', timezone),
        };
    }

    /** Ждёт ли элемент доставки — {@link isXoDispatchPending} по строке. */
    isPending(row: BxRow, timezone: ETimeZone): boolean {
        return isXoDispatchPending(this.read(row, timezone));
    }

    /** UF-имя поля маркера; null — поле не установлено на портале. */
    fieldName(marker: keyof typeof XO_DISPATCH_MARKER_CODES): string | null {
        const field = this.portal.getEntityFieldByCode(
            this.entityType,
            XO_DISPATCH_MARKER_CODES[marker],
        );
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /**
     * Коды маркер-полей, которых НЕТ в слепке портала.
     *
     * Без них двухфазность не собрать, и подстраховка обязана честно
     * молчать, а не делать вид, что работает: упавший хук никто не дошлёт.
     */
    missingFields(): string[] {
        return (
            Object.keys(XO_DISPATCH_MARKER_CODES) as Array<
                keyof typeof XO_DISPATCH_MARKER_CODES
            >
        )
            .filter(marker => this.fieldName(marker) === null)
            .map(marker => XO_DISPATCH_MARKER_CODES[marker]);
    }

    private valueOf(
        row: BxRow,
        marker: keyof typeof XO_DISPATCH_MARKER_CODES,
        timezone: ETimeZone,
    ): Dayjs | null {
        const name = this.fieldName(marker);
        if (!name) return null;
        return parseBitrixField(row[name], timezone);
    }
}
