jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { createElement } from 'react';
import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../model/offer-document-settings.type';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { classicTemplate } from '../templates/classic/classic.template';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { iskraTemplate } from '../templates/iskra/iskra.template';
import { MONOCHROME_THEME } from '../templates/monochrome/monochrome.theme';
import type { OfferPdfTheme } from '../templates/kit/theme/offer-pdf-theme';
import {
    hasInfoblocksToPrint,
    OfferInfoblocks,
} from '../templates/kit/infoblocks';
import {
    estimateAlternativeBlockHeadHeight,
    estimateAlternativeSetHeadHeight,
} from '../templates/kit/infoblocks/alternative-head.util';
import {
    ALTERNATIVE_BLOCK_TITLE,
    printedAlternativeSets,
} from '../templates/kit/infoblocks/alternative-sets.util';
import { estimateComplectHeadHeight } from '../templates/kit/infoblocks/complect-head.util';
import {
    ALTERNATIVE_BLOCK_MARGIN_TOP,
    COMPLECT_HEAD_MARGIN_TOP_UNDER_SET,
    LIST_GROUP_HEAD,
    SPLIT_PRESENCE,
    complectTitleSize,
} from '../templates/kit/infoblocks/infoblocks.layout';
import { infoblocksStyles } from '../templates/kit/infoblocks/infoblocks.styles';
import {
    createAlternativeSetFixture,
    createComplectSectionFixture,
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
} from './fixtures/offer-pdf-model.fixture';
import {
    expandHost,
    flattenHost,
    hostText,
    unbreakableWith,
    type HostNode,
} from './helpers/host-tree';
import { collectTexts } from './helpers/react-pdf.mock';

/**
 * Блок «Наполнение наборов для сравнения»: после наполнения общего набора идёт
 * общий заголовок блока, затем у каждого набора плашка с заголовком и разделы
 * его комплектов в том же виде и режиме описаний, что выбраны настройками PDF.
 * Без IsAlternativeComplects документ печатается как раньше.
 */
const block = (
    name: string,
    description = 'описание',
): IInfblockRenderData => ({
    name,
    infoblock: name,
    smallDescription: `Кратко: ${description}`,
    mediumDescription: `Средне: ${description}`,
    bigDescription: `Много: ${description}`,
});

const groupOf = (
    groupsName: string,
    ...blocks: IInfblockRenderData[]
): IInfblockGroupsRenderData => ({ groupsName, infoblocks: blocks });

const common = [groupOf('Общая группа', block('Общий блок', 'общее описание'))];
const alpha = [
    groupOf(
        'Группа Альфа',
        block('Блок Альфа 1', 'первый блок альфы'),
        block('Блок Альфа 2', 'второй блок альфы'),
    ),
];
const beta = [
    groupOf('Группа Бета', block('Блок Бета 1', 'первый блок беты')),
    groupOf('Группа Гамма', block('Блок Гамма 1', 'блок гаммы')),
];
const delta = [groupOf('Группа Дельта', block('Блок Дельта 1', 'дельта'))];

/** Данные с двумя наборами для сравнения: у первого один комплект, у второго два */
const dataWith = (
    over: Partial<OfferPdfDocumentModel['data']> = {},
): OfferPdfDocumentModel['data'] =>
    createOfferRenderDataFixture({
        infoblocksByGroups: common,
        ComplectSections: undefined,
        IsComplectsSeparate: undefined,
        AlternativeComplectSections: [
            createAlternativeSetFixture(1, [
                createComplectSectionFixture(
                    'Комплект Альфа',
                    'Интернет 3 ОД',
                    alpha,
                ),
            ]),
            createAlternativeSetFixture(2, [
                createComplectSectionFixture(
                    'Комплект Бета',
                    'Интернет 1 ОД',
                    beta,
                ),
                createComplectSectionFixture('Комплект Дельта', '', delta),
            ]),
        ],
        IsAlternativeComplects: true,
        ...over,
    });

const modelWith = (
    settings: Partial<OfferPdfSettings> = {},
    data = dataWith(),
): OfferPdfDocumentModel =>
    createOfferPdfModelFixture({
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
        data,
    });

