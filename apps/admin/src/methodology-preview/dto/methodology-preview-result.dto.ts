import { ApiProperty } from '@nestjs/swagger';
import {
    CHECKPOINT_SOURCES,
    CHECKPOINT_STATUSES,
    METHODOLOGY_CAP_TARGETS,
    type CapTriggered,
    type CheckpointResult,
    type CheckpointSource,
    type CheckpointStatus,
    type MethodologyCapTarget,
    type MethodologyOutcome,
    type MethodologyPreviewResult,
    type SpiralResult,
} from '@lib/call-lib/call-report/methodology';

/** Пункт методики в проверке: статус и цитата из разговора. */
export class PreviewCheckpointDto implements CheckpointResult {
    @ApiProperty({
        description: 'Код пункта в конфиге методики.',
        example: 'cold.utp_unique',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Формулировка пункта — как её увидит менеджер.',
        example: 'Назвал, чем предложение отличается от конкурентов',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Статус: выполнен, пропущен или неприменим к этому разговору.',
        enum: CHECKPOINT_STATUSES,
        example: 'done',
    })
    status: CheckpointStatus;

    @ApiProperty({
        description: 'Обязательный пункт — входит в долю выполнения.',
        example: true,
        type: Boolean,
    })
    mandatory: boolean;

    @ApiProperty({
        description: 'Кто определил статус: модель или правило кода по фактам.',
        enum: CHECKPOINT_SOURCES,
        example: 'model',
    })
    source: CheckpointSource;

    @ApiProperty({
        description: 'Цитата из разговора; null — цитаты нет.',
        example: 'У нас единственных обновление каждый день.',
        type: String,
        nullable: true,
    })
    quote: string | null;

    @ApiProperty({
        description: 'Начало цитаты, секунда звонка; null — время не указано.',
        example: 74,
        type: Number,
        nullable: true,
    })
    startSec: number | null;

    @ApiProperty({
        description: 'Конец цитаты, секунда звонка; null — время не указано.',
        example: 81,
        type: Number,
        nullable: true,
    })
    endSec: number | null;
}

/** Виток спирали презентации. */
export class PreviewSpiralDto implements SpiralResult {
    @ApiProperty({
        description: 'Потребность клиента; null — звено не прозвучало.',
        example: 'Долго ищут судебную практику',
        type: String,
        nullable: true,
    })
    need: string | null;

    @ApiProperty({
        description: 'Свойство продукта; null — звено не прозвучало.',
        example: 'Подборка практики по статье',
        type: String,
        nullable: true,
    })
    feature: string | null;

    @ApiProperty({
        description: 'Связка свойства с потребностью; null — не прозвучала.',
        example: 'Это значит, что искать вручную не придётся',
        type: String,
        nullable: true,
    })
    link: string | null;

    @ApiProperty({
        description: 'Выгода для клиента; null — не прозвучала.',
        example: 'Экономия часа на каждом деле',
        type: String,
        nullable: true,
    })
    benefit: string | null;

    @ApiProperty({
        description: 'Вопрос на согласие; null — не задан.',
        example: 'Вам это было бы полезно?',
        type: String,
        nullable: true,
    })
    question: string | null;

    @ApiProperty({
        description: 'Ответ клиента на вопрос; null — ответа нет.',
        example: 'Да, это как раз наша боль',
        type: String,
        nullable: true,
    })
    clientAnswer: string | null;

    @ApiProperty({
        description: 'Виток полный: все пять звеньев прозвучали.',
        example: true,
        type: Boolean,
    })
    full: boolean;
}

/** Ограничитель, сработавший на звонке. */
export class PreviewCapDto implements CapTriggered {
    @ApiProperty({
        description: 'Код ограничителя.',
        example: 'pres.no_needs',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Формулировка для карточки разбора.',
        example: 'презентация без выявленных потребностей',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Что ограничено: код раздела или итоговая оценка.',
        enum: METHODOLOGY_CAP_TARGETS,
        example: 'total',
    })
    target: MethodologyCapTarget;

