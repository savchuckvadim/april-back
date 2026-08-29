import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireControl,
    EnumQuestionnaireFieldStatus,
    EnumQuestionnairePersist,
    EnumQuestionnairePlace,
    EnumQuestionnairePresentation,
    EnumQuestionnairePurpose,
    EnumQuestionnaireTargetEntity,
    EnumQuestionnaireTargetMode,
} from './portal-questionnaires.schema';

/**
 * Контракт хранилища каталога анкет (реализация — Prisma).
 *
 * Наружу из репозитория выходят только доменные типы: `portal_id` и
 * `field_bitrix_id` в БД BigInt, но в записях это уже `number` —
 * глобального `BigInt.prototype.toJSON` в монорепе нет, и BigInt,
 * доехавший до контроллера, роняет сериализацию ответа.
 */

/** Вариант справочника вопроса (зеркало bitrixfield_items). */
export interface PortalQuestionnaireOptionRecord {
    id: string;
    code: string;
    title: string;
    /** Именно это значение уходит в `crm.*.update`. */
    bitrixId: number | null;
    xmlId: string | null;
    sort: number;
    isDefault: boolean;
    isActive: boolean;
}

/** Вопрос анкеты как он лежит в БД (без интерпретации). */
export interface PortalQuestionnaireItemRecord {
    id: string;
    questionnaireId: string;
    portalId: number;
    code: string;
    title: string;
    placeholder: string | null;
    hint: string | null;
    groupTitle: string | null;
    sort: number;
    control: string;
    isMultiple: boolean;
    isRequired: boolean;
    requireChange: boolean;
    staleAfterDays: number | null;
    channel: string;
    targetMode: string;
    targetEntity: string | null;
    dtoPath: string | null;
    /**
     * Адрес смарта-носителя (канал `smart`): строка `smarts` НАШЕЙ БД.
     * Постоянный, в отличие от транзиентного `fieldSource`: по нему
     * компиляция узнаёт поток, а сверка привязок — где искать поле.
     */
    smartId: number | null;
    /** Слепок `smarts.entityTypeId` на момент привязки — рантайм-сверка. */
    smartEntityTypeId: number | null;
    isNative: boolean;
    /** Главный якорь привязки: UF-имя ровно как вернул Битрикс. */
    fieldName: string | null;
    fieldBitrixId: number | null;
    fieldXmlId: string | null;
    fieldCode: string | null;
    fieldType: string | null;
    fieldStatus: string;
    fieldCheckedAt: Date | null;
    /** JSON-расширения (min/max, rows); мусор из БД нормализуется в {}. */
    meta: Record<string, unknown>;
    isActive: boolean;
    options: PortalQuestionnaireOptionRecord[];
}

/** Анкета как она лежит в БД. */
export interface PortalQuestionnaireRecord {
    id: string;
    portalId: number;
    domain: string;
    appCode: string;
    code: string;
    title: string;
    hint: string | null;
    purpose: string;
    presentation: string;
    place: string | null;
    persist: string;
    /** Сырой JSON условий, нормализованный до массива (не массив → []). */
    conditions: unknown[];
    configKey: string | null;
    legacyChecklistId: string | null;
    isActive: boolean;
    sort: number;
    version: number;
    updatedBy: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    items: PortalQuestionnaireItemRecord[];
}

/** Вариант справочника на сохранение. */
export interface PortalQuestionnaireOptionInput {
    code: string;
    title: string;
    bitrixId: number | null;
    xmlId: string | null;
    sort: number;
    isDefault: boolean;
    isActive: boolean;
}

/** Вопрос на сохранение (уже проверенный сервисом). */
export interface PortalQuestionnaireItemInput {
    code: string;
    title: string;
    placeholder: string | null;
    hint: string | null;
    groupTitle: string | null;
    sort: number;
    control: EnumQuestionnaireControl;
    isMultiple: boolean;
    isRequired: boolean;
    requireChange: boolean;
    staleAfterDays: number | null;
    channel: EnumQuestionnaireChannel;
    targetMode: EnumQuestionnaireTargetMode;
    targetEntity: EnumQuestionnaireTargetEntity | null;
    dtoPath: string | null;
    smartId: number | null;
    smartEntityTypeId: number | null;
    isNative: boolean;
    fieldName: string | null;
    fieldBitrixId: number | null;
    fieldXmlId: string | null;
    fieldCode: string | null;
    fieldType: string | null;
    fieldStatus: EnumQuestionnaireFieldStatus;
    fieldCheckedAt: Date | null;
    meta: Record<string, unknown>;
    isActive: boolean;
    options: PortalQuestionnaireOptionInput[];
}

