import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
    EnumQuestionnaireControl,
    isQuestionnaireControlAllowed,
} from '@lib/portal-lib/store/questionnaires';
import { SmartItemField } from '@lib/portal-lib/pbx/smart-item-fields';
import { QuestionnaireSmartAnswer } from './questionnaire-smart-answer.type';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/** Формат даты элемента (тот же, что уже пишут потоки). */
const CRM_DATE_FORMAT = 'DD.MM.YYYY';
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/** Канон каталога: значение `<input type="date">`. */
const CANON_DATE = 'YYYY-MM-DD';
/** Канон каталога: значение `<input type="datetime-local">`. */
const CANON_DATETIME_FORMATS = ['YYYY-MM-DDTHH:mm', 'YYYY-MM-DDTHH:mm:ss'];

/** Значение элемента справочника ровно как его отдаёт резолв смарта. */
export interface SmartEnumMirrorItem {
    /** Числовой id значения в Битриксе. */
    id: number;
    /** Внешний код (xmlId) — он же код варианта каталога. */
    code: string;
    value: string;
}

export interface SmartFieldValueInput {
    answer: QuestionnaireSmartAnswer;
    /** ЖИВОЕ поле элемента (`crm.item.fields`). */
    field: SmartItemField;
    /** Таймзона портала — даты элемента живут в ней. */
    timezone: string;
    /**
     * Справочник ЭТОГО поля из резолва смарта (`info.enumItems`): коды
     * вариантов там те же, что в каталоге. Пусто — резолвим подписью.
     */
    mirrorItems?: readonly SmartEnumMirrorItem[];
}

/** Готовое значение либо человекочитаемая причина отказа. */
export type SmartFieldValueResult =
    | { ok: true; value: string | number }
    | { ok: false; reason: string };

/**
 * Канон каталога → значение поля элемента смарта.
 *
 * Никаких догадок: не разобрали — возвращаем причину, и вызывающий
 * ПРОПУСКАЕТ поле (то же правило, что у `setUf`/`setEnum` потоков —
 * чужое значение не затираем, а расхождение объясняем в логе).
 */
export const toSmartFieldValue = (
    input: SmartFieldValueInput,
): SmartFieldValueResult => {
    const { answer, field } = input;

    if (field.isMultiple) {
        return {
            ok: false,
            reason: `поле «${field.upperName}» стало множественным — ответ записался бы в первый элемент и исчез`,
        };
    }
    // Живой тип — истина: поле могли пересоздать другим типом уже после
    // того, как владелец привязал к нему вопрос.
    if (
        field.type &&
        !isQuestionnaireControlAllowed(field.type, answer.control)
    ) {
        return {
            ok: false,
            reason: `тип поля «${field.upperName}» на портале — «${field.type}», ответ типа «${answer.control}» в него не пишется`,
        };
    }

    switch (answer.control) {
        case EnumQuestionnaireControl.string:
        case EnumQuestionnaireControl.text:
            return { ok: true, value: answer.value.trim() };

        case EnumQuestionnaireControl.money:
            return toMoney(answer.value);

        case EnumQuestionnaireControl.boolean:
            return toBoolean(answer.value);

        case EnumQuestionnaireControl.date:
            return toDate(answer.value, input.timezone);

        case EnumQuestionnaireControl.datetime:
            return toDateTime(answer.value, input.timezone);

        case EnumQuestionnaireControl.enumeration:
            return toEnum(input);

        default:
            // Недостижимо по типам, но каталог приезжает из БД: контрол,
            // которого фрейм не знает, лучше пропустить с внятной строкой,
            // чем уронить джоб.
            return {
                ok: false,
                reason:
                    `тип отображения «${String(answer.control)}» ` +
                    'записывать нечем',
            };
    }
};

