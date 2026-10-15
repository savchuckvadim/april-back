import { NotFoundException } from '@nestjs/common';
import { HooksAdminController } from '../hooks-admin.controller';
import { HookReadinessService } from '../../readiness/hook-readiness.service';
import { HookOperationsService } from '../../monitoring/hook-operations.service';
import { HookReadiness } from '../../readiness/lib/evaluate-readiness';
import { HOOK_CATALOG } from '../../catalog/hook-catalog';

/**
 * Админ-контроллер каталога хуков: список и карточки собираются из
 * статического каталога, состояние портала и операции — из сервисов
 * (здесь замоканы). Проверяем контракт ответа, а не данные портала.
 */
describe('HooksAdminController', () => {
    const readiness: HookReadiness = {
        code: 'lead-to-work',
        status: 'partial',
        enabled: null,
        missingRequired: ['Лид: Корневая сделка Продажи'],
        fields: [
            {
                entity: 'lead',
                code: 'to_base_sales',
                name: 'Корневая сделка Продажи',
                role: 'link',
                required: true,
                installed: false,
                note: null,
            },
        ],
        stages: [
            {
                entity: 'lead',
                code: 'lead_assigned',
                title: 'Назначена менеджеру',
                required: true,
                mapped: true,
                note: null,
            },
        ],
        settings: [
            {
                app: 'event-sales',
                key: 'leadIntakeSlaMinutes',
                code: 'lead_intake_sla_minutes',
                name: 'SLA: минут на принятие',
                type: 'number',
                role: 'param',
                value: 90,
                default: 60,
                stored: true,
                note: 'порог',
            },
        ],
    };

    const evaluateAll = jest.fn(() =>
        Promise.resolve({
            portalId: 7,
            domain: 'gsr.bitrix24.ru',
            hooks: [readiness],
        }),
    );
    const evaluateOne = jest.fn(() =>
        Promise.resolve({ domain: 'gsr.bitrix24.ru', readiness }),
    );
    const requireDomain = jest.fn(() => Promise.resolve('gsr.bitrix24.ru'));
    const listByPortal = jest.fn(() =>
        Promise.resolve({
            operations: [],
            summary: {
                total: 0,
                queued: 0,
                running: 0,
                done: 0,
                failed: 0,
                byHook: [],
                lastActivityAt: null,
            },
        }),
    );

    const controller = new HooksAdminController(
        {
            evaluateAll,
            evaluateOne,
            requireDomain,
        } as unknown as HookReadinessService,
        { listByPortal } as unknown as HookOperationsService,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('список отдаёт каждый хук каталога со счётчиками требований', () => {
        const items = controller.list();

        expect(items.map(item => item.code).sort()).toEqual(
            HOOK_CATALOG.map(entry => entry.code).sort(),
        );
        const leadToWork = items.find(item => item.code === 'lead-to-work');
        expect(leadToWork?.hasOperations).toBe(true);
        expect(leadToWork?.familyTitle).not.toBe('');
        expect(leadToWork?.requiredFieldsCount).toBeGreaterThan(0);
    });

    it('карточка хука несёт названия полей и стадий из реестров и ссылки на статьи', () => {
        const entry = controller.entry('lead-to-work');

        const field = entry.pbxFields.find(
            item => item.code === 'to_base_sales',
        );
        expect(field?.name).not.toBe('to_base_sales');
        expect(field?.type).not.toBe('');
        const stage = entry.stages.find(item => item.code === 'lead_assigned');
        expect(stage?.title).toBe('Назначена менеджеру');
        expect(entry.kbDocs[0]?.url).toMatch(
            /^https:\/\/garantservisvoronezh\.bitrix24\.ru\/note\/document\/\d+\/$/,
        );
        const setting = entry.settings.find(
            item => item.key === 'leadIntakeSlaMinutes',
        );
        expect(setting?.code).toBe('lead_intake_sla_minutes');
    });

    it('неизвестный хук — 404', () => {
        expect(() => controller.entry('no-such-hook')).toThrow(
            NotFoundException,
        );
    });

    it('готовность портала дополняется ссылками на разделы админки', async () => {
        const result = await controller.portalHooks(7);

        expect(evaluateAll).toHaveBeenCalledTimes(1);
        expect(result.domain).toBe('gsr.bitrix24.ru');
        const hook = result.hooks[0];
        expect(hook?.title).not.toBe('');
        expect(hook?.fields[0]?.href).toBe('/portal/{portalId}/pbx/lead');
        expect(hook?.stages[0]?.href).toBe('/portal/{portalId}/pbx/lead');
        expect(hook?.settings[0]?.href).toBe('/portal/{portalId}/app-settings');
    });

    it('операции: фильтр по хуку и лимит по умолчанию 50, окно поясняется', async () => {
        const result = await controller.portalOperations(7, {
            hook: 'lead-to-work',
        });

        expect(listByPortal).toHaveBeenCalledWith(7, 'lead-to-work', 50);
        expect(result.windowNote).toContain('час');
        expect(result.operations).toEqual([]);
    });

    it('готовность одного хука проверяет код по каталогу до запроса к порталу', async () => {
        await expect(controller.portalHook(7, 'no-such-hook')).rejects.toThrow(
            NotFoundException,
        );
        expect(evaluateOne).not.toHaveBeenCalled();
    });
});
