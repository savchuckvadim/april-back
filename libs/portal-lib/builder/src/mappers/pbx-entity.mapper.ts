import {
    ICompany,
    IContact,
    ILead,
    IPBXList,
    IPDeal,
    IPSmart,
    IRPA,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    BuilderEntityKey,
    PortalAggregate,
    PortalWithRelations,
    getFromIndex,
} from '../repositories/portal-aggregate.types';
import { FieldModel, mapField } from './pbx-field.mapper';
import { mapCategory } from './pbx-category.mapper';
import {
    nonNull,
    toIsoOrNull,
    toNumber,
    toNumberOrNull,
} from './laravel-serialize.util';

/** Индексы полиморфных таблиц, нужные мапперам сущностей. */
export type PolymorphicContext = Pick<
    PortalAggregate,
    'fieldsIndex' | 'categoriesIndex'
>;

/** Сущность с обязательными (а не опциональными) полями FieldModel. */
type WithFieldModels = { bitrixfields: FieldModel[] };

/** Смарт-процесс в форме Laravel SmartResource. */
export type SmartModel = IPSmart & WithFieldModels & { fields: FieldModel[] };

/** Сделка в форме Laravel BtxDealResource. */
export type DealModel = IPDeal & WithFieldModels;

/** Лид в форме Laravel BtxLeadResource. */
export type LeadModel = ILead & WithFieldModels;

/** Компания в форме Laravel BtxCompanyResource. */
export type CompanyModel = ICompany & WithFieldModels;

/** Контакт в форме Laravel BtxContactResource. */
export type ContactModel = IContact & WithFieldModels;

/** RPA в форме Laravel (raw btx_rpas с relations). */
export type RpaModel = IRPA & WithFieldModels;

/** Универсальный список в форме Laravel BitrixlistResource. */
export type BitrixListModel = IPBXList &
    WithFieldModels & { id: number; portal_id: number; bitrixId: number };

/** Пользовательская модель BtxUser (в btx_users есть только code — name/title Laravel отдавал null). */
export interface UserModel {
    id: number;
    portal_id: number;
    code: string;
    name: string | null;
    title: string | null;
    bitrixfields: FieldModel[];
}

const fieldsOf = (
    ctx: PolymorphicContext,
    entity: BuilderEntityKey,
    id: bigint,
): FieldModel[] =>
    getFromIndex(ctx.fieldsIndex, entity, Number(id)).map(mapField);

const categoriesOf = (
    ctx: PolymorphicContext,
    entity: BuilderEntityKey,
    id: bigint,
) => getFromIndex(ctx.categoriesIndex, entity, Number(id)).map(mapCategory);

/** smarts -> IPSmart в форме Laravel SmartResource (bitrixfields и fields — один массив). */
export const mapSmart = (
    row: PortalWithRelations['smarts'][number],
    ctx: PolymorphicContext,
): SmartModel => {
    const fields = fieldsOf(ctx, 'smart', row.id);
    return {
        id: toNumber(row.id),
        portal_id: toNumber(row.portal_id),
        type: row.type,
        group: row.group,
        name: row.name,
        title: row.title,
        bitrixId: nonNull(toNumberOrNull(row.bitrixId)),
        entityTypeId: toNumber(row.entityTypeId),
        forStageId: nonNull(toNumberOrNull(row.forStageId)),
        forStage: nonNull(row.forStage),
        crmId: nonNull(toNumberOrNull(row.crmId)),
        crm: nonNull(row.crm),
        forFilterId: nonNull(toNumberOrNull(row.forFilterId)),
        forFilter: nonNull(row.forFilter),
        bitrixfields: fields,
        fields,
        categories: categoriesOf(ctx, 'smart', row.id),
    };
};

/** bitrixlists -> форма Laravel BitrixlistResource (поля только с parent_type='list'). */
export const mapBitrixList = (
    row: PortalWithRelations['bitrixlists'][number],
    ctx: PolymorphicContext,
): BitrixListModel => ({
    id: toNumber(row.id),
    type: row.type,
    group: row.group,
    name: row.name,
    title: row.title,
    bitrixId: toNumber(row.bitrixId),
    portal_id: toNumber(row.portal_id),
    bitrixfields: fieldsOf(ctx, 'list', row.id).filter(
        field => field.parent_type === 'list',
    ),
});

