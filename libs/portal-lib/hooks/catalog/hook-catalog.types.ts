import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import { KbDocKey } from './kb-docs';

/**
 * Каталог хуков и автоматики отдела продаж — ЕДИНСТВЕННЫЙ источник
 * правды для админки: что есть, кто вызывает, какие параметры, какие
 * настройки портала и PBX-поля задействованы, что установить и как
 * проверить. Тексты — русские, markdown (подмножество GFM: заголовки,
 * абзацы, списки, таблицы, `код`, **жирный**, ссылки).
 *
 * Каталог статический (код), живое состояние портала считает
 * `HookReadinessService` по этим же описаниям. Факты берутся из README
 * модулей event-sales и базы знаний kb-garant — выдумывать нельзя:
 * коды настроек, полей и стадий проверяются тестом реестра.
 */

/** Семейство: как хук живёт в коде и кто его зовёт. */
export type HookFamily =
    /** Семейство sales-hooks (вебхук → silence → очередь → use-case). */
    | 'sales-hook'
    /** Холодный обзвон (cold-hook v1/v2). */
    | 'cold-hook'
    /** Путь заявки (lead-request: принятие, SLA, страховка). */
    | 'lead-request'
    /** Кроны-подстраховки и отчёты по расписанию. */
    | 'cron';

/** Чем запускается в первую очередь. */
export type HookEntryKind = 'webhook' | 'button' | 'cron' | 'internal';

export type HookEndpointMethod = 'GET' | 'POST';

/** Роль ручки: вебхук робота, run кнопки фрейма, кнопка-операция, статус. */
export type HookEndpointKind = 'webhook' | 'run' | 'button' | 'status';

export interface HookEndpoint {
    kind: HookEndpointKind;
    method: HookEndpointMethod;
    /** Путь относительно корня API event-sales, например `/api/sales-hooks/lead-to-work/webhook`. */
    path: string;
    description: string;
    /** Готовый пример для робота или curl (одной строкой). */
    example?: string;
}

export type HookParamWhere = 'query' | 'body';

export interface HookParam {
    name: string;
    where: HookParamWhere;
    /** Допустимые значения человеческим текстом (`Y / N`, `from_lead / cold / new`). */
    values?: string;
    default?: string;
    required?: boolean;
    description: string;
    /** Параметр есть только у `/run` (кнопка), роботу он недоступен. */
    runOnly?: boolean;
}

/** Роль настройки для хука: рубильник или параметр поведения. */
export type HookSettingRole = 'gate' | 'param';

export interface HookSettingRef {
    /** camelCase-ключ схемы PORTAL_APP_SETTINGS_SCHEMA[app]. */
    key: string;
    /** Приложение настроек; по умолчанию event-sales. */
    app?: EnumPortalAppCode;
    role: HookSettingRole;
    /** Как именно хук использует настройку (одно предложение). */
    note: string;
}

export type HookPbxEntity = 'lead' | 'deal' | 'company' | 'contact' | 'task';

/**
 * Роль PBX-поля: reads — читает, writes — пишет, marker — метка
 * процесса (идемпотентность/подстраховка), routing — маршрутизация
 * (кому/куда), link — связь графа (лид ↔ сделка).
 */
export type HookPbxFieldRole =
    | 'reads'
    | 'writes'
    | 'marker'
    | 'routing'
    | 'link';

export interface HookPbxFieldRef {
    entity: HookPbxEntity;
    /** Код из PBX_SALES_EVENT_FIELDS (не bitrixId). */
    code: string;
    role: HookPbxFieldRole;
    /** Без поля хук теряет часть функции (graceful-пропуск = не «ломается»). */
    required: boolean;
    note?: string;
}

export interface HookStageRef {
    entity: 'lead' | 'deal';
    /** Код стадии шаблона: лид — PBX_LEAD_STAGES.sales, сделка — воронка sales_base. */
    code: string;
    required: boolean;
    note?: string;
}

export interface HookCronInfo {
    /** Имя крона в коде (`@Cron(..., { name })`). */
    name: string;
    /** Расписание человеческим текстом. */
    schedule: string;
    /** Замечания: лок, рабочее время, лимиты за проход. */
    note?: string;
}

export interface HookCatalogEntry {
    /** Код хука — он же `hook` операции в app-cache для sales-hooks. */
    code: string;
    title: string;
    family: HookFamily;
    kind: HookEntryKind;
    /** Одно-два предложения для списка. */
    summary: string;
    /** Теория для человека: зачем нужен, что делает, бизнес-смысл. Markdown. */
    theory: string;
    /** Как работает по факту: шаги, идемпотентность, что пишет. Markdown. */
    howItWorks: string;
    /** Кто вызывает (роботы, кнопки, кроны) — короткие строки. */
    triggers: string[];
    endpoints: HookEndpoint[];
    params: HookParam[];
    settings: HookSettingRef[];
    pbxFields: HookPbxFieldRef[];
    stages: HookStageRef[];
    cron?: HookCronInfo;
    /** Статьи базы знаний (ключи дерева kb-garant). */
    kbDocs: KbDocKey[];
    /** Коды связанных хуков каталога. */
    related: string[];
    /** Что установить/настроить на портале: чек-лист. Markdown. */
    install: string;
    /** Как проверить, что сработало, и где смотреть. Markdown. */
    verify: string;
    /** Предупреждения и ловушки. */
    warnings?: string[];
    /**
     * Код хука в статусах операций app-cache (`event-sales-hooks`,
     * group `operation`). У sales-hooks совпадает с code; у кронов и
     * cold-hook операций нет (null) — мониторинг показывает только
     * настройки и поля.
     */
    operationHook: string | null;
}
