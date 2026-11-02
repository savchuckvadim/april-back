import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { EventReportSettingsResolver } from '../services/settings/event-report-settings.resolver';
import {
    DEFAULT_FIELD_POLICY_SETTINGS,
    DEFAULT_STAGE_RULE_SETTINGS,
} from '../services/entity/field-policy';
import { DEFAULT_POST_FAIL_SETTINGS } from '../services/post-fail/post-fail.settings';

/**
 * Настройки отчёта: читаются из настроек приложения «Звонки», при их
 * недоступности — дефолты схемы (политики, стадии, пост-отказ) и
 * выключенные чек-листы; отчёт из-за настроек не падает.
 */
const makeResolver = (
    settings: Record<string, unknown> | Error = {},
): EventReportSettingsResolver =>
    new EventReportSettingsResolver({
        resolve: () =>
            settings instanceof Error
                ? Promise.reject(settings)
                : Promise.resolve(settings),
    } as unknown as PortalAppSettingsService);

describe('EventReportSettingsResolver', () => {
    it('читает чек-листы, политики полей, правила стадий и пост-отказ из настроек', async () => {
        const resolver = makeResolver({
            withTaskChecklist: true,
            withCalculatedNextEvent: false,
            withFinalFieldsReset: true,
            withRefineStageOnPlan: true,
            withPostFail: true,
            postFailAssignUserId: '251',
            postFailCompanyDateTextField: ' UF_CRM_1401340642 ',
        });

        expect(await resolver.taskChecklistEnabled('d')).toBe(true);
        expect(await resolver.fieldPolicy('d')).toEqual({
            calculatedNextEvent: false,
            resetOnFinal: true,
        });
        expect(await resolver.stageRule('d')).toEqual({
            refineStageOnPlan: true,
        });
        expect(await resolver.postFail('d')).toEqual({
            enabled: true,
            assignUserId: 251,
            companyDateTextField: 'UF_CRM_1401340642',
        });
    });

    it('пост-отказ: мусорный или нулевой сотрудник → 0, пустое поле → пустая строка', async () => {
        const resolver = makeResolver({
            withPostFail: true,
            postFailAssignUserId: 'abc',
        });
        expect(await resolver.postFail('d')).toEqual({
            enabled: true,
            assignUserId: 0,
            companyDateTextField: '',
        });
    });

    it('настройки недоступны — дефолты схемы и выключенные чек-листы, без исключения', async () => {
        const resolver = makeResolver(new Error('redis down'));

        expect(await resolver.taskChecklistEnabled('d')).toBe(false);
        expect(await resolver.fieldPolicy('d')).toBe(
            DEFAULT_FIELD_POLICY_SETTINGS,
        );
        expect(await resolver.stageRule('d')).toBe(DEFAULT_STAGE_RULE_SETTINGS);
        expect(await resolver.postFail('d')).toBe(DEFAULT_POST_FAIL_SETTINGS);
    });
});
