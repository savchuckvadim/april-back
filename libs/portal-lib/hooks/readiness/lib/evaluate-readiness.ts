import {
    HookCatalogEntry,
    HookPbxEntity,
    HookPbxFieldRole,
    HookSettingRole,
} from '../../catalog/hook-catalog.types';

/**
 * Слепок портала для оценки готовности — то, что сервис читает из
 * PortalDB и настроек; оценка (ниже) чистая и тестируется без БД.
 */
export interface HookReadinessSnapshot {
    /** Установленные PBX-поля по сущностям (коды реестра). */
    fields: Record<HookPbxEntity, ReadonlySet<string>>;
    /** Сопоставленные стадии лида (коды шаблона). */
    leadStages: ReadonlySet<string>;
    /** Стадии воронки ОП (коды sales_*). */
    dealStages: ReadonlySet<string>;
    /** Действующие значения настроек по приложениям: app → camelKey → значение. */
    settings: Record<string, Record<string, unknown>>;
    /** Ключи, заданные на портале (а не дефолт кода): app → set(camelKey). */
    storedKeys: Record<string, ReadonlySet<string>>;
}

/** Описатель настройки из схемы — передаётся снаружи, чтобы оценка не зависела от реестра. */
export interface ReadinessSettingDescriptor {
    code: string;
    name: string;
    type: 'boolean' | 'number' | 'string';
    default: boolean | number | string;
}

export type ReadinessDescriptorResolver = (
    app: string,
    key: string,
) => ReadinessSettingDescriptor | null;

export type ReadinessFieldNameResolver = (code: string) => string;
export type ReadinessStageTitleResolver = (
    entity: 'lead' | 'deal',
    code: string,
) => string;

/**
 * Статус установки: ready — всё обязательное есть; partial — часть
 * обязательного отсутствует; not-installed — ничего из обязательного
 * нет; none — у хука нет требований к порталу.
 */
export type HookInstallStatus = 'ready' | 'partial' | 'not-installed' | 'none';

export interface HookFieldCheck {
    entity: HookPbxEntity;
    code: string;
    name: string;
    role: HookPbxFieldRole;
    required: boolean;
    installed: boolean;
    note: string | null;
}

export interface HookStageCheck {
    entity: 'lead' | 'deal';
    code: string;
    title: string;
    required: boolean;
    mapped: boolean;
    note: string | null;
}

export interface HookSettingCheck {
    app: string;
    key: string;
    code: string;
    name: string;
    type: 'boolean' | 'number' | 'string';
    role: HookSettingRole;
    value: boolean | number | string | null;
    default: boolean | number | string;
    stored: boolean;
    note: string;
}

export interface HookReadiness {
    code: string;
    status: HookInstallStatus;
    /** Рубильник хука на портале: true/false; null — рубильника нет (вебхук работает всегда). */
    enabled: boolean | null;
    fields: HookFieldCheck[];
    stages: HookStageCheck[];
    settings: HookSettingCheck[];
    /** Человеческие названия отсутствующего обязательного — для бейджа списка. */
    missingRequired: string[];
}

export interface EvaluateReadinessDeps {
    descriptor: ReadinessDescriptorResolver;
    fieldName: ReadinessFieldNameResolver;
    stageTitle: ReadinessStageTitleResolver;
}

const DEFAULT_APP = 'event-sales';

const toScalar = (value: unknown): boolean | number | string | null =>
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
        ? value
        : null;

/** Готовность одного хука по слепку портала. Чистая функция. */
export function evaluateHookReadiness(
    entry: HookCatalogEntry,
    snapshot: HookReadinessSnapshot,
    deps: EvaluateReadinessDeps,
): HookReadiness {
    const fields: HookFieldCheck[] = entry.pbxFields.map(ref => ({
        entity: ref.entity,
        code: ref.code,
        name: deps.fieldName(ref.code),
        role: ref.role,
        required: ref.required,
        installed: snapshot.fields[ref.entity]?.has(ref.code) ?? false,
        note: ref.note ?? null,
    }));

    const stages: HookStageCheck[] = entry.stages.map(ref => ({
        entity: ref.entity,
        code: ref.code,
        title: deps.stageTitle(ref.entity, ref.code),
        required: ref.required,
        mapped:
            ref.entity === 'lead'
                ? snapshot.leadStages.has(ref.code)
                : snapshot.dealStages.has(ref.code),
        note: ref.note ?? null,
    }));

    const settings: HookSettingCheck[] = [];
    for (const ref of entry.settings) {
        const app = ref.app ?? DEFAULT_APP;
        const descriptor = deps.descriptor(app, ref.key);
        if (!descriptor) continue;
        settings.push({
            app,
            key: ref.key,
            code: descriptor.code,
            name: descriptor.name,
            type: descriptor.type,
            role: ref.role,
            value: toScalar(snapshot.settings[app]?.[ref.key]),
            default: descriptor.default,
            stored: snapshot.storedKeys[app]?.has(ref.key) ?? false,
            note: ref.note,
        });
    }

    const requiredTotal =
        fields.filter(f => f.required).length +
        stages.filter(s => s.required).length;
    const missingFields = fields
        .filter(f => f.required && !f.installed)
        .map(f => `${entityLabel(f.entity)}: ${f.name}`);
    const missingStages = stages
        .filter(s => s.required && !s.mapped)
        .map(s => `${stageEntityLabel(s.entity)}: ${s.title}`);
    const missingRequired = [...missingFields, ...missingStages];

    let status: HookInstallStatus;
    if (requiredTotal === 0) status = 'none';
    else if (missingRequired.length === 0) status = 'ready';
    else if (missingRequired.length === requiredTotal) status = 'not-installed';
    else status = 'partial';

    // Рубильник — булева настройка с ролью gate; первая по порядку записи.
    const gate = settings.find(s => s.role === 'gate' && s.type === 'boolean');
    const enabled = gate ? gate.value === true : null;

    return {
        code: entry.code,
        status,
        enabled,
        fields,
        stages,
        settings,
        missingRequired,
    };
}

export function entityLabel(entity: HookPbxEntity): string {
    switch (entity) {
        case 'lead':
            return 'Лид';
        case 'deal':
            return 'Сделка';
        case 'company':
            return 'Компания';
        case 'contact':
            return 'Контакт';
        case 'task':
            return 'Задача';
        default:
            return entity;
    }
}

export function stageEntityLabel(entity: 'lead' | 'deal'): string {
    return entity === 'lead' ? 'Стадия лида' : 'Стадия сделки';
}
