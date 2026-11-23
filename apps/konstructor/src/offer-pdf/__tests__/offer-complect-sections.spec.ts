jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { createElement, isValidElement, type ReactNode } from 'react';
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
import { estimateComplectHeadHeight } from '../templates/kit/infoblocks/complect-head.util';
import { printedComplectSections } from '../templates/kit/infoblocks/complect-sections.util';
import {
    KEEP_WHOLE_LINES,
    LIST_GROUP_HEAD,
    SPLIT_PRESENCE,
    complectTitleSize,
} from '../templates/kit/infoblocks/infoblocks.layout';
import { infoblocksStyles } from '../templates/kit/infoblocks/infoblocks.styles';
import {
    createComplectSectionFixture,
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
} from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

/**
 * Раздел наполнения по комплектам: у каждого комплекта подзаголовок (название
 * и поставка) и его наполнение в том же виде и режиме описаний, что выбраны
 * настройками PDF. Без IsComplectsSeparate раздел печатается как раньше.
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
const common = [groupOf('Общая группа', block('Общий блок', 'общее описание'))];

/** Данные с двумя комплектами; верхний уровень — «объединённое» наполнение */
const dataWith = (
    over: Partial<OfferPdfDocumentModel['data']> = {},
): OfferPdfDocumentModel['data'] =>
    createOfferRenderDataFixture({
        infoblocksByGroups: common,
        ComplectSections: [
            createComplectSectionFixture(
                'Комплект Альфа',
                'Интернет 3 ОД',
                alpha,
            ),
            createComplectSectionFixture(
                'Комплект Бета',
                'Интернет 1 ОД',
                beta,
            ),
        ],
        IsComplectsSeparate: true,
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

/** Узел дерева после раскрытия компонентов: только примитивы react-pdf */
interface HostNode {
    type: string;
    props: Record<string, unknown>;
    children: Array<HostNode | string>;
}

type Component = (props: Record<string, unknown>) => ReactNode;

const expand = (node: ReactNode): Array<HostNode | string> => {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return [];
    }
    if (typeof node === 'string' || typeof node === 'number') {
        return [String(node)];
    }
    if (Array.isArray(node)) return node.flatMap(expand);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === 'function') {
        return expand((node.type as Component)(node.props));
    }
    const children = expand(node.props.children as ReactNode);
    return typeof node.type === 'string'
        ? [{ type: node.type, props: node.props, children }]
        : children;
};

/** Все узлы в порядке документа */
const flatten = (nodes: Array<HostNode | string>): HostNode[] =>
    nodes.flatMap(node =>
        typeof node === 'string' ? [] : [node, ...flatten(node.children)],
    );

const textOf = (node: HostNode | string): string =>
    typeof node === 'string' ? node : node.children.map(textOf).join('');

const sectionTree = (
    settings: Partial<OfferPdfSettings> = {},
    data = dataWith(),
    theme = CLASSIC_THEME,
): HostNode[] =>
    flatten(
        expand(
            createElement(OfferInfoblocks, {
                model: modelWith(settings, data),
                theme,
            }),
        ),
    );

/** Неделимые блоки, в которых лежит текст */
const unbreakableWith = (tree: HostNode[], text: string): HostNode[] =>
    tree.filter(
        node => node.props.wrap === false && textOf(node).includes(text),
    );

