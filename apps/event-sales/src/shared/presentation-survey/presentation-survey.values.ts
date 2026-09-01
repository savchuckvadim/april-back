import {
    PRESENTATION_SURVEY_FIVE_K_CODES,
    PRESENTATION_SURVEY_SUMMARY_CODES,
    PRESENTATION_SURVEY_TALK_CODES,
    PRESENTATION_SURVEY_VALUE_MAX_LENGTH,
} from './presentation-survey.codes';

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
    /** Вопросы «Разговора»: код поля (`op_talk_*`) → ответ менеджера. */
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
    /** Только whitelisted `op_talk_*`, только непустые. */
    readonly talk: ReadonlyMap<string, string>;
    readonly xvost: string | null;
    readonly fiveKSummary: string | null;
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
    return {
        fiveK: pickAnswers(raw?.fiveK, PRESENTATION_SURVEY_FIVE_K_CODES),
        talk: pickAnswers(raw?.talk, PRESENTATION_SURVEY_TALK_CODES),
        xvost: cleanSurveyValue(raw?.xvost),
        fiveKSummary: cleanSurveyValue(raw?.fiveKSummary),
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

function pickAnswers(
    raw: Record<string, string> | undefined,
    codes: readonly string[],
): ReadonlyMap<string, string> {
    const answers = new Map<string, string>();
    const source = raw ?? {};
    for (const code of codes) {
        const value = cleanSurveyValue(source[code]);
        if (value) answers.set(code, value);
    }
    return answers;
}
