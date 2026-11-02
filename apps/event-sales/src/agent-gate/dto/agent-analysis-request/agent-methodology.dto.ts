import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    CHECKPOINT_SOURCES,
    CHECKPOINT_STATUSES,
    DEAL_PROGRESS_MAX,
    DEAL_PROGRESS_MIN,
    METHODOLOGY_CAP_TARGETS,
    type CapTriggered,
    type CheckpointResult,
    type CheckpointSource,
    type CheckpointStatus,
    type DealProgressResult,
    type MethodologyCapTarget,
    type MethodologyOutcome,
    type SpiralResult,
} from '@lib/call-lib';

/**
 * Методика и продвижение сделки в разборе (этап 1 плана методики
 * Полянского): продвижение сделки 1–5 и ограничители — ядро для всех
 * порталов; пункты и спирали — только при выбранной методике портала.
 * Формы совпадают с доменными типами call-lib (`implements`).
 */

/** Продвижение сделки по звонку, шкала 1–5 с обязательным комментарием. */
export class AgentDealProgressDto implements DealProgressResult {
    @ApiProperty({
        description:
            'Продвижение сделки по звонку: 1 — ничего не изменилось, 2 — новая ' +
            'информация без определённости, 3 — конкретный барьер и действие по ' +
            'его снятию, 4 — принципиальное согласие, 5 — закрыто (счёт, дата оплаты).',
        example: 3,
        type: Number,
        minimum: DEAL_PROGRESS_MIN,
        maximum: DEAL_PROGRESS_MAX,
    })
    @IsInt()
    @Min(DEAL_PROGRESS_MIN)
    @Max(DEAL_PROGRESS_MAX)
    score: number;

    @ApiProperty({
        description: 'Состояние сделки до звонка, одной фразой.',
        example: 'Клиент сомневался после показа, ЛПР не определён.',
        type: String,
    })
    @IsString()
    before: string;

    @ApiProperty({
        description: 'Состояние после звонка, одной фразой.',
        example: 'Назван барьер — цена; договорились показать директору.',
        type: String,
    })
    @IsString()
    after: string;

    @ApiProperty({
        description: 'Почему именно такая оценка.',
        example:
            'Барьер конкретизирован, есть действие клиента до следующего контакта.',
        type: String,
    })
    @IsString()
    why: string;

    @ApiProperty({
        description: 'Почему не выше.',
        example: 'Решение за директором, условия не согласованы.',
        type: String,
    })
    @IsString()
    whyNotHigher: string;
}

