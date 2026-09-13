/**
 * Настройки сборки комплекта: что делать с несколькими наборами на одной сделке
 * и как их печатать.
 *
 * Живут в колонке `bx_document_deals.settings` у строки самой сделки
 * (`smartId IS NULL`) — колонка уже была в таблице и Laravel её не пишет, так
 * что миграция не нужна и легаси не задет.
 *
 * Настройки есть только у КП. Договор устроен жёстко: на каждый комплект своё
 * Приложение 1 с полным перечнем инфоблоков, плюс одно Приложение 2 с
 * объединёнными ценами. Счёт следует за договором — один договор, один счёт.
 */

/** Что делаем с несколькими наборами. */
export enum ComplectModeEnum {
    /** Альтернативы: клиент выбирает один. Участник ровно один. */
    COMPARE = 'compare',
    /** Идут вместе, каждый своим договором. Типы договора могут отличаться. */
    MULTI_CONTRACT = 'multi_contract',
    /** Идут вместе одним договором. Только при одинаковом типе договора. */
    SINGLE_CONTRACT = 'single_contract',
}

/** Как раскладывать инфоблоки в КП. */
export enum ComplectOfferInfoblocksEnum {
    /** У каждого набора своя страница; инфоблоки могут повторяться. */
    INDEPENDENT = 'independent',
    /** Единый порядок, повторяющиеся инфоблоки схлопываются. */
    MERGED = 'merged',
}

export interface ComplectOfferSettings {
    infoblocks: ComplectOfferInfoblocksEnum;
    /**
     * Показывать ли в КП наборы «для сравнения» рядом с основными. Механика в
     * конструкторе уже есть — альтернативные наборы (`sets.alternative`).
     */
    showAlternatives: boolean;
}

export interface ComplectComposition {
    mode: ComplectModeEnum;
    offer: ComplectOfferSettings;
    /**
     * Вариант, открытый в конструкторе прямо сейчас.
     *
     * Это не участие и не дубль стадии: стадия говорит «набор в игре», а это —
     * «менеджер сейчас редактирует именно его». Без такой пометки конструктор
     * после перезагрузки открывал слепок сделки и терял, в каком варианте шла
     * работа.
     */
    openVariantSmartId: number | null;
}

/** Сделка без явных настроек ведёт себя как раньше: один набор, одно КП. */
export const DEFAULT_COMPLECT_COMPOSITION: ComplectComposition = {
    mode: ComplectModeEnum.COMPARE,
    offer: {
        infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
        showAlternatives: false,
    },
    openVariantSmartId: null,
};

const isMode = (value: unknown): value is ComplectModeEnum =>
    typeof value === 'string' &&
    (Object.values(ComplectModeEnum) as string[]).includes(value);

const isInfoblocksMode = (
    value: unknown,
): value is ComplectOfferInfoblocksEnum =>
    typeof value === 'string' &&
    (Object.values(ComplectOfferInfoblocksEnum) as string[]).includes(value);

/** Идентификатор элемента смарта: мусор и нули считаем «не задано». */
const toPositiveIdOrNull = (value: unknown): number | null => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Разбор колонки `settings`.
 *
 * Никогда не бросает: слепок с битыми настройками должен открываться, потеряв
 * настройки, а не рушить восстановление сделки целиком. Это тот же принцип, что
 * и у разбора остальных JSON-колонок слепка.
 */
export const parseComplectComposition = (
    raw: string | null | undefined,
): ComplectComposition | null => {
    if (!raw) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    const source = parsed as Record<string, unknown>;
    const offerSource =
        source.offer && typeof source.offer === 'object'
            ? (source.offer as Record<string, unknown>)
            : {};

    return {
        mode: isMode(source.mode)
            ? source.mode
            : DEFAULT_COMPLECT_COMPOSITION.mode,
        offer: {
            infoblocks: isInfoblocksMode(offerSource.infoblocks)
                ? offerSource.infoblocks
                : DEFAULT_COMPLECT_COMPOSITION.offer.infoblocks,
            showAlternatives: Boolean(offerSource.showAlternatives),
        },
        openVariantSmartId: toPositiveIdOrNull(source.openVariantSmartId),
    };
};

/** Сериализация в колонку. `null` — настройки не заданы, колонку чистим. */
export const serializeComplectComposition = (
    composition: ComplectComposition | null | undefined,
): string | null => (composition ? JSON.stringify(composition) : null);

/**
 * Один договор возможен только при одинаковом типе договора у всех наборов.
 *
 * Нечитаемый тип хотя бы у одного набора запрещает объединение: договор
 * оформляется по типу, и объединять вслепую нельзя — ошибка вскроется уже на
 * подписании. Типы приходят с фронта: здесь только правило.
 */
export const isSingleContractAllowed = (
    contractTypeCodes: readonly string[],
): boolean => {
    if (!contractTypeCodes.length) {
        return false;
    }
    if (contractTypeCodes.some(code => !code)) {
        return false;
    }
    return new Set(contractTypeCodes).size === 1;
};