const toMoney = (raw: string): SmartFieldValueResult => {
    // Запятая как разделитель — единственная вольность: раскладка у
    // менеджера русская, и «150000,5» это не мусор, а описка.
    const parsed = Number(raw.trim().replace(',', '.'));
    if (!Number.isFinite(parsed)) {
        return { ok: false, reason: `«${raw}» — не число` };
    }
    return { ok: true, value: parsed };
};

/** UF-поле типа `boolean` хранит 1/0 (зеркало фронтового перевода). */
const toBoolean = (raw: string): SmartFieldValueResult => {
    const token = raw.trim().toUpperCase();
    if (token === 'Y' || token === '1' || token === 'TRUE') {
        return { ok: true, value: '1' };
    }
    if (token === 'N' || token === '0' || token === 'FALSE') {
        return { ok: true, value: '0' };
    }
    return { ok: false, reason: `«${raw}» — не «да» и не «нет»` };
};

const toDate = (raw: string, tz: string): SmartFieldValueResult => {
    const parsed = parseInZone(raw.trim(), [CANON_DATE], tz);
    if (!parsed)
        return { ok: false, reason: `«${raw}» — не дата ${CANON_DATE}` };
    return { ok: true, value: parsed.format(CRM_DATE_FORMAT) };
};

const toDateTime = (raw: string, tz: string): SmartFieldValueResult => {
    const parsed = parseInZone(raw.trim(), CANON_DATETIME_FORMATS, tz);
    if (!parsed) {
        return {
            ok: false,
            reason: `«${raw}» — не дата со временем ${CANON_DATETIME_FORMATS[0]}`,
        };
    }
    return { ok: true, value: parsed.format(CRM_DATETIME_FORMAT) };
};

/**
 * Разбор В ТАЙМЗОНЕ ПОРТАЛА, а не в таймзоне сервера.
 *
 * `dayjs.tz(value, tz)` читает настенное время как время портала —
 * `dayjs(value).tz(tz)` СДВИНУЛ бы его на разницу зон, и «встреча в 10:00»
 * приехала бы в элемент семью часами раньше.
 */
const parseInZone = (
    raw: string,
    formats: string[],
    tz: string,
): dayjs.Dayjs | null => {
    for (const format of formats) {
        // Строгий разбор: «01.09.2026» не должен молча сойти за канон.
        if (!dayjs(raw, format, true).isValid()) continue;
        const parsed = dayjs.tz(raw, format, tz);
        if (parsed.isValid()) return parsed;
    }
    return null;
};

/**
 * Код варианта → ЧИСЛОВОЙ id элемента списка: Битрикс ждёт именно его.
 *
 * Порядок «код → подпись», и оба пути сверяются с ЖИВЫМ справочником:
 *  1) код варианта каталога = внешний код (xmlId) значения, он переживает
 *     переименование — берём id из резолва смарта, но только если такой
 *     элемент в поле ещё есть (справочник могли пересобрать);
 *  2) иначе ищем живой элемент по подписи варианта — так находится
 *     значение, заведённое на портале руками, без внешнего кода;
 *  3) не нашли — отказ: поле не трогаем вовсе.
 */
const toEnum = (input: SmartFieldValueInput): SmartFieldValueResult => {
    const { answer, field } = input;
    const liveIds = new Set(field.items.map(item => item.id));

    const mirrored = (input.mirrorItems ?? []).find(
        item => slugCode(item.code) === slugCode(answer.value),
    );
    if (mirrored && liveIds.has(mirrored.id)) {
        return { ok: true, value: mirrored.id };
    }

    const title = answer.optionTitle?.trim().toLowerCase();
    if (title) {
        const byTitle = field.items.find(
            item => item.value.trim().toLowerCase() === title,
        );
        if (byTitle) return { ok: true, value: byTitle.id };
    }

    return {
        ok: false,
        reason:
            `варианта «${answer.optionTitle ?? answer.value}» больше нет в ` +
            `списке поля «${field.upperName}» на портале`,
    };
};

/** Произвольная строка → сравнимый код (правило кодов вариантов админки). */
const slugCode = (raw: string): string =>
    raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
