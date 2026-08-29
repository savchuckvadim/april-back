import {
    findSmartItemField,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import {
    QuestionnaireAnswerPurpose,
    QuestionnaireSmartAnswer,
} from './questionnaire-smart-answer.type';
import { SmartEnumMirrorItem, toSmartFieldValue } from './to-smart-field-value';

export interface ApplyQuestionnaireAnswersInput {
    /** Объект, который поток и так собирает под `crm.item.add/update`. */
    fields: Record<string, unknown>;
    /** Живые поля элемента (`crm.item.fields`). */
    itemFields: SmartItemFields;
    answers: readonly QuestionnaireSmartAnswer[];
    /**
     * Назначения анкет, ответы которых едут В ЭТОТ элемент.
     *
     * Обычно одно: план — в плановый элемент, отчёт — в отчётный. На
     * ПЕРЕНОСЕ элемент один на две роли (отчёт о том, что выяснили, и
     * план на новую дату — план-джоб на переносе не ставится вовсе),
     * и тогда сюда приезжают ОБА назначения: иначе ответы плана
     * записать было бы некуда, и терялись бы они молча.
     */
    purposes: readonly QuestionnaireAnswerPurpose[];
    /** Таймзона портала. */
    timezone: string;
    /**
     * Справочники КОНСТАНТНЫХ полей смарта, ключ — camel-ключ поля
     * (`info.ufKeyByCode[code]` → `info.enumItems[code]`). Поле, заведённое
     * владельцем руками, сюда не попадает — оно резолвится подписью.
     */
    mirrorItemsByKey?: Record<string, readonly SmartEnumMirrorItem[]>;
}

export interface ApplyQuestionnaireAnswersResult {
    /** Сколько ответов легло в элемент. */
    applied: number;
    /** Что не легло и почему — вызывающий обязан это залогировать. */
    warnings: string[];
}

/**
 * Ответы портальной анкеты → поля элемента смарта.
 *
 * Записываем В ТОТ ЖЕ объект `fields`, который поток и так собирает: id
 * элемента для этого не нужен вовсе — он появится (или уже известен) в той
 * же строке `item.add`/`item.update`, что и всегда. Отсюда и покрытие всех
 * четырёх случаев без единого лишнего вызова Битрикса: плановый элемент,
 * закрываемый, перенесённый и спонтанный.
 *
 * Три правила записи, и все три — «не навреди»:
 *  - ключ уже занят потоком (стадия, результат, лента) — НЕ трогаем:
 *    портальная анкета не должна затирать служебные поля элемента;
 *  - поля нет среди живых, тип разошёлся, вариант справочника исчез —
 *    пропуск с предупреждением, а не запись наугад;
 *  - пустого не пишем никогда (пустые ответы отсеяны ещё в снимке).
 */
export const applyQuestionnaireAnswers = (
    input: ApplyQuestionnaireAnswersInput,
): ApplyQuestionnaireAnswersResult => {
    const warnings: string[] = [];
    let applied = 0;

    for (const answer of input.answers) {
        /*
         * Ответ чужого назначения несёт ДРУГОЙ джоб того же отчёта —
         * здесь он пропускается намеренно. А что его не несёт НИКТО,
         * видно только диспетчеру (EventReportUseCase): состав
         * поставленных джобов знает он один, он и предупреждает.
         */
        if (!input.purposes.includes(answer.purpose)) continue;

        const field = findSmartItemField(input.itemFields, answer.fieldName);
        if (!field) {
            warnings.push(
                `${answer.key} («${answer.title}»): поля ${answer.fieldName} ` +
                    'нет среди полей элемента — переименовали или удалили',
            );
            continue;
        }

        if (input.fields[field.key] !== undefined) {
            warnings.push(
                `${answer.key} («${answer.title}»): поле ${answer.fieldName} ` +
                    'уже заполняет сам поток — ответ анкеты не записан',
            );
            continue;
        }

        const value = toSmartFieldValue({
            answer,
            field,
            timezone: input.timezone,
            mirrorItems: input.mirrorItemsByKey?.[field.key],
        });
        if (!value.ok) {
            warnings.push(`${answer.key} («${answer.title}»): ${value.reason}`);
            continue;
        }

        input.fields[field.key] = value.value;
        applied += 1;
    }

    return { applied, warnings };
};

/**
 * Справочники резолва смарта, переложенные на camel-ключи полей.
 *
 * Резолв знает свои поля по КОДУ конфига (`PRES_FAIL_REASON`), а анкета —
 * по UF-имени; общий знаменатель у них один — фактический camel-ключ,
 * который отдают оба.
 */
export const buildMirrorItemsByKey = (info: {
    ufKeyByCode: Record<string, string>;
    enumItems: Record<string, SmartEnumMirrorItem[]>;
}): Record<string, readonly SmartEnumMirrorItem[]> => {
    const byKey: Record<string, readonly SmartEnumMirrorItem[]> = {};
    for (const [code, items] of Object.entries(info.enumItems)) {
        const key = info.ufKeyByCode[code];
        if (!key || !items.length) continue;
        byKey[key] = items;
    }
    return byKey;
};
