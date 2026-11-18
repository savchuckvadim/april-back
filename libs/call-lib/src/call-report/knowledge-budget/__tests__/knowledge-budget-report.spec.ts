import { POLYANSKY_METHODOLOGY } from '../../methodology/polyansky.methodology';
import type { ResolvedMethodology } from '../../methodology/methodology.types';
import { KNOWLEDGE_USES } from '../knowledge-budgets';
import { KnowledgeBudgetReportService } from '../knowledge-budget-report.service';
import {
    budgetKindsOf,
    buildKnowledgeBudgetReport,
    tokensOfChars,
    type KnowledgeBudgetCallType,
    type KnowledgeBudgetKindReport,
} from '../knowledge-budget-report.util';

const DOMAIN = 'gsr.bitrix24.ru';

const TYPES: KnowledgeBudgetCallType[] = [
    {
        code: 'cold',
        title: 'Холодный звонок',
        typedKind: 'call-analysis-cold',
        methodology: true,
    },
    {
        code: 'presentation',
        title: 'Презентация',
        typedKind: 'call-analysis-presentation',
        methodology: true,
    },
];

const KNOWLEDGE = POLYANSKY_METHODOLOGY.knowledge;

const kindOf = (
    kinds: readonly KnowledgeBudgetKindReport[],
    kind: string,
): KnowledgeBudgetKindReport => {
    const found = kinds.find(item => item.kind === kind);
    if (!found) throw new Error(`вида ${kind} нет в сводке`);
    return found;
};

describe('сводка бюджетов базы знаний', () => {
    it('оценка токенов округляется вверх', () => {
        expect(tokensOfChars(0)).toBe(0);
        expect(tokensOfChars(7)).toBe(3);
        expect(tokensOfChars(6000)).toBe(2000);
    });

    it('виды для чтения — всё, что читает конвейер по типам портала, без повторов', () => {
        const kinds = budgetKindsOf(TYPES, KNOWLEDGE);

        expect(new Set(kinds).size).toBe(kinds.length);
        expect(kinds).toEqual(
            expect.arrayContaining([
                'sales-script',
                'call-analysis-cold',
                'call-analysis-presentation',
                'presentation-playbook',
                'product-facts',
                'call-etalon',
            ]),
        );
    });

    it('вид длиннее бюджета: видно, сколько знаков помещается и сколько обрезано в каждом месте', () => {
        const kinds = buildKnowledgeBudgetReport({
            types: TYPES,
            knowledge: KNOWLEDGE,
            measures: [{ kind: 'sales-regulation', documents: 2, chars: 4200 }],
            titleOf: kind => `вид ${kind}`,
        });

        const regulation = kindOf(kinds, 'sales-regulation');
        expect(regulation).toMatchObject({
            title: 'вид sales-regulation',
            documents: 2,
            chars: 4200,
            tokens: 1400,
            cutChars: 1200,
        });
        const movement = regulation.uses.find(
            use => use.use === KNOWLEDGE_USES.focusMovement,
        );
        expect(movement).toMatchObject({
            budgetChars: 3000,
            fitChars: 3000,
            cutChars: 1200,
            callTypes: null,
        });
        // В проверке по регламенту бюджет больше — туда вид помещается целиком.
        const compliance = regulation.uses.find(
            use => use.use === KNOWLEDGE_USES.compliance,
        );
        expect(compliance).toMatchObject({
            budgetChars: 5000,
            fitChars: 4200,
            cutChars: 0,
        });
    });

    it('вид, нужный не всем типам, подписан типами звонков; пустой вид — нули', () => {
        const kinds = buildKnowledgeBudgetReport({
            types: TYPES,
            knowledge: KNOWLEDGE,
            measures: [],
            titleOf: kind => kind,
        });

        const playbook = kindOf(kinds, 'presentation-playbook');
        expect(playbook).toMatchObject({ documents: 0, chars: 0, cutChars: 0 });
        expect(
            playbook.uses.find(use => use.use === KNOWLEDGE_USES.focusShared)
                ?.callTypes,
        ).toEqual(['Презентация']);
        expect(
            kindOf(kinds, 'call-analysis-cold').uses.map(use => use.callTypes),
        ).toEqual([['Холодный звонок']]);
        // Скрипт читают все типы.
        expect(
            kindOf(kinds, 'sales-script').uses.every(
                use => use.callTypes === null,
            ),
        ).toBe(true);
    });

    it('без методики факты о продукте читает только проверка по регламенту', () => {
        const kinds = buildKnowledgeBudgetReport({
            types: TYPES.map(type => ({ ...type, methodology: false })),
            knowledge: undefined,
            measures: [],
            titleOf: kind => kind,
        });

        expect(kindOf(kinds, 'product-facts').uses.map(use => use.use)).toEqual(
            [KNOWLEDGE_USES.compliance],
        );
    });
});

