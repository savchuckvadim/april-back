import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

type BxRow = Record<string, unknown>;

/** Сущности, на которых заведено поле `manager_op`. */
export type ManagerOpEntity = 'lead' | 'deal' | 'company';

/**
 * «Менеджер по продажам Гарант» (`manager_op`, employee).
 *
 * Решение владельца 17.09: поле идёт СРАЗУ за ответственным работы — при
 * адресном ХО и при принятии заявки в него пишется тот же сотрудник.
 * Иначе карточка показывала бы менеджером того, у кого работу уже забрали.
 *
 * Значение — id сотрудника числом, как пишет event-report
 * (`EventReportEntityFieldsModel.setScalar`). Поля нет в слепке — молча
 * пропускаем.
 */

/** UF-имя поля у сущности; null — поле на портале не установлено. */
export function managerOpName(
    portal: PortalModel,
    entity: ManagerOpEntity,
): string | null {
    const field = portal.getEntityFieldByCode(
        entity,
        PBX_SALES_EVENT_FIELD_CODES.manager_op,
    );
    return field ? portal.getFieldBitrixId(field) : null;
}

/** Ставит менеджера в поля записи; нет поля или сотрудника — пропуск. */
export function setManagerOp(
    portal: PortalModel,
    entity: ManagerOpEntity,
    fields: BxRow,
    userId: number | null,
): boolean {
    const name = managerOpName(portal, entity);
    if (!name || !userId || userId <= 0) return false;
    fields[name] = userId;
    return true;
}

/** В строке сущности менеджером уже стоит этот сотрудник (или поля нет). */
export function isManagerOp(
    portal: PortalModel,
    entity: ManagerOpEntity,
    row: BxRow,
    userId: number,
): boolean {
    const name = managerOpName(portal, entity);
    if (!name) return true;
    const raw = row[name];
    const value = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    return (
        (typeof value === 'string' || typeof value === 'number') &&
        Number(value) === userId
    );
}
