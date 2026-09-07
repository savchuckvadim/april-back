import { DigestItem } from '@lib/sales-ai-analytics';
import {
    buildDigestAllMessage,
    DIGEST_ALL_MESSAGE_TITLE,
    DIGEST_ALL_NO_CALLS,
    DIGEST_ALL_SUMMARY_TITLE,
    DigestAllDepartmentEntry,
    groupDigestAll,
    summaryLines,
} from '../delivery/ai-analytics-digest-all-message.util';
import { ManagerOrg } from '../domain/loaders/manager-org.loader';

const LINK = 'https://april.bitrix24.ru/crm/type/1054/details/77/';

function item(
    transcriptionId: string,
    section: string,
    alternatives: string[],
    hourUtc = 8,
): DigestItem {
    return {
        transcriptionId,
        callStartedAt: new Date(
            `2026-09-04T${String(hourUtc).padStart(2, '0')}:20:00Z`,
        ),
        section,
        asWas: 'Было',
        alternatives,
    };
}

const org = new Map<number, ManagerOrg>([
    [10, { departmentId: 5, departmentName: 'Отдел продаж 1', groupId: null }],
    [20, { departmentId: 5, departmentName: 'Отдел продаж 1', groupId: 7 }],
    [30, { departmentId: 6, departmentName: null, groupId: null }],
]);
const names = new Map([
    ['10', 'Иванов Иван'],
    ['20', 'Петров Пётр'],
    ['30', 'Сидоров Сидор'],
]);

describe('groupDigestAll (сводный дайджест: ростер по отделам)', () => {
    it('группирует ростер по отделам, менеджеры по имени, лимит 3 звонка, чужой менеджер — «Без отдела»', () => {
        const byManager = new Map<string, DigestItem[]>([
            [
                '10',
                [
                    item('a1', 'NEEDS', ['1']),
                    item('a2', 'CLOSING', ['2']),
                    item('a3', 'NEEDS', ['3']),
                    item('a4', 'NEEDS', ['4']),
                ],
            ],
            ['99', [item('z1', 'NEEDS', ['z'])]],
        ]);
        const departments = groupDigestAll({
            roster: [30, 20, 10],
            org,
            byManager,
            names,
        });
        expect(departments.map(d => d.title)).toEqual([
            'Отдел #6',
            'Отдел продаж 1',
            'Без отдела',
        ]);
        const sales = departments[1];
        expect(sales.managers.map(m => m.name)).toEqual([
            'Иванов Иван',
            'Петров Пётр',
        ]);
        expect(sales.managers[0].items.map(i => i.transcriptionId)).toEqual([
            'a1',
            'a2',
            'a3',
        ]);
        expect(sales.managers[1].items).toEqual([]);
        expect(departments[2].managers).toEqual([
            { managerId: '99', name: '#99', items: byManager.get('99') },
        ]);
    });

    it('пустой ростер и пустой день → нет отделов', () => {
        expect(
            groupDigestAll({
                roster: [],
                org: new Map(),
                byManager: new Map(),
                names: new Map(),
            }),
        ).toEqual([]);
    });
});

describe('buildDigestAllMessage (текст сводного дайджеста)', () => {
    const departments: DigestAllDepartmentEntry[] = [
        {
            departmentId: 5,
            title: 'Отдел продаж 1',
            managers: [
                {
                    managerId: '10',
                    name: 'Иванов Иван',
                    items: [
                        item('a1', 'NEEDS', [
                            'Давайте назначим дату',
                            'Вторая',
                        ]),
                        item('a2', 'CLOSING', ['Зафиксируем шаг'], 9),
                        item('a3', 'NEEDS', ['Ещё раз про дату'], 10),
                    ],
                },
                { managerId: '20', name: 'Петров Пётр', items: [] },
            ],
        },
        {
            departmentId: null,
            title: 'Без отдела',
            managers: [{ managerId: '30', name: 'Сидоров Сидор', items: [] }],
        },
    ];

    it('заголовок с датой, отделы, ≤ 3 звонка с одной лучшей фразой и ссылкой, «звонков не было», итог «кому что»', () => {
        const text = buildDigestAllMessage({
            day: '2026-09-04',
            timeZone: 'Europe/Moscow',
            departments,
            links: new Map([['a1', LINK]]),
        });
        expect(text).toContain(
            `[B]${DIGEST_ALL_MESSAGE_TITLE}[/B] (04.09.2026)`,
        );
        expect(text).toContain('[B]Отдел продаж 1[/B]');
        expect(text).toContain('Иванов Иван');
        expect(text).toContain(
            '  1. 04.09, 11:20 · Выявление потребностей — «Давайте назначим дату»',
        );
        expect(text).not.toContain('Вторая'); // только одна лучшая формулировка
        expect(text).toContain(`     Разбор: ${LINK}`);
        expect(text.split('Разбор:')).toHaveLength(2);
        expect(text).toContain('  3. 04.09, 13:20 · Выявление потребностей');
        expect(text).toContain(`${DIGEST_ALL_NO_CALLS}: Петров Пётр`);
        expect(text).toContain('[B]Без отдела[/B]');
        expect(text).toContain(`${DIGEST_ALL_NO_CALLS}: Сидоров Сидор`);
        expect(text).toContain(DIGEST_ALL_SUMMARY_TITLE);
        expect(text).toContain(
            '— Иванов Иван: Выявление потребностей, Закрытие разговора',
        );
        expect(text).not.toContain('— Петров Пётр');
    });

    it('пустой день → заголовок и «Звонков не было», без отделов и итога', () => {
        const text = buildDigestAllMessage({
            day: '2026-09-04',
            timeZone: 'Europe/Moscow',
            departments: departments.map(d => ({
                ...d,
                managers: d.managers.map(m => ({ ...m, items: [] })),
            })),
            links: new Map(),
        });
        expect(text).toBe(
            `[B]${DIGEST_ALL_MESSAGE_TITLE}[/B] (04.09.2026)\n${DIGEST_ALL_NO_CALLS}.`,
        );
        expect(summaryLines([])).toEqual([]);
    });
});