describe('KnowledgeBudgetReportService', () => {
    const resolved: ResolvedMethodology = {
        methodology: POLYANSKY_METHODOLOGY,
        scope: 'common',
        source: 'builtin',
        versionTag: 'polyansky@1.0.0',
    };

    const makeDeps = (options?: {
        methodology?: ResolvedMethodology | null;
        compliance?: boolean | Error;
    }) => {
        const knowledgeContent = {
            readAll: jest.fn((_domain: string, kind: string) => {
                if (kind === 'call-etalon') {
                    return Promise.reject(new Error('папка недоступна'));
                }
                return Promise.resolve([
                    // Хранилище подмешивает общие материалы к любому виду.
                    { kind: 'general', text: 'общий текст' },
                    {
                        kind,
                        text: kind === 'product-facts' ? 'ф'.repeat(7500) : '',
                    },
                ]);
            }),
        };
        const callTypeRegistry = {
            resolve: jest.fn().mockResolvedValue({
                codes: ['cold', 'presentation'],
                types: {
                    cold: {
                        title: 'Холодный звонок',
                        knowledgeKind: 'call-analysis-cold',
                    },
                    presentation: {
                        title: 'Презентация',
                        knowledgeKind: 'call-analysis-presentation',
                    },
                },
            }),
        };
        const methodologyRegistry = {
            resolve: jest.fn().mockResolvedValue(options?.methodology ?? null),
        };
        const compliance = options?.compliance ?? true;
        const portalAiSettings = {
            getByDomain:
                compliance instanceof Error
                    ? jest.fn().mockRejectedValue(compliance)
                    : jest.fn().mockResolvedValue({
                          complianceReviewEnabled: compliance,
                      }),
        };
        const service = new KnowledgeBudgetReportService(
            knowledgeContent as never,
            callTypeRegistry as never,
            methodologyRegistry as never,
            portalAiSettings as never,
        );
        return { service, knowledgeContent };
    };

    it('портал с методикой: объём вида считается без подмешанных общих материалов, сбой вида — пустой вид', async () => {
        const { service, knowledgeContent } = makeDeps({
            methodology: resolved,
        });

        const report = await service.report(DOMAIN);

        expect(report).toMatchObject({
            domain: DOMAIN,
            charsPerToken: 3,
            complianceEnabled: true,
            methodology: {
                title: POLYANSKY_METHODOLOGY.title,
                displayTitle: 'Методика Полянского',
                version: POLYANSKY_METHODOLOGY.version,
                declaresKnowledge: true,
            },
        });
        const facts = kindOf(report.kinds, 'product-facts');
        expect(facts).toMatchObject({
            title: 'Факты о продукте, комплектах и ценах',
            documents: 1,
            chars: 7500,
            cutChars: 1500,
        });
        expect(facts.uses.map(use => use.use)).toEqual([
            KNOWLEDGE_USES.methodology,
            KNOWLEDGE_USES.compliance,
        ]);
        expect(kindOf(report.kinds, 'call-etalon')).toMatchObject({
            documents: 0,
            chars: 0,
        });
        // Общие материалы — отдельный вид со своим объёмом.
        expect(kindOf(report.kinds, 'general').chars).toBe(11);
        // Каждый вид читается один раз.
        const readKinds = knowledgeContent.readAll.mock.calls.map(
            call => call[1],
        );
        expect(new Set(readKinds).size).toBe(readKinds.length);
    });

    it('портал без методики и с непрочитанными настройками: методики нет, проверка по регламенту неизвестна', async () => {
        const { service } = makeDeps({
            compliance: new Error('база недоступна'),
        });

        const report = await service.report(DOMAIN);

        expect(report.methodology).toBeNull();
        expect(report.complianceEnabled).toBeNull();
        expect(kindOf(report.kinds, 'product-facts').uses).toHaveLength(1);
    });
});
