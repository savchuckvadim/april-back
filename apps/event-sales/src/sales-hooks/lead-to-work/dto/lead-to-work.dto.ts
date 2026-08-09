import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiBxHookUserId } from '@/core/decorators/dto/api-bx-hook-user-id.decorator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** Y/N-флаги хука в формате, который шлёт робот Битрикса. */
export const LEAD_TO_WORK_FLAG_VALUES = ['Y', 'N'] as const;
export type LeadToWorkFlag = (typeof LEAD_TO_WORK_FLAG_VALUES)[number];

/** Режим стадии создаваемой сделки ОП. */
export const LEAD_TO_WORK_STAGE_MODES = ['from_lead', 'cold'] as const;
export type LeadToWorkStageMode = (typeof LEAD_TO_WORK_STAGE_MODES)[number];

/** Что делать с открытыми задачами лида. */
export const LEAD_TO_WORK_TASK_MODES = ['move', 'close'] as const;
export type LeadToWorkTaskMode = (typeof LEAD_TO_WORK_TASK_MODES)[number];

/**
 * Query-параметры вебхука робота «лид → работа». Параметры идут в query
 * (тело занято BxWebHookDto с auth портала) — как у cold-hook.
 */
export class LeadToWorkWebhookQueryDto {
    @ApiProperty({
        description: 'Идентификатор лида Bitrix, который берётся в работу.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    /**
     * Тип поля — `string` (в рантайме декоратор отдаёт число): при
     * объявленном `number` глобальный ValidationPipe с implicit conversion
     * превратит `'user_447'` в NaN до трансформации. Подробности — в
     * JSDoc `ApiBxHookUserId`. К числу приводит `buildLeadToWorkItem()`.
     */
    @ApiBxHookUserId({
        description:
            'Ответственный менеджер — идентификатор пользователя Bitrix ' +
            'в формате хука (user_<id>).',
    })
    responsible: string;

    @ApiPropertyOptional({
        description:
            'Создать компанию, если у лида её нет (название берётся из ' +
            'лида). По умолчанию N.',
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    createCompany?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description:
            'Режим стадии сделки ОП: from_lead — по зеркалу стадии лида, ' +
            'cold — как холодный обзвон.',
        example: 'from_lead',
        type: String,
        enum: LEAD_TO_WORK_STAGE_MODES,
        default: 'from_lead',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_STAGE_MODES as unknown as string[])
    stageMode?: LeadToWorkStageMode;

    @ApiPropertyOptional({
        description:
            'Задачи лида: move — перенести с префиксом «Звонок», ' +
            'close — закрыть и поставить новую.',
        example: 'move',
        type: String,
        enum: LEAD_TO_WORK_TASK_MODES,
        default: 'move',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_TASK_MODES as unknown as string[])
    taskMode?: LeadToWorkTaskMode;

    @ApiPropertyOptional({
        description:
            'Признак ХО: при Y дополнительно создаётся ХО-сделка и задача ' +
            'называется «Холодный обзвон», как в классическом ХО-хуке.',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isXo?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description:
            'Дедлайн задачи «Звонок» в локали портала (DD.MM.YYYY HH:mm:ss). ' +
            'Без него новая задача создаётся без дедлайна.',
        example: '15.08.2026 10:00:00',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description:
            'Название события — используется в названии задачи. Без него ' +
            'берётся название лида.',
        example: 'ООО Ромашка',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;
}

/** Тело кнопки фрейма «лид → работа». */
export class LeadToWorkRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description: 'Идентификатор лида Bitrix, который берётся в работу.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    @ApiProperty({
        description: 'Идентификатор ответственного менеджера.',
        example: 123,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    responsible: number;

    @ApiPropertyOptional({
        description: 'Создать компанию, если у лида её нет.',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    createCompany?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: 'Режим стадии сделки ОП.',
        example: 'from_lead',
        type: String,
        enum: LEAD_TO_WORK_STAGE_MODES,
        default: 'from_lead',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_STAGE_MODES as unknown as string[])
    stageMode?: LeadToWorkStageMode;

    @ApiPropertyOptional({
        description: 'Что делать с открытыми задачами лида.',
        example: 'move',
        type: String,
        enum: LEAD_TO_WORK_TASK_MODES,
        default: 'move',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_TASK_MODES as unknown as string[])
    taskMode?: LeadToWorkTaskMode;

    @ApiPropertyOptional({
        description: 'Признак ХО (создать ХО-сделку).',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isXo?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description:
            'Дедлайн задачи «Звонок» в локали портала (DD.MM.YYYY HH:mm:ss).',
        example: '15.08.2026 10:00:00',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description: 'Название события для задачи; без него — название лида.',
        example: 'ООО Ромашка',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;
}

/** Элемент пачки — внутренний контракт между транспортом и use-case. */
export interface ILeadToWorkItem {
    leadId: number;
    responsible: number;
    createCompany: LeadToWorkFlag;
    stageMode: LeadToWorkStageMode;
    taskMode: LeadToWorkTaskMode;
    isXo: LeadToWorkFlag;
    /** Сырой дедлайн в локали портала; отсутствует — задача без дедлайна. */
    deadline?: string;
    /** Название события; отсутствует — берётся название лида. */
    name?: string;
}

/** Сборка элемента с дефолтами флагов. */
export function buildLeadToWorkItem(input: {
    leadId: number;
    responsible: string | number;
    createCompany?: LeadToWorkFlag;
    stageMode?: LeadToWorkStageMode;
    taskMode?: LeadToWorkTaskMode;
    isXo?: LeadToWorkFlag;
    deadline?: string;
    name?: string;
}): ILeadToWorkItem {
    return {
        leadId: input.leadId,
        responsible: Number(input.responsible),
        createCompany: input.createCompany ?? 'N',
        stageMode: input.stageMode ?? 'from_lead',
        taskMode: input.taskMode ?? 'move',
        isXo: input.isXo ?? 'N',
        deadline: input.deadline,
        name: input.name,
    };
}
