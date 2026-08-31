/**
 * Слепки живого поля Битрикса в `meta` вопроса.
 *
 * Зачем они вообще. Сверка привязок сравнивала подпись поля в Битриксе с
 * ФОРМУЛИРОВКОЙ вопроса — а это разные тексты по своей природе: «Дата
 * решения» в карточке против «Когда клиент примет решение?» в анкете.
 * Строка «подпись поля в Битриксе» из-за этого загоралась почти у каждого
 * вопроса, и настоящее переименование в портале тонуло в этом шуме.
 *
 * Отличить «в Битриксе переименовали» от «владелец назвал вопрос
 * по-своему» можно только одним способом: помнить, КАК ПОЛЕ НАЗЫВАЛОСЬ В
 * БИТРИКСЕ, когда его брали в анкету. Колонки под это нет и не будет —
 * зато есть `meta`, открытый JSON вопроса, куда и кладутся два слепка:
 *
 *  - `live` — правда портала: что в поле прямо сейчас. Пишет каждая
 *    сверка; редактор показывает её рядом с нашим текстом, чтобы владелец
 *    видел состояние поля, не открывая Битрикс;
 *  - `accepted` — что владелец уже видел и принял: слепок момента
 *    привязки и последующих применений. Ровно с ним сравнивается живое, и
 *    расхождение означает переименование В ПОРТАЛЕ, а не авторскую
 *    формулировку.
 *
 * Слепок `accepted` сверка НЕ обновляет: иначе переименование сгорало бы
 * на первой же тихой сверке при открытии редактора — владелец не успел бы
 * его увидеть. Единственное исключение — посев: слепка ещё нет (вопрос
 * привязан до появления этого файла), сравнивать не с чем, и объявлять
 * переименованием живую подпись нечестно.
 *
 * Форма слепка описана ещё и во фронте (admin: `lib/field-mirror.ts`):
 * `meta` в контракте — открытый объект, места для типа в DTO нет. При
 * правке формы правятся оба файла.
 */

/** Ключ слепков в `meta` вопроса: остальные ключи (min/max, rows) не наши. */
export const QUESTIONNAIRE_FIELD_MIRROR_KEY = 'bitrixField';

/** Элемент списка живого поля в слепке. */
export interface QuestionnaireFieldMirrorOption {
    /** Идентификатор элемента: им вариант и опознаётся между слепками. */
    bitrixId: number | null;
    xmlId: string | null;
    title: string;
}

/** Состояние поля Битрикса на один момент времени. */
export interface QuestionnaireFieldMirrorState {
    /** Подпись поля в карточке Битрикса. */
    title: string;
    /** `userTypeId`; null — не прочитан. */
    type: string | null;
    /** Элементы списка; у поля без списка пусто. */
    options: QuestionnaireFieldMirrorOption[];
    /** Когда слепок снят, ISO; null — время неизвестно. */
    at: string | null;
}

/** Оба слепка вопроса. */
export interface QuestionnaireFieldMirror {
    /** Правда портала на момент последней сверки; null — не читали. */
    live: QuestionnaireFieldMirrorState | null;
    /** Что владелец принял; null — слепка ещё нет, сравнивать не с чем. */
    accepted: QuestionnaireFieldMirrorState | null;
}

/** Пустые слепки — их же отдаём на любой мусор в колонке. */
export const emptyQuestionnaireFieldMirror = (): QuestionnaireFieldMirror => ({
    live: null,
    accepted: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readText = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const readNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Разбор одного элемента списка. Вариант без подписи бессмыслен: сравнивать
 * в нём нечего, и в слепок он не попадает.
 */
const readOption = (value: unknown): QuestionnaireFieldMirrorOption | null => {
    if (!isRecord(value)) return null;
    const title = readText(value.title);
    if (title === null) return null;

    return {
        bitrixId: readNumber(value.bitrixId),
        xmlId: readText(value.xmlId),
        title,
    };
};

/**
 * Разбор одного слепка. Всё, что не разобралось, считается отсутствующим:
 * `meta` правится и руками, и мусор из неё не должен ронять сверку.
 */
const readState = (value: unknown): QuestionnaireFieldMirrorState | null => {
    if (!isRecord(value)) return null;
    const title = readText(value.title);
    if (title === null) return null;

    const options = Array.isArray(value.options)
        ? value.options
              .map(option => readOption(option))
              .filter(
                  (option): option is QuestionnaireFieldMirrorOption =>
                      option !== null,
              )
        : [];

    return {
        title,
        type: readText(value.type),
        options,
        at: readText(value.at),
    };
};

/** Слепки вопроса из его `meta`; мусор и пустота дают пустые слепки. */
export const readQuestionnaireFieldMirror = (
    meta: Record<string, unknown> | null | undefined,
): QuestionnaireFieldMirror => {
    const raw = meta?.[QUESTIONNAIRE_FIELD_MIRROR_KEY];
    if (!isRecord(raw)) return emptyQuestionnaireFieldMirror();

    return {
        live: readState(raw.live),
        accepted: readState(raw.accepted),
    };
};

/**
 * `meta` вопроса с новыми слепками. Остальные ключи сохраняются: в `meta`
 * живут расширения вопроса (min/max, rows), и затирать их слепком нельзя.
 */
export const writeQuestionnaireFieldMirror = (
    meta: Record<string, unknown> | null | undefined,
    mirror: QuestionnaireFieldMirror,
): Record<string, unknown> => ({
    ...(meta ?? {}),
    [QUESTIONNAIRE_FIELD_MIRROR_KEY]: {
        live: mirror.live,
        accepted: mirror.accepted,
    },
});

/** Подписи сравниваем без краевых пробелов: их правка — не переименование. */
export const isSameQuestionnaireFieldTitle = (
    left: string,
    right: string,
): boolean => left.trim() === right.trim();

/**
 * Принятая подпись варианта; `null` — варианта в слепке нет, и
 * переименованием его подпись объявить не за что.
 *
 * Опознаём по идентификатору элемента списка, а при его отсутствии — по
 * внешнему коду: подпись здесь ключом быть не может, её как раз и меняют.
 */
export const findQuestionnaireMirrorOption = (
    state: QuestionnaireFieldMirrorState | null,
    option: { bitrixId: number | null; xmlId: string | null },
): QuestionnaireFieldMirrorOption | null => {
    if (!state) return null;

    const byId =
        option.bitrixId === null
            ? undefined
            : state.options.find(row => row.bitrixId === option.bitrixId);
    if (byId) return byId;

    const byXmlId =
        option.xmlId === null || option.xmlId === ''
            ? undefined
            : state.options.find(row => row.xmlId === option.xmlId);
    return byXmlId ?? null;
};
