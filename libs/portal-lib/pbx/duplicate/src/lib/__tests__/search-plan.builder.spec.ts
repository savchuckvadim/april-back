import { buildSearchPlan } from '../search-plan.builder';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSignalKind,
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
    [DuplicateEntityType.DEAL, []],
]);

const ALL_TYPES = [
    DuplicateEntityType.LEAD,
    DuplicateEntityType.CONTACT,
    DuplicateEntityType.COMPANY,
    DuplicateEntityType.DEAL,
];

const signals = {
    phones: ['9991234567', '9007654321'],
    emails: ['test@bitrix.com'],
    inns: ['7707083893'],
    titles: ['ромашка плюс'],
};

describe('buildSearchPlan', () => {
    it('L1: телефоны/email через findbycomm + ИНН по полям портала', () => {
        const plan = buildSearchPlan({
            signals,
            level: DuplicateSearchLevel.FAST,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });

        const methods = plan.map(c => c.method);
        // 2 телефона по одному + 1 email + ИНН по лиду и компании.
        expect(
            methods.filter(m => m === 'crm.duplicate.findbycomm'),
        ).toHaveLength(3);
        expect(methods.filter(m => m === 'crm.lead.list')).toHaveLength(1);
        expect(methods.filter(m => m === 'crm.company.list')).toHaveLength(1);
        // Уровень FAST не трогает реквизиты и подстрочный поиск.
        expect(methods).not.toContain('crm.requisite.list');
    });

    it('весь L1 умещается в один HTTP-запрос (батч режется по 50)', () => {
        const plan = buildSearchPlan({
            signals,
            level: DuplicateSearchLevel.FAST,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        expect(Math.ceil(plan.length / 50)).toBe(1);
    });

    it('много телефонов не превращаются в много команд — чанки по 20', () => {
        const phones = Array.from({ length: 25 }, (_, i) =>
            String(9000000000 + i),
        );
        const plan = buildSearchPlan({
            signals: { ...signals, phones, emails: [], inns: [], titles: [] },
            level: DuplicateSearchLevel.FAST,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        expect(plan).toHaveLength(2);
        expect(plan[0].params.values).toHaveLength(20);
        expect(plan[1].params.values).toHaveLength(5);
    });

    it('несколько ИНН идут одной командой на поле — Битрикс понимает массив как IN', () => {
        const plan = buildSearchPlan({
            signals: {
                phones: [],
                emails: [],
                inns: ['7707083893', '500100732259'],
                titles: [],
            },
            level: DuplicateSearchLevel.FAST,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        expect(plan).toHaveLength(2);
        expect(plan[0].params.filter).toEqual({
            UF_CRM_OP_INN: ['7707083893', '500100732259'],
        });
    });

    it('L2 добавляет реквизиты и подстрочный поиск по названию', () => {
        const plan = buildSearchPlan({
            signals,
            level: DuplicateSearchLevel.DEEP,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        const methods = plan.map(c => c.method);
        expect(methods).toContain('crm.requisite.list');

        const substring = plan.filter(c =>
            String(Object.keys(c.params.filter ?? {})[0] ?? '').startsWith('%'),
        );
        // %TITLE у компании + %TITLE и %COMPANY_TITLE у лида.
        expect(substring).toHaveLength(3);
    });

    it('пустые сигналы дают пустой план — в Битрикс не ходим вовсе', () => {
        const plan = buildSearchPlan({
            signals: { phones: [], emails: [], inns: [], titles: [] },
            level: DuplicateSearchLevel.DEEP,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        expect(plan).toHaveLength(0);
    });

    it('ключи команд уникальны — иначе батч потеряет часть ответов', () => {
        const plan = buildSearchPlan({
            signals,
            level: DuplicateSearchLevel.DEEP,
            innFieldsByEntity: innFields,
            targetTypes: ALL_TYPES,
        });
        expect(new Set(plan.map(c => c.cmd)).size).toBe(plan.length);
    });
});
