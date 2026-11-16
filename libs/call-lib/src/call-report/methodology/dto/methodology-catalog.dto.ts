import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
    CatalogCheckpoint,
    CatalogEntry,
    CatalogKnowledgeKind,
    MethodologyCatalog,
} from '../methodology-catalog.const';
import type { MethodologyCapTarget } from '../methodology.types';
import {
    MethodologyCapDto,
    MethodologyCheckpointDto,
    MethodologyConditionDto,
} from './methodology-config.dto';

/** Запись справочника каталога: код и русская подпись. */
export class CatalogEntryDto implements CatalogEntry {
    @ApiProperty({ description: 'Код.', example: 'presentation', type: String })
    code: string;

    @ApiProperty({
        description: 'Подпись для формы.',
        example: 'Презентация',
        type: String,
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Пояснение для подсказки.',
        type: String,
    })
    hint?: string;
}

/** Пункт-кандидат каталога (из встроенной методики). */
export class CatalogCheckpointDto
    extends MethodologyCheckpointDto
    implements CatalogCheckpoint
{
    @ApiProperty({
        description: 'Считается кодом по фактам, у модели не спрашивается.',
        example: false,
        type: Boolean,
    })
    byRule: boolean;

    @ApiProperty({
        description: 'Код встроенной методики-источника.',
        example: 'polyansky',
        type: String,
    })
    source: string;
}

/** Вид базы знаний, который методика может объявить своим. */
export class CatalogKnowledgeKindDto implements CatalogKnowledgeKind {
    @ApiProperty({
        description: 'Код вида базы знаний.',
        example: 'product-facts',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Название вида для формы.',
        example: 'Факты о продукте, комплектах и ценах',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Сколько знаков вида получает проход методики.',
        example: 6000,
        type: Number,
    })
    budgetChars: number;

    @ApiProperty({
        description:
            'Вид читается только у показов, звонков по решению и доработки — ' +
            'там он идёт во все проходы и без объявления.',
        example: false,
        type: Boolean,
    })
    presentationOnly: boolean;
}

/** Каталог для формы-брифа методики. */
export class MethodologyCatalogDto implements MethodologyCatalog {
    @ApiProperty({ description: 'Типы звонков.', type: [CatalogEntryDto] })
    callTypes: CatalogEntryDto[];

    @ApiProperty({ description: 'Разделы разговора.', type: [CatalogEntryDto] })
    sections: CatalogEntryDto[];

    @ApiProperty({
        description: 'Факты разбора для условий.',
        type: [CatalogEntryDto],
    })
    factFields: MethodologyCatalog['factFields'];

    @ApiProperty({ description: 'Операции условий.', type: [CatalogEntryDto] })
    conditionOps: MethodologyCatalog['conditionOps'];

    @ApiProperty({
        description: 'Виды подтверждения пункта.',
        type: [CatalogEntryDto],
    })
    evidenceKinds: CatalogEntryDto[];

    @ApiProperty({
        description: 'Статусы пункта в разборе.',
        type: [CatalogEntryDto],
    })
    statuses: CatalogEntryDto[];

    @ApiProperty({
        description: 'Цели ограничителей: разделы и итог.',
        type: [CatalogEntryDto],
    })
    capTargets: CatalogEntry<MethodologyCapTarget>[];

    @ApiProperty({
        description: 'Полосы шкалы для якорей.',
        example: ['1-2', '3-4', '5-6', '7-8', '9-10'],
        type: [String],
    })
    anchorBands: string[];

    @ApiProperty({
        description:
            'Пункты-кандидаты встроенных методик — выбираются галочками.',
        type: [CatalogCheckpointDto],
    })
    checkpoints: CatalogCheckpointDto[];

    @ApiProperty({
        description:
            'Ограничители ядра — действуют всегда, в форме для справки.',
        type: [MethodologyCapDto],
    })
    coreCaps: MethodologyCapDto[];

    @ApiProperty({
        description:
            'Виды базы знаний, которые методика может объявить своими: ' +
            'проход методики получает их вдобавок к общему слою разбора.',
        type: [CatalogKnowledgeKindDto],
    })
    knowledgeKinds: CatalogKnowledgeKindDto[];
}

/** Реэкспорт для удобства импорта из одного места. */
export { MethodologyConditionDto };
