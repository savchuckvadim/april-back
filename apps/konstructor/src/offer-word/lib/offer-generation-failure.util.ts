import { timelineText } from '@lib/bitrix/consts/timeline.consts';
import { bitrixCallMethodOf } from '@lib/bitrix/core/base/bitrix-error-method.util';
import {
    isBitrixConnectionReset,
    isBitrixTimeout,
    readBitrixErrorBody,
} from '@lib/bitrix/core/base/bitrix-response.util';
import { bitrixRetryKind } from '@lib/bitrix/core/base/bitrix-retry.util';

/**
 * Причина сбоя генерации КП: короткая строка для менеджера (комментарий в
 * сделке) и поля для строки журнала.
 *
 * Случай с прода (gsirk, сделка 281275, 26.11.2026): Диск Битрикса отказал в
 * сохранении файла, и в сделку ушло безликое «Ошибка при создании документа».
 * Менеджер не мог понять, повторять ли формирование. В журнале не хватало
 * метода Битрикса, его кода и размера файла.
 */

/** Шаги цепочки генерации, на которых бывает сбой. */
export const OFFER_GENERATION_STEP = {
    /** Подготовка запроса и сборка документов (в том числе перевод в PDF). */
    build: 'build',
    /** Загрузка документов на Диск Битрикса. */
    upload: 'upload',
    /** Запись ссылок на документы в таймлайн сделки. */
    timeline: 'timeline',
    /** Всё после записи в сделку: документ уже у менеджера. */
    finish: 'finish',
} as const;

export type OfferGenerationStep =
    (typeof OFFER_GENERATION_STEP)[keyof typeof OFFER_GENERATION_STEP];

/** Шаг в середине фразы комментария; у завершающего шага своя фраза. */
const STEP_TITLE: Record<
    Exclude<OfferGenerationStep, typeof OFFER_GENERATION_STEP.finish>,
    string
> = {
    build: 'сборка документа',
    upload: 'загрузка на Диск',
    timeline: 'запись в таймлайн сделки',
};

/** Предел комментария в сделке. */
export const OFFER_FAILURE_COMMENT_MAX = 300;

/** Сколько знаков описания Битрикса берём в комментарий. */
const DESCRIPTION_MAX = 160;

/** Сколько знаков описания Битрикса и имени файла берём в журнал. */
const LOG_TEXT_MAX = 200;

const CODE_MAX = 60;

const INTERNAL_CAUSE = 'внутренняя ошибка, подробности в журнале';

/** Файл, на котором упала загрузка. */
export interface OfferFailureFile {
    name: string;
    sizeBytes: number;
}

interface OfferFailureNotes {
    step?: OfferGenerationStep;
    file?: OfferFailureFile;
}

/**
 * Пометки хранятся рядом с ошибкой, вне её полей: наверх летит прежняя
 * ошибка (HTTP-исключение остаётся собой, текст и стек те же), и процессор
 * очереди по метке узнаёт шаг и файл.
 */
const notes = new WeakMap<object, OfferFailureNotes>();

const isObject = (value: unknown): value is object =>
    typeof value === 'object' && value !== null;

/** Шаг, на котором упала ошибка; уже названный шаг не перетирается. */
export const noteOfferFailureStep = (
    error: unknown,
    step: OfferGenerationStep,
): void => {
    if (!isObject(error)) return;
    const known = notes.get(error);
    if (known?.step) return;
    notes.set(error, { ...known, step });
};

/** Файл, на котором упала загрузка (имя и размер, без содержимого). */
export const noteOfferFailureFile = (
    error: unknown,
    file: OfferFailureFile,
): void => {
    if (!isObject(error)) return;
    notes.set(error, { ...notes.get(error), file });
};

/** Пометки ошибки: шаг и файл. */
export const offerFailureNotesOf = (error: unknown): OfferFailureNotes =>
    (isObject(error) ? notes.get(error) : undefined) ?? {};

/**
 * Выполняет шаг цепочки: упавшая ошибка помечается шагом и летит дальше как
 * была. Брошенное не-объектом (строка) становится Error, чтобы метке было к
 * чему прикрепиться.
 */
export async function inOfferStep<T>(
    step: OfferGenerationStep,
    run: () => Promise<T>,
): Promise<T> {
    try {
        return await run();
    } catch (error) {
        const failure: unknown = isObject(error)
            ? error
            : new Error(String(error));
        noteOfferFailureStep(failure, step);
        throw failure;
    }
}

