import { DepartmentLike } from '../../shared/department-heads/department-heads.util';
import { DUPLICATE_RECIPIENT_ROLE } from '../constants/duplicate-report.const';
import { classifyClient } from '../lib/duplicate-classify';
import {
    assignRecipients,
    topHeadsOf,
    hasDuplicateRecipients,
    STRUCTURE_MISSING_WARNING,
} from '../lib/duplicate-recipients';
import {
    ClassifiedClient,
    DuplicateRecipientsSettings,
} from '../types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    makeClientInput,
    makeDeal,
} from './fixtures/duplicate-report.fixture';

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/**
 * Структура как на garant: «Глава» (309) → ОП (РОП 11) → группа без
 * руководителя (323, 325); отдельный ОП 37 (РОП 413, сотрудник 500).
 */
const STRUCTURE: DepartmentLike[] = [
    { ID: 79, HEADS: [309], USERS: users(309) },
    { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 69) },
    { ID: 67, PARENT: 63, USERS: users(323, 325) },
    { ID: 37, HEADS: [413], USERS: users(413, 500) },
];

const client = (id: number, ...owners: number[]): ClassifiedClient =>
    classifyClient(
        makeClientInput(
            owners.map((owner, index) =>
                makeDeal(id * 10 + index, {
                    companyId: id,
                    assignedById: owner,
                }),
            ),
        ),
        CLASSIFY_OPTIONS,
    );

/** Клиенты: 1 — у сотрудника группы 323; 2 — у 69 и 500; 3 — у 500. */
const CLIENTS = [client(1, 323, 325), client(2, 69, 500), client(3, 500, 500)];

const NONE: DuplicateRecipientsSettings = {
    toHead: false,
    departmentUserIds: [],
    structureUserIds: [],
};

const idsOf = (list: readonly ClassifiedClient[]) =>
    list.map(item => item.ref.id);

describe('получатели отчёта по дублям', () => {
    it('РОПу: руководитель получает клиентов своих сотрудников, у группы без РОПа — РОП выше', () => {
        const reports = assignRecipients(
            CLIENTS,
            STRUCTURE,
            { ...NONE, toHead: true },
            [],
        );
        expect(
            reports.map(report => [report.userId, idsOf(report.clients)]),
        ).toEqual([
            [11, [1, 2]],
            [413, [2, 3]],
        ]);
        expect(reports[0].roles).toEqual([DUPLICATE_RECIPIENT_ROLE.head]);
    });

    it('по своему отделу: отдел получателя и все подотделы', () => {
        const [report] = assignRecipients(
            CLIENTS,
            STRUCTURE,
            { ...NONE, departmentUserIds: [309] },
            [],
        );
        expect(report.userId).toBe(309);
        expect(idsOf(report.clients)).toEqual([1, 2]);
        expect(report.roles).toEqual([DUPLICATE_RECIPIENT_ROLE.department]);
    });

    it('по всей структуре: все клиенты', () => {
        const [report] = assignRecipients(
            CLIENTS,
            [],
            { ...NONE, structureUserIds: [1] },
            [],
        );
        expect(idsOf(report.clients)).toEqual([1, 2, 3]);
    });

    it('человек в нескольких списках получает одну задачу с объединённым набором', () => {
        const reports = assignRecipients(
            CLIENTS,
            STRUCTURE,
            { toHead: true, departmentUserIds: [11], structureUserIds: [] },
            [],
        );
        const rop = reports.filter(report => report.userId === 11);
        expect(rop).toHaveLength(1);
        expect(idsOf(rop[0].clients)).toEqual([1, 2]);
        expect(rop[0].roles).toEqual([
            DUPLICATE_RECIPIENT_ROLE.department,
            DUPLICATE_RECIPIENT_ROLE.head,
        ]);
    });

    it('структура не прочитана — предупреждение, «по всей структуре» всё равно уходит', () => {
        const warnings: string[] = [];
        const reports = assignRecipients(
            CLIENTS,
            [],
            { toHead: true, departmentUserIds: [309], structureUserIds: [1] },
            warnings,
        );
        expect(warnings).toEqual([STRUCTURE_MISSING_WARNING]);
        expect(reports.map(report => report.userId)).toEqual([1]);
    });

    it('РОПу: клиент уволенных (их нет в структуре) — руководителям верхних отделов, с предупреждением', () => {
        const warnings: string[] = [];
        const reports = assignRecipients(
            [client(4, 900, 901)],
            STRUCTURE,
            { ...NONE, toHead: true },
            warnings,
        );
        // Корни снимка: «Глава» 79 (309) и ОП 37 (413).
        expect(
            reports.map(report => [report.userId, idsOf(report.clients)]),
        ).toEqual([
            [309, [4]],
            [413, [4]],
        ]);
        expect(reports[0].roles).toEqual([DUPLICATE_RECIPIENT_ROLE.orphan]);
        expect(warnings).toEqual([
            expect.stringContaining('клиентов без получателя: 1'),
        ]);
        expect(warnings[0]).toContain(
            'руководителям верхних отделов: 309, 413',
        );
    });

    it('без «Отчёта РОПу» клиент вне выбранных отделов никому не уходит — но в предупреждении', () => {
        const warnings: string[] = [];
        const reports = assignRecipients(
            CLIENTS,
            STRUCTURE,
            { ...NONE, departmentUserIds: [309] },
            warnings,
        );
        expect(reports.map(report => report.userId)).toEqual([309]);
        expect(warnings).toEqual([
            expect.stringContaining('клиентов без получателя: 1'),
        ]);
        expect(warnings[0]).toContain('никому не ушли');
    });

    it('верхние отделы: родителя нет в снимке; руководители без повторов', () => {
        expect(topHeadsOf(STRUCTURE)).toEqual([309, 413]);
        expect(topHeadsOf([])).toEqual([]);
    });

    it('получатель без клиентов задачи не получает', () => {
        const reports = assignRecipients(
            [client(3, 500, 500)],
            STRUCTURE,
            { ...NONE, departmentUserIds: [309] },
            [],
        );
        expect(reports).toEqual([]);
    });

    it('задан ли хоть один получатель', () => {
        expect(hasDuplicateRecipients(NONE)).toBe(false);
        expect(hasDuplicateRecipients({ ...NONE, toHead: true })).toBe(true);
        expect(hasDuplicateRecipients({ ...NONE, structureUserIds: [1] })).toBe(
            true,
        );
    });
});
