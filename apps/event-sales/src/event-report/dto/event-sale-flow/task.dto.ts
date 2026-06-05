import { EV_TYPE } from '../../types/task-types';
import { PresentationStateCount } from '../../types/presentation-types';
import { IBXDeal } from 'src/modules/bitrix';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsIn,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';
import { EBXTaskMark } from '@/modules/bitrix/domain/tasks/task';

export enum EnumTaskEventType {
    XO = 'xo',
    WARM = 'warm',
    PRESENTATION = 'presentation',
    IN_PROGRESS = 'in_progress',
    MONEY_AWAIT = 'money_await',
    EVENT = 'event',
    SUPPLY = 'supply',
}

/** Признак просроченности задачи. */
export const TASK_IS_EXPIRED_VALUES = ['no', 'almost', 'yes'] as const;
export type TaskIsExpired = (typeof TASK_IS_EXPIRED_VALUES)[number];

export class EventTaskUserDto {
    @ApiProperty({
        description: 'Идентификатор пользователя задачи.',
        type: Number,
        example: 81,
    })
    @IsNumeric()
    id: number;

    @ApiProperty({
        description: 'Имя пользователя (ФИО).',
        type: String,
        example: 'Иван Иванов',
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Ссылка на иконку/аватар пользователя.',
        type: String,
        example: 'https://portal.bitrix24.ru/upload/photo.jpg',
    })
    @IsString()
    icon: string;

    @ApiProperty({
        description: 'Должность пользователя.',
        type: String,
        example: 'Менеджер по продажам',
    })
    @IsString()
    workPosition: string;
}

export class EventTaskGroupDto {
    @ApiPropertyOptional({
        description: 'Идентификатор рабочей группы/проекта задачи.',
        type: Number,
        example: 12,
    })
    @IsOptional()
    @IsNumeric()
    id: number;
}

export class EventTaskDto {
    @ApiProperty({
        description: 'Идентификатор задачи Bitrix.',
        type: Number,
        example: 777,
    })
    @IsNumeric()
    id: number;

    @ApiPropertyOptional({
        description: 'Название задачи.',
        type: String,
        example: 'Перезвонить клиенту',
    })
    @IsOptional()
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Внутренний тип задачи (`EV_TYPE`).',
        type: String,
        example: 'call',
    })
    @IsString()
    type: EV_TYPE;

    @ApiProperty({
        description: 'Признак просроченности задачи.',
        type: String,
        enum: TASK_IS_EXPIRED_VALUES,
        example: 'no',
    })
    @IsString()
    @IsIn(TASK_IS_EXPIRED_VALUES as unknown as string[])
    isExpired: TaskIsExpired;

    @ApiProperty({
        description: 'Тип события задачи, определяющий ветку flow.',
        enum: EnumTaskEventType,
        example: EnumTaskEventType.WARM,
    })
    @IsEnum(EnumTaskEventType)
    eventType: EnumTaskEventType;

    @ApiPropertyOptional({
        description:
            'Состояние счётчиков презентаций по задаче (`PresentationStateCount`). ' +
            '`null`, если презентаций нет.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    presentation: null | PresentationStateCount;

    @ApiPropertyOptional({
        description:
            'Базовая сделка задачи (`IBXDeal`). `null`, если сделки нет. ' +
            'Структура соответствует сделке Bitrix.',
        type: Object,
        nullable: true,
    })
    dealBase: null | IBXDeal;

    @ApiPropertyOptional({
        description:
            'Исходный тип события до переопределения (`presentation` или `null`).',
        enum: ['presentation'],
        nullable: true,
        example: 'presentation',
    })
    @IsOptional()
    @IsEnum(['presentation'])
    originalEventType?: 'presentation' | null;

    @ApiPropertyOptional({
        description: 'Признак отмены презентации по задаче.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    isPresentationCanceled?: boolean;

    @ApiPropertyOptional({
        description: 'Постановщик задачи.',
        type: EventTaskUserDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskUserDto)
    creator: EventTaskUserDto;

    @ApiPropertyOptional({
        description: 'Срок (дедлайн) задачи (ISO 8601).',
        type: String,
        example: '2017-12-29T15:00:00+03:00',
    })
    @IsOptional()
    @IsString()
    @Type(() => String)
    deadline: string;

    @ApiPropertyOptional({
        description: 'Рабочая группа задачи.',
        type: EventTaskGroupDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskGroupDto)
    group: EventTaskGroupDto;

    @ApiPropertyOptional({
        description: 'Идентификатор рабочей группы задачи.',
        type: Number,
        example: 12,
    })
    @IsOptional()
    @IsNumeric()
    groupId: number;

    @ApiPropertyOptional({
        description: 'Оценка/маркер задачи Bitrix (`EBXTaskMark`).',
        enum: EBXTaskMark,
    })
    @IsOptional()
    @IsEnum(EBXTaskMark)
    mark: EBXTaskMark;

    @ApiPropertyOptional({
        description: 'Ответственный за задачу.',
        type: EventTaskUserDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskUserDto)
    responsible: EventTaskUserDto;

    @ApiPropertyOptional({
        description: 'Идентификатор ответственного за задачу.',
        type: Number,
        example: 81,
    })
    @IsOptional()
    @IsNumeric()
    responsibleId: number;

    @ApiPropertyOptional({
        description:
            'Идентификаторы привязанных к задаче сделок (UF_CRM_TASK). ' +
            'Из них init-фаза достаёт presDeal/tmcDeal.',
        type: [String],
        example: ['D_1024', 'D_2048'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Type(() => String)
    ufCrmTask: string[];

    // === Сырые поля задачи Bitrix (IBXTask), эхом возвращаемые фронтом. ===
    // В контракт API не входят, поэтому не документируются через @ApiProperty.
    accomplices: [];
    accomplicesData: [];
    activityDate: '2017-12-29T13:07:19+03:00';
    addInReport: 'N';
    allowChangeDeadline: 'Y';
    allowTimeTracking: 'N';
    auditors: [];
    auditorsData: [];
    changedBy: '1';
    changedDate: '2017-12-29T13:07:19+03:00';
    closedBy: '81';
    closedDate: '2017-12-29T13:06:18+03:00';
    commentsCount: null;
    createdBy: '1';
    createdDate: '2017-12-29T12:15:42+03:00';
    dateStart: '2017-12-29T13:04:29+03:00';
    description: string;
    descriptionInBbcode: 'Y';
    durationFact: null;
    durationPlan: null;
    durationType: 'days';
    endDatePlan: null;
    exchangeId: null;
    exchangeModified: null;
    favorite: 'N';
    forkedByTemplateId: null;
    forumId: null;
    forumTopicId: null;
    guid: '{9bd11fb5-8e76-4379-b3be-1f4cbe9bae1d}';
    isMuted: 'N';
    isPinned: 'N';
    isPinnedInGroup: 'N';
    matchWorkTime: 'N';
    multitask: 'N';
    newCommentsCount: 0;
    notViewed: 'N';
    outlookVersion: '4';
    parentId: null;
    priority: '0';
    replicate: 'N';
    serviceCommentsCount: null;
    siteId: 's1';
    sorting: null;
    stageId: '0';
    startDatePlan: null;
    status: '5';
    statusChangedBy: '81';
    statusChangedDate: '2017-12-29T13:06:18+03:00';
    subStatus: '5';
    subordinate: 'N';
    taskControl: 'N';
    timeEstimate: '0';
    timeSpentInLogs: null;
    title: string;
    viewedDate: '2017-12-29T19:44:28+03:00';
    xmlId: null;
}
