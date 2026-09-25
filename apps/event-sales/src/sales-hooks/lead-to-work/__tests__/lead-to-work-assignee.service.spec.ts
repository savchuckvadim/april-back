import { LeadToWorkAssigneeService } from '../services/lead-to-work-assignee.service';
import { buildLeadToWorkItem } from '../dto/lead-to-work.dto';

/** Структура: два ОП (15 и 20), в ОП 15 группа 16. */
const makeStructure = () => ({
    getStructure: jest.fn().mockResolvedValue({
        department: {
            department: 0,
            generalDepartment: [],
            // Подотделы ОП 15: «Группа А» (попадает в groups) и «Сектор
            // Липецк» — обычный подотдел, в groups его нет, но именно такой
            // Битрикс присылает по маппингу кода партнёра.
            childrenDepartments: [
                {
                    ID: 16,
                    NAME: 'Группа А',
                    PARENT: 15,
                    USERS: [
                        { ID: 5, ACTIVE: true },
                        { ID: 3, ACTIVE: true },
                    ],
                },
                {
                    ID: 21,
                    NAME: 'Сектор Липецк',
                    PARENT: 15,
                    USERS: [{ ID: 5, ACTIVE: true }],
                },
                { ID: 22, NAME: 'Сектор Пустой', PARENT: 15, USERS: [] },
            ],
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

/** Настройки портала: соответствие «Отдел строка» → отдел продаж. */
const makeSettings = (aliases = '') => ({
    resolve: jest
        .fn()
        .mockResolvedValue({ leadIntakeDepartmentAliases: aliases }),
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
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ responsible: 7 }),
        );
        expect(result).toMatchObject({ responsible: 7, source: 'explicit' });
        expect(structure.getStructure).not.toHaveBeenCalled();
    });

    /*
     * Адресная передача заявки (кнопка «Передать другому» с выбором
     * сотрудника): фронт шлёт responsible ВМЕСТЕ с excludeResponsible и
     * transferredBy. Выбранный человек обязан победить — ни круг, ни
     * исключение прежнего не имеют права его перебить.
     */
    it('адресная передача: явный responsible сильнее excludeResponsible/department', async () => {
        const structure = makeStructure();
        const service = new LeadToWorkAssigneeService(
            structure as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({
                responsible: 3,
                excludeResponsible: 5,
                transferredBy: 5,
                department: '20',
            }),
        );
        expect(result).toMatchObject({ responsible: 3, source: 'explicit' });
        expect(result.warnings).toEqual([]);
        expect(structure.getStructure).not.toHaveBeenCalled();
    });

    /*
     * Вырожденный случай: выбранный адресат совпал с исключаемым (менеджер
     * выбрал сам себя). Явный выбор всё равно главнее — иначе кнопка
     * молча отдала бы заявку случайному человеку.
     */
    it('адресная передача: responsible == excludeResponsible не перекидывает заявку', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ responsible: 5, excludeResponsible: 5, transferredBy: 5 }),
        );
        expect(result.responsible).toBe(5);
        expect(result.source).toBe('explicit');
    });

    it('round-robin по отделу из намёка: курсор идёт по кругу', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
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
            makeSettings() as never,
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
            makeSettings() as never,
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
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'D_16' }),
        );
        expect(result.departmentKey).toBe('group_16');
        expect([3, 5]).toContain(result.responsible);
    });

    /*
     * Маппинг «код партнёра → подразделение» держит Битрикс и присылает id
     * (или название) подотдела внутри ОП. Такой подотдел не обязан называться
     * «Группа …» — если искать только в groups, верный намёк превратился бы
     * в выбор по всем отделам продаж, и заявка уехала бы не туда.
     */
    it('намёк id подотдела ОП (не «Группа …») выбирает его сотрудников', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '21' }),
        );
        expect(result.departmentKey).toBe('dep_21');
        expect(result.responsible).toBe(5);
        expect(result.warnings).toEqual([]);
    });

    it('намёк названием подотдела («Сектор Липецк») тоже матчит', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'Сектор Липецк' }),
        );
        expect(result.departmentKey).toBe('dep_21');
        expect(result.responsible).toBe(5);
    });

    it('подотдел без сотрудников → родительский ОП + warning (а не все ОП)', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '22' }),
        );
        expect(result.departmentKey).toBe('op_15');
        expect([3, 5]).toContain(result.responsible);
        expect(result.warnings.join(' ')).toContain('Сектор Пустой');
    });

    /*
     * Требование владельца 18.09.2026: круг идёт ТОЛЬКО внутри целевого
     * отдела. Раньше ненайденный отдел означал выбор по всем ОП, и заявка
     * Питера могла уехать в Воронеж или Ростов. Неназначенную заявку видно
     * и её разберут, уехавшую в чужой город замечают через сутки.
     */
    it('отдел не найден → никого не назначаем, а не круг по всем ОП', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '999' }),
        );
        expect(result.warnings.join(' ')).toContain('999');
        expect(result.departmentKey).toBe('none');
        expect(result.responsible).toBeNull();
    });

    it('передача: excludeResponsible не выбирается (заявка не возвращается)', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
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
            makeSettings() as never,
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

    /*
     * Конвертация (isXo=N) НИЧЕГО не перераспределяет: работа остаётся у
     * менеджера, который уже ведёт лид. Round-robin здесь был бы вредом —
     * сделка уехала бы случайному сотруднику вместо владельца заявки.
     */
    it('конвертация без responsible: ответственный берётся с лида, круг не крутится', async () => {
        const structure = makeStructure();
        const appCache = makeAppCache();
        const service = new LeadToWorkAssigneeService(
            structure as never,
            appCache as never,
            makeSettings() as never,
        );
        const result = await service.resolve('d.b24.ru', item(), {
            leadResponsibleId: 77,
            keepLeadResponsible: true,
        });
        expect(result).toMatchObject({ responsible: 77, source: 'lead' });
        expect(result.warnings).toEqual([]);
        // Ни структура, ни курсор round-robin не тронуты.
        expect(structure.getStructure).not.toHaveBeenCalled();
        expect(appCache.set).not.toHaveBeenCalled();
    });

    it('конвертация без ответственного у лида → round-robin + предупреждение', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
            { leadResponsibleId: null, keepLeadResponsible: true },
        );
        expect(result.source).toBe('round-robin');
        expect([3, 5]).toContain(result.responsible);
        expect(result.warnings.join(' ')).toContain('не задан ответственный');
    });

    /* ХО распределяет заявку по кругу даже при живом ответственном лида. */
    it('ХО (keepLeadResponsible=false) игнорирует ответственного лида', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
            { leadResponsibleId: 77, keepLeadResponsible: false },
        );
        expect(result.source).toBe('round-robin');
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
            makeSettings() as never,
        );
        const result = await service.resolve('d.b24.ru', item());
        expect(result.responsible).toBeNull();
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});

