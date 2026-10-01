import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { loadSalesDepartments } from '../sales-departments.loader';

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

describe('loadSalesDepartments', () => {
    it('основные отделы, подотделы и предки — одним списком, снимок отдела продаж', async () => {
        const getFullDepartment = jest.fn().mockResolvedValue({
            department: {
                generalDepartment: [{ ID: 63, HEADS: [11], USERS: users(433) }],
                childrenDepartments: [
                    { ID: 67, PARENT: 63, USERS: users(323) },
                ],
                parentDepartments: [{ ID: 79, HEADS: [309], USERS: [] }],
            },
        });
        const warnings: string[] = [];

        const departments = await loadSalesDepartments(
            { getFullDepartment },
            'd.b24.ru',
            warnings,
        );

        expect(departments.map(item => item.ID)).toEqual([63, 67, 79]);
        expect(getFullDepartment).toHaveBeenCalledWith(
            'd.b24.ru',
            EDepartamentGroup.sales,
        );
        expect(warnings).toEqual([]);
    });

    it('предков нет (старый кэш снимка) — без них, без ошибки', async () => {
        const departments = await loadSalesDepartments(
            {
                getFullDepartment: jest.fn().mockResolvedValue({
                    department: {
                        generalDepartment: [{ ID: 63, USERS: [] }],
                        childrenDepartments: [],
                    },
                }),
            },
            'd.b24.ru',
            [],
        );

        expect(departments.map(item => item.ID)).toEqual([63]);
    });

    it('снимок не прочитан — пусто и предупреждение с причиной', async () => {
        const warnings: string[] = [];

        const departments = await loadSalesDepartments(
            {
                getFullDepartment: jest
                    .fn()
                    .mockRejectedValue(new Error('redis down')),
            },
            'd.b24.ru',
            warnings,
            'Повторная заявка: структура не прочитана',
        );

        expect(departments).toEqual([]);
        expect(warnings).toEqual([
            'Повторная заявка: структура не прочитана: redis down',
        ]);
    });
});
