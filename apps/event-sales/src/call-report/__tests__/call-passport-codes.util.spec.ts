import {
    resolveDealCodes,
    resolveLeadStatusTitle,
} from '../services/call-passport-codes.util';

/** Слепок портала: две воронки pbx (title пустой — берётся name) и статусы лида. */
const portal = {
    getDealCategories: () => [
        {
            bitrixId: '0',
            code: 'sales_base',
            name: 'ОП Основная',
            title: '',
            stages: [
                {
                    code: 'sales_pres',
                    bitrixId: 'PREPARATION',
                    name: 'Презентация',
                    title: '',
                },
            ],
        },
        {
            bitrixId: '5',
            code: 'sales_presentation',
            name: 'Презентации',
            title: 'ОП Презентации',
            stages: [
                {
                    code: 'sales_presentation_presentation',
                    bitrixId: 'C5:EXECUTING',
                    name: 'Показ',
                    title: 'Презентация',
                },
            ],
        },
    ],
    getLeadCategories: () => [
        { stages: [{ bitrixId: 'IN_PROCESS', name: 'В работе', title: '' }] },
    ],
} as never;

describe('resolveDealCodes — pbx-коды и названия воронки/стадии по слепку', () => {
    it('воронка и стадия из pbx: коды и русские названия (title важнее name)', () => {
        expect(resolveDealCodes(portal, '5', 'C5:EXECUTING')).toEqual({
            categoryCode: 'sales_presentation',
            categoryTitle: 'ОП Презентации',
            stageCode: 'sales_presentation_presentation',
            stageTitle: 'Презентация',
        });
    });

    it('без CATEGORY_ID — основная воронка; стадия с префиксом сверяется по суффиксу', () => {
        expect(resolveDealCodes(portal, null, 'C0:PREPARATION')).toEqual({
            categoryCode: 'sales_base',
            categoryTitle: 'ОП Основная',
            stageCode: 'sales_pres',
            stageTitle: 'Презентация',
        });
    });

    it('стадия не из pbx — код и название стадии пусты, воронка известна', () => {
        expect(resolveDealCodes(portal, '0', 'UC_UNKNOWN')).toEqual({
            categoryCode: 'sales_base',
            categoryTitle: 'ОП Основная',
            stageCode: null,
            stageTitle: null,
        });
        expect(resolveDealCodes(portal, '0', null)).toMatchObject({
            stageCode: null,
            stageTitle: null,
        });
    });

    it('чужая воронка или сломанный слепок → null (fail-open)', () => {
        expect(resolveDealCodes(portal, '28', 'SERVICE:NEW')).toBeNull();
        const broken = {
            getDealCategories: () => {
                throw new Error('нет воронок');
            },
        } as never;
        expect(resolveDealCodes(broken, '0', 'PREPARATION')).toBeNull();
    });
});

describe('resolveLeadStatusTitle — название статуса лида по слепку', () => {
    it('статус из pbx — название; чужой, пустой статус и слепок без лидов — null', () => {
        expect(resolveLeadStatusTitle(portal, 'IN_PROCESS')).toBe('В работе');
        expect(resolveLeadStatusTitle(portal, 'UC_X')).toBeNull();
        expect(resolveLeadStatusTitle(portal, null)).toBeNull();
        const broken = {
            getLeadCategories: () => {
                throw new Error('нет лидов');
            },
        } as never;
        expect(resolveLeadStatusTitle(broken, 'IN_PROCESS')).toBeNull();
    });
});