const renderTexts = (
    settings: Partial<OfferPdfSettings> = {},
    data = dataWith(),
): string =>
    collectTexts(classicTemplate.render(modelWith(settings, data))).join('\n');

/** Описание длиннее KEEP_WHOLE_LINES строк списка: пункт режется по странице */
const LONG_TEXT = 'очень длинное описание. '.repeat(80);

const sectionTree = (
    settings: Partial<OfferPdfSettings> = {},
    data = dataWith(),
    theme: OfferPdfTheme = CLASSIC_THEME,
): HostNode[] =>
    flattenHost(
        expandHost(
            createElement(OfferInfoblocks, {
                model: modelWith(settings, data),
                theme,
            }),
        ),
    );

/** Стиль узла: массив стилей (стиль заголовка раздела и поверх него свой) сложен в один объект */
const mergedStyle = (node: HostNode | undefined): Record<string, unknown> => {
    const parts = node?.props.style as
        | Array<Record<string, unknown>>
        | undefined;
    return (parts ?? []).reduce<Record<string, unknown>>(
        (merged, part) => ({ ...merged, ...part }),
        {},
    );
};

/** Позиции подстрок в порядке списка; -1 — подстроки в тексте нет */
const positions = (text: string, items: string[]): number[] =>
    items.map(item => text.indexOf(item));

const inOrder = (indexes: number[]): boolean =>
    indexes.every(index => index >= 0) &&
    [...indexes].sort((a, b) => a - b).every((v, i) => v === indexes[i]);

