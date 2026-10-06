import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    buildDealAuditStaffGroups,
    staffGroupUserIds,
} from '../lib/deal-audit-staff-groups';

const department = (
    id: number,
    name: string,
    userIds: Array<number | string | null>,
): IBXDepartment =>
    ({
        ID: id,
        NAME: name,
        PARENT: '1',
        SORT: 100,
        USERS: userIds.map(userId => ({ ID: userId })),
    }) as unknown as IBXDepartment;

describe('группы сотрудников для аудита сделок', () => {
    it('отдел продаж — группа из его сотрудников', () => {
        expect(
            buildDealAuditStaffGroups([
                department(31, 'ОП 1', [11, '12']),
                department(33, 'ОП 2', [21]),
            ]),
        ).toEqual([
            { title: 'ОП 1', userIds: [11, 12] },
            { title: 'ОП 2', userIds: [21] },
        ]);
    });

    it('сотрудник двух отделов попадает в первую группу — его сделки не приходят дважды', () => {
        const groups = buildDealAuditStaffGroups([
            department(31, 'ОП 1', [11, 12]),
            department(33, 'ОП 2', [12, 21]),
        ]);

        expect(groups[1].userIds).toEqual([21]);
        expect(staffGroupUserIds(groups)).toEqual([11, 12, 21]);
    });

    it('отдел без сотрудников в группы не попадает — запрос «сделки никого» вернул бы всю воронку', () => {
        expect(
            buildDealAuditStaffGroups([
                department(31, 'Пустой', []),
                department(32, 'Мусор', [0, null, 'x']),
                department(33, 'ОП 2', [21]),
            ]),
        ).toEqual([{ title: 'ОП 2', userIds: [21] }]);
    });

    it('один отдел дважды в структуре (общий и дочерний списки) — одна группа', () => {
        expect(
            buildDealAuditStaffGroups([
                department(31, 'ОП 1', [11]),
                department(31, 'ОП 1', [11, 12]),
            ]),
        ).toEqual([{ title: 'ОП 1', userIds: [11] }]);
    });

    it('отдел без названия подписывается номером', () => {
        expect(buildDealAuditStaffGroups([department(77, '', [5])])).toEqual([
            { title: 'Отдел 77', userIds: [5] },
        ]);
    });
});
