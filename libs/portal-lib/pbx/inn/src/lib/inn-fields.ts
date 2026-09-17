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
 */
export type InnFieldEntity = 'deal' | 'company' | 'lead';

export class InnFieldMap {
    private constructor(
        private readonly names: Record<
            InnFieldEntity,
            { inn: string | null; pool: string | null }
        >,
    ) {}

    static from(portal: PortalModel): InnFieldMap {
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
        return new InnFieldMap({
            deal: pick('deal'),
            company: pick('company'),
            lead: pick('lead'),
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