describe('наполнение наборов для сравнения: вид блока', () => {
    it('после наполнения общего набора: общий заголовок блока, у набора плашка, у комплекта подзаголовок и наполнение', () => {
        const text = renderTexts();

        expect(
            inOrder(
                positions(text, [
                    'Информационное наполнение',
                    'Общая группа',
                    'Общий блок',
                    ALTERNATIVE_BLOCK_TITLE,
                    'Набор 1',
                    'Комплект Альфа',
                    'Интернет 3 ОД',
                    'Группа Альфа',
                    'Блок Альфа 1',
                    'Блок Альфа 2',
                    'Набор 2',
                    'Комплект Бета',
                    'Интернет 1 ОД',
                    'Группа Бета',
                    'Блок Бета 1',
                    'Группа Гамма',
                    'Блок Гамма 1',
                    'Комплект Дельта',
                    'Группа Дельта',
                    'Блок Дельта 1',
                ]),
            ),
        ).toBe(true);
    });

    it('общий заголовок блока и заголовок раздела печатаются по одному разу', () => {
        const text = renderTexts();

        expect(text.match(/Информационное наполнение/g)).toHaveLength(1);
        expect(text.match(/Наполнение наборов для сравнения/g)).toHaveLength(1);
    });

    it('наполнение комплекта набора печатается один раз и не заходит в соседний набор', () => {
        const text = renderTexts();

        for (const name of ['Блок Альфа 1', 'Блок Бета 1', 'Блок Дельта 1']) {
            expect(text.split(name)).toHaveLength(2);
        }
        expect(text.indexOf('Блок Бета 1')).toBeGreaterThan(
            text.indexOf('Набор 2'),
        );
        expect(text.indexOf('Блок Альфа 1')).toBeLessThan(
            text.indexOf('Набор 2'),
        );
    });

    it('наполнение общего набора остаётся прежним: объединённый список и название набора', () => {
        const text = renderTexts(
            {},
            dataWith({ GeneralProductName: 'Общее название набора' }),
        );

        expect(text).toContain('Общее название набора');
        expect(text).toContain('Общий блок');
        expect(text.indexOf('Общий блок')).toBeLessThan(
            text.indexOf(ALTERNATIVE_BLOCK_TITLE),
        );
    });

    it('общий набор по комплектам: его разделы идут до блока наборов для сравнения', () => {
        const text = renderTexts(
            {},
            dataWith({
                IsComplectsSeparate: true,
                ComplectSections: [
                    createComplectSectionFixture(
                        'Комплект Общий',
                        'Интернет 5 ОД',
                        common,
                    ),
                ],
            }),
        );

        expect(
            inOrder(
                positions(text, [
                    'Комплект Общий',
                    'Общий блок',
                    ALTERNATIVE_BLOCK_TITLE,
                    'Набор 1',
                ]),
            ),
        ).toBe(true);
    });

    it('набор без заголовка печатается как «Набор N»', () => {
        const text = renderTexts(
            {},
            dataWith({
                AlternativeComplectSections: [
                    {
                        ...createAlternativeSetFixture(3, [
                            createComplectSectionFixture(
                                'Комплект Бета',
                                '',
                                beta,
                            ),
                        ]),
                        AlternativeSetTitle: '  ',
                    },
                ],
            }),
        );

        expect(text).toContain('Набор 3');
    });

    it('набор без комплекта с наполнением пропускается, остальные печатаются', () => {
        const text = renderTexts(
            {},
            dataWith({
                AlternativeComplectSections: [
                    createAlternativeSetFixture(1, [
                        createComplectSectionFixture('Комплект Пустой', '', []),
                    ]),
                    createAlternativeSetFixture(2, [
                        createComplectSectionFixture('Комплект Бета', '', beta),
                    ]),
                ],
            }),
        );

        expect(text).not.toContain('Набор 1');
        expect(text).not.toContain('Комплект Пустой');
        expect(text).toContain('Набор 2');
        expect(text).toContain('Блок Бета 1');
    });

    it('у всех наборов наполнения нет — блока нет, документ печатается как раньше', () => {
        const withoutBlock = renderTexts(
            {},
            dataWith({
                AlternativeComplectSections: [
                    createAlternativeSetFixture(1, [
                        createComplectSectionFixture('Комплект Пустой', '', []),
                    ]),
                ],
            }),
        );
        const plain = renderTexts(
            {},
            dataWith({
                AlternativeComplectSections: undefined,
                IsAlternativeComplects: undefined,
            }),
        );

        expect(withoutBlock).not.toContain(ALTERNATIVE_BLOCK_TITLE);
        expect(withoutBlock).toBe(plain);
    });

    it('комплект набора без названия и поставки печатается без подзаголовка, плашка набора остаётся', () => {
        const data = dataWith({
            AlternativeComplectSections: [
                createAlternativeSetFixture(1, [
                    createComplectSectionFixture('', '', delta),
                ]),
            ],
        });
        const text = renderTexts({}, data);

        expect(text).toContain('Набор 1');
        expect(text).toContain('Блок Дельта 1');
        const [outer] = unbreakableWith(sectionTree({}, data), 'Блок Дельта 1');
        expect(hostText(outer)).toContain(ALTERNATIVE_BLOCK_TITLE);
        expect(hostText(outer)).toContain('Набор 1');
        expect(hostText(outer)).toContain('Группа Дельта');
    });

    it('блок печатается и тогда, когда наполнения общего набора в данных нет', () => {
        const text = renderTexts({}, dataWith({ infoblocksByGroups: [] }));

        expect(text).toContain('Информационное наполнение');
        expect(text).toContain(ALTERNATIVE_BLOCK_TITLE);
        expect(text).toContain('Блок Альфа 1');
        expect(text).not.toContain('Общий блок');
    });
});