/** Виток спирали презентации: потребность → свойство → связка → выгода → вопрос. */
export class AgentSpiralDto implements SpiralResult {
    @ApiProperty({
        description:
            'Потребность клиента, под которую показан блок; null — показ без связи с потребностью.',
        example: 'Нужна судебная практика по закупкам',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    need: string | null;

    @ApiProperty({
        description: 'Что показали или назвали.',
        example: 'Поиск судебной практики',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    feature: string | null;

    @ApiProperty({
        description: 'Связка «что это даёт именно вам».',
        example: 'Ищет по вашим закупкам',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    link: string | null;

    @ApiProperty({
        description: 'Выгода для клиента словами менеджера.',
        example: 'Спор готовите за час',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    benefit: string | null;

    @ApiProperty({
        description: 'Вопрос клиенту после блока; null — вопроса не было.',
        example: 'Подходит под ваши дела?',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    question: string | null;

    @ApiProperty({
        description: 'Ответ клиента; null — не отвечал.',
        example: 'Да, это как раз нужно',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    clientAnswer: string | null;

    @ApiProperty({
        description: 'Все пять звеньев заполнены (считает код).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    full: boolean;
}

/** Итог пункта методики. */
export class AgentCheckpointResultDto implements CheckpointResult {
    @ApiProperty({
        description: 'Код пункта методики.',
        example: 'pres.needs_confirmed',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Формулировка пункта, как её видит менеджер.',
        example: 'Резюмировал потребности вслух, расставил приоритеты',
        type: String,
    })
    @IsString()
    title: string;

    @ApiProperty({
        description:
            'Статус: done — выполнен, missed — пропущен, not_applicable — выполнить было нельзя.',
        enum: CHECKPOINT_STATUSES,
        example: 'done',
    })
    @IsString()
    @IsIn(CHECKPOINT_STATUSES)
    status: CheckpointStatus;

    @ApiProperty({
        description: 'Обязательный пункт входит в долю выполнения.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    mandatory: boolean;

    @ApiProperty({
        description:
            'Откуда статус: model — ответ модели, rule — правило кода по фактам.',
        enum: CHECKPOINT_SOURCES,
        example: 'model',
    })
    @IsString()
    @IsIn(CHECKPOINT_SOURCES)
    source: CheckpointSource;

    @ApiProperty({
        description: 'Дословная цитата-доказательство; null — нет.',
        example: 'Итак, вам важны практика и формы…',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    quote: string | null;

    @ApiProperty({
        description: 'Начало цитаты, сек от начала записи; null — нет.',
        example: 120,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    startSec: number | null;

    @ApiProperty({
        description: 'Конец цитаты, сек; null — нет.',
        example: 131,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    endSec: number | null;
}

/** Сработавший ограничитель оценки. */
export class AgentCapTriggeredDto implements CapTriggered {
    @ApiProperty({
        description: 'Код ограничителя.',
        example: 'core.presentation_without_needs',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Формулировка для карточки: «оценка ограничена: …».',
        example: 'презентация без выявленных потребностей',
        type: String,
    })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Что ограничено: раздел или total — итоговая оценка.',
        enum: METHODOLOGY_CAP_TARGETS,
        example: 'PRESENTATION',
    })
    @IsString()
    @IsIn(METHODOLOGY_CAP_TARGETS)
    target: MethodologyCapTarget;

    @ApiProperty({
        description: 'Потолок оценки по шкале 1–10.',
        example: 6,
        type: Number,
    })
    @IsInt()
    max: number;

    @ApiProperty({
        description: 'Оценка до среза; null — оценивать было нечего.',
        example: 9,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    before: number | null;

    @ApiProperty({
        description: 'Оценка после; null — оценивать было нечего.',
        example: 6,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    after: number | null;

    @ApiProperty({
        description: 'Оценка действительно срезана (была выше потолка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    applied: boolean;
}

/** Итог методики в разборе. */
export class AgentMethodologyOutcomeDto implements MethodologyOutcome {
    @ApiProperty({
        description: 'Код методики портала.',
        example: 'polyansky',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Версия конфига методики.',
        example: '1.0.0',
        type: String,
    })
    @IsString()
    version: string;

    @ApiProperty({
        description: 'Название методики.',
        example: 'Полянский',
        type: String,
    })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Пункты методики для этого типа звонка со статусами.',
        type: [AgentCheckpointResultDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentCheckpointResultDto)
    checkpoints: AgentCheckpointResultDto[];

    @ApiProperty({
        description: 'Обязательных пунктов выполнено.',
        example: 7,
        type: Number,
    })
    @IsInt()
    checkpointsDone: number;

    @ApiProperty({
        description: 'Обязательных пунктов применимо (без «неприменимо»).',
        example: 11,
        type: Number,
    })
    @IsInt()
    checkpointsTotal: number;

    @ApiPropertyOptional({
        description: 'Витки спирали презентации; null — для типа не считались.',
        type: [AgentSpiralDto],
        nullable: true,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentSpiralDto)
    spirals: AgentSpiralDto[] | null;

    @ApiPropertyOptional({
        description: 'Полных витков; null — не считались.',
        example: 2,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    spiralsFull: number | null;

    @ApiPropertyOptional({
        description:
            'Минимум полных витков по методике для этого типа; null — спирали не считались.',
        example: 3,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    spiralsMinFull: number | null;
}
