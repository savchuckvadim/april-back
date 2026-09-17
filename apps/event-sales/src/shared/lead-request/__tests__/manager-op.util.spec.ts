import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { isManagerOp, managerOpName, setManagerOp } from '../manager-op.util';

/**
 * «Менеджер по продажам Гарант» идёт за ответственным работы: пишется id
 * сотрудника, поле не установлено — молча пропуск.
 */
type Row = Record<string, unknown>;

const portal = (entities: string[]): PortalModel =>
    ({
        getEntityFieldByCode: (entity: string, code: string) =>
            code === 'manager_op' && entities.includes(entity)
                ? { bitrixId: 'MANAGER_OP' }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as unknown as PortalModel;

describe('manager-op.util', () => {
    it('имя поля — по коду manager_op у нужной сущности', () => {
        const model = portal(['lead', 'deal']);
        expect(managerOpName(model, 'lead')).toBe('UF_CRM_MANAGER_OP');
        expect(managerOpName(model, 'company')).toBeNull();
    });

    it('пишет id сотрудника числом', () => {
        const fields: Row = {};
        expect(setManagerOp(portal(['deal']), 'deal', fields, 447)).toBe(true);
        expect(fields).toEqual({ UF_CRM_MANAGER_OP: 447 });
    });

    it('поля нет или сотрудника нет — ничего не пишет', () => {
        const fields: Row = {};
        expect(setManagerOp(portal([]), 'deal', fields, 447)).toBe(false);
        expect(setManagerOp(portal(['deal']), 'deal', fields, null)).toBe(
            false,
        );
        expect(setManagerOp(portal(['deal']), 'deal', fields, 0)).toBe(false);
        expect(fields).toEqual({});
    });

    it('сверка текущего менеджера: строка, число, пусто, поля нет', () => {
        const model = portal(['lead']);
        expect(
            isManagerOp(model, 'lead', { UF_CRM_MANAGER_OP: '447' }, 447),
        ).toBe(true);
        expect(
            isManagerOp(model, 'lead', { UF_CRM_MANAGER_OP: 447 }, 447),
        ).toBe(true);
        expect(
            isManagerOp(model, 'lead', { UF_CRM_MANAGER_OP: '448' }, 447),
        ).toBe(false);
        expect(isManagerOp(model, 'lead', {}, 447)).toBe(false);
        // Поля нет — сверять нечего, писать тоже.
        expect(isManagerOp(portal([]), 'lead', {}, 447)).toBe(true);
    });
});