describe('наполнение наборов для сравнения: режим описаний и вид из настроек PDF', () => {
    it('описания по режиму: нет, мало, средне, много — в каждом комплекте набора', () => {
        const none = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(none).toContain('Блок Альфа 1');
        expect(none).not.toContain('первый блок альфы');

        const small = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.SMALL,
        });
        expect(small).toContain('Кратко: первый блок альфы');
        expect(small).toContain('Кратко: блок гаммы');

        const medium = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.MEDIUM,
        });
        expect(medium).toContain('Средне: первый блок беты');

        const big = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        });
        expect(big).toContain('Много: первый блок альфы');
        expect(big).toContain('Много: дельта');
        expect(big).not.toContain('Кратко: первый блок альфы');
    });

    it('таблица с разделами: названия групп комплектов в таблице; таблица без разделов: названий групп нет', () => {
        const withGroups = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(withGroups).toContain('Набор 2');
        expect(withGroups).toContain('Группа Бета');
        expect(withGroups).toContain('Группа Гамма');

        const plain = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(plain).toContain('Набор 2');
        expect(plain).toContain('Комплект Бета');
        expect(plain).not.toContain('Группа Бета');
        expect(plain).toContain('Блок Бета 1');
        expect(plain).toContain('Блок Гамма 1');
    });

    it('названия в две колонки у стиля, где тема их задаёт, — тоже в наборах для сравнения', () => {
        const text = collectTexts(
            iskraTemplate.render(
                createOfferPdfModelFixture({
                    templateCode: OfferPdfTemplateCode.ISKRA,
                    settings: {
                        ...OFFER_PDF_DEFAULT_SETTINGS,
                        descriptionMode: DocumentFieldDescriptionMode.NO,
                    },
                    data: dataWith(),
                }),
            ),
        ).join('\n');

        expect(
            inOrder(
                positions(text, [
                    ALTERNATIVE_BLOCK_TITLE,
                    'Набор 1',
                    'Комплект Альфа',
                    'Группа Альфа',
                    'Блок Альфа 2',
                    'Набор 2',
                    'Комплект Бета',
                    'Группа Бета',
                    'Блок Бета 1',
                ]),
            ),
        ).toBe(true);
    });

    it('порядок «сначала цена»: блок остаётся в наполнении после общего набора, таблица цен идёт раньше наполнения', () => {
        const text = renderTexts({ isPriceFirst: true });

        expect(
            inOrder(
                positions(text, [
                    'Стоимость',
                    'Информационное наполнение',
                    'Общий блок',
                    ALTERNATIVE_BLOCK_TITLE,
                    'Набор 1',
                ]),
            ),
        ).toBe(true);
    });
});

describe('наполнение наборов для сравнения: без IsAlternativeComplects печать прежняя', () => {
    it('флаг выключен или не задан — AlternativeComplectSections не влияют на документ ни на букву', () => {
        const without = renderTexts(
            {},
            dataWith({
                AlternativeComplectSections: undefined,
                IsAlternativeComplects: undefined,
            }),
        );
        const off = renderTexts(
            {},
            dataWith({ IsAlternativeComplects: false }),
        );
        const unset = renderTexts(
            {},
            dataWith({ IsAlternativeComplects: undefined }),
        );

        expect(off).toBe(without);
        expect(unset).toBe(without);
        expect(off).toContain('Общий блок');
        expect(off).not.toContain(ALTERNATIVE_BLOCK_TITLE);
        expect(off).not.toContain('Блок Альфа 1');
    });

    it('данные образца по умолчанию печатаются, как до появления блока', () => {
        const sample = collectTexts(
            classicTemplate.render(createOfferPdfModelFixture()),
        ).join('\n');
        const withoutField = collectTexts(
            classicTemplate.render(
                createOfferPdfModelFixture({
                    data: createOfferRenderDataFixture({
                        AlternativeComplectSections: undefined,
                        IsAlternativeComplects: undefined,
                    }),
                }),
            ),
        ).join('\n');

        expect(sample).toBe(withoutField);
        expect(sample).not.toContain(ALTERNATIVE_BLOCK_TITLE);
    });

    it('дерево раздела с выключенным флагом совпадает с деревом без поля', () => {
        const withoutField = sectionTree(
            {},
            dataWith({
                AlternativeComplectSections: undefined,
                IsAlternativeComplects: undefined,
            }),
        );
        const off = sectionTree(
            {},
            dataWith({ IsAlternativeComplects: false }),
        );

        expect(off).toEqual(withoutField);
    });
});

