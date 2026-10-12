import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/** Вид документа: у каждого свой набор обязательных признаков. */
export enum DocumentTemplateKind {
    CONTRACT = 'contract',
    SUPPLY_REPORT = 'supply_report',
    INVOICE = 'invoice',
    OFFER_WORD = 'offer_word',
}

/**
 * Признаки, по которым выбирается шаблон.
 *
 * Собираются из запроса на генерацию, а не из БД:
 *  - `portalId` — из domain (PortalStoreService.getPortalByDomain);
 *  - `agentId` — поставщик, из dto.providerId;
 *  - `contractType` — CONTRACT_LTYPE, уже приходит в DTO генерации;
 *  - `supplyType` — internet | proxima, из dto...supply.type;
 *  - `clientType` — через resolveClientTypeCode (принимает и строку, и {code}).
 */
export type TemplateCriteria = {
    portalId: bigint | null;
    agentId: bigint | null;
    /** Обязателен для договора, у остальных — уточняющий признак. */
    contractType?: CONTRACT_LTYPE | null;
    supplyType?: SupplyTypeEnum | null;
    clientType?: ClientTypeEnum | null;
};

/**
 * Строка-кандидат в том виде, в котором её сравнивает ранжировщик.
 *
 * Намеренно НЕ Prisma-модель: id у таблиц разного типа (у счёта CHAR(36),
 * у договора/отчёта/КП BigInt autoincrement), поэтому здесь он всегда
 * строка — репозиторий приводит его на входе. Так один чистый ранжировщик
 * работает для всех четырёх видов документа.
 */
export type TemplateCandidate = {
    id: string;
    /**
     * `file_path` строки — ровно то, за чем генерация идёт к резолверу.
     * В ранжировании НЕ участвует: это полезная нагрузка, а не признак
     * отбора. Лежит здесь, а не добирается вторым запросом по id, потому
     * что id у таблиц разного типа и повторная выборка означала бы ещё
     * один switch по виду документа.
     *
     * Для `supply_report` рядом едут `requiredFields`/`optionalFields`:
     * портальная настройка состава формы отчёта живёт в той же строке.
     */
    filePath: string;
    /** Коды полей формы отчёта, которые портал считает обязательными. */
    requiredFields?: string[] | null;
    /** Коды полей формы отчёта, которые портал показывает необязательными. */
    optionalFields?: string[] | null;
    portalId: bigint | null;
    agentId: bigint | null;
    contractType?: string | null;
    /** Уже разобранные списки; null = «годится любому». */
    clientTypes: ClientTypeEnum[] | null;
    supplyTypes: SupplyTypeEnum[] | null;
    isDefault: boolean;
    updatedAt: Date | null;
    createdAt: Date | null;
};

/** Откуда взялся шаблон — важно для ответа и для диагностики. */
export enum TemplateResolutionSource {
    DB = 'db',
    STORAGE_FALLBACK = 'storage-fallback',
}

/**
 * Разряды приоритета, от старшего к младшему. Сравниваются
 * ЛЕКСИКОГРАФИЧЕСКИ, а не суммируются: при сумме весов портальный
 * «общий» шаблон может обойти шаблон под конкретного поставщика.
 */
export type TemplateRankTuple = {
    /** Точный портал важнее «общего» (portal_id IS NULL). */
    portalExact: 0 | 1;
    /** Точный поставщик важнее «любого» (agent_id IS NULL). */
    agentExact: 0 | 1;
    /** Явный тип поставки важнее «любого». */
    supplyExact: 0 | 1;
    /** Явный тип клиента важнее «любого». */
    clientExact: 0 | 1;
    /** Флаг «по умолчанию» — только как разряд разрешения ничьей. */
    isDefault: 0 | 1;
    /** Свежесть, мс. При пустых таймстампах вырождается в 0. */
    recency: number;
};

export type TemplateMatch = {
    candidate: TemplateCandidate;
    tuple: TemplateRankTuple;
    /** Человекочитаемое «почему этот шаблон» — для ответа и логов. */
    reason: string;
};

/**
 * Один «ящик» диагностики неоднозначности.
 *
 * Ящик — это группа строк с ПОЛНОСТЬЮ совпадающим набором признаков
 * отбора: (portal_id, agent_id, contract_type, client_types, supply_types).
 * Если в таком ящике больше одного `is_default`, резолвер выберет
 * победителя детерминированно (ничью разрешает id), но выбор перестаёт
 * быть осмысленным: админ задал два «по умолчанию» на один и тот же
 * случай, и какой из них поедет в документ — вопрос id, а не настройки.
 */
export type TemplateAmbiguityBucket = {
    kind: DocumentTemplateKind;
    /** null — общий ящик (portal_id IS NULL). */
    portalId: string | null;
    agentId: string | null;
    contractType: string | null;
    /** Нормализованные отсортированные списки; null — «для любого». */
    clientTypes: ClientTypeEnum[] | null;
    supplyTypes: SupplyTypeEnum[] | null;
    /** Сколько строк с is_default = true в этом ящике (всегда > 1). */
    defaultCount: number;
    /** id этих строк, строками. */
    templateIds: string[];
    /**
     * true — ящик общий (portal_id IS NULL), то есть конфликт достанется
     * КАЖДОМУ порталу, у которого нет своего шаблона на этот случай.
     */
    isCommon: boolean;
};

/** Ответ диагностики: ящики-конфликты + опора на общие строки. */
export type TemplateAmbiguityReport = {
    /** null — проверялись все порталы. */
    portalId: string | null;
    /** Ящики, где больше одного is_default. */
    ambiguous: TemplateAmbiguityBucket[];
    /**
     * Виды документов, по которым у портала нет НИ ОДНОЙ своей активной
     * строки: он целиком живёт на общих (portal_id IS NULL) шаблонах.
     * Не ошибка, но админ должен знать — правка общего шаблона поедет
     * во все такие порталы сразу.
     */
    reliesOnCommon: DocumentTemplateKind[];
};
