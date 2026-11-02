import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    CHECKPOINT_EVIDENCE_KINDS,
    METHODOLOGY_CAP_TARGETS,
    METHODOLOGY_CONDITION_OPS,
    METHODOLOGY_FACT_FIELDS,
    type CheckpointEvidenceKind,
    type Methodology,
    type MethodologyAnchors,
    type MethodologyCap,
    type MethodologyCapTarget,
    type MethodologyCheckpoint,
    type MethodologyCondition,
    type MethodologyConditionOp,
    type MethodologyFactField,
    type MethodologyFactValue,
    type MethodologyRelevance,
    type MethodologySpirals,
} from '../methodology.types';

/**
 * Swagger-описание конфига методики для генерируемого клиента админки:
 * форма раздела «Методики» правит именно эти поля. Проверку делает
 * валидатор call-lib (parseMethodology) — class-validator здесь не нужен,
 * классы только описывают форму и реализуют доменные типы.
 */

/** Условие ограничителя или правила пункта. */
export class MethodologyConditionDto implements MethodologyCondition {
    @ApiProperty({
        description:
            'Операция: is / not — равенство; empty / not_empty — пусто; ' +
            'lt / lte / gt / gte — числа; above_norm / within_norm — против ' +
            'нормы типа; checkpoint_missed / checkpoint_done — статус пункта.',
        enum: METHODOLOGY_CONDITION_OPS,
        example: 'is',
    })
    op: MethodologyConditionOp;

    @ApiPropertyOptional({
        description: 'Факт разбора (для всех операций, кроме checkpoint_*).',
        enum: METHODOLOGY_FACT_FIELDS,
        example: 'needsFound',
    })
    field?: MethodologyFactField;

    @ApiPropertyOptional({
        description:
            'Значение сравнения для is / not / lt / lte / gt / gte (true/false, число, строка или null).',
        example: false,
        oneOf: [{ type: 'boolean' }, { type: 'number' }, { type: 'string' }],
        nullable: true,
    })
    value?: MethodologyFactValue;

    @ApiPropertyOptional({
        description: 'Код пункта для checkpoint_missed / checkpoint_done.',
        example: 'pres.needs_confirmed',
        type: String,
    })
    checkpoint?: string;
}

/** Чек-пункт методики. */
export class MethodologyCheckpointDto implements MethodologyCheckpoint {
    @ApiProperty({
        description: 'Код пункта: латиница, точка, подчёркивание, дефис.',
        example: 'pres.needs_confirmed',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Формулировка, которую менеджер увидит дословно.',
        example: 'Резюмировал потребности вслух',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Типы звонков пункта (коды справочника).',
        example: ['presentation'],
        type: [String],
    })
    types: Methodology['types'];

    @ApiProperty({
        description:
            'Подтверждение: quote — нужна дословная цитата, fact — факт разговора.',
        enum: CHECKPOINT_EVIDENCE_KINDS,
        example: 'quote',
    })
    evidence: CheckpointEvidenceKind;

    @ApiProperty({
        description: 'Обязательный пункт входит в долю выполнения.',
        example: true,
        type: Boolean,
    })
    mandatory: boolean;

    @ApiPropertyOptional({
        description: 'Подсказка модели, менеджеру не показывается.',
        example: 'Запрещённые открывашки — в регламенте.',
        type: String,
    })
    hint?: string;

    @ApiPropertyOptional({
        description: 'Продукт, к которому привязан пункт.',
        example: 'garant',
        type: String,
    })
    product?: string;

    @ApiPropertyOptional({
        description:
            'Правило кода (все условия — И): пункт считается по фактам, у модели не спрашивается.',
        type: [MethodologyConditionDto],
    })
    rule?: MethodologyConditionDto[];
}

/** Ограничитель оценки. */
export class MethodologyCapDto implements MethodologyCap {
    @ApiProperty({
        description: 'Код ограничителя.',
        example: 'cold.no_price',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Формулировка для карточки «оценка ограничена: …».',
        example: 'холодный: обсуждал стоимость до показа',
        type: String,
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Типы звонков, где действует; нет — все типы методики.',
        example: ['cold'],
        type: [String],
    })
    types?: Methodology['types'];

    @ApiProperty({
        description: 'Условия срабатывания (все — И).',
        type: [MethodologyConditionDto],
    })
    when: MethodologyConditionDto[];

    @ApiProperty({
        description: 'Что ограничивается: раздел или total — итоговая оценка.',
        enum: METHODOLOGY_CAP_TARGETS,
        example: 'PRICE',
    })
    target: MethodologyCapTarget;

    @ApiProperty({
        description: 'Потолок оценки по шкале 1–10.',
        example: 6,
        type: Number,
    })
    max: number;
}

/** Спирали презентации. */
export class MethodologySpiralsDto implements MethodologySpirals {
    @ApiProperty({
        description: 'Считать ли спирали.',
        example: true,
        type: Boolean,
    })
    enabled: boolean;

    @ApiProperty({
        description: 'Минимум полных витков.',
        example: 3,
        type: Number,
    })
    minFull: number;

    @ApiProperty({
        description: 'Типы звонков, где считаются.',
        example: ['presentation'],
        type: [String],
    })
    types: Methodology['types'];
}

/** Конфиг методики целиком. */
export class MethodologyConfigDto implements Methodology {
    @ApiProperty({
        description: 'Код методики: латиница, цифры, дефис, 2–64 знака.',
        example: 'garant-own',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название.',
        example: 'Своя методика',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Версия major.minor.patch; меняется при правке пунктов.',
        example: '1.0.0',
        type: String,
    })
    version: string;

    @ApiProperty({
        description: 'Типы звонков методики.',
        example: ['presentation', 'refine'],
        type: [String],
    })
    types: Methodology['types'];

    @ApiProperty({
        description: 'Короткие правила методики для промпта.',
        example: ['Цену в холодном звонке не обсуждаем.'],
        type: [String],
    })
    principles: string[];

    @ApiProperty({
        description: 'Чек-пункты.',
        type: [MethodologyCheckpointDto],
    })
    checkpoints: MethodologyCheckpointDto[];

    @ApiProperty({
        description: 'Ограничители оценки.',
        type: [MethodologyCapDto],
    })
    caps: MethodologyCapDto[];

    @ApiProperty({
        description: 'Спирали презентации.',
        type: MethodologySpiralsDto,
    })
    spirals: MethodologySpiralsDto;

    @ApiPropertyOptional({
        description:
            'Якоря шкалы: раздел → полоса («1-2» … «9-10») → описание.',
        type: Object,
        example: {
            PRESENTATION: {
                '1-2': 'нет показа',
                '9-10': 'каждый блок по спирали',
            },
        },
    })
    sectionAnchors?: MethodologyAnchors;

    @ApiPropertyOptional({
        description: 'Приоры актуальности разделов по типам, 0–100.',
        type: Object,
        example: { presentation: { PRESENTATION: 100, NEEDS: 70 } },
    })
    relevance?: MethodologyRelevance;

    @ApiPropertyOptional({
        description: 'kind базы знаний → слой: shared или код методики.',
        type: Object,
        example: {
            'presentation-playbook': 'garant-own',
            'product-facts': 'shared',
        },
    })
    knowledge?: Record<string, string>;
}