/**
 * Ночная заявка 18.09.2026: бизнес-процесс написал в лид «Питер», отдел на
 * портале называется «ОП САНКТ-ПЕТЕРБУРГ (ОП)», сравнение по вхождению их не
 * связало — заявка ушла в общий круг, то есть в Воронеж.
 */
describe('LeadToWorkAssigneeService — город из «Отдел строка»', () => {
    it('город по настройке портала находит свой отдел', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings('Питер=ОП 1; Ростов=ОП 2') as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'Питер' }),
        );

        expect(result).toMatchObject({
            departmentKey: 'op_15',
            source: 'round-robin',
        });
        expect([3, 5]).toContain(result.responsible);
    });

    it('справа можно указать id отдела', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings('Питер=15') as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'питер ' }),
        );

        expect(result.departmentKey).toBe('op_15');
    });

    /*
     * Без настройки город узнаётся справочником написаний: «Питер» и
     * «ОП САНКТ-ПЕТЕРБУРГ (ОП)» — один город.
     */
    it('город узнаётся по справочнику написаний и без настройки', async () => {
        const structure = makeStructure();
        structure.getStructure.mockResolvedValue({
            department: { childrenDepartments: [], allUsers: [] },
            salesDepartments: [
                {
                    department: { ID: 37, NAME: 'ОП САНКТ-ПЕТЕРБУРГ (ОП)' },
                    groups: [],
                    allUsers: [{ ID: 11, ACTIVE: true }],
                },
                {
                    department: { ID: 63, NAME: 'ОП Воронеж (ОП)' },
                    groups: [],
                    allUsers: [{ ID: 12, ACTIVE: true }],
                },
            ],
        });
        const service = new LeadToWorkAssigneeService(
            structure as never,
            makeAppCache() as never,
            makeSettings('') as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'Питер' }),
        );

        expect(result.departmentKey).toBe('op_37');
        expect(result.responsible).toBe(11);
    });

    it('незнакомый город без настройки — никого не назначаем', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings('') as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: 'Питер' }),
        );

        expect(result.departmentKey).toBe('none');
        expect(result.responsible).toBeNull();
    });

    /*
     * Требование владельца 22.09.2026: уволенные в круге не участвуют.
     * Структура отделов кешируется на сутки, поэтому перед выбором
     * спрашиваем портал заново, кто из кандидатов ещё работает.
     */
    it('уволенный кандидат исключается по живой проверке', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
            { activeUserIds: () => Promise.resolve(new Set([5])) },
        );

        // Кандидаты ОП 15 — 3 и 5; работает только 5.
        expect(result.responsible).toBe(5);
    });

    it('все кандидаты уволены — никого не назначаем', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
            { activeUserIds: () => Promise.resolve(new Set<number>()) },
        );

        expect(result.responsible).toBeNull();
        expect(result.warnings.join(' ')).toContain('уволены');
    });

    it('проверка не удалась — круг по структуре и предупреждение', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings() as never,
        );

        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
            { activeUserIds: () => Promise.reject(new Error('portal down')) },
        );

        expect([3, 5]).toContain(result.responsible);
        expect(result.warnings.join(' ')).toContain('portal down');
    });

    it('отдел в лиде пустой — предупреждение, что выбор по всем ОП', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            makeSettings('Питер=ОП 1') as never,
        );

        const result = await service.resolve('d.b24.ru', item());

        expect(result.warnings.join(' ')).toContain('Отдел заявки не указан');
    });
});

