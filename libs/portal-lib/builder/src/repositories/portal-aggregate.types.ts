import { Prisma } from 'generated/prisma';
import { PbxEntityTypePrisma } from '@lib/shared/enums/pbx-entity-type.enum';

/**
 * Include-аргумент агрегатного запроса портала.
 * Единственный источник правды для типа PortalWithRelations.
 */
export const PORTAL_AGGREGATE_INCLUDE = {
    bitrixlists: true,
    smarts: true,
    btx_deals: true,
    btx_companies: true,
    btx_contacts: true,
    btx_leads: true,
    btx_rpas: true,
    btx_users: true,
    departaments: true,
    callings: true,
    bxRqs: true,
    portal_measure: { include: { measures: true } },
} as const satisfies Prisma.PortalInclude;

/** Портал со всеми плоскими relations из БД. */
export type PortalWithRelations = Prisma.PortalGetPayload<{
    include: typeof PORTAL_AGGREGATE_INCLUDE;
}>;

/** Строка bitrixfields вместе с items. */
export type BitrixFieldWithItems = Prisma.bitrixfieldsGetPayload<{
    include: { bitrixfield_items: true };
}>;

/** Строка btx_categories вместе со стадиями. */
export type CategoryWithStages = Prisma.btx_categoriesGetPayload<{
    include: { btx_stages: true };
}>;

/**
 * Индекс полиморфных строк: entity_type (FQCN Laravel) -> entity_id -> строки.
 * Собирается в памяти из одного батч-запроса, чтобы не плодить N+1.
 */
export type PolymorphicIndex<T> = Map<string, Map<number, T[]>>;

/** Сущности-владельцы полиморфных bitrixfields / btx_categories. */
export type BuilderEntityKey =
    | 'deal'
    | 'smart'
    | 'company'
    | 'contact'
    | 'lead'
    | 'list'
    | 'rpa'
    | 'user';

/**
 * Какие значения entity_type реально лежат в БД для каждой сущности.
 *
 * Правило одно: значение = FQCN модели Laravel, потому что её morph-связи
 * (`bitrixfields`, `categories`) ищут привязанные строки строго по нему.
 * Лид — `App\Models\BtxLead`, как компания/контакт/сделка (`Btx*`).
 * Прежнее `App\Models\Lead` было ошибкой записи: внешний getportal такие
 * строки не находил и отдавал пустую секцию lead, из-за чего поля и стадии
 * лида не доезжали до приложений. Старые строки удалены/переустановлены,
 * поэтому легаси-вариант больше НЕ читается.
 *
 * Для list каноническим стало легаси-написание `App\Models\Bitrixlist`
 * (его понимает старая Laravel-админка); `App\Models\BitrixList` писала
 * ранняя версия установщика pbx-install — такие строки продолжаем читать.
 */
export const ENTITY_TYPE_DB_VALUES: Record<
    BuilderEntityKey,
    readonly string[]
> = {
    deal: [PbxEntityTypePrisma.DEAL],
    smart: [PbxEntityTypePrisma.SMART],
    company: [PbxEntityTypePrisma.BTX_COMPANY],
    contact: [PbxEntityTypePrisma.BTX_CONTACT],
    lead: [PbxEntityTypePrisma.LEAD],
    list: [PbxEntityTypePrisma.BITRIX_LIST, 'App\\Models\\BitrixList'],
    rpa: [PbxEntityTypePrisma.BTX_RPA],
    user: [PbxEntityTypePrisma.USER],
};

/** Сущности, у которых есть btx_categories (по данным БД: deal, smart, rpa; lead — по типам Laravel). */
export const CATEGORY_ENTITY_KEYS: readonly BuilderEntityKey[] = [
    'deal',
    'smart',
    'rpa',
    'lead',
];

/** Агрегат портала: плоские relations + индексы полиморфных таблиц. */
export interface PortalAggregate {
    portal: PortalWithRelations;
    fieldsIndex: PolymorphicIndex<BitrixFieldWithItems>;
    categoriesIndex: PolymorphicIndex<CategoryWithStages>;
}

/** Достаёт строки из индекса по всем допустимым написаниям entity_type. */
export const getFromIndex = <T>(
    index: PolymorphicIndex<T>,
    entity: BuilderEntityKey,
    entityId: number,
): T[] => {
    const result: T[] = [];
    for (const entityType of ENTITY_TYPE_DB_VALUES[entity]) {
        const rows = index.get(entityType)?.get(entityId);
        if (rows) result.push(...rows);
    }
    return result;
};
