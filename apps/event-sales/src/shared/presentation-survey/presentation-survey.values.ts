import {
    PRESENTATION_SURVEY_FIVE_K_CODES,
    PRESENTATION_SURVEY_SUMMARY_CODES,
    PRESENTATION_SURVEY_XVOST_CODES,
    PRESENTATION_SURVEY_VALUE_MAX_LENGTH,
} from './presentation-survey.codes';
import {
    isSurveyTemplateOnly,
    surveyTemplateByCode,
} from './presentation-survey.templates';

/**
 * Ответы анкеты 5К/Хвост, КАК ИХ ПРИСЫЛАЕТ КЛИЕНТ.
 *
 * Одна и та же форма у обоих входов: `values` легаси-ручки
 * `/event-sales/presentation-survey` и блок `presentation.survey` в payload
 * отчёта. Один смысл — один формат: иначе два входа разъехались бы в
 * трактовке одних и тех же ответов.
 */
export interface RawPresentationSurveyValues {
    /** Детальные «5К»: код поля (`op_5k_*`) → ответ менеджера. */
    fiveK?: Record<string, string>;
    /**
     * Блоки «Хвоста»: код поля (`op_xvost_*`) → ответ менеджера.
     *
     * Ключ провода остался `talk` намеренно, хотя коды внутри сменились:
     * переименование ключа сломало бы конверт для легаси-фронта, который
     * выкатывается отдельно, и весь блок молча терялся бы до его релиза.
     */
    talk?: Record<string, string>;
    /** Сводный «Хвост» (`op_presentation_xvost`). */
    xvost?: string;
    /** Сводка «Пять К» одним текстом (`op_presentation_5k`). */
    fiveKSummary?: string;
}

/**
 * Ответы ПОСЛЕ нормализации: whitelist кодов, trim, обрезка по лимиту.
 * Пустых значений внутри нет вовсе — пустой ответ не едет никуда и ничего
 * не затирает.
 */
export interface PresentationSurveyValues {
    /** Только whitelisted `op_5k_*`, только непустые. */
    readonly fiveK: ReadonlyMap<string, string>;
    /** Только whitelisted `op_xvost_*`, только непустые. */
    readonly talk: ReadonlyMap<string, string>;
    readonly xvost: string | null;
    readonly fiveKSummary: string | null;
    /**
     * Коды, которые прислали, но whitelist не пропустил.
     *
     * ЗАЧЕМ. Отбрасывание молчаливое по замыслу — писатель анкеты не умеет
     * писать чужие поля по определению. Но у молчания есть цена: если
     * легаси-фронт ещё не выкатан и шлёт СТАРЫЕ коды, ответы менеджера
     * исчезают без следа, и понять это можно только по пустой карточке.
     * Список отброшенного возвращается наружу, чтобы вызывающий мог его
     * залогировать; сама функция остаётся чистой и логгера не знает.
     */
    readonly droppedCodes: readonly string[];
}

/**
 * Нормализация ответов анкеты — ЕДИНАЯ для ручки и для потока.
 *
 * Чистая функция без I/O: whitelist по общему списку кодов, `trim`,
 * обрезка до {@link PRESENTATION_SURVEY_VALUE_MAX_LENGTH}. Ключи вне
 * whitelist и нестроковые значения отбрасываются МОЛЧА — писатель анкеты
 * не умеет писать чужие поля по определению, а не по договорённости.
 */
export function normalizePresentationSurvey(
    raw?: RawPresentationSurveyValues | null,
): PresentationSurveyValues {
    const fiveK = pickAnswers(raw?.fiveK, PRESENTATION_SURVEY_FIVE_K_CODES);
    const talk = pickAnswers(raw?.talk, PRESENTATION_SURVEY_XVOST_CODES);
    return {
        fiveK,
        talk,
        xvost: cleanSurveyValue(raw?.xvost),
        fiveKSummary: cleanSurveyValue(raw?.fiveKSummary),
        droppedCodes: [
            ...droppedCodes(raw?.fiveK, PRESENTATION_SURVEY_FIVE_K_CODES),
            ...droppedCodes(raw?.talk, PRESENTATION_SURVEY_XVOST_CODES),
        ],
    };
}

/** Ответов нет вовсе — писать нечего, ни одной команды не появляется. */
export function isPresentationSurveyEmpty(
    values: PresentationSurveyValues,
): boolean {
    return (
        values.fiveK.size === 0 &&
        values.talk.size === 0 &&
        !values.xvost &&
        !values.fiveKSummary
    );
}

/**
 * Ответы анкеты ОДНОЙ картой «код поля реестра → ответ».
 *
 * Разбиение на «5К», «Разговор» и сводные — форма ВХОДА (так их присылает
 * фрейм), а всем писателям нужен один адрес: код поля. Раскладка сводных
 * по их кодам живёт здесь и только здесь — иначе снимок для смарта и
 * запись в сущности разошлись бы в трактовке одних и тех же двух ответов.
 *
 * В карте только непустые ответы: нормализация пустых уже не пропустила.
 */
export function presentationSurveyAnswersByCode(
    values: PresentationSurveyValues,
): ReadonlyMap<string, string> {
    const answers = new Map<string, string>();
    for (const [code, value] of values.fiveK) answers.set(code, value);
    for (const [code, value] of values.talk) answers.set(code, value);
    if (values.xvost) {
        answers.set(PRESENTATION_SURVEY_SUMMARY_CODES.xvost, values.xvost);
    }
    if (values.fiveKSummary) {
        answers.set(
            PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
            values.fiveKSummary,
        );
    }
    return answers;
}

/** Один ответ: строка, `trim`, обрезка по лимиту; пусто → null. */
export function cleanSurveyValue(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value) return null;
    return value.slice(0, PRESENTATION_SURVEY_VALUE_MAX_LENGTH);
}

/**
 * Присланные коды, которых нет в whitelist. Пустые значения не считаются
 * потерей: пустой ответ и так никуда не едет.
 */
function droppedCodes(
    raw: Record<string, string> | undefined,
    codes: readonly string[],
): string[] {
    if (!raw) return [];
    const allowed = new Set(codes);
    return Object.keys(raw).filter(
        code => !allowed.has(code) && Boolean(cleanSurveyValue(raw[code])),
    );
}

function pickAnswers(
    raw: Record<string, string> | undefined,
    codes: readonly string[],
): ReadonlyMap<string, string> {
    const answers = new Map<string, string>();
    const source = raw ?? {};
    for (const code of codes) {
        const value = cleanSurveyValue(source[code]);
        if (!value) continue;
        if (isUntouchedTemplate(code, value)) continue;
        answers.set(code, value);
    }
    return answers;
}

/**
 * Поле открыли, но не тронули: внутри только сами вопросы.
 *
 * ПОЧЕМУ БЕЗ ЭТОГО НЕЛЬЗЯ. С переделки 01.09.2026 поле приходит с шаблоном
 * внутри — пронумерованными вопросами, — и пустым оно не бывает НИКОГДА.
 * Прежнее правило «пустая строка значит не отвечали» перестало работать
 * молча, а на нём держится главная гарантия анкеты: пустое в портал не
 * пишется, чтобы не стереть ответ, положенный кем-то другим. Без этой
 * проверки нетронутое поле считалось бы заполненным и шаблон затирал бы
 * чужой настоящий ответ.
 *
 * Код не из состава анкеты шаблона не имеет — для него правило прежнее.
 */
function isUntouchedTemplate(code: string, value: string): boolean {
    const template = surveyTemplateByCode(code);
    return template !== null && isSurveyTemplateOnly(value, template);
}
