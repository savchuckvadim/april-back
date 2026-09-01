import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxSalesEventFieldCode } from '@lib/portal-lib/pbx';

type ContactMirrorValue = string | number | Array<string | number>;
export type ContactMirrorMap = Record<string, ContactMirrorValue>;

/**
 * Поля, которые отчёт ДУБЛИРУЕТ в контакт события (задача владельца
 * 01.09.2026).
 *
 * Зачем это вообще. Возражение и плановая дата покупки живут на сделке, а
 * спрашивают их у КОНКРЕТНОГО человека. Пока они лежали только на сделке,
 * ответить на вопрос «кто именно в компании и когда собирается покупать»
 * было нечем: у компании из десяти контактов одна дата на всех.
 *
 * Состав намеренно узкий. Это не «скопировать всё в контакт», а ровно те
 * три поля, у которых есть персональный смысл:
 *  - возражение из справочника — что мешает ЭТОМУ человеку;
 *  - его же формулировка своими словами;
 *  - когда ЭТОТ человек планирует покупку.
 */
export const CONTACT_MIRROR_CODES = [
    'op_objection_reason',
    'op_objection_comment',
    'op_sale_date_prognoz',
] as const satisfies readonly PbxSalesEventFieldCode[];

/**
 * ДУБЛИРОВАНИЕ полей сделки в контакт события — не перенос.
 *
 * ПОРЯДОК ВАЖЕН: источник истины — СДЕЛКА, и она пишется в любом случае.
 * Контакт получает КОПИЮ, и только если контакт у события есть. Не наоборот
 * и не вместо.
 *
 * ЗАЧЕМ КОПИЯ, ЕСЛИ ЕСТЬ ОРИГИНАЛ. Поле сделки живёт одно на всю сделку и
 * освежается каждым следующим звонком. Через месяц по той же сделке
 * поговорят с ДРУГИМ человеком — значение на сделке перезапишется, и то,
 * что говорил первый, исчезнет. Копия в его карточке остаётся: так
 * детальная картина по людям накапливается там, где ей место, а сделка
 * продолжает показывать «как обстоит дело сейчас».
 *
 * ПОЛИТИКА ОТЛИЧАЕТСЯ ОТ БЭКФИЛЛА КОМПАНИИ, и это осознанно.
 * Бэкфилл компании заполняет только ПУСТОТУ: там задача — подобрать данные,
 * введённые до привязки компании, и перезатирать чужое значение нельзя.
 * Здесь наоборот: у КОНКРЕТНОГО человека значение обязано отражать
 * последний разговор именно с ним. Прошлые его же ответы остаются в оси
 * событий клиента, а не в поле.
 *
 * Что НЕ меняется: пустое значение не пишется никогда. Не ответили на этом
 * звонке — в контакте остаётся прошлый ответ, а не пустота.
 *
 * Enumeration переносится ЧЕРЕЗ КОДЫ items: числовые id значений у поля
 * сделки и поля контакта — разные справочники, прямой перенос id записал бы
 * в контакт чужое значение. Item без пары по коду честно выпадает.
 *
 * Множественное поле переносится массивом целиком: `op_objection_reason`
 * стал множественным 01.09.2026, потому что на звонке возражений бывает
 * несколько.
 */
export class EventReportContactMirrorModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly contact: Record<string, unknown>,
        private readonly deal: Record<string, unknown>,
    ) {}

    toFields(): ContactMirrorMap {
        const out: ContactMirrorMap = {};
        for (const code of CONTACT_MIRROR_CODES) {
            this.applyCode(out, code);
        }
        return out;
    }

    private applyCode(
        out: ContactMirrorMap,
        code: PbxSalesEventFieldCode,
    ): void {
        const dealField = this.portal.getEntityFieldByCode('deal', code);
        const contactField = this.portal.getEntityFieldByCode('contact', code);
        // Self-gate: поле должно быть установлено на ОБЕИХ сущностях. Нет
        // поля на контакте — блок молчит и релиза под установку не требует
        // (§5 доктрины pbx-fields-system).
        if (!dealField || !contactField) return;

        const dealRaw = this.deal[this.portal.getFieldBitrixId(dealField)];
        if (!this.hasValue(dealRaw)) return;

        const value =
            dealField.type === 'enumeration'
                ? this.remapEnum(dealField, contactField, dealRaw)
                : (dealRaw as ContactMirrorValue);
        if (value == null || (Array.isArray(value) && !value.length)) return;

        const contactKey = this.portal.getFieldBitrixId(contactField);
        if (this.sameValue(this.contact[contactKey], value)) return;

        out[contactKey] = value;
    }

    /**
     * Значение уже такое же — команду не выпускаем.
     *
     * Не оптимизация, а гигиена истории: Битрикс пишет в ленту карточки
     * изменение поля даже когда значение не поменялось, и контакт после
     * десятка звонков выглядел бы как переписанный десять раз.
     */
    private sameValue(current: unknown, next: ContactMirrorValue): boolean {
        if (Array.isArray(next)) {
            const now = Array.isArray(current) ? current : [];
            if (now.length !== next.length) return false;
            const a = now.map(String).sort();
            const b = next.map(String).sort();
            return a.every((value, index) => value === b[index]);
        }
        return String(current ?? '') === String(next);
    }

    private hasValue(raw: unknown): boolean {
        if (raw == null) return false;
        if (Array.isArray(raw)) return raw.length > 0;
        return String(raw).trim() !== '';
    }

    /**
     * Значение справочника сделки → значение справочника контакта по КОДУ
     * элемента. Пары нет — элемент выпадает; не осталось ни одного —
     * возвращается null, и поле не пишется вовсе.
     */
    private remapEnum(
        dealField: IField,
        contactField: IField,
        raw: unknown,
    ): ContactMirrorValue | null {
        const ids = (Array.isArray(raw) ? raw : [raw])
            .map(value => String(value ?? '').trim())
            .filter(Boolean);
        if (!ids.length) return null;

        const mapped: string[] = [];
        for (const id of ids) {
            const dealItem = (dealField.items ?? []).find(
                item => String(item.bitrixId) === id,
            );
            if (!dealItem) continue;
            const contactItem = (contactField.items ?? []).find(
                item => item.code === dealItem.code,
            );
            if (!contactItem) continue;
            mapped.push(String(contactItem.bitrixId));
        }
        if (!mapped.length) return null;
        return Array.isArray(raw) || mapped.length > 1 ? mapped : mapped[0]!;
    }
}
