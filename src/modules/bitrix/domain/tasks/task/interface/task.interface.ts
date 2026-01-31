import { IBXTask } from '../../../interfaces/bitrix.interface';

/**
 * Интерфейс для фильтра задач (использует camelCase как в IBXTask)
 */
export interface ITaskFilter extends Partial<IBXTask> {
    [key: string]: any;
}

/**
 * Интерфейс для полей создания/обновления задачи в формате Bitrix API (UPPERCASE)
 * При создании задачи поля передаются в формате TITLE, DEADLINE, CREATED_BY и т.д.
 */
export interface ITaskCreateFields {
    TITLE: string;
    RESPONSIBLE_ID: number | string;
    CREATED_BY?: number | string;
    GROUP_ID?: number | string;
    DEADLINE?: string;
    DESCRIPTION?: string;
    PRIORITY?: number | string;
    PARENT_ID?: number | string;
    UF_CRM_TASK?: string[];
    UF_TASK_WEBDAV_FILES?: string[];
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
    [key: string]: any; // Для поддержки других полей и пользовательских полей
}

/**
 * Интерфейс для обновления задачи (использует UPPERCASE формат как при создании)
 */
export interface ITaskUpdateFields extends Partial<ITaskCreateFields> {
    [key: string]: any;
}