describe('наполнение наборов для сравнения: разбивка по листам', () => {
    it('заголовок блока, плашка первого набора, подзаголовок комплекта и первая группа с первым пунктом — в одном малом неделимом блоке', () => {
        const tree = sectionTree();
        const blocks = unbreakableWith(tree, ALTERNATIVE_BLOCK_TITLE);

        expect(blocks).toHaveLength(1);
        const text = hostText(blocks[0]);
        for (const part of [
            'Набор 1',
            'Комплект Альфа',
            'Интернет 3 ОД',
            'Группа Альфа',
            'Блок Альфа 1',
        ]) {
            expect(text).toContain(part);
        }
        // блок малый: второй пункт группы и второй набор в него не входят
        expect(text).not.toContain('Блок Альфа 2');
        expect(text).not.toContain('Набор 2');
    });

    it('у второго набора своя связка: плашка, подзаголовок первого комплекта и первая группа; общего заголовка блока в ней нет', () => {
        const tree = sectionTree();
        const blocks = unbreakableWith(tree, 'Набор 2');

        expect(blocks).toHaveLength(1);
        const text = hostText(blocks[0]);
        expect(text).toContain('Комплект Бета');
        expect(text).toContain('Группа Бета');
        expect(text).toContain('Блок Бета 1');
        expect(text).not.toContain(ALTERNATIVE_BLOCK_TITLE);
        expect(text).not.toContain('Группа Гамма');
    });

    it('второй комплект набора идёт со своим подзаголовком без плашки набора', () => {
        const tree = sectionTree();
        const blocks = unbreakableWith(tree, 'Комплект Дельта');

        expect(blocks).toHaveLength(1);
        const text = hostText(blocks[0]);
        expect(text).toContain('Группа Дельта');
        expect(text).toContain('Блок Дельта 1');
        expect(text).not.toContain('Набор');
    });

    const viewCases: Array<[string, DocumentFieldViewMode]> = [
        ['список', DocumentFieldViewMode.LIST],
        ['таблица с разделами', DocumentFieldViewMode.TABLE_WITH_GROUP],
        ['таблица', DocumentFieldViewMode.TABLE],
    ];

    it.each(viewCases)(
        '%s: плашка набора держится с подзаголовком комплекта и первой строкой наполнения',
        (_name, viewMode) => {
            const tree = sectionTree({
                viewMode,
                descriptionMode: DocumentFieldDescriptionMode.NO,
            });

            for (const [title, firstName] of [
                ['Набор 1', 'Блок Альфа 1'],
                ['Набор 2', 'Блок Бета 1'],
            ]) {
                const blocks = unbreakableWith(tree, title);
                expect(blocks).toHaveLength(1);
                expect(hostText(blocks[0])).toContain(firstName);
            }
        },
    );

    const longData = (): OfferPdfDocumentModel['data'] =>
        dataWith({
            AlternativeComplectSections: [
                createAlternativeSetFixture(1, [
                    createComplectSectionFixture(
                        'Комплект Альфа',
                        'Интернет 3 ОД',
                        [
                            groupOf(
                                'Группа Альфа',
                                block('Блок Альфа 1', LONG_TEXT),
                            ),
                        ],
                    ),
                ]),
                createAlternativeSetFixture(2, [
                    createComplectSectionFixture(
                        'Комплект Бета',
                        'Интернет 1 ОД',
                        [
                            groupOf(
                                'Группа Бета',
                                block('Блок Бета 1', LONG_TEXT),
                            ),
                        ],
                    ),
                ]),
            ],
        });

    it('первый пункт первого набора длинный: перед заголовком блока метка на заголовок, плашку, подзаголовок, группу и начало пункта; неделимого блока нет', () => {
        const tree = sectionTree(
            { descriptionMode: DocumentFieldDescriptionMode.BIG },
            longData(),
        );

        expect(unbreakableWith(tree, ALTERNATIVE_BLOCK_TITLE)).toHaveLength(0);
        const head = tree.findIndex(
            node =>
                node.type === 'TEXT' &&
                hostText(node) === ALTERNATIVE_BLOCK_TITLE,
        );
        const gate = tree[head - 1];
        expect(gate.props.minPresenceAhead).toBe(
            estimateAlternativeBlockHeadHeight(CLASSIC_THEME) +
                estimateAlternativeSetHeadHeight(CLASSIC_THEME, 'Набор 1') +
                estimateComplectHeadHeight(
                    CLASSIC_THEME,
                    'Комплект Альфа',
                    'Интернет 3 ОД',
                    true,
                ) +
                LIST_GROUP_HEAD +
                SPLIT_PRESENCE,
        );
    });

    it('первый пункт второго набора длинный: метка перед его плашкой без заголовка блока', () => {
        const tree = sectionTree(
            { descriptionMode: DocumentFieldDescriptionMode.BIG },
            longData(),
        );

        const head = tree.findIndex(
            node => node.type === 'VIEW' && hostText(node) === 'Набор 2',
        );
        const gate = tree[head - 1];
        expect(gate.props.minPresenceAhead).toBe(
            estimateAlternativeSetHeadHeight(CLASSIC_THEME, 'Набор 2') +
                estimateComplectHeadHeight(
                    CLASSIC_THEME,
                    'Комплект Бета',
                    'Интернет 1 ОД',
                    true,
                ) +
                LIST_GROUP_HEAD +
                SPLIT_PRESENCE,
        );
    });

    it('свойства break нет, метки разрыва с запасом меньше листа, а неделимые блоки малы', () => {
        const data = dataWith({
            AlternativeComplectSections: [
                ...(longData().AlternativeComplectSections ?? []),
                createAlternativeSetFixture(3, [
                    createComplectSectionFixture(
                        'Комплект с очень длинным названием, которое занимает не одну строку подзаголовка комплекта',
                        'Интернет 1 ОД',
                        beta,
                    ),
                ]),
            ],
        });

        for (const viewMode of Object.values(DocumentFieldViewMode)) {
            const tree = sectionTree(
                {
                    viewMode,
                    descriptionMode: DocumentFieldDescriptionMode.BIG,
                },
                data,
            );
            expect(tree.filter(node => 'break' in node.props)).toEqual([]);
            const presences = tree.flatMap(node =>
                typeof node.props.minPresenceAhead === 'number'
                    ? [node.props.minPresenceAhead]
                    : [],
            );
            // метка с запасом не больше трети листа: иначе на пустом листе блок не поместится
            expect(Math.max(...presences)).toBeLessThanOrEqual(260);
            // неделимая связка — заголовки и один пункт, не всё наполнение набора
            const bundle = unbreakableWith(tree, 'Набор 3')[0];
            expect(hostText(bundle)).not.toContain('Группа Гамма');
        }
    });
});

