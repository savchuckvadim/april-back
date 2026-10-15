import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    HookCatalogEntry,
    HookPbxEntity,
    HookSettingRole,
} from '../hook-catalog.types';
import { pbxFieldName } from './pbx-field-registry';
import { hookStageTitle } from './stage-titles';

/**
 * Хук, который читает настройку, и КАК он её использует — внутренняя
 * документация для сотрудников: по ней видно, к чему приведёт значение.
 */
export interface SettingHookRelation {
    code: string;
    title: string;
    /** gate — рубильник хука/крона, param — параметр поведения. */
    role: HookSettingRole;
    /** Как именно хук использует настройку (из каталога). */
    note: string;
}

/** PBX-поле, задействованное хуками настройки. */
export interface SettingPbxFieldRelation {
    entity: HookPbxEntity;
    code: string;
    name: string;
    /** Обязательно хотя бы одному из хуков (без него хук теряет основную функцию). */
    required: boolean;
}

/** Стадия лида или воронки ОП, нужная хукам настройки. */
export interface SettingStageRelation {
    entity: 'lead' | 'deal';
    code: string;
    title: string;
    required: boolean;
}

export interface SettingRelations {
    hooks: SettingHookRelation[];
    pbxFields: SettingPbxFieldRelation[];
    stages: SettingStageRelation[];
}

/**
 * Карта «ключ настройки → хуки, PBX-поля и стадии»: выводится из каталога,
 * а не пишется руками во второй раз. Ключ карты — `${app}.${code}`
 * (snake_case код настройки), потому что админка оперирует кодами.
 * Поле или стадия, нужные нескольким хукам, сливаются в одну запись;
 * обязательность — «обязательно хотя бы одному».
 */
export function buildSettingRelations(
    catalog: readonly HookCatalogEntry[],
): Map<string, SettingRelations> {
    const result = new Map<string, SettingRelations>();
    for (const entry of catalog) {
        for (const ref of entry.settings) {
            const app = ref.app ?? EnumPortalAppCode.eventSales;
            const descriptor = (
                PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
                    string,
                    PortalAppSettingDescriptor
                >
            )[ref.key];
            if (!descriptor) continue;
            const mapKey = settingRelationKey(app, descriptor.code);
            const relations = result.get(mapKey) ?? {
                hooks: [],
                pbxFields: [],
                stages: [],
            };
            if (!relations.hooks.some(h => h.code === entry.code)) {
                relations.hooks.push({
                    code: entry.code,
                    title: entry.title,
                    role: ref.role,
                    note: ref.note,
                });
            }
            for (const field of entry.pbxFields) {
                mergeRequired(
                    relations.pbxFields,
                    f => f.entity === field.entity && f.code === field.code,
                    {
                        entity: field.entity,
                        code: field.code,
                        name: pbxFieldName(field.code),
                        required: field.required,
                    },
                );
            }
            for (const stage of entry.stages) {
                mergeRequired(
                    relations.stages,
                    s => s.entity === stage.entity && s.code === stage.code,
                    {
                        entity: stage.entity,
                        code: stage.code,
                        title: hookStageTitle(stage.entity, stage.code),
                        required: stage.required,
                    },
                );
            }
            result.set(mapKey, relations);
        }
    }
    return result;
}

/** Добавить запись или усилить обязательность уже добавленной. */
function mergeRequired<T extends { required: boolean }>(
    list: T[],
    same: (item: T) => boolean,
    next: T,
): void {
    const existing = list.find(same);
    if (existing) {
        existing.required = existing.required || next.required;
        return;
    }
    list.push(next);
}

export function settingRelationKey(
    app: EnumPortalAppCode,
    settingCode: string,
): string {
    return `${app}.${settingCode}`;
}

export { pbxFieldName } from './pbx-field-registry';
