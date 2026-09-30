import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { toStructureData } from '../lib/structure-projection.util';
import { IDepartmentData } from '../lib/structure-data.types';

const users = (...ids: number[]): IBXUser[] =>
    ids.map(ID => ({ ID, NAME: `u${ID}` }));

const dep = (
    ID: number,
    NAME: string,
    PARENT: number,
    extra: Partial<IBXDepartment> = {},
): IBXDepartment => ({ ID, NAME, PARENT: String(PARENT), SORT: ID, ...extra });

const idsOf = (list: { ID?: number | string }[]) =>
    list.map(item => Number(item.ID));

describe('structure-projection.util: toStructureData', () => {
    describe('одиночный режим (как раньше)', () => {
        // 9 Отдел продаж: 90 └─ 10 Группа 1: 100 └─ 11 Стажёры: 110
        const snapshot: IDepartmentData = {
            department: 9,
            generalDepartment: [
                dep(9, 'Отдел продаж', 1, { USERS: users(90), HEADS: [90] }),
            ],
            childrenDepartments: [
                dep(10, 'Группа 1', 9, { USERS: users(100) }),
                dep(11, 'Стажёры', 9, { USERS: users(110) }),
            ],
            parentDepartments: [dep(1, 'Компания', 0, { HEADS: [1] })],
            allUsers: users(90, 100, 110),
            isMultiple: false,
            multipleTag: null,
        };

        it('разбивка по базовому отделу: группы — только «Группа …», сотрудники — весь отдел', () => {
            const structure = toStructureData(snapshot);

            expect(structure.salesDepartments).toHaveLength(1);
            const [sales] = structure.salesDepartments;
            expect(sales.department).toBe(snapshot.generalDepartment[0]);
            expect(idsOf(sales.groups)).toEqual([10]);
            expect(sales.allUsers).toBe(snapshot.allUsers);
        });

        it('cup не определяется, department — сам снимок', () => {
            const structure = toStructureData(snapshot);

            expect(structure.cupDepartments).toEqual([]);
            expect(structure.department).toBe(snapshot);
        });

        it('снимок без isMultiple (старый формат) — одиночный режим', () => {
            const legacy: IDepartmentData = {
                department: snapshot.department,
                generalDepartment: snapshot.generalDepartment,
                childrenDepartments: snapshot.childrenDepartments,
                allUsers: snapshot.allUsers,
            };

            expect(toStructureData(legacy).cupDepartments).toEqual([]);
            expect(toStructureData(legacy).salesDepartments).toHaveLength(1);
        });
    });

    describe('мультирежим', () => {
        // 1 Корень (HEADS 1): 1
        // ├─ 79 Глава Воронеж (HEADS 790): 790
        // │  └─ 63 ОП Воронеж (ОП): 630
        // │     ├─ 67 Группа Звездочки: 670, 671
        // │     ├─ 69 Стажёры: 690
        // │     └─ 70 ОП Воронеж-2 (ОП): 700 (ОП внутри ОП)
        // └─ 81 Глава Питер (HEADS 810): 810
        //    └─ 37 ОП Питер (ОП): 370
        const op63 = dep(63, 'ОП Воронеж (ОП)', 79, { USERS: users(630) });
        const op70 = dep(70, 'ОП Воронеж-2 (ОП)', 63, { USERS: users(700) });
        const op37 = dep(37, 'ОП Питер (ОП)', 81, { USERS: users(370) });
        const snapshot: IDepartmentData = {
            department: 0,
            generalDepartment: [op63, op70, op37],
            childrenDepartments: [
                dep(67, 'Группа Звездочки', 63, { USERS: users(670, 671) }),
                dep(69, 'Стажёры', 63, { USERS: users(690) }),
                op70,
            ],
            parentDepartments: [
                dep(79, 'Глава Воронеж', 1, {
                    USERS: users(790),
                    HEADS: [790],
                }),
                dep(1, 'Корень', 0, { USERS: users(1), HEADS: [1] }),
                dep(81, 'Глава Питер', 1, {
                    USERS: users(810),
                    HEADS: [810],
                }),
            ],
            allUsers: users(630, 700, 370, 670, 671, 690),
            isMultiple: true,
            multipleTag: '(ОП)',
        };

        it('разбивка по каждому ОП: группы «Группа …», сотрудники ОП и всех его подотделов', () => {
            const { salesDepartments } = toStructureData(snapshot);

            expect(idsOf(salesDepartments.map(s => s.department))).toEqual([
                63, 70, 37,
            ]);
            const voronezh = salesDepartments[0];
            expect(idsOf(voronezh.groups)).toEqual([67]);
            expect(idsOf(voronezh.allUsers).sort((a, b) => a - b)).toEqual([
                630, 670, 671, 690, 700,
            ]);
            const piter = salesDepartments[2];
            expect(piter.groups).toEqual([]);
            expect(idsOf(piter.allUsers)).toEqual([370]);
        });

        it('cup — прямые родители ОП с сотрудниками и руководителями снимка; корень и дубли не попадают', () => {
            const { cupDepartments } = toStructureData(snapshot);

            // 79 и 81 — родители ОП из предков, 63 — родитель вложенного ОП 70
            expect(idsOf(cupDepartments)).toEqual([79, 81, 63]);
            expect(cupDepartments[0].HEADS).toEqual([790]);
            expect(idsOf(cupDepartments[0].USERS ?? [])).toEqual([790]);
        });

        it('родитель и в предках, и среди ОП — один раз', () => {
            const duplicated: IDepartmentData = {
                ...snapshot,
                parentDepartments: [
                    ...(snapshot.parentDepartments ?? []),
                    op63,
                ],
            };

            const ids = idsOf(toStructureData(duplicated).cupDepartments);

            expect(ids.filter(id => id === 63)).toHaveLength(1);
        });

        it('сотрудники разбивки — подмножество allUsers снимка', () => {
            const { salesDepartments } = toStructureData(snapshot);
            const all = new Set(idsOf(snapshot.allUsers));

            for (const sales of salesDepartments) {
                expect(idsOf(sales.allUsers).every(id => all.has(id))).toBe(
                    true,
                );
            }
        });

        it('снимок без parentDepartments — cup только из вложенных ОП', () => {
            const { cupDepartments } = toStructureData({
                ...snapshot,
                parentDepartments: undefined,
            });

            expect(idsOf(cupDepartments)).toEqual([63]);
        });
    });
});