describe('плашка набора и заголовок блока: токены темы', () => {
    const themeCases: Array<[string, OfferPdfTheme]> = [
        ['классика', CLASSIC_THEME],
        ['монохром', MONOCHROME_THEME],
    ];

    it.each(themeCases)(
        '%s: плашка с заливкой шапки таблицы, название акцентом, кегль между группой и разделом',
        (_name, theme) => {
            const styles = infoblocksStyles(theme);

            expect(styles.alternativeSetHead.backgroundColor).toBe(
                theme.colors.shade,
            );
            expect(styles.alternativeSetTitle.color).toBe(theme.colors.accent);
            expect(styles.alternativeSetTitle.fontSize).toBe(
                complectTitleSize(theme.sizes.lg),
            );
            expect(styles.alternativeSetTitle.fontSize).toBeGreaterThan(
                styles.groupTitle.fontSize,
            );
            expect(styles.alternativeSetTitle.fontSize).toBeLessThan(
                theme.sizes.h2,
            );
        },
    );

    it('заголовок блока — стиль заголовка раздела с отступом сверху', () => {
        const tree = sectionTree();
        const title = tree.find(
            node =>
                node.type === 'TEXT' &&
                hostText(node) === ALTERNATIVE_BLOCK_TITLE,
        );

        expect(title).toBeDefined();
        const style = mergedStyle(title);
        expect(style.fontSize).toBe(CLASSIC_THEME.sizes.h2);
        expect(style.color).toBe(CLASSIC_THEME.colors.accent);
        expect(style.marginTop).toBe(ALTERNATIVE_BLOCK_MARGIN_TOP);
    });

    it('подзаголовок комплекта под плашкой набора с меньшим отступом сверху', () => {
        const tree = sectionTree();
        const underSet = tree.find(
            node =>
                node.type === 'VIEW' &&
                hostText(node).startsWith('Комплект Альфа'),
        );
        const style = mergedStyle(underSet);

        expect(style.marginTop).toBe(COMPLECT_HEAD_MARGIN_TOP_UNDER_SET);
    });

    it('оценка высоты плашки растёт с длиной заголовка набора', () => {
        const short = estimateAlternativeSetHeadHeight(
            CLASSIC_THEME,
            'Набор 1',
        );
        const long = estimateAlternativeSetHeadHeight(
            CLASSIC_THEME,
            'Набор с очень длинным названием '.repeat(8),
        );

        expect(long).toBeGreaterThan(short);
        expect(
            estimateAlternativeBlockHeadHeight(CLASSIC_THEME),
        ).toBeGreaterThan(ALTERNATIVE_BLOCK_MARGIN_TOP);
    });

    it('оценка высоты подзаголовка под плашкой меньше обычной на разницу отступов', () => {
        const usual = estimateComplectHeadHeight(
            CLASSIC_THEME,
            'Комплект',
            'Интернет',
        );
        const underSet = estimateComplectHeadHeight(
            CLASSIC_THEME,
            'Комплект',
            'Интернет',
            true,
        );

        expect(underSet).toBeLessThan(usual);
    });
});