describe('наполнение по комплектам: вид раздела', () => {
    it('у каждого комплекта подзаголовок с названием и поставкой, под ним его наполнение; заголовок раздела один', () => {
        const text = renderTexts();

        expect(text.match(/Информационное наполнение/g)).toHaveLength(1);
        const order = [
            'Комплект Альфа',
            'Интернет 3 ОД',
            'Группа Альфа',
            'Блок Альфа 1',
            'Блок Альфа 2',
            'Комплект Бета',
            'Интернет 1 ОД',
            'Группа Бета',
            'Блок Бета 1',
            'Группа Гамма',
            'Блок Гамма 1',
        ].map(item => text.indexOf(item));
        expect(order.every(index => index >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it('наполнение комплекта печатается один раз, у чужого комплекта его нет; объединённый список не печатается', () => {
        const text = renderTexts();

        for (const name of ['Блок Альфа 1', 'Блок Бета 1', 'Блок Гамма 1']) {
            expect(text.split(name)).toHaveLength(2);
        }
        expect(text).not.toContain('Общая группа');
        expect(text).not.toContain('Общий блок');
        // комплект Бета не заходит в раздел Альфы
        expect(text.indexOf('Группа Бета')).toBeGreaterThan(
            text.indexOf('Комплект Бета'),
        );
    });

    it('общее название набора над разделом не печатается: у каждого комплекта свой заголовок', () => {
        const withName = renderTexts(
            {},
            dataWith({ GeneralProductName: 'Общее название набора' }),
        );
        const merged = renderTexts(
            {},
            dataWith({
                GeneralProductName: 'Общее название набора',
                IsComplectsSeparate: false,
            }),
        );

        expect(merged).toContain('Общее название набора');
        // название набора остаётся в письме и цене, а над наполнением его нет
        const infoblocksFrom = withName.indexOf('Информационное наполнение');
        const firstComplect = withName.indexOf('Комплект Альфа');
        expect(withName.slice(infoblocksFrom, firstComplect)).not.toContain(
            'Общее название набора',
        );
    });

    it('подпись поставки необязательна: без неё печатается одно название; без названия — одна поставка; без обоих заголовка нет', () => {
        const data = dataWith({
            ComplectSections: [
                createComplectSectionFixture('Комплект Альфа', '', alpha),
                createComplectSectionFixture('', 'Поставка без названия', beta),
                createComplectSectionFixture('', '', [
                    groupOf('Группа Дельта', block('Блок Дельта 1')),
                ]),
            ],
        });
        const text = renderTexts({}, data);

        expect(text).toContain('Комплект Альфа');
        expect(text).toContain('Поставка без названия');
        expect(text).toContain('Блок Дельта 1');
        // у комплекта без названия и поставки подзаголовка нет, а наполнение печатается:
        // первый неделимый блок с его пунктом — внешний, заголовок группы и пункт
        const [outer] = unbreakableWith(sectionTree({}, data), 'Блок Дельта 1');
        expect(textOf(outer)).toContain('Группа Дельта');
        expect(textOf(outer)).not.toContain('Комплект');
        expect(textOf(outer)).not.toContain('Поставка');
    });

    it('комплект без наполнения пропускается, остальные печатаются', () => {
        const text = renderTexts(
            {},
            dataWith({
                ComplectSections: [
                    createComplectSectionFixture(
                        'Комплект Пустой',
                        'Интернет',
                        [],
                    ),
                    createComplectSectionFixture('Комплект Бета', '', beta),
                ],
            }),
        );

        expect(text).not.toContain('Комплект Пустой');
        expect(text).toContain('Комплект Бета');
        expect(text).toContain('Блок Бета 1');
    });

    it('у всех комплектов наполнения нет — раздел печатается объединённым списком, как раньше', () => {
        const text = renderTexts(
            {},
            dataWith({
                ComplectSections: [
                    createComplectSectionFixture('Комплект Пустой', '', []),
                ],
            }),
        );

        expect(text).toContain('Общий блок');
        expect(text).not.toContain('Комплект Пустой');
    });

    it('раздел по комплектам печатается и тогда, когда объединённого наполнения в данных нет', () => {
        const text = renderTexts({}, dataWith({ infoblocksByGroups: [] }));

        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('Блок Альфа 1');
        expect(text).toContain('Блок Гамма 1');
    });
});

describe('наполнение по комплектам: режим описаний и вид из настроек PDF', () => {
    it('описания по режиму: нет, мало, средне, много — в каждом комплекте', () => {
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
        expect(big).toContain('Много: блок гаммы');
        expect(big).not.toContain('Кратко: первый блок альфы');
    });

    it('таблица с разделами: названия групп комплектов в таблице; таблица без разделов: названий групп нет', () => {
        const withGroups = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(withGroups).toContain('Комплект Бета');
        expect(withGroups).toContain('Группа Бета');
        expect(withGroups).toContain('Группа Гамма');

        const plain = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(plain).toContain('Комплект Бета');
        expect(plain).not.toContain('Группа Бета');
        expect(plain).toContain('Блок Бета 1');
        expect(plain).toContain('Блок Гамма 1');
    });

    it('названия в две колонки у стиля, где тема их задаёт, — тоже по комплектам', () => {
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

        const order = [
            'Комплект Альфа',
            'Группа Альфа',
            'Блок Альфа 2',
            'Комплект Бета',
            'Группа Бета',
            'Блок Бета 1',
        ].map(item => text.indexOf(item));
        expect(order.every(index => index >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
});

describe('наполнение по комплектам: без IsComplectsSeparate печать прежняя', () => {
    it('флаг выключен — ComplectSections не влияют на документ ни на букву', () => {
        const without = renderTexts(
            {},
            createOfferRenderDataFixture({
                infoblocksByGroups: common,
                ComplectSections: undefined,
                IsComplectsSeparate: undefined,
            }),
        );
        const off = renderTexts({}, dataWith({ IsComplectsSeparate: false }));
        const unset = renderTexts(
            {},
            dataWith({ IsComplectsSeparate: undefined }),
        );

        expect(off).toBe(without);
        expect(unset).toBe(without);
        expect(off).toContain('Общий блок');
        expect(off).not.toContain('Комплект Альфа');
        expect(off).not.toContain('Блок Альфа 1');
    });

    it('данные образца по умолчанию печатаются, как до появления комплектов', () => {
        const sample = collectTexts(
            classicTemplate.render(createOfferPdfModelFixture()),
        ).join('\n');
        const withoutSections = collectTexts(
            classicTemplate.render(
                createOfferPdfModelFixture({
                    data: createOfferRenderDataFixture({
                        ComplectSections: undefined,
                        IsComplectsSeparate: undefined,
                    }),
                }),
            ),
        ).join('\n');

        expect(sample).toBe(withoutSections);
    });
});

describe('наполнение по комплектам: разбивка по листам', () => {
    it('подзаголовок и первая группа с первым пунктом лежат в одном малом неделимом блоке', () => {
        const tree = sectionTree();
        const blocks = unbreakableWith(tree, 'Комплект Альфа');

        expect(blocks).toHaveLength(1);
        const text = textOf(blocks[0]);
        expect(text).toContain('Интернет 3 ОД');
        expect(text).toContain('Группа Альфа');
        expect(text).toContain('Блок Альфа 1');
        // блок малый: второй пункт группы в него не входит
        expect(text).not.toContain('Блок Альфа 2');
        // у второго комплекта свой блок со своей первой группой
        const second = unbreakableWith(tree, 'Комплект Бета');
        expect(second).toHaveLength(1);
        expect(textOf(second[0])).toContain('Группа Бета');
        expect(textOf(second[0])).not.toContain('Группа Гамма');
    });

    const viewCases: Array<[string, DocumentFieldViewMode]> = [
        ['список', DocumentFieldViewMode.LIST],
        ['таблица с разделами', DocumentFieldViewMode.TABLE_WITH_GROUP],
        ['таблица', DocumentFieldViewMode.TABLE],
    ];

    it.each(viewCases)(
        '%s: подзаголовок держится с первой строкой наполнения',
        (_name, viewMode) => {
            const tree = sectionTree({
                viewMode,
                descriptionMode: DocumentFieldDescriptionMode.NO,
            });

            for (const [title, firstName] of [
                ['Комплект Альфа', 'Блок Альфа 1'],
                ['Комплект Бета', 'Блок Бета 1'],
            ]) {
                const blocks = unbreakableWith(tree, title);
                expect(blocks).toHaveLength(1);
                expect(textOf(blocks[0])).toContain(firstName);
            }
        },
    );

    it('первый пункт комплекта длинный: перед подзаголовком метка на подзаголовок, группу и начало пункта, неделимого блока нет', () => {
        const longText = LONG_TEXT;
        const data = dataWith({
            ComplectSections: [
                createComplectSectionFixture(
                    'Комплект Альфа',
                    'Интернет 3 ОД',
                    [groupOf('Группа Альфа', block('Блок Альфа 1', longText))],
                ),
            ],
        });
        const tree = sectionTree(
            { descriptionMode: DocumentFieldDescriptionMode.BIG },
            data,
        );

        expect(unbreakableWith(tree, 'Комплект Альфа')).toHaveLength(0);
        const head = tree.findIndex(node =>
            textOf(node).startsWith('Комплект Альфа'),
        );
        const gate = tree[head - 1];
        expect(gate.props.minPresenceAhead).toBe(
            estimateComplectHeadHeight(
                CLASSIC_THEME,
                'Комплект Альфа',
                'Интернет 3 ОД',
            ) +
                LIST_GROUP_HEAD +
                SPLIT_PRESENCE,
        );
        // оценка длинного пункта — не короче порога, иначе проверка ничего не значит
        expect(longText.length / 120).toBeGreaterThan(KEEP_WHOLE_LINES);
    });

    it('свойства break нет, метки разрыва не больше места под карточку раздела', () => {
        const longText = LONG_TEXT;
        const data = dataWith({
            ComplectSections: [
                createComplectSectionFixture(
                    'Комплект Альфа',
                    'Интернет 3 ОД',
                    [groupOf('Группа Альфа', block('Блок Альфа 1', longText))],
                ),
                createComplectSectionFixture(
                    'Комплект Бета с очень длинным названием, которое занимает не одну строку подзаголовка',
                    'Интернет 1 ОД',
                    beta,
                ),
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
            // 120 — место под начало карточки раздела: больше метки не ставят
            expect(Math.max(...presences)).toBeLessThanOrEqual(120);
        }
    });
});

describe('подзаголовок комплекта: токены темы', () => {
    const themeCases: Array<[string, OfferPdfTheme]> = [
        ['классика', CLASSIC_THEME],
        ['монохром', MONOCHROME_THEME],
    ];

    it.each(themeCases)(
        '%s: цвета и кегль из темы, название меньше заголовка раздела',
        (_name, theme) => {
            const styles = infoblocksStyles(theme);

            expect(styles.complectHead.borderLeftColor).toBe(
                theme.colors.accent,
            );
            expect(styles.complectTitle.color).toBe(theme.colors.accent);
            expect(styles.complectSupply.color).toBe(theme.colors.muted);
            expect(styles.complectTitle.fontSize).toBe(
                complectTitleSize(theme.sizes.lg),
            );
            // подзаголовок крупнее заголовка группы и мельче заголовка раздела
            expect(styles.complectTitle.fontSize).toBeGreaterThan(
                styles.groupTitle.fontSize,
            );
            expect(styles.complectTitle.fontSize).toBeLessThan(theme.sizes.h2);
        },
    );

    it('оценка высоты растёт с длиной названия и подписью поставки', () => {
        const titleOnly = estimateComplectHeadHeight(
            CLASSIC_THEME,
            'Комплект',
            '',
        );
        const withSupply = estimateComplectHeadHeight(
            CLASSIC_THEME,
            'Комплект',
            'Интернет 3 ОД',
        );
        const longTitle = estimateComplectHeadHeight(
            CLASSIC_THEME,
            'Очень длинное название комплекта '.repeat(8),
            'Интернет 3 ОД',
        );

        expect(withSupply).toBeGreaterThan(titleOnly);
        expect(longTitle).toBeGreaterThan(withSupply);
    });
});

describe('printedComplectSections и hasInfoblocksToPrint', () => {
    it('без флага или без разделов с наполнением — null: печатается объединённый список', () => {
        expect(
            printedComplectSections(dataWith({ IsComplectsSeparate: false })),
        ).toBeNull();
        expect(
            printedComplectSections(dataWith({ ComplectSections: undefined })),
        ).toBeNull();
        expect(
            printedComplectSections(
                dataWith({
                    ComplectSections: [
                        createComplectSectionFixture('Пустой', '', []),
                    ],
                }),
            ),
        ).toBeNull();
    });

    it('разделы с наполнением — название и поставка обрезаны, пустые разделы пропущены', () => {
        const sections = printedComplectSections(
            dataWith({
                ComplectSections: [
                    createComplectSectionFixture(
                        '  Альфа  ',
                        ' Интернет ',
                        alpha,
                    ),
                    createComplectSectionFixture('Пустой', '', []),
                    createComplectSectionFixture('Бета', '', beta),
                ],
            }),
        );

        expect(sections?.map(item => item.title)).toEqual(['Альфа', 'Бета']);
        expect(sections?.[0].supplyName).toBe('Интернет');
        expect(sections?.[1].groups).toHaveLength(2);
    });

    it('есть что печатать: объединённый список или разделы по комплектам', () => {
        expect(hasInfoblocksToPrint(dataWith())).toBe(true);
        expect(hasInfoblocksToPrint(dataWith({ infoblocksByGroups: [] }))).toBe(
            true,
        );
        expect(
            hasInfoblocksToPrint(
                dataWith({
                    infoblocksByGroups: [],
                    IsComplectsSeparate: false,
                }),
            ),
        ).toBe(false);
        expect(
            hasInfoblocksToPrint(
                dataWith({ infoblocksByGroups: [], ComplectSections: [] }),
            ),
        ).toBe(false);
    });
});