/**
 * Смарт портала в том минимуме, который нужен каталогу: чем строка
 * опознаётся в реестре типов события (`type`, `group`) и куда пишет
 * поток (`entityTypeId`).
 */
export interface PortalQuestionnaireSmartRecord {
    /** `smarts.id` НАШЕЙ БД — то же, что `smartId` вопроса. */
    id: number;
    entityTypeId: number;
    type: string;
    group: string;
    title: string;
}

/** Условие показа на сохранение. */
export interface PortalQuestionnaireConditionInput {
    kind: string;
    values: string[];
}

/**
 * Анкета на сохранение целиком: состав задаётся ЦЕЛИКОМ, а не
 * дополняется — пункт, которого нет в `items`, ГАСИТСЯ (`isActive:
 * false`). Из БД он не пропадает: ответ на него уже лежит в поле CRM, и
 * без пункта это значение объяснить нечем. Пункты опознаются по `code`.
 */
export interface PortalQuestionnaireSaveInput {
    /** Есть — обновляем эту строку; нет — ищем по (портал, приложение, код). */
    id: string | null;
    portalId: number;
    domain: string;
    appCode: string;
    code: string;
    title: string;
    hint: string | null;
    purpose: EnumQuestionnairePurpose;
    presentation: EnumQuestionnairePresentation;
    place: EnumQuestionnairePlace | null;
    persist: EnumQuestionnairePersist;
    conditions: PortalQuestionnaireConditionInput[];
    configKey: string | null;
    legacyChecklistId: string | null;
    isActive: boolean;
    sort: number;
    /** Битрикс-id сотрудника, сохранившего анкету. */
    updatedBy: number | null;
    items: PortalQuestionnaireItemInput[];
}

/** Что проверка привязок ставит одному варианту справочника. */
export interface PortalQuestionnaireOptionCheckInput {
    optionId: string;
    /** Живой id элемента списка: именно он уходит в `crm.*.update`. */
    bitrixId: number | null;
    /** Варианта больше нет в Битриксе — гасим, а не удаляем. */
    isActive: boolean;
}

/**
 * Итог сверки одного вопроса с живым Битриксом («Проверить привязки»).
 *
 * `status: null` — degraded-режим (читали через `crm.item.fields`, прав
 * администратора CRM не хватило): поле НЕ теряем, обновляем только отметку
 * проверки. Поставить `missing` по неполным данным значит молча выбросить
 * вопрос из каталога живой анкеты.
 */
export interface PortalQuestionnaireItemCheckInput {
    itemId: string;
    /** null — статус оставляем прежним. */
    status: EnumQuestionnaireFieldStatus | null;
    checkedAt: Date;
    /** undefined — колонку не трогаем: в degraded-режиме её нечем заполнить. */
    fieldBitrixId?: number | null;
    fieldXmlId?: string | null;
    fieldType?: string | null;
    /**
     * `meta` вопроса ЦЕЛИКОМ вместе со слепками живого поля
     * (`questionnaire-field-mirror`). undefined — колонку не трогаем: в
     * degraded-режиме живого состояния мы не видели, и записать в слепок
     * нечего.
     */
    meta?: Record<string, unknown>;
    options: PortalQuestionnaireOptionCheckInput[];
}

/** Подпись варианта, которую владелец согласился подтянуть из Битрикса. */
export interface PortalQuestionnaireOptionRenameInput {
    optionId: string;
    title: string;
}

/**
 * Вариант Битрикса, которого у нас ещё нет.
 *
 * `bitrixId` обязателен и НЕ nullable, в отличие от сохранения: вариант
 * без идентификатора элемента списка записать в поле нечем — ответ на него
 * молча потерялся бы.
 */