describe('printedAlternativeSets и hasInfoblocksToPrint', () => {
    it('без флага, без наборов или без наполнения — null', () => {
        expect(
            printedAlternativeSets(dataWith({ IsAlternativeComplects: false })),
        ).toBeNull();
        expect(
            printedAlternativeSets(
                dataWith({ AlternativeComplectSections: undefined }),
            ),
        ).toBeNull();
        expect(
            printedAlternativeSets(
                dataWith({ AlternativeComplectSections: [] }),
            ),
        ).toBeNull();
        expect(
            printedAlternativeSets(
                dataWith({
                    AlternativeComplectSections: [
                        createAlternativeSetFixture(1, [
                            createComplectSectionFixture('Пустой', '', []),
                        ]),
                    ],
                }),
            ),
        ).toBeNull();
    });

    it('наборы с наполнением: заголовки и названия обрезаны, пустые комплекты и наборы пропущены, порядок запроса', () => {
        const sets = printedAlternativeSets(
            dataWith({
                AlternativeComplectSections: [
                    {
                        ...createAlternativeSetFixture(2, [
                            createComplectSectionFixture(
                                '  Альфа  ',
                                ' Интернет ',
                                alpha,
                            ),
                            createComplectSectionFixture('Пустой', '', []),
                        ]),
                        AlternativeSetTitle: '  Набор 2  ',
                    },
                    createAlternativeSetFixture(1, []),
                    createAlternativeSetFixture(5, [
                        createComplectSectionFixture('Бета', '', beta),
                    ]),
                ],
            }),
        );

        expect(sets?.map(item => item.number)).toEqual([2, 5]);
        expect(sets?.[0].title).toBe('Набор 2');
        expect(sets?.[0].sections).toHaveLength(1);
        expect(sets?.[0].sections[0].title).toBe('Альфа');
        expect(sets?.[0].sections[0].supplyName).toBe('Интернет');
        expect(sets?.[1].sections[0].groups).toHaveLength(2);
    });

    it('есть что печатать: общее наполнение, разделы по комплектам или наполнение наборов для сравнения', () => {
        expect(hasInfoblocksToPrint(dataWith())).toBe(true);
        // общего наполнения нет, а наборы для сравнения есть — лист не теряется
        expect(hasInfoblocksToPrint(dataWith({ infoblocksByGroups: [] }))).toBe(
            true,
        );
        expect(
            hasInfoblocksToPrint(
                dataWith({
                    infoblocksByGroups: [],
                    IsAlternativeComplects: false,
                }),
            ),
        ).toBe(false);
        expect(
            hasInfoblocksToPrint(
                dataWith({
                    infoblocksByGroups: [],
                    AlternativeComplectSections: [],
                }),
            ),
        ).toBe(false);
    });
});
