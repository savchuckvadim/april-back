import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiBxHookUserId } from '@/core/decorators/dto/api-bx-hook-user-id.decorator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** Y/N-флаги хука в формате, который шлёт робот Битрикса. */
export const LEAD_TO_WORK_FLAG_VALUES = ['Y', 'N'] as const;
export type LeadToWorkFlag = (typeof LEAD_TO_WORK_FLAG_VALUES)[number];

/**
 * Режим стадии создаваемой сделки ОП: from_lead — зеркало стадии лида,
 * cold — «Холодная» (классический ХО), new — «Новая» (заявка, по которой
 * работа стартует с начала воронки, а не с холодного цикла).
 */
export const LEAD_TO_WORK_STAGE_MODES = ['from_lead', 'cold', 'new'] as const;
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
     *
     * Поле необязательное: без него ответственный выбирается round-robin
     * из отдела продаж (см. `department` и LeadToWorkAssigneeService).
     */
    @ApiBxHookUserId({
        description:
            'Ответственный менеджер — идентификатор пользователя Bitrix ' +
            'в формате хука (user_<id>). Не передан — выбирается ' +
            'round-robin из отдела продаж (намёк — параметр department).',
        optional: true,
    })
    responsible?: string;

    @ApiPropertyOptional({
        description:
            'Намёк на отдел продаж для round-robin выбора ответственного ' +
            '(портал с несколькими ОП). Принимает id («15», «D_15») ЛИБО ' +
            'название отдела/группы («ОП Центр») — матчинг нестрогий. ' +
            'Игнорируется, если передан responsible.',
        example: '15',
        type: String,
    })
    @IsOptional()
    @IsString()
    department?: string;

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
            'cold — «Холодная» (как холодный обзвон), new — «Новая» ' +
            '(заявка стартует с начала воронки).',
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
            'Явный признак «это ЗАЯВКА» от робота: Y — считать заявкой ' +
            '(названия «…Заявка. {Название}», site-метки), N — просто лид. ' +
            'Не передан — автодетект по полям лида.',
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isRequest?: LeadToWorkFlag;

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

    @ApiPropertyOptional({
        description:
            'Идентификатор ответственного менеджера. Не передан — ' +
            'выбирается round-robin из отдела продаж (намёк — department).',
        example: 123,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    responsible?: number;

    @ApiPropertyOptional({
        description:
            'Намёк на отдел продаж для round-robin выбора ответственного ' +
            '(id отдела). Игнорируется, если передан responsible.',
        example: '15',
        type: String,
    })
    @IsOptional()
    @IsString()
    department?: string;

    @ApiPropertyOptional({
        description:
            'Кого round-robin не должен выбрать (кнопка «Передать другому»: ' +
            'заявка не возвращается прежнему ответственному).',
        example: 447,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    excludeResponsible?: number;

    @ApiPropertyOptional({
        description:
            'Сотрудник, который САМ передал заявку: подсвеченная запись в ' +
            'истории обработки, отдел для round-robin — его отдел.',
        example: 447,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    transferredBy?: number;

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
            'Явный признак «это ЗАЯВКА» от робота (робот воронки заявок ' +
            'знает это лучше эвристики): Y — считать заявкой, N — считать ' +
            'просто лидом. Не передан — автодетект по полям лида ' +
            '(op_lead_site_* / UF_CRM_REG_NUMBER / UF_CRM_LEAD_QUEST_URL).',
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isRequest?: LeadToWorkFlag;

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
    /** Отсутствует — ответственный выбирается round-robin из отдела. */
    responsible?: number;
    /** Сырой намёк на отдел ОП для round-robin (формат тестируется). */
    department?: string;
    /**
     * Кого round-robin НЕ должен выбрать (передача/SLA: заявка не должна
     * вернуться прежнему; игнорируется при явном responsible).
     */
    excludeResponsible?: number;
    /**
     * Сотрудник САМ передал заявку (кнопка «Передать другому»): история
     * получает подсвеченную запись, отдел для round-robin — его отдел.
     */
    transferredBy?: number;
    createCompany: LeadToWorkFlag;
    stageMode: LeadToWorkStageMode;
    taskMode: LeadToWorkTaskMode;
    isXo: LeadToWorkFlag;
    /** Явный признак заявки от робота; отсутствует — автодетект по полям. */
    isRequest?: LeadToWorkFlag;
    /** Сырой дедлайн в локали портала; отсутствует — задача без дедлайна. */
    deadline?: string;
    /** Название события; отсутствует — берётся название лида. */
    name?: string;
}

/**
 * Элемент после резолва ответственного (LeadToWorkAssigneeService):
 * flow-слой работает только с гарантированным responsible.
 */
export type ResolvedLeadToWorkItem = ILeadToWorkItem & { responsible: number };

/** Сборка элемента с дефолтами флагов. */
export function buildLeadToWorkItem(input: {
    leadId: number;
    responsible?: string | number;
    department?: string;
    excludeResponsible?: number;
    transferredBy?: number;
    createCompany?: LeadToWorkFlag;
    stageMode?: LeadToWorkStageMode;
    taskMode?: LeadToWorkTaskMode;
    isXo?: LeadToWorkFlag;
    isRequest?: LeadToWorkFlag;
    deadline?: string;
    name?: string;
}): ILeadToWorkItem {
    const responsible =
        input.responsible === undefined || input.responsible === ''
            ? undefined
            : Number(input.responsible);
    return {
        leadId: input.leadId,
        responsible:
            responsible !== undefined && Number.isFinite(responsible)
                ? responsible
                : undefined,
        department: input.department,
        excludeResponsible: input.excludeResponsible,
        transferredBy: input.transferredBy,
        createCompany: input.createCompany ?? 'N',
        stageMode: input.stageMode ?? 'from_lead',
        taskMode: input.taskMode ?? 'move',
        isXo: input.isXo ?? 'N',
        isRequest: input.isRequest,
        deadline: input.deadline,
        name: input.name,
    };
}
