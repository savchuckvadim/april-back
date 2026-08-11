import { LeadToWorkAssigneeService } from '../services/lead-to-work-assignee.service';
import { buildLeadToWorkItem } from '../dto/lead-to-work.dto';

/** Структура: два ОП (15 и 20), в ОП 15 группа 16. */
const makeStructure = () => ({
    getStructure: jest.fn().mockResolvedValue({
        department: {
            department: 0,
            generalDepartment: [],
            childrenDepartments: [],
            allUsers: [
                { ID: 3, ACTIVE: true },
                { ID: 5, ACTIVE: true },
                { ID: 9, ACTIVE: false },
            ],
        },
        salesDepartments: [
            {
                department: { ID: 15, NAME: 'ОП 1' },
                groups: [
                    {
                        ID: 16,
                        NAME: 'Группа А',
                        USERS: [
                            { ID: 5, ACTIVE: true },
                            { ID: 3, ACTIVE: true },
                        ],
                    },
                ],
                allUsers: [
                    { ID: 3, ACTIVE: true },
                    { ID: 5, ACTIVE: true },
                ],
            },
            {
                department: { ID: 20, NAME: 'ОП 2' },
                groups: [],
                allUsers: [{ ID: 9, ACTIVE: false }],
            },
        ],
    }),
});

const makeAppCache = () => {
    const store = new Map<string, unknown>();
    return {
        store,
        get: jest.fn(({ key }: { key: string }) =>
            Promise.resolve(store.get(key) ?? null),
        ),
        set: jest.fn(({ key, data }: { key: string; data: unknown }) => {
            store.set(key, data);
            return Promise.resolve();
        }),
    };
};

const item = (
    over: {
        responsible?: number;
        department?: string;
        excludeResponsible?: number;
        transferredBy?: number;
    } = {},
) => buildLeadToWorkItem({ leadId: 42, ...over });

describe('LeadToWorkAssigneeService', () => {
    it('явный responsible проходит без обращения к структуре', async () => {
        const structure = makeStructure();
        const service = new LeadToWorkAssigneeService(
            structure as never,
            makeAppCache() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ responsible: 7 }),
        );
        expect(result).toMatchObject({ responsible: 7, source: 'explicit' });
        expect(structure.getStructure).not.toHaveBeenCalled();
    });

    it('round-robin по отделу из намёка: курсор идёт по кругу', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        const first = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
        );
        const second = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
        );
        const third = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
        );
        // Кандидаты ОП 15: [3, 5] → 3, 5, снова 3.
        expect(first.responsible).toBe(3);
        expect(second.responsible).toBe(5);
        expect(third.responsible).toBe(3);
        expect(first.source).toBe('round-robin');
        expect(first.departmentKey).toBe('op_15');
    });

    it('намёк НАЗВАНИЕМ отдела («оп 1») матчит ОП без цифр', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'ОП 1' }),
        );
        expect(result.departmentKey).toBe('op_15');
        expect([3, 5]).toContain(result.responsible);
    });

    it('намёк названием группы («Группа А») матчит группу', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'группа а' }),
        );
        expect(result.departmentKey).toBe('group_16');
    });

    it('намёк «D_16» матчит группу внутри ОП', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'D_16' }),
        );
        expect(result.departmentKey).toBe('group_16');
        expect([3, 5]).toContain(result.responsible);
    });

    it('намёк не найден → warning + выбор по всем ОП (неактивные отфильтрованы)', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '999' }),
        );
        expect(result.warnings.join(' ')).toContain('999');
        expect(result.departmentKey).toBe('all');
        // 9 неактивен — только 3 и 5.
        expect([3, 5]).toContain(result.responsible);
    });

    it('передача: excludeResponsible не выбирается (заявка не возвращается)', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        // В ОП 15 кандидаты [3, 5]; исключаем 3 → всегда 5.
        const first = await service.resolve(
            'd.b24.ru',
            item({ department: '15', excludeResponsible: 3 }),
        );
        const second = await service.resolve(
            'd.b24.ru',
            item({ department: '15', excludeResponsible: 3 }),
        );
        expect(first.responsible).toBe(5);
        expect(second.responsible).toBe(5);
    });

    it('самопередача без намёка: отдел берётся у передающего сотрудника', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
        );
        // Пользователь 5 из ОП 15: без department отдел найден по нему,
        // а сам он исключён → достаётся 3.
        const result = await service.resolve(
            'd.b24.ru',
            item({ transferredBy: 5, excludeResponsible: 5 }),
        );
        expect(result.departmentKey).toBe('op_15');
        expect(result.responsible).toBe(3);
    });

    it('пустой отдел → responsible null + warning', async () => {
        const structure = {
            getStructure: jest.fn().mockResolvedValue({
                department: { allUsers: [] },
                salesDepartments: [],
            }),
        };
        const service = new LeadToWorkAssigneeService(
            structure as never,
            makeAppCache() as never,
        );
        const result = await service.resolve('d.b24.ru', item());
        expect(result.responsible).toBeNull();
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});