/*
 * ИСКЛЮЧЕНИЯ ИЗ КРУГА (настройка портала, 25.09.2026): стажёры, отпуск —
 * круг им заявки не раздаёт, адресно назначить можно.
 */
describe('LeadToWorkAssigneeService — исключения из круга', () => {
    const settingsWith = (excluded: string) => ({
        resolve: jest.fn().mockResolvedValue({
            leadIntakeDepartmentAliases: '',
            leadIntakeRoundRobinExcludedUserIds: excluded,
        }),
    });

    it('исключённый сотрудник не получает заявку по кругу', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            settingsWith('5') as never,
        );
        for (let i = 0; i < 4; i += 1) {
            const result = await service.resolve(
                'd.b24.ru',
                item({ department: '15' }),
            );
            expect(result.source).toBe('round-robin');
            expect(result.responsible).toBe(3);
        }
    });

    it('адресное назначение исключённому работает', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            settingsWith('5') as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ responsible: 5 }),
        );
        expect(result).toMatchObject({ responsible: 5, source: 'explicit' });
    });

    it('исключены все — распределяем среди них с предупреждением', async () => {
        const service = new LeadToWorkAssigneeService(
            makeStructure() as never,
            makeAppCache() as never,
            settingsWith('3, 5') as never,
        );
        const result = await service.resolve(
            'd.b24.ru',
            item({ department: '15' }),
        );
        expect([3, 5]).toContain(result.responsible);
        expect(result.warnings.join(' ')).toContain('исключены из круга');
    });
});
