import { buildSearchPlan } from '../search-plan.builder';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSignalKind,
    SEARCH_VIA,
    SignalFieldRef,
    SignalFieldSource,
} from '../../type/duplicate.type';

const innField = (
    entityType: DuplicateEntityType,
    fieldName = 'UF_CRM_OP_INN',
): SignalFieldRef => ({
    entityType,
    kind: DuplicateSignalKind.INN,
    fieldName,
    source: SignalFieldSource.TEMPLATE,
    enabled: true,
});

const innFields = new Map<DuplicateEntityType, SignalFieldRef[]>([
    [DuplicateEntityType.LEAD, [innField(DuplicateEntityType.LEAD)]],
    [DuplicateEntityType.COMPANY, [innField(DuplicateEntityType.COMPANY)]],
    [DuplicateEntityType.CONTACT, []],
    [DuplicateEntityType.DEAL, [innField(DuplicateEntityType.DEAL)]],
]);

const ALL_TYPES = [
    DuplicateEntityType.LEAD,
    DuplicateEntityType.CONTACT,
    DuplicateEntityType.COMPANY,
    DuplicateEntityType.DEAL,
];

/** CATEGORY_ID воронки ОП Основная в тестах. */
const SALES_BASE_CATEGORY = 5;

const signals = {
    phones: ['9991234567', '9007654321'],
    emails: ['test@bitrix.com'],
    inns: ['7707083893'],
    titles: ['ромашка плюс'],
};

const plan = (over: Partial<Parameters<typeof buildSearchPlan>[0]> = {}) =>
    buildSearchPlan({
        signals,
        level: DuplicateSearchLevel.FAST,
        innFieldsByEntity: innFields,
        targetTypes: ALL_TYPES,
        dealCategoryBitrixIds: [SALES_BASE_CATEGORY],
        ...over,
    });

describe('buildSearchPlan', () => {
    it('L1: телефоны/email через findbycomm + ИНН по полям портала', () => {
        const commands = plan();

        const methods = commands.map(c => c.method);
        // 2 телефона по одному + 1 email + ИНН по лиду, компании и сделке.
        expect(
            methods.filter(m => m === 'crm.duplicate.findbycomm'),
        ).toHaveLength(3);
        expect(methods.filter(m => m === 'crm.lead.list')).toHaveLength(1);
        expect(methods.filter(m => m === 'crm.company.list')).toHaveLength(1);
        expect(methods.filter(m => m === 'crm.deal.list')).toHaveLength(1);
        // Уровень FAST не трогает реквизиты и подстрочный поиск.
        expect(methods).not.toContain('crm.requisite.list');
    });

    it('весь L1 умещается в один HTTP-запрос (батч режется по 50)', () => {
        expect(Math.ceil(plan().length / 50)).toBe(1);
    });

    it('deal-команды всегда ограничены CATEGORY_ID наших воронок', () => {
        const dealCommands = plan({
            level: DuplicateSearchLevel.DEEP,
        }).filter(c => c.method === 'crm.deal.list');

        expect(dealCommands.length).toBeGreaterThan(0);
        for (const command of dealCommands) {
            expect(
                (command.params.filter as Record<string, unknown>).CATEGORY_ID,
            ).toEqual([SALES_BASE_CATEGORY]);
        }
    });

    it('без сконфигурированных воронок сделки выпадают из плана целиком', () => {
        const commands = plan({
            level: DuplicateSearchLevel.DEEP,
            dealCategoryBitrixIds: [],
        });
        expect(commands.some(c => c.method === 'crm.deal.list')).toBe(false);
    });

    it('много телефонов не превращаются в много команд — чанки по 20', () => {
        const phones = Array.from({ length: 25 }, (_, i) =>
            String(9000000000 + i),
        );
        const commands = plan({
            signals: { ...signals, phones, emails: [], inns: [], titles: [] },
        });
        expect(commands).toHaveLength(2);
        expect(commands[0].params.values).toHaveLength(20);
        expect(commands[1].params.values).toHaveLength(5);
    });

    it('несколько ИНН идут одной командой на поле — Битрикс понимает массив как IN', () => {
        const commands = plan({
            signals: {
                phones: [],
                emails: [],
                inns: ['7707083893', '500100732259'],
                titles: [],
            },
            innFieldsByEntity: new Map([
                [
                    DuplicateEntityType.LEAD,
                    [innField(DuplicateEntityType.LEAD)],
                ],
                [
                    DuplicateEntityType.COMPANY,
                    [innField(DuplicateEntityType.COMPANY)],
                ],
                [DuplicateEntityType.CONTACT, []],
                [DuplicateEntityType.DEAL, []],
            ]),
        });
        expect(commands).toHaveLength(2);
        expect(commands[0].params.filter).toEqual({
            UF_CRM_OP_INN: ['7707083893', '500100732259'],
        });
    });

    it('L2 добавляет реквизиты и подстрочный поиск по названию', () => {
        const commands = plan({ level: DuplicateSearchLevel.DEEP });
        const methods = commands.map(c => c.method);
        expect(methods).toContain('crm.requisite.list');

        const titleSubstring = commands.filter(
            c =>
                c.meta.kind === DuplicateSignalKind.TITLE &&
                String(Object.keys(c.params.filter ?? {})[0] ?? '').startsWith(
                    '%',
                ),
        );
        // %TITLE у компании + %TITLE и %COMPANY_TITLE у лида.
        expect(titleSubstring).toHaveLength(3);
    });

    it('L2 ищет ИНН подстрокой в названиях (компания/лид/сделка) с весом innInTitle', () => {
        const commands = plan({ level: DuplicateSearchLevel.DEEP });
        const innInTitle = commands.filter(
            c =>
                c.meta.kind === DuplicateSignalKind.INN &&
                (c.meta.via === SEARCH_VIA.TITLE ||
                    c.meta.via === SEARCH_VIA.COMPANY_TITLE),
        );
        // COMPANY %TITLE + LEAD %TITLE + LEAD %COMPANY_TITLE + DEAL %TITLE.
        expect(innInTitle).toHaveLength(4);
        // Значение фильтра — сам ИНН.
        expect(innInTitle[0].params.filter).toMatchObject({
            [SEARCH_VIA.TITLE]: signals.inns[0],
        });
    });

    it('пустые сигналы дают пустой план — в Битрикс не ходим вовсе', () => {
        const commands = plan({
            signals: { phones: [], emails: [], inns: [], titles: [] },
            level: DuplicateSearchLevel.DEEP,
        });
        expect(commands).toHaveLength(0);
    });

    it('ключи команд уникальны — иначе батч потеряет часть ответов', () => {
        const commands = plan({ level: DuplicateSearchLevel.DEEP });
        expect(new Set(commands.map(c => c.cmd)).size).toBe(commands.length);
    });
});
