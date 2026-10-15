import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import { PBX_LEAD_STAGE_CODES } from '@lib/portal-lib/pbx-domain/portal-lead/stages/const/pbx-lead-stages.const';
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    findHookEntry,
    HOOK_CATALOG,
    HOOK_FAMILY_ORDER,
    listHookEntries,
} from '../hook-catalog';
import {
    KB_DOC_KEYS,
    KB_DOCS,
    KB_STUB_DOC_KEYS,
    KbDocKey,
    kbDocLink,
    kbDocUrl,
} from '../kb-docs';
import {
    buildSettingRelations,
    settingRelationKey,
} from '../lib/setting-relations';
import { PBX_FIELD_REGISTRY } from '../lib/pbx-field-registry';

const FIELD_CODES = new Set<string>(PBX_FIELD_REGISTRY.keys());
const LEAD_STAGE_CODES = new Set<string>(PBX_LEAD_STAGE_CODES);
const DEAL_STAGE_CODES = new Set<string>(
    PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code),
);
const KB_KEYS = new Set<string>(KB_DOC_KEYS);

/**
 * Реестр каталога хуков: записи ссылаются только на существующие
 * настройки, поля, стадии, статьи и хуки. Выдуманный код здесь падает —
 * админка не покажет ссылку в никуда.
 */
