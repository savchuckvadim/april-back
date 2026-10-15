import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';
import {
    listAppSettingGroups,
    PORTAL_APP_SETTING_GROUPS,
    PortalAppSettingGroupCode,
    resolveAppSettingGroup,
} from '../lib/app-setting-groups';
import { APP_SETTING_GROUP_DOCS } from '../lib/app-setting-group-docs';

/**
 * Внутренняя документация категорий — для сотрудников April, не для
 * клиента: у каждой содержательной категории она есть, коды настроек в
 * ней существуют, клиентских оборотов «попросите разработчика» нет.
 */
describe('внутренняя документация категорий настроек', () => {
    const DOC_OPTIONAL: readonly PortalAppSettingGroupCode[] = [
        'portal_product',
        'other',
    ];
    const allCodes = new Set<string>(
        Object.values(EnumPortalAppCode).flatMap(appCode =>
            Object.values(
                PORTAL_APP_SETTINGS_SCHEMA[appCode] as Record<
                    string,
                    PortalAppSettingDescriptor
                >,
            ).map(descriptor => descriptor.code),
        ),
    );

    it('есть у каждой категории, кроме служебных', () => {
        const groups = Object.keys(
            PORTAL_APP_SETTING_GROUPS,
        ) as PortalAppSettingGroupCode[];
        const missing = groups.filter(
            code =>
                !DOC_OPTIONAL.includes(code) && !APP_SETTING_GROUP_DOCS[code],
        );
        expect(missing).toEqual([]);
    });

    /**
     * Префиксы, которые в реестре принадлежат ТОЛЬКО настройкам (поля PBX и
     * стадии так не начинаются): упомянутый в бэктиках код с таким
     * префиксом обязан быть ключом реестра — опечатка в документации
     * отправила бы сотрудника искать несуществующую настройку.
     */
    const SETTING_ONLY_PREFIX =
        /^(lead_intake_|lead_work_|lead_client_|xo_rescue_|reject_revive_|deal_audit_|duplicate_report_|with_|checklist_|ai_analytics_|bitrix_|visibility_)[a-z0-9_]*[a-z0-9]$/;

    it.each(Object.entries(APP_SETTING_GROUP_DOCS))(
        '%s: упомянутые коды настроек существуют, клиентских оборотов нет',
        (_code, doc) => {
            const text = doc ?? '';
            const mentioned = [...text.matchAll(/`([a-z0-9_]+)`/g)]
                .map(match => match[1] ?? '')
                .filter(token => SETTING_ONLY_PREFIX.test(token));
            const unknown = mentioned.filter(token => !allCodes.has(token));

            expect(unknown).toEqual([]);
            expect(text).not.toMatch(/попросите разработчика/i);
        },
    );

    it('listAppSettingGroups отдаёт документацию вместе с группой', () => {
        const [group] = listAppSettingGroups(
            new Set<PortalAppSettingGroupCode>(['lead_sla']),
        );
        expect(group?.theory).toEqual(APP_SETTING_GROUP_DOCS.lead_sla);
    });
});

/**
 * Категории настроек админки (запрос владельца 13.10.2026: в сотне ключей
 * event-sales не найти нужное). Группа считается правилом по коду — тест
 * держит, что ни один ключ реестра не падает в «Прочее» и каждая ссылка
 * ведёт в раздел карточки портала.
 */

const codesOf = (appCode: EnumPortalAppCode): string[] =>
    Object.values(
        PORTAL_APP_SETTINGS_SCHEMA[appCode] as Record<
            string,
            PortalAppSettingDescriptor
        >,
    ).map(descriptor => descriptor.code);

describe('категории настроек приложений', () => {
    it.each(Object.values(EnumPortalAppCode))(
        'приложение %s: ни один ключ не попал в «Прочее»',
        appCode => {
            const other = codesOf(appCode).filter(
                code => resolveAppSettingGroup(appCode, code) === 'other',
            );
            expect(other).toEqual([]);
        },
    );

    it('ключи раскладываются по смыслу', () => {
        const app = EnumPortalAppCode.eventSales;
        expect(resolveAppSettingGroup(app, 'xo_rescue_enabled')).toBe(
            'xo_rescue',
        );
        expect(
            resolveAppSettingGroup(app, 'reject_revive_resend_after_minutes'),
        ).toBe('xo_rescue');
        expect(resolveAppSettingGroup(app, 'reject_revive_enabled')).toBe(
            'reject_revive',
        );
        expect(resolveAppSettingGroup(app, 'lead_intake_sla_minutes')).toBe(
            'lead_sla',
        );
        expect(
            resolveAppSettingGroup(app, 'lead_intake_sla_repeat_multiplier'),
        ).toBe('lead_sla');
        expect(
            resolveAppSettingGroup(app, 'lead_intake_repeat_join_mode'),
        ).toBe('lead_repeat');
        expect(resolveAppSettingGroup(app, 'with_ai')).toBe('calls_features');
        expect(resolveAppSettingGroup(app, 'checklist_pay_enabled')).toBe(
            'calls_checklists',
        );
        expect(resolveAppSettingGroup(app, 'deal_audit_dry_run')).toBe(
            'deal_audit',
        );
        expect(
            resolveAppSettingGroup(
                EnumPortalAppCode.kpiSales,
                'ai_analytics_levels',
            ),
        ).toBe('ai_analytics_people');
        expect(
            resolveAppSettingGroup(
                EnumPortalAppCode.kpiSales,
                'ai_analytics_enabled',
            ),
        ).toBe('ai_analytics_main');
    });

    it('группы отдаются в порядке справочника и только использованные', () => {
        const used = new Set<PortalAppSettingGroupCode>([
            'deal_audit',
            'lead_sla',
        ]);
        expect(listAppSettingGroups(used).map(group => group.code)).toEqual([
            'lead_sla',
            'deal_audit',
        ]);
    });

    it('ссылки ведут в разделы карточки портала', () => {
        for (const group of Object.values(PORTAL_APP_SETTING_GROUPS)) {
            for (const item of group.links) {
                expect(item.href.startsWith('/portal/{portalId}/')).toBe(true);
                expect(item.title.length).toBeGreaterThan(0);
            }
        }
    });
});