/** Одна строка без тегов и переносов, не длиннее `max` знаков. */
const oneLine = (text: string, max: number): string => {
    const line = timelineText(text.replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Описание Битрикса без дубля кода: «Не удалось сохранить файл. (CODE).» → «Не удалось сохранить файл». */
const cleanDescription = (description: string, code: string | null): string => {
    const withoutCode = code
        ? description.split(`(${code})`).join(' ')
        : description;
    return oneLine(withoutCode, DESCRIPTION_MAX).replace(/[\s.]+$/, '');
};

interface Cause {
    /** Что случилось, одной фразой без точки в конце. */
    text: string;
    /** Проходит ли сбой повтором. */
    temporary: boolean;
}

/** Что ответил Битрикс (статус, код, описание). */
const bitrixCause = (error: unknown): Cause => {
    const { status, code, description } = readBitrixErrorBody(error);
    const temporary = bitrixRetryKind(error) !== null;

    if (status === null) {
        if (isBitrixTimeout(error)) {
            return { text: 'Битрикс не ответил вовремя', temporary: true };
        }
        return {
            text: isBitrixConnectionReset(error)
                ? 'оборвалась связь с Битриксом'
                : 'нет связи с Битриксом',
            temporary: true,
        };
    }

    const shortCode = code ? oneLine(code, CODE_MAX) : null;
    const shortDescription = description
        ? cleanDescription(description, code)
        : '';
    if (shortDescription && shortCode) {
        return {
            text: `Битрикс ответил «${shortDescription}» (${shortCode})`,
            temporary,
        };
    }
    if (shortDescription) {
        return { text: `Битрикс ответил «${shortDescription}»`, temporary };
    }
    if (shortCode) {
        return { text: `Битрикс ответил ошибкой ${shortCode}`, temporary };
    }
    return {
        text:
            status >= 500
                ? `Битрикс временно недоступен (HTTP ${status})`
                : `Битрикс ответил HTTP ${status}`,
        temporary,
    };
};

/**
 * Причина: ошибка вызова Битрикса из нашего клиента (её метку ставит
 * BitrixCore) описывается ответом Битрикса; всё прочее, включая ошибки axios
 * из других сервисов, — внутренняя ошибка. Текст такой ошибки в комментарий
 * не попадает: в нём бывают пути, адреса и внутренние детали.
 */
const causeOf = (error: unknown): Cause =>
    bitrixCallMethodOf(error) === null
        ? { text: INTERNAL_CAUSE, temporary: false }
        : bitrixCause(error);

const truncate = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Поле строки журнала: `имя=значение`; свободный текст в кавычках. */
const quoted = (value: string): string => JSON.stringify(value);

const logFieldsOf = (
    error: unknown,
    step: OfferGenerationStep | null,
    file: OfferFailureFile | undefined,
): string => {
    const fields: string[] = [];
    if (step) fields.push(`step=${step}`);

    const method = bitrixCallMethodOf(error);
    if (method !== null) {
        const { status, code, description } = readBitrixErrorBody(error);
        fields.push(`bitrixMethod=${method}`);
        if (status !== null) fields.push(`bitrixStatus=${status}`);
        if (code) fields.push(`bitrixCode=${oneLine(code, CODE_MAX)}`);
        if (description) {
            fields.push(
                `bitrixDescription=${quoted(oneLine(description, LOG_TEXT_MAX))}`,
            );
        }
    }
    if (file) {
        fields.push(`fileName=${quoted(oneLine(file.name, LOG_TEXT_MAX))}`);
        fields.push(`fileSizeBytes=${file.sizeBytes}`);
    }
    return fields.join(' ');
};

export interface OfferFailureDescription {
    /** Шаг, на котором упала генерация; не определён — null. */
    step: OfferGenerationStep | null;
    /**
     * Короткая строка для менеджера (комментарий в сделке): что не вышло,
     * на каком шаге, почему и что делать. Без стеков и содержимого файлов,
     * не длиннее OFFER_FAILURE_COMMENT_MAX знаков.
     */
    comment: string;
    /** Поля строки журнала: шаг, метод Битрикса, его код и описание, файл. */
    logFields: string;
}

/** Ошибка генерации → короткая причина для менеджера и поля для журнала. */
export function describeOfferFailure(error: unknown): OfferFailureDescription {
    const { step = null, file } = offerFailureNotesOf(error);
    const { text, temporary } = causeOf(error);

    const afterDelivery = step === OFFER_GENERATION_STEP.finish;
    const head = afterDelivery
        ? 'КП сформировано и лежит в сделке, но завершающий шаг не выполнился'
        : 'КП не сформировано';
    const where =
        step && step !== OFFER_GENERATION_STEP.finish
            ? `${STEP_TITLE[step]} — `
            : '';
    const hint = temporary && !afterDelivery ? ' Повторите формирование.' : '';

    return {
        step,
        comment: truncate(
            `${head}: ${where}${text}.${hint}`,
            OFFER_FAILURE_COMMENT_MAX,
        ),
        logFields: logFieldsOf(error, step, file),
    };
}