    @ApiProperty({
        description: 'Потолок оценки по шкале 1–10.',
        example: 6,
        type: Number,
    })
    max: number;

    @ApiProperty({
        description: 'Оценка до ограничителя; null — оценивать было нечего.',
        example: 8,
        type: Number,
        nullable: true,
    })
    before: number | null;

    @ApiProperty({
        description: 'Оценка после ограничителя; null — оценивать было нечего.',
        example: 6,
        type: Number,
        nullable: true,
    })
    after: number | null;

    @ApiProperty({
        description:
            'Оценка действительно срезана. false — условие выполнено, но ' +
            'оценка и так не выше потолка.',
        example: true,
        type: Boolean,
    })
    applied: boolean;
}

/** Пункты и спирали по черновику методики. */
export class PreviewOutcomeDto implements MethodologyOutcome {
    @ApiProperty({
        description: 'Код методики.',
        example: 'polyansky',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Версия методики.',
        example: '1.2.0',
        type: String,
    })
    version: string;

    @ApiProperty({
        description: 'Название методики.',
        example: 'Полянский',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Пункты методики для типа этого звонка.',
        type: [PreviewCheckpointDto],
    })
    checkpoints: PreviewCheckpointDto[];

    @ApiProperty({
        description: 'Сколько обязательных пунктов выполнено.',
        example: 4,
        type: Number,
    })
    checkpointsDone: number;

    @ApiProperty({
        description: 'Сколько обязательных пунктов применимо к разговору.',
        example: 6,
        type: Number,
    })
    checkpointsTotal: number;

    @ApiProperty({
        description: 'Витки спирали; null — для этого типа не считаются.',
        type: [PreviewSpiralDto],
        nullable: true,
    })
    spirals: PreviewSpiralDto[] | null;

    @ApiProperty({
        description: 'Полных витков; null — спирали не считаются.',
        example: 2,
        type: Number,
        nullable: true,
    })
    spiralsFull: number | null;

    @ApiProperty({
        description: 'Минимум полных витков по методике; null — не считаются.',
        example: 3,
        type: Number,
        nullable: true,
    })
    spiralsMinFull: number | null;
}

/** Итог проверки черновика на звонке. */
export class MethodologyPreviewResultDto implements MethodologyPreviewResult {
    @ApiProperty({
        description:
            'Код типа звонка, с которым шёл разбор; null — не определён.',
        example: 'presentation',
        type: String,
        nullable: true,
    })
    callType: string | null;

    @ApiProperty({
        description:
            'У методики есть пункты или спирали для этого типа звонка. ' +
            'false — проход не вызывался, модель не тратилась.',
        example: true,
        type: Boolean,
    })
    applicable: boolean;

    @ApiProperty({
        description: 'Пункты и спирали; null — методика к звонку не применима.',
        type: PreviewOutcomeDto,
        nullable: true,
    })
    methodology: PreviewOutcomeDto | null;

    @ApiProperty({
        description: 'Ограничители ядра и черновика, сработавшие на звонке.',
        type: [PreviewCapDto],
    })
    capsTriggered: PreviewCapDto[];

    @ApiProperty({
        description: 'Итоговая оценка действующего разбора; null — оценки нет.',
        example: 7,
        type: Number,
        nullable: true,
    })
    scoreBefore: number | null;

    @ApiProperty({
        description: 'Итоговая оценка с ограничителями черновика.',
        example: 6,
        type: Number,
        nullable: true,
    })
    scoreAfter: number | null;

    @ApiProperty({
        description:
            'Модель, ответившая на проход; null — проход не вызывался.',
        example: 'bitrix/bitrixgpt-5.5',
        type: String,
        nullable: true,
    })
    model: string | null;

    @ApiProperty({
        description: 'Токены вызова; null — проход не вызывался.',
        example: 14200,
        type: Number,
        nullable: true,
    })
    tokens: number | null;
}
