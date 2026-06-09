import { IBXUser } from '../../../interfaces/bitrix.interface';

/**
 * Интерфейс для фильтра задач (использует camelCase как в IBXTask)
 */
export interface ITaskFilter extends Partial<IBXTaskCreateFields> {
    [key: string]: any;
}

/**
 * Интерфейс для полей создания/обновления задачи в формате Bitrix API (UPPERCASE)
 * При создании задачи поля передаются в формате TITLE, DEADLINE, CREATED_BY и т.д.
 */
export enum ETaskPriority {
    HIGH = 2,
    MEDIUM = 1,
    LOW = 0,
}
export interface ITaskChecklistItem {
    TITLE: string;
    IS_COMPLETE?: 'Y' | 'N';
    SORT_INDEX?: number;
}

export interface IBXTaskCreateFields {
    TITLE: string;
    RESPONSIBLE_ID: number | string;
    CREATED_BY?: number | string;
    GROUP_ID?: number | string;
    DEADLINE?: string;
    DESCRIPTION?: string;
    PRIORITY?: ETaskPriority;
    PARENT_ID?: number | string;
    UF_CRM_TASK?: string[];
    UF_TASK_WEBDAV_FILES?: string[];
    CHECKLIST?: ITaskChecklistItem[];
    ALLOW_CHANGE_DEADLINE?: 'Y' | 'N';
    ALLOW_TIME_TRACKING?: 'Y' | 'N';
    TASK_CONTROL?: 'Y' | 'N';
    ADD_IN_REPORT?: 'Y' | 'N';
    MATCH_WORK_TIME?: 'Y' | 'N';
    FORUM_TOPIC_ID?: number | string;
    SITE_ID?: string;
    MULTITASK?: 'Y' | 'N';
    REPLICATE?: 'Y' | 'N';
    STAGE_ID?: number | string;
    DATE_START?: string;
    START_DATE_PLAN?: string;
    END_DATE_PLAN?: string;
    TIME_ESTIMATE?: number | string;
    STATUS?: EBXTaskStatus;
    [key: string]: any; // Для поддержки других полей и пользовательских полей
}
export enum EBXTaskMark {
    NONE = '',
    GOOD = 'P',
    BAD = 'N',
}
export enum EBXTaskStatus {
    NEW = '1', // Новая
    PENDING = '2', //Ждёт выполнения
    IN_PROGRESS = '3', //Выполняется
    SUPPOSEDLY_COMPLETED = '4', //Ожидает контроля
    COMPLETED = '5', //Завершена
    DEFERRED = '6', //Отклонена
    DECLINED = '7', //Отклонена
}

export interface IBXTask {
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
    creator: IBXUser;
    dateStart: '2017-12-29T13:04:29+03:00';
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
    group: [];
    groupId: number;
    guid: '{9bd11fb5-8e76-4379-b3be-1f4cbe9bae1d}';
    id: number;
    isMuted: 'N';
    isPinned: 'N';
    isPinnedInGroup: 'N';
    mark: EBXTaskMark;
    matchWorkTime: 'N';
    multitask: 'N';
    newCommentsCount: 0;
    notViewed: 'N';
    outlookVersion: '4';
    parentId: null;
    priority: '0';
    replicate: 'N';
    responsible: IBXUser;
    responsibleId: '81';
    serviceCommentsCount: null;
    siteId: 's1';
    sorting: null;
    stageId: '0';
    startDatePlan: null;
    status: EBXTaskStatus;
    statusChangedBy: '81';
    statusChangedDate: '2017-12-29T13:06:18+03:00';
    subStatus: EBXTaskStatus;
    subordinate: 'N';
    taskControl: 'N';
    timeEstimate: '0';
    timeSpentInLogs: null;
    title: string;
    viewedDate: '2017-12-29T19:44:28+03:00';
    xmlId: null;
    ufCrmTask: Array<string>;
}
/**
 * Интерфейс для обновления задачи (использует UPPERCASE формат как при создании)
 */
export interface ITaskUpdateFields extends Partial<IBXTaskCreateFields> {
    [key: string]: any;
}

/**
 * Поля комментария к задаче (`task.commentitem.add`).
 */
export interface ITaskCommentAddFields {
    AUTHOR_ID: number | string;
    POST_MESSAGE: string;
}
