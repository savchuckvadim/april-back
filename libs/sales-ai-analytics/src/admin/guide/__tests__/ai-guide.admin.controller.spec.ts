import { NotFoundException } from '@nestjs/common';
import { AI_ANALYTICS_PARAMS } from '../../../params/registry.const';
import { AiAnalyticsGuideAdminController } from '../ai-guide.admin.controller';
import { AI_GUIDE_SECTIONS } from '../ai-guide.catalog';
import { AI_GUIDE_PARAM_GROUPS } from '../ai-guide.registry';

/**
 * Контроллер путеводителя собирает ответ из статического каталога и
 * реестров: проверяем контракт — названия подтянуты из схемы и реестра,
 * ссылки с плейсхолдером портала, неизвестный код — 404.
 */
describe('AiAnalyticsGuideAdminController', () => {
    const controller = new AiAnalyticsGuideAdminController();

    it('оглавление отдаёт все разделы в порядке каталога со счётчиками', () => {
        const items = controller.list();
        expect(items.map(item => item.code)).toEqual(
            AI_GUIDE_SECTIONS.map(section => section.code),
        );
        const launch = items.find(item => item.code === 'launch-after-release');
        expect(launch?.hasLaunch).toBe(true);
        expect(
            items.find(item => item.code === 'enable-and-push')?.hasLaunch,
        ).toBe(false);
    });

    it('раздел «включение и рассылки»: настройки с названиями из схемы и категорией, якорь на ключ', () => {
        const section = controller.entry('enable-and-push');
        const enabled = section.settings.find(
            item => item.code === 'ai_analytics_enabled',
        );
        expect(enabled).toMatchObject({
            app: 'kpi-sales',
            key: 'aiAnalyticsEnabled',
            name: 'AI-аналитика ОП включена',
            type: 'boolean',
            default: false,
            group: 'ai_analytics_main',
            href: '/portal/{portalId}/app-settings#setting-ai_analytics_enabled',
        });
        expect(enabled?.note.length).toBeGreaterThan(0);
        expect(section.settings.length).toBe(
            AI_GUIDE_SECTIONS.find(item => item.code === 'enable-and-push')
                ?.settings.length,
        );
    });

    it('параметры несут название, слой, диапазон и группу из реестра; заметка раздела сохраняется', () => {
        const section = controller.entry('model-and-data');
        const weak = section.params.find(
            item => item.code === 'weak_section_score_max',
        );
        expect(weak).toMatchObject({
            title: 'Порог слабого раздела разговора',
            scope: 'portal',
            default: 5,
            range: [3, 7],
            group: 'thresholds',
            groupTitle: AI_GUIDE_PARAM_GROUPS.thresholds.title,
        });
        const codes = section.params.map(item => item.code);
        expect(new Set(codes).size).toBe(codes.length);
        const allGroupCodes = Object.values(AI_GUIDE_PARAM_GROUPS).flatMap(
            group => group.params.map(descriptor => descriptor.code),
        );
        expect(codes).toEqual(expect.arrayContaining(allGroupCodes));
        expect(codes.length).toBeLessThanOrEqual(AI_ANALYTICS_PARAMS.length);

        const launch = controller.entry('launch-after-release');
        expect(
            launch.params.find(item => item.code === 'forecast_stage_enabled')
                ?.note,
        ).toBeNull();
        const forecast = controller.entry('forecast');
        expect(
            forecast.params.find(item => item.code === 'forecast_stage_enabled')
                ?.note,
        ).toContain('pass');
    });

    it('kind базы знаний — с названием из реестра и ссылкой на базу знаний портала', () => {
        const section = controller.entry('call-analysis');
        const invite = section.knowledgeKinds.find(
            item => item.kind === 'call-analysis-event-invite',
        );
        expect(invite).toMatchObject({
            title: 'Анализ: приглашение на мероприятие',
            clientEditable: true,
            href: '/portal/{portalId}/ai-settings?tab=knowledge&kind=call-analysis-event-invite',
        });
        expect(section.knowledgeKinds.map(item => item.kind)).toEqual(
            expect.arrayContaining([
                'call-analysis-cold',
                'call-analysis-refine',
                'call-classify',
                'call-type-registry',
            ]),
        );
    });

    it('поля настроек AI портала — с названием и ссылкой на вкладку ai-settings', () => {
        const section = controller.entry('call-analysis');
        const pilot = section.portalAiSettings.find(
            item => item.field === 'allowedUserIds',
        );
        expect(pilot?.title).toContain('Пилот');
        expect(pilot?.href).toBe('/portal/{portalId}/ai-settings');
    });

    it('ручки: действие, тело и Swagger; внешние приложения помечены', () => {
        const section = controller.entry('launch-after-release');
        const push = section.endpoints.find(item => item.action === 'push');
        expect(push).toMatchObject({
            app: 'kpi-report-sales',
            method: 'POST',
            path: 'ai-analytics/push',
            swaggerPath: '/docs/api',
        });
        // Смарт с 21.10.2026 — кнопкой панели запуска через ручку admin.
        const install = section.endpoints.find(
            item => item.path === 'admin/pbx/smarts/install-aicall',
        );
        expect(install).toMatchObject({
            app: 'admin',
            method: 'POST',
            body: '{"domain":"{domain}"}',
            action: null,
        });
        const backfill = section.endpoints.find(
            item => item.action === 'backfill',
        );
        expect(backfill?.app).toBe('admin');
        expect(section.launch.length).toBeGreaterThan(5);
        // Шаги панели — кнопками, формы ручек остались в списке «Ручки».
        expect(section.launch[0]).toMatchObject({
            code: 'install-smart',
            action: null,
        });
    });

    it('связанные разделы резолвятся в коды и названия', () => {
        const section = controller.entry('forecast');
        expect(section.related).toEqual(
            expect.arrayContaining([
                { code: 'model-and-data', title: 'Модель и данные' },
            ]),
        );
    });

    it('неизвестный код раздела — 404', () => {
        expect(() => controller.entry('nope')).toThrow(NotFoundException);
    });
});
