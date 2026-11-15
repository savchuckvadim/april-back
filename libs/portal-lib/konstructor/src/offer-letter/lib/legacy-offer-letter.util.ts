import { LegacyOfferLetter } from '../offer-letter.entity';

/** Код легаси-шаблона КП в `templates` */
export const LEGACY_OFFER_TEMPLATE_CODE = 'offer';
/** Поле с текстом письма: текст в `description` */
export const LEGACY_LETTER_FIELD_CODE = 'letter';
/** Поле «с письмом?»: `value` = '1' — включено */
export const LEGACY_LETTER_FLAG_CODE = 'isLetter';

/** Поле шаблона, как его отдаёт выборка */
export interface LegacyTemplateField {
    id: bigint;
    code: string;
    value: string | null;
    description: string | null;
}

/** Легаси-шаблон `offer` с полями и доменом портала */
export interface LegacyOfferTemplate {
    id: bigint;
    portalId: bigint;
    domain: string | null;
    fields: LegacyTemplateField[];
}

const isOn = (value: string | null | undefined): boolean =>
    value === '1' || value === 'true';

/**
 * Письмо портала из легаси-шаблона: поле `letter` (текст в `description`)
 * и флаг `isLetter`. Шаблон без поля `letter` письма не даёт.
 */
export const legacyLetterOf = (
    template: LegacyOfferTemplate,
): LegacyOfferLetter | null => {
    const letter = template.fields.find(
        field => field.code === LEGACY_LETTER_FIELD_CODE,
    );
    if (!letter) return null;
    const flag = template.fields.find(
        field => field.code === LEGACY_LETTER_FLAG_CODE,
    );
    return {
        portalId: Number(template.portalId),
        domain: template.domain ?? '',
        templateId: Number(template.id),
        fieldId: Number(letter.id),
        text: (letter.description ?? '').trim(),
        enabled: flag ? isOn(flag.value) : true,
    };
};
