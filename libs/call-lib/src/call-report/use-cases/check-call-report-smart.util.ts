/**
 * Проверка полей смарта «AI-анализ звонков»: что должно быть по конфигу и
 * что есть на портале (этап 6.4). Только сравнение — ничего не создаёт и не
 * правит, в отличие от установки.
 *
 * Чистые функции: без DI и Bitrix.
 */
import type { IUserFieldConfig } from '@/modules/bitrix';
import {
    CALL_REPORT_CARD_SECTIONS,
    CALL_REPORT_METHODOLOGY_FIELD_CODES,
    CALL_REPORT_SMART_FIELDS,
    buildCallReportUfName,
} from '../config/call-report-smart.config';
import { missingEnumCodes } from './install-smart-enum-repair';

/** Поле конфига, которого нет на портале. */
export interface CallReportSmartMissingField {
    fieldName: string;
    code: string;
    title: string;
    /** Раздел карточки, где поле показывается; null — вне раскладки. */
    section: string | null;
    /** Поле сводки методики продаж. */
    methodology: boolean;
}

/** Поле-список, в котором не хватает значений справочника. */
export interface CallReportSmartEnumGap {
    fieldName: string;
    title: string;
    /** Названия недостающих значений. */
    missing: string[];
}

/** Поле смарта, которого нет в конфиге: занимает место в лимите полей. */
export interface CallReportSmartExtraField {
    fieldName: string;
    title: string;
}

export interface CallReportSmartFieldsCheck {
    /** Сколько полей должно быть по конфигу. */
    expected: number;
    /** Сколько из них есть на портале. */
    present: number;
    /** Сколько всего пользовательских полей у смарта на портале. */
    total: number;
    methodologyExpected: number;
    methodologyPresent: number;
    missing: CallReportSmartMissingField[];
    enumGaps: CallReportSmartEnumGap[];
    extra: CallReportSmartExtraField[];
}

const METHODOLOGY_CODES: readonly string[] =
    CALL_REPORT_METHODOLOGY_FIELD_CODES;

const sectionOf = (code: string): string | null =>
    CALL_REPORT_CARD_SECTIONS.find(section => section.codes.includes(code))
        ?.title ?? null;

/** Название поля, как его видит пользователь портала. */
const labelOf = (field: IUserFieldConfig): string =>
    field.editFormLabel?.ru ??
    field.listColumnLabel?.ru ??
    field.editFormLabel?.en ??
    '';

/**
 * @param typeId id смарт-типа из crm.type.list (НЕ entityTypeId) — основа UF-имён
 * @param existing пользовательские поля смарта с портала, со значениями списков
 */
export function checkCallReportSmartFields(
    typeId: number,
    existing: readonly IUserFieldConfig[],
): CallReportSmartFieldsCheck {
    const byName = new Map(existing.map(field => [field.fieldName, field]));
    const expectedNames = new Set<string>();
    const missing: CallReportSmartMissingField[] = [];
    const enumGaps: CallReportSmartEnumGap[] = [];

    for (const def of CALL_REPORT_SMART_FIELDS) {
        const fieldName = buildCallReportUfName(typeId, def.code);
        expectedNames.add(fieldName);
        const field = byName.get(fieldName);
        if (!field) {
            missing.push({
                fieldName,
                code: def.code,
                title: def.name,
                section: sectionOf(def.code),
                methodology: METHODOLOGY_CODES.includes(def.code),
            });
            continue;
        }
        const missingCodes = missingEnumCodes(def, field);
        if (missingCodes.length > 0) {
            enumGaps.push({
                fieldName,
                title: def.name,
                missing: (def.items ?? [])
                    .filter(item => missingCodes.includes(item.CODE))
                    .map(item => item.VALUE),
            });
        }
    }

    const methodologyMissing = missing.filter(item => item.methodology).length;
    return {
        expected: CALL_REPORT_SMART_FIELDS.length,
        present: CALL_REPORT_SMART_FIELDS.length - missing.length,
        total: existing.length,
        methodologyExpected: METHODOLOGY_CODES.length,
        methodologyPresent: METHODOLOGY_CODES.length - methodologyMissing,
        missing,
        enumGaps,
        extra: existing
            .filter(field => !expectedNames.has(field.fieldName))
            .map(field => ({
                fieldName: field.fieldName,
                title: labelOf(field),
            })),
    };
}