/** btx_deals -> IPDeal в форме Laravel BtxDealResource. */
export const mapDeal = (
    row: PortalWithRelations['btx_deals'][number],
    ctx: PolymorphicContext,
): DealModel => ({
    id: toNumber(row.id),
    portal_id: toNumber(row.portal_id),
    code: row.code,
    name: row.name,
    title: row.title,
    categories: categoriesOf(ctx, 'deal', row.id),
    bitrixfields: fieldsOf(ctx, 'deal', row.id),
});

/** btx_leads -> ILead в форме Laravel BtxLeadResource. */
export const mapLead = (
    row: PortalWithRelations['btx_leads'][number],
    ctx: PolymorphicContext,
): LeadModel => ({
    id: toNumber(row.id),
    portal_id: toNumber(row.portal_id),
    code: row.code,
    name: row.name,
    title: row.title,
    categories: categoriesOf(ctx, 'lead', row.id),
    bitrixfields: fieldsOf(ctx, 'lead', row.id),
});

/** btx_companies -> ICompany в форме Laravel BtxCompanyResource. */
export const mapCompany = (
    row: PortalWithRelations['btx_companies'][number],
    ctx: PolymorphicContext,
): CompanyModel => ({
    id: toNumber(row.id),
    portal_id: toNumber(row.portal_id),
    code: row.code,
    name: row.name,
    title: row.title,
    bitrixfields: fieldsOf(ctx, 'company', row.id),
});

/** btx_contacts -> IContact в форме Laravel BtxContactResource. */
export const mapContact = (
    row: PortalWithRelations['btx_contacts'][number],
    ctx: PolymorphicContext,
): ContactModel => ({
    id: toNumber(row.id),
    portal_id: toNumber(row.portal_id),
    code: row.code,
    name: row.name,
    title: row.title,
    bitrixfields: fieldsOf(ctx, 'contact', row.id),
});

/** btx_users -> форма Laravel BtxUserResource. */
export const mapUser = (
    row: PortalWithRelations['btx_users'][number],
    ctx: PolymorphicContext,
): UserModel => ({
    id: toNumber(row.id),
    portal_id: toNumber(row.portal_id),
    code: row.code,
    name: null,
    title: null,
    bitrixfields: fieldsOf(ctx, 'user', row.id),
});

/** btx_rpas -> IRPA (Laravel отдавал raw-модели с eager relations). */
export const mapRpa = (
    row: PortalWithRelations['btx_rpas'][number],
    ctx: PolymorphicContext,
): RpaModel => ({
    id: toNumber(row.id),
    created_at: nonNull(toIsoOrNull(row.created_at)),
    updated_at: nonNull(toIsoOrNull(row.updated_at)),
    name: row.name,
    title: row.title,
    code: row.code,
    type: row.type,
    image: nonNull(row.image),
    bitrixId: nonNull(toNumberOrNull(row.bitrixId)),
    typeId: row.typeId,
    description: nonNull(row.description),
    entityTypeId: nonNull(toNumberOrNull(row.entityTypeId)),
    forStageId: nonNull(toNumberOrNull(row.forStageId)),
    forFilterId: nonNull(toNumberOrNull(row.forFilterId)),
    crmId: nonNull(toNumberOrNull(row.crmId)),
    portal_id: toNumber(row.portal_id),
    categories: categoriesOf(ctx, 'rpa', row.id),
    bitrixfields: fieldsOf(ctx, 'rpa', row.id),
});

/**
 * Семантика Laravel `where('group','sales')->first()`:
 * первый элемент группы sales или null (без фолбэка на другие группы).
 */
export const firstSales = <T extends { group: string }>(
    rows: readonly T[],
): T | null => rows.find(row => row.group === 'sales') ?? null;

/** Семантика Laravel `->first()`: первый элемент или null. */
export const firstOrNull = <T>(rows: readonly T[]): T | null =>
    rows.length ? rows[0] : null;
