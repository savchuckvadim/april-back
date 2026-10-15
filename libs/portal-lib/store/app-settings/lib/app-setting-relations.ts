// Точечные импорты каталога хуков (не индекс @lib/portal-lib/hooks):
// индекс тянет админ-модуль хуков, а тот — сервис настроек; точечный
// импорт чистых функций цикла не создаёт.
import { HOOK_CATALOG } from '@lib/portal-lib/hooks/catalog/hook-catalog';
import {
    buildSettingRelations,
    SettingRelations,
    settingRelationKey,
} from '@lib/portal-lib/hooks/catalog/lib/setting-relations';
import { EnumPortalAppCode } from '../portal-app-settings.schema';
import type {
    PortalAppSettingHookLinkDto,
    PortalAppSettingPbxFieldDto,
    PortalAppSettingStageDto,
} from '../portal-app-settings.dto';

/** Разделы админки: страница хука и раздел PBX сущности (`{portalId}` подставляет фронт). */
const HOOK_HREF = '/portal/{portalId}/hooks/{code}';
const PBX_HREF: Record<PortalAppSettingPbxFieldDto['entity'], string> = {
    lead: '/portal/{portalId}/pbx/lead',
    deal: '/portal/{portalId}/pbx/deal',
    company: '/portal/{portalId}/pbx/company',
    contact: '/portal/{portalId}/pbx/contact',
    task: '/portal/{portalId}/pbx/task',
};

/** Связи одной настройки или категории в форме ответа админки. */
export interface AppSettingRelationsView {
    hooks: PortalAppSettingHookLinkDto[];
    pbxFields: PortalAppSettingPbxFieldDto[];
    stages: PortalAppSettingStageDto[];
}

/** Карта связей считается один раз: каталог статический. */
const SETTING_RELATIONS = buildSettingRelations(HOOK_CATALOG);

const toView = (
    relations: SettingRelations | undefined,
): AppSettingRelationsView => ({
    hooks: (relations?.hooks ?? []).map(hook => ({
        code: hook.code,
        title: hook.title,
        href: HOOK_HREF.replace('{code}', hook.code),
        role: hook.role,
        note: hook.note,
    })),
    pbxFields: (relations?.pbxFields ?? []).map(field => ({
        entity: field.entity,
        code: field.code,
        name: field.name,
        required: field.required,
        href: PBX_HREF[field.entity],
    })),
    stages: (relations?.stages ?? []).map(stage => ({
        entity: stage.entity,
        code: stage.code,
        title: stage.title,
        required: stage.required,
        href: PBX_HREF[stage.entity],
    })),
});

/** Связи настройки с каталогом хуков (пустые, если хуки её не читают). */
export function resolveSettingRelations(
    appCode: EnumPortalAppCode,
    settingCode: string,
): AppSettingRelationsView {
    return toView(
        SETTING_RELATIONS.get(settingRelationKey(appCode, settingCode)),
    );
}

/**
 * Объединение связей настроек категории: хук — один раз (заметки разных
 * настроек у категории не нужны, они видны у самих настроек), поле и
 * стадия — один раз, обязательность — «обязательно хотя бы одной
 * настройке». Порядок — порядок первого появления.
 */
export class GroupRelationsAccumulator {
    private readonly hooks = new Map<string, PortalAppSettingHookLinkDto>();
    private readonly fields = new Map<string, PortalAppSettingPbxFieldDto>();
    private readonly stages = new Map<string, PortalAppSettingStageDto>();

    add(view: AppSettingRelationsView): void {
        for (const hook of view.hooks) {
            const existing = this.hooks.get(hook.code);
            // Рубильник сильнее параметра: категория показывает, что хук
            // в ней включается, если хоть одна её настройка — его gate.
            if (
                !existing ||
                (existing.role === 'param' && hook.role === 'gate')
            ) {
                this.hooks.set(hook.code, { ...hook });
            }
        }
        for (const field of view.pbxFields) {
            const key = `${field.entity}:${field.code}`;
            const existing = this.fields.get(key);
            if (existing)
                existing.required = existing.required || field.required;
            else this.fields.set(key, { ...field });
        }
        for (const stage of view.stages) {
            const key = `${stage.entity}:${stage.code}`;
            const existing = this.stages.get(key);
            if (existing)
                existing.required = existing.required || stage.required;
            else this.stages.set(key, { ...stage });
        }
    }

    result(): AppSettingRelationsView {
        return {
            hooks: [...this.hooks.values()],
            pbxFields: [...this.fields.values()],
            stages: [...this.stages.values()],
        };
    }
}

/** Связи в ответ — только непустые: у ключей без хуков ответ не меняется. */
export function relationsPayload(
    view: AppSettingRelationsView,
): Partial<AppSettingRelationsView> {
    return {
        ...(view.hooks.length ? { hooks: view.hooks } : {}),
        ...(view.pbxFields.length ? { pbxFields: view.pbxFields } : {}),
        ...(view.stages.length ? { stages: view.stages } : {}),
    };
}