export interface PortalQuestionnaireOptionCreateInput {
    code: string;
    title: string;
    bitrixId: number;
    xmlId: string | null;
    sort: number;
}

/**
 * Что владелец согласился применить по одному вопросу.
 *
 * `title: undefined` — подпись вопроса не трогаем. Молча переписывать её
 * нельзя: формулировку вопроса владелец правит под себя, и сверка затирала
 * бы её каждой проверкой.
 */
export interface PortalQuestionnaireItemSyncInput {
    itemId: string;
    title?: string;
    renamedOptions: PortalQuestionnaireOptionRenameInput[];
    newOptions: PortalQuestionnaireOptionCreateInput[];
    /**
     * `meta` вопроса ЦЕЛИКОМ с обновлённым слепком `accepted`: подтянутое
     * владельцем становится принятым, и следующая сверка не покажет то же
     * расхождение снова. undefined — слепка у вопроса нет, обновлять
     * нечего.
     */
    meta?: Record<string, unknown>;
}

/** Хранилище портального каталога анкет. */
export abstract class PortalQuestionnairesRepository {
    /**
     * Горячий путь фрейма: активные анкеты приложения на домене вместе с
     * активными пунктами и вариантами, отсортированные для показа.
     */
    abstract findActiveByDomain(
        domain: string,
        appCode: string,
    ): Promise<PortalQuestionnaireRecord[]>;

    /** Список для админки: все анкеты портала, включая выключенные. */
    abstract findByPortalId(
        portalId: number,
        appCode?: string,
    ): Promise<PortalQuestionnaireRecord[]>;

    abstract findById(id: string): Promise<PortalQuestionnaireRecord | null>;

    /**
     * Смарты портала одной выборкой — для сохранения и компиляции вопроса
     * канала `smart`. Ходить в БД за каждым пунктом нельзя: компиляция
     * лежит на горячем пути фрейма.
     *
     * Смарта, на который смотрит вопрос, в списке нет (снесли или
     * переустановили) — пункт выбрасывается из каталога: писать ответ
     * стало некуда.
     */
    abstract findPortalSmarts(
        portalId: number,
    ): Promise<PortalQuestionnaireSmartRecord[]>;

    /**
     * Сохранение анкеты одной транзакцией: шапка, пункты, варианты.
     * Состав сверяется по коду вопроса, лишнее гасится, а не удаляется.
     * `version` инкрементится — фрейм сверяет свою версию каталога.
     */
    abstract save(
        input: PortalQuestionnaireSaveInput,
    ): Promise<PortalQuestionnaireRecord>;

    abstract remove(id: string): Promise<void>;

    /**
     * Отметка проверки привязки пункта («Проверить привязки» в админке).
     * Пункт со статусом кроме `ok` в каталог канала `crm` не попадает.
     */
    abstract setItemFieldStatus(
        itemId: string,
        status: EnumQuestionnaireFieldStatus,
        checkedAt: Date,
    ): Promise<void>;

    /**
     * Итоги сверки с Битриксом одной транзакцией: статусы вопросов и
     * состояние их вариантов. Частями нельзя — половина применённой
     * проверки хуже непроверенной анкеты: часть вопросов исчезнет из
     * каталога, часть останется, и объяснить это будет нечем.
     */
    abstract applyFieldCheck(
        items: PortalQuestionnaireItemCheckInput[],
    ): Promise<void>;

    /**
     * Применение расхождений, ВЫБРАННЫХ владельцем: подпись вопроса,
     * подписи вариантов и новые варианты Битрикса — одной транзакцией.
     *
     * Отдельно от `applyFieldCheck` намеренно: сверка правит только адрес
     * записи (`bitrixId`) и гасит исчезнувшее — это обязано быть верным
     * всегда. Тексты же владелец правит под себя, и подтягиваются они
     * только по его кнопке.
     *
     * `version` анкеты растёт: состав и подписи уехали к менеджеру, и
     * фрейм должен увидеть это по версии каталога, а не по случайно
     * протухшему кэшу.
     */
    abstract applyFieldSync(
        questionnaireId: string,
        items: PortalQuestionnaireItemSyncInput[],
    ): Promise<void>;
}