describe('HOOK_CATALOG: целостность реестра', () => {
    it('коды уникальны и непустые, реестр не пуст', () => {
        expect(HOOK_CATALOG.length).toBeGreaterThan(0);
        const codes = HOOK_CATALOG.map(entry => entry.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const code of codes) {
            expect(code).toMatch(/^[a-z0-9-]+$/);
        }
    });

    it.each(HOOK_CATALOG.map(entry => [entry.code, entry] as const))(
        '%s: обязательные тексты заполнены',
        (_code, entry) => {
            expect(entry.title.trim()).not.toBe('');
            expect(entry.summary.trim()).not.toBe('');
            expect(entry.theory.trim()).not.toBe('');
            expect(entry.howItWorks.trim()).not.toBe('');
            expect(entry.install.trim()).not.toBe('');
            expect(entry.verify.trim()).not.toBe('');
            expect(entry.triggers.length).toBeGreaterThan(0);
            expect(HOOK_FAMILY_ORDER).toContain(entry.family);
            if (entry.family === 'cron') {
                expect(entry.cron).toBeDefined();
            }
        },
    );

    it.each(HOOK_CATALOG.map(entry => [entry.code, entry] as const))(
        '%s: настройки существуют в схеме приложения',
        (_code, entry) => {
            for (const ref of entry.settings) {
                const app = ref.app ?? EnumPortalAppCode.eventSales;
                const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
                    string,
                    unknown
                >;
                expect(schema[ref.key]).toBeDefined();
                expect(ref.note.trim()).not.toBe('');
            }
        },
    );

    it.each(HOOK_CATALOG.map(entry => [entry.code, entry] as const))(
        '%s: PBX-поля есть в реестрах событий продаж и конструктора',
        (_code, entry) => {
            const unknown = entry.pbxFields
                .map(field => field.code)
                .filter(code => !FIELD_CODES.has(code));
            expect(unknown).toEqual([]);
            const keys = entry.pbxFields.map(f => `${f.entity}:${f.code}`);
            expect(new Set(keys).size).toBe(keys.length);
        },
    );

    it.each(HOOK_CATALOG.map(entry => [entry.code, entry] as const))(
        '%s: стадии есть в шаблонах лида и воронки ОП',
        (_code, entry) => {
            for (const stage of entry.stages) {
                const known =
                    stage.entity === 'lead'
                        ? LEAD_STAGE_CODES
                        : DEAL_STAGE_CODES;
                expect(known.has(stage.code)).toBe(true);
            }
        },
    );

    it.each(HOOK_CATALOG.map(entry => [entry.code, entry] as const))(
        '%s: ссылки на статьи и связанные хуки резолвятся',
        (_code, entry) => {
            for (const key of entry.kbDocs) {
                expect(KB_KEYS.has(key)).toBe(true);
                expect(kbDocUrl(key)).toMatch(/\/note\/document\/\d+\/$/);
            }
            for (const related of entry.related) {
                expect(related).not.toBe(entry.code);
                expect(findHookEntry(related)).not.toBeNull();
            }
        },
    );

    it('operationHook ссылается на существующий sales-hook', () => {
        for (const entry of HOOK_CATALOG) {
            if (entry.operationHook === null) continue;
            const target = findHookEntry(entry.operationHook);
            expect(target).not.toBeNull();
        }
    });

    it('listHookEntries сортирует по порядку семейств', () => {
        const families = listHookEntries().map(entry => entry.family);
        const ranks = families.map(f => HOOK_FAMILY_ORDER.indexOf(f));
        for (let i = 1; i < ranks.length; i += 1) {
            expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1] ?? 0);
        }
    });

    it('ссылка на статью m10 — опубликованный документ #33', () => {
        expect(kbDocUrl('m10')).toBe(
            'https://garantservisvoronezh.bitrix24.ru/note/document/33/',
        );
    });

    /**
     * Карта номеров сверена хэшами со слепком выкладки (38 из 38): h12,
     * h14 и h13 добавлялись позже и получили последние номера. Порядок
     * дерева здесь не помогает — ловим возврат к нему.
     */
    it('номера документов — по слепку выкладки, а не по порядку дерева', () => {
        const ids = (keys: KbDocKey[]) => keys.map(key => KB_DOCS[key].id);
        expect(ids(['gm', 'm1', 'm4', 'm14', 'gh'])).toEqual([
            13, 15, 21, 41, 43,
        ]);
        expect(ids(['h1', 'h6', 'h8', 'h11', 'faq', 'gs'])).toEqual([
            45, 55, 59, 65, 67, 69,
        ]);
        expect(ids(['s1', 's2', 's5', 'h12', 'h14', 'h13'])).toEqual([
            71, 73, 79, 81, 83, 85,
        ]);
        const all = KB_DOC_KEYS.map(key => KB_DOCS[key].id);
        expect(new Set(all).size).toBe(all.length);
    });

    it('заготовки «готовится» помечены как неготовые, остальные — готовые', () => {
        expect(kbDocLink('s4').ready).toBe(false);
        expect(kbDocLink('h8').ready).toBe(false);
        expect(kbDocLink('m10').ready).toBe(true);
        expect(kbDocLink('s1').ready).toBe(true);
        for (const key of KB_STUB_DOC_KEYS) {
            expect(KB_DOC_KEYS).toContain(key);
        }
    });
});

describe('buildSettingRelations', () => {
    it('настройка lead-to-work знает свой хук и поля', () => {
        const relations = buildSettingRelations(HOOK_CATALOG);
        const key = settingRelationKey(
            EnumPortalAppCode.eventSales,
            'lead_intake_sla_minutes',
        );
        const item = relations.get(key);
        expect(item).toBeDefined();
        expect(item?.hooks.map(h => h.code)).toContain('lead-to-work');
        expect(
            item?.pbxFields.some(
                f => f.entity === 'lead' && f.code === 'to_base_sales',
            ),
        ).toBe(true);
        // Название — из реестра полей, а не код.
        const field = item?.pbxFields.find(f => f.code === 'to_base_sales');
        expect(field?.name).not.toBe('to_base_sales');
    });

    it('неизвестный ключ настройки в карту не попадает', () => {
        const base = HOOK_CATALOG[0];
        if (!base) throw new Error('каталог пуст');
        const relations = buildSettingRelations([
            {
                ...base,
                code: 'fake',
                settings: [{ key: 'noSuchKey', role: 'param', note: 'x' }],
            },
        ]);
        expect(relations.size).toBe(0);
    });
});
