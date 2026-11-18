import type { ManagerDigestCard } from '@lib/sales-ai-analytics';
import { digestManagersOf } from '../lib/period-digest-managers';

const DEPARTMENTS = [
    {
        ID: 7,
        NAME: 'ОП 1',
        USERS: [
            { ID: 10, NAME: 'Анна', LAST_NAME: 'Иванова' },
            { ID: '11', NAME: 'Сергей', LAST_NAME: 'Петров' },
            { ID: 12, NAME: '', LAST_NAME: '' },
        ],
    },
    {
        ID: '8',
        NAME: 'ОП 2',
        USERS: [
            // Тот же сотрудник во втором отделе — берётся первый.
            { ID: 10, NAME: 'Анна', LAST_NAME: 'Иванова' },
            { ID: 13, NAME: 'Елена', LAST_NAME: 'Кузнецова' },
        ],
    },
];

const previousCard = (managerId: string): ManagerDigestCard =>
    ({
        managerId,
        managerName: 'Сидоров Кирилл',
        departmentId: 9,
        departmentName: 'ОП 3',
    }) as ManagerDigestCard;

describe('кому подводить итоги периода', () => {
    it('сотрудники отделов продаж по фамилии, без повторов, отдел — первый', () => {
        const managers = digestManagersOf({
            departments: DEPARTMENTS,
            callerIds: new Set(),
            previousCards: new Map(),
            excludeUserIds: new Set(),
        });

        expect(managers).toEqual([
            {
                id: '10',
                name: 'Иванова Анна',
                departmentId: 7,
                departmentName: 'ОП 1',
            },
            {
                id: '13',
                name: 'Кузнецова Елена',
                departmentId: 8,
                departmentName: 'ОП 2',
            },
            {
                id: '11',
                name: 'Петров Сергей',
                departmentId: 7,
                departmentName: 'ОП 1',
            },
            {
                id: '12',
                name: 'Сотрудник 12',
                departmentId: 7,
                departmentName: 'ОП 1',
            },
        ]);
    });

    it('исключённые настройкой не попадают', () => {
        const managers = digestManagersOf({
            departments: DEPARTMENTS,
            callerIds: new Set(['13']),
            previousCards: new Map([['13', previousCard('13')]]),
            excludeUserIds: new Set([13, 12]),
        });

        expect(managers.map(item => item.id)).toEqual(['10', '11']);
    });

    it('ушедший из отдела продаж со звонками и прошлой карточкой — остаётся; без карточки — нет', () => {
        const managers = digestManagersOf({
            departments: [],
            callerIds: new Set(['20', '21']),
            previousCards: new Map([['20', previousCard('20')]]),
            excludeUserIds: new Set(),
        });

        expect(managers).toEqual([
            {
                id: '20',
                name: 'Сидоров Кирилл',
                departmentId: 9,
                departmentName: 'ОП 3',
            },
        ]);
    });
});
