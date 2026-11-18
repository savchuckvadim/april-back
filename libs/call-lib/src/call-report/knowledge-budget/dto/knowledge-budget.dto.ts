import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { KNOWLEDGE_USES, type KnowledgeUse } from '../knowledge-budgets';
import type {
    KnowledgeBudgetMethodology,
    KnowledgeBudgetReport,
} from '../knowledge-budget-report.service';
import type {
    KnowledgeBudgetKindReport,
    KnowledgeBudgetUseReport,
} from '../knowledge-budget-report.util';

/** Параметры сводки бюджетов базы знаний. */
export class KnowledgeBudgetQueryDto {
    @ApiProperty({
        description: 'Домен портала, для которого считается сводка.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: 255,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    domain: string;
}

/** Одно место, где вид материалов попадает в промпт. */
export class KnowledgeBudgetUseDto implements KnowledgeBudgetUseReport {
    @ApiProperty({
        description: 'Код места чтения в конвейере разбора.',
        enum: Object.values(KNOWLEDGE_USES),
        example: KNOWLEDGE_USES.focusShared,
    })
    use: KnowledgeUse;

    @ApiProperty({
        description: 'Название места чтения для человека.',
        example: 'Разбор звонка: все проходы и итог',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Бюджет вида в этом месте, знаков.',
        example: 6000,
        type: Number,
    })
    budgetChars: number;

    @ApiProperty({
        description: 'Сколько знаков вида попадает в промпт.',
        example: 6000,
        type: Number,
    })
    fitChars: number;

    @ApiProperty({
        description:
            'Сколько знаков не поместилось в бюджет и модели не видны. ' +
            '0 — материалы помещаются целиком.',
        example: 1840,
        type: Number,
    })
    cutChars: number;

    @ApiProperty({
        description:
            'Названия типов звонков, для которых вид читается в этом месте. ' +
            'null — для всех типов звонков портала.',
        example: ['Презентация', 'Звонок по решению'],
        type: [String],
        nullable: true,
    })
    callTypes: string[] | null;
}

/** Один вид материалов базы знаний портала. */
export class KnowledgeBudgetKindDto implements KnowledgeBudgetKindReport {
    @ApiProperty({
        description: 'Код вида базы знаний.',
        example: 'presentation-playbook',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Название вида для человека.',
        example: 'Методология презентации (хвост и 5К)',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Сколько документов вида с текстом доступно порталу ' +
            '(свои и общие).',
        example: 2,
        type: Number,
    })
    documents: number;

    @ApiProperty({
        description: 'Объём материалов вида, знаков.',
        example: 7840,
        type: Number,
    })
    chars: number;

    @ApiProperty({
        description: 'Объём материалов вида в токенах — оценка.',
        example: 2614,
        type: Number,
    })
    tokens: number;

    @ApiProperty({
        description: 'Где вид читается и сколько знаков туда помещается.',
        type: [KnowledgeBudgetUseDto],
    })
    uses: KnowledgeBudgetUseDto[];

    @ApiProperty({
        description:
            'Наибольшее число знаков вида, не попавших в промпт, среди ' +
            'всех мест чтения. 0 — вид нигде не обрезается.',
        example: 1840,
        type: Number,
    })
    cutChars: number;
}

/** Методика портала в сводке. */
export class KnowledgeBudgetMethodologyDto
    implements KnowledgeBudgetMethodology
{
    @ApiProperty({
        description: 'Название методики.',
        example: 'Полянский',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Имя методики для людей — показывать вместо названия: встроенная — ' +
            '«Методика Полянского», название со словом «методика» — как есть, ' +
            'иначе «Методика «Название»».',
        example: 'Методика Полянского',
        type: String,
    })
    displayTitle: string;

    @ApiProperty({
        description: 'Версия методики.',
        example: '1.2',
        type: String,
    })
    version: string;

    @ApiProperty({
        description:
            'Методика объявила свои виды материалов: проход методики ' +
            'получает их вдобавок к общему слою разбора.',
        example: true,
        type: Boolean,
    })
    declaresKnowledge: boolean;
}

/** Сводка бюджетов базы знаний портала. */
export class KnowledgeBudgetReportDto implements KnowledgeBudgetReport {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Сколько знаков принято за один токен при оценке объёма.',
        example: 3,
        type: Number,
    })
    charsPerToken: number;

    @ApiProperty({
        description:
            'Методика продаж портала. null — методика не выбрана, прохода ' +
            'методики нет.',
        type: KnowledgeBudgetMethodologyDto,
        nullable: true,
    })
    methodology: KnowledgeBudgetMethodologyDto | null;

    @ApiProperty({
        description:
            'Включена ли на портале проверка по регламенту. null — ' +
            'настройки портала не прочитаны.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    complianceEnabled: boolean | null;

    @ApiProperty({
        description: 'Виды материалов, которые читает разбор звонков портала.',
        type: [KnowledgeBudgetKindDto],
    })
    kinds: KnowledgeBudgetKindDto[];
}
