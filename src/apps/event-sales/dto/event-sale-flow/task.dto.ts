import {
    EBXTaskMark,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EV_TYPE, IEventTask } from '../../types/task-types';
import { PresentationStateCount } from '../../types/presentation-types';
import { IBXDeal } from 'src/modules/bitrix';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MinimalUserDto } from './user.dto';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

export enum EnumTaskEventType {
    XO = 'xo',
    WARM = 'warm',
    PRESENTATION = 'presentation',
    IN_PROGRESS = 'in_progress',
    MONEY_AWAIT = 'money_await',
    EVENT = 'event',
    SUPPLY = 'supply',
}
export class EventTaskUserDto {
    @IsNumeric()
    id: number;

    @IsString()
    name: string;

    @IsString()
    icon: string;

    @IsString()
    workPosition: string;
}

export class EventTaskGroupDto {

    @IsOptional()
    @IsNumeric()
    id: number;
}
export class EventTaskDto {
    @IsNumeric()
    id: number;

    @IsOptional()
    @IsString()
    name: string;
    @IsString()
    type: EV_TYPE;
    @IsString()
    isExpired: 'no' | 'almost' | 'yes';
    @IsEnum(EnumTaskEventType)
    eventType: EnumTaskEventType;

    @IsOptional()
    presentation: null | PresentationStateCount;


    dealBase: null | IBXDeal;

    @IsOptional()
    @IsEnum(['presentation'])
    originalEventType?: 'presentation' | null;

    @IsOptional()
    @IsBoolean()
    isPresentationCanceled?: boolean;
    // IBXTask properties
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

    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskUserDto)
    creator: EventTaskUserDto;
    dateStart: '2017-12-29T13:04:29+03:00';

    @IsOptional()
    @IsString()
    @Type(() => String)
    deadline: '2017-12-29T15:00:00+03:00';
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
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskGroupDto)
    group: EventTaskGroupDto;

    @IsOptional()
    @IsNumeric()
    groupId: number;
    guid: '{9bd11fb5-8e76-4379-b3be-1f4cbe9bae1d}';

    isMuted: 'N';
    isPinned: 'N';
    isPinnedInGroup: 'N';

    @IsOptional()
    @IsEnum(EBXTaskMark)
    mark: EBXTaskMark;


    matchWorkTime: 'N';
    multitask: 'N';
    newCommentsCount: 0;
    notViewed: 'N';
    outlookVersion: '4';
    parentId: null;
    priority: '0';
    replicate: 'N';

    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskUserDto)
    responsible: EventTaskUserDto;

    @IsOptional()
    @IsNumeric()
    responsibleId: number;


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

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Type(() => String)
    ufCrmTask: string[];
}
