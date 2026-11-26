import { uniq } from '@lib/portal-lib/pbx-duplicate';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IInnAvailability } from '../type/inn.type';

/**
 * UF-имена полей ИНН по сущностям портала.
 *
 * Коды — только из канона (`PBX_SALES_KONSTRUCTOR_FIELD_CODES`), реальные
 * имена (`UF_CRM_...`) — только из `PortalModel`: магических строк в коде
 * ИНН быть не должно (ai/rules/pbx-typing.md). Поле не установлено на
 * портале — `null`, и вызывающий сам решает, что делать: молча пропустить
 * запись или показать плашку «запустите установщик».
 *
 * Старые поля портала (`legacy`) — НЕ наши: их имена приходят из настройки
 * портала `inn_legacy_fields_*` и только читаются как источник вариантов.
 */
export type InnFieldEntity = 'deal' | 'company' | 'lead';

/** Старые поля портала с ИНН по сущностям (настройка `inn_legacy_fields_*`). */
export type InnLegacyFields = Readonly<
    Partial<Record<InnFieldEntity, readonly string[]>>
>;

export const NO_INN_LEGACY_FIELDS: InnLegacyFields = {};

/** Имя пользовательского поля CRM. */
const UF_FIELD_NAME = /^UF_CRM_[A-Z0-9_]+$/;

/**
 * Значение настройки (имена через запятую) → имена полей. Мусор и повторы
 * отбрасываются: в настройку руками могли вписать что угодно.
 */
export function parseInnLegacyFieldNames(
    raw: string | null | undefined,
): string[] {
    return uniq(
        String(raw ?? '')
            .split(/[\s,;]+/)
            .map(name => name.trim().toUpperCase())
            .filter(name => UF_FIELD_NAME.test(name)),
    );
}

export class InnFieldMap {
    private constructor(
        private readonly names: Record<
            InnFieldEntity,
            { inn: string | null; pool: string | null }
        >,
        private readonly legacyNames: Record<InnFieldEntity, readonly string[]>,
    ) {}

    static from(
        portal: PortalModel,
        legacy: InnLegacyFields = NO_INN_LEGACY_FIELDS,
    ): InnFieldMap {
        const resolve = (
            entity: InnFieldEntity,
            code: string,
        ): string | null => {
            const field = portal.getEntityFieldByCode(entity, code);
            return field ? portal.getFieldBitrixId(field) : null;
        };
        const pick = (
            entity: InnFieldEntity,
        ): { inn: string | null; pool: string | null } => ({
            inn: resolve(entity, PBX_SALES_KONSTRUCTOR_FIELD_CODES.op_inn),
            pool: resolve(
                entity,
                PBX_SALES_KONSTRUCTOR_FIELD_CODES.op_inn_pool,
            ),
        });
        const names = {
            deal: pick('deal'),
            company: pick('company'),
            lead: pick('lead'),
        };
        // Наше же поле, выбранное «старым», задвоило бы вариант — пропускаем.
        const legacyOf = (entity: InnFieldEntity): string[] => {
            const own = [names[entity].inn, names[entity].pool];
            return parseInnLegacyFieldNames(
                (legacy[entity] ?? []).join(','),
            ).filter(name => !own.includes(name));
        };
        return new InnFieldMap(names, {
            deal: legacyOf('deal'),
            company: legacyOf('company'),
            lead: legacyOf('lead'),
        });
    }

    inn(entity: InnFieldEntity): string | null {
        return this.names[entity].inn;
    }

    pool(entity: InnFieldEntity): string | null {
        return this.names[entity].pool;
    }

    /** Оба имени сущности — для скана строки на ИНН. */
    both(entity: InnFieldEntity): string[] {
        return [this.names[entity].inn, this.names[entity].pool].filter(
            (name): name is string => !!name,
        );
    }

    /** Старые поля портала сущности: только чтение, запись в них запрещена. */
    legacy(entity: InnFieldEntity): readonly string[] {
        return this.legacyNames[entity];
    }

    availability(requisitesReadable: boolean): IInnAvailability {
        return {
            dealInnField: !!this.names.deal.inn,
            dealPoolField: !!this.names.deal.pool,
            companyInnField: !!this.names.company.inn,
            companyPoolField: !!this.names.company.pool,
            requisitesReadable,
        };
    }
}
