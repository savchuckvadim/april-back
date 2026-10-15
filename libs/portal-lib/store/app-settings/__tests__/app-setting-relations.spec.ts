import { EnumPortalAppCode } from '../portal-app-settings.schema';
import {
    AppSettingRelationsView,
    GroupRelationsAccumulator,
    relationsPayload,
    resolveSettingRelations,
} from '../lib/app-setting-relations';

/**
 * Связи настроек с каталогом хуков — внутренняя документация админки:
 * у настройки видно, какой хук её читает и КАК (роль, заметка), какие
 * поля и стадии при этом нужны и обязательны ли они.
 */
describe('app-setting-relations', () => {
    it('настройка SLA: хук «Лид → работа» с ролью и заметкой, обязательные поля и стадии', () => {
        const view = resolveSettingRelations(
            EnumPortalAppCode.eventSales,
            'lead_intake_sla_minutes',
        );

        const hook = view.hooks.find(item => item.code === 'lead-to-work');
        expect(hook?.role).toBe('param');
        expect(hook?.note).toEqual(expect.stringContaining('SLA'));
        expect(hook?.href).toBe('/portal/{portalId}/hooks/lead-to-work');

        const field = view.pbxFields.find(
            item => item.entity === 'lead' && item.code === 'to_base_sales',
        );
        expect(field?.required).toBe(true);
        expect(field?.href).toBe('/portal/{portalId}/pbx/lead');

        const stage = view.stages.find(item => item.code === 'lead_assigned');
        expect(stage).toEqual(
            expect.objectContaining({
                entity: 'lead',
                title: 'Назначена менеджеру',
                required: true,
                href: '/portal/{portalId}/pbx/lead',
            }),
        );
    });

    it('рубильник крона помечен ролью gate', () => {
        const view = resolveSettingRelations(
            EnumPortalAppCode.eventSales,
            'lead_intake_rescue_enabled',
        );

        expect(view.hooks.some(hook => hook.role === 'gate')).toBe(true);
    });

    it('настройка без хуков — пустые связи и пустой payload', () => {
        const view = resolveSettingRelations(
            EnumPortalAppCode.eventSales,
            'with_presentation_animate',
        );

        expect(view).toEqual({ hooks: [], pbxFields: [], stages: [] });
        expect(relationsPayload(view)).toEqual({});
    });

    it('категория: обязательность «хотя бы одной», gate сильнее param, без дублей', () => {
        const base: AppSettingRelationsView = {
            hooks: [
                {
                    code: 'h',
                    title: 'Хук',
                    href: '/h',
                    role: 'param',
                    note: 'a',
                },
            ],
            pbxFields: [
                {
                    entity: 'lead',
                    code: 'f',
                    name: 'Поле',
                    required: false,
                    href: '/p',
                },
            ],
            stages: [
                {
                    entity: 'deal',
                    code: 's',
                    title: 'Стадия',
                    required: false,
                    href: '/p',
                },
            ],
        };
        const stronger: AppSettingRelationsView = {
            hooks: [{ ...base.hooks[0], role: 'gate', note: 'b' }],
            pbxFields: [{ ...base.pbxFields[0], required: true }],
            stages: [{ ...base.stages[0], required: true }],
        };

        const accumulator = new GroupRelationsAccumulator();
        accumulator.add(base);
        accumulator.add(stronger);
        const result = accumulator.result();

        expect(result.hooks).toHaveLength(1);
        expect(result.hooks[0]?.role).toBe('gate');
        expect(result.pbxFields).toHaveLength(1);
        expect(result.pbxFields[0]?.required).toBe(true);
        expect(result.stages[0]?.required).toBe(true);
        // Исходные объекты не мутируются.
        expect(base.pbxFields[0]?.required).toBe(false);
    });
});
