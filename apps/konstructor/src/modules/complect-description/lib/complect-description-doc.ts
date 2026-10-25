import { Document, HeadingLevel, Paragraph, TextRun } from 'docx';
import type {
    ComplectDescriptionGroupDto,
    ComplectDescriptionInfoblockDto,
} from '../dto/complect-description.dto';

/**
 * Описание комплекта (легаси Laravel FileController::getGeneralDescription +
 * шаблон Description.docx): шапка «комплект · поставка», затем по группам —
 * название блока жирным и его описание. Блоки без текста не печатаются
 * (легаси pushDescription брал только `checked && description`).
 */

/** Текст описания по коду: из БД (инфоблоки, сервисы) — приоритетнее фронта. */
export interface DescriptionSource {
    name?: string | null;
    description?: string | null;
}

export interface ResolvedInfoblock {
    code: string;
    name: string;
    /** Абзацы описания (разбито по переводам строк, пустые убраны) */
    paragraphs: string[];
}

export interface ResolvedGroup {
    name: string;
    infoblocks: ResolvedInfoblock[];
}

export interface DescriptionDocumentInput {
    complectName: string;
    supply: string;
    groups: ResolvedGroup[];
}

const toParagraphs = (text: string): string[] =>
    text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

const descriptionOf = (
    infoblock: ComplectDescriptionInfoblockDto,
    sources: Map<string, DescriptionSource>,
): string | null => {
    const fromDb = sources.get(infoblock.code)?.description?.trim();
    if (fromDb) return fromDb;
    const fromFront = infoblock.description?.trim();
    return fromFront || null;
};

/** Группы запроса → группы с текстами; блок без описания и пустая группа выпадают. */
export const resolveDescriptionGroups = (
    groups: ComplectDescriptionGroupDto[],
    sources: Map<string, DescriptionSource>,
): ResolvedGroup[] =>
    groups
        .map(group => ({
            name: group.name,
            infoblocks: group.infoblocks.flatMap(infoblock => {
                const description = descriptionOf(infoblock, sources);
                if (!description) return [];
                return [
                    {
                        code: infoblock.code,
                        name: infoblock.name,
                        paragraphs: toParagraphs(description),
                    },
                ];
            }),
        }))
        .filter(group => group.infoblocks.length > 0);

export const countInfoblocks = (groups: ResolvedGroup[]): number =>
    groups.reduce((sum, group) => sum + group.infoblocks.length, 0);

const SPACING_AFTER = 120;

export const buildDescriptionDocument = (
    input: DescriptionDocumentInput,
): Document => {
    const children: Paragraph[] = [
        new Paragraph({
            text: 'Описание комплекта',
            heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
            children: [
                new TextRun({ text: input.complectName, bold: true }),
                new TextRun({ text: input.supply ? ` · ${input.supply}` : '' }),
            ],
            spacing: { after: SPACING_AFTER * 2 },
        }),
    ];

    for (const group of input.groups) {
        children.push(
            new Paragraph({
                text: group.name,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: SPACING_AFTER * 2, after: SPACING_AFTER },
            }),
        );
        for (const infoblock of group.infoblocks) {
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: infoblock.name, bold: true }),
                    ],
                    spacing: {
                        before: SPACING_AFTER,
                        after: SPACING_AFTER / 2,
                    },
                }),
            );
            for (const paragraph of infoblock.paragraphs) {
                children.push(
                    new Paragraph({
                        text: paragraph,
                        spacing: { after: SPACING_AFTER / 2 },
                    }),
                );
            }
        }
    }

    return new Document({
        creator: 'April Konstructor',
        title: `Описание комплекта ${input.complectName}`,
        sections: [{ children }],
    });
};

/** Имя файла без символов, запрещённых в путях */
export const descriptionFileName = (
    complectName: string,
    stamp: string,
): string =>
    `Описание комплекта ${complectName.replace(/[\\/:*?"<>|]+/g, '-').trim()} ${stamp}.docx`;
