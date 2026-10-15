import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings/portal-app-settings.service';
import {
    BtxCategoryService,
    BtxStageRepository,
    PortalCompanyService,
    PortalDealService,
    PortalLeadService,
} from '@lib/portal-lib/pbx-domain';
import { HookReadinessService } from '../hook-readiness.service';
import { HookCatalogEntry } from '../../catalog/hook-catalog.types';

/**
 * Сервис готовности собирает слепок портала из PortalDB и настроек.
 * Все зависимости замоканы: проверяем, ЧТО и КАК он читает (лид-якорь
 * группы sales, воронка sales_base, коды полей) и как переживает пустой
 * портал и сбой настроек.
 */
describe('HookReadinessService', () => {
    const entry: HookCatalogEntry = {
        code: 'test-hook',
        title: 'Тест',
        family: 'sales-hook',
        kind: 'webhook',
        summary: 's',
        theory: 't',
        howItWorks: 'h',
        triggers: ['робот'],
        endpoints: [],
        params: [],
        settings: [
            { key: 'leadIntakeSlaEnabled', role: 'gate', note: 'рубильник' },
        ],
        pbxFields: [
            {
                entity: 'lead',
                code: 'to_base_sales',
                role: 'link',
                required: true,
            },
            {
                entity: 'deal',
                code: 'deal_from_lead_id',
                role: 'link',
                required: true,
            },
        ],
        stages: [
            { entity: 'lead', code: 'lead_assigned', required: true },
            { entity: 'deal', code: 'sales_new', required: true },
        ],
        kbDocs: [],
        related: [],
        install: 'i',
        verify: 'v',
        operationHook: null,
    };

    const findUnique = jest.fn();
    const resolveWithStored = jest.fn();
    const leadWithFields = jest.fn();
    const leadByPortal = jest.fn();
    const dealWithFields = jest.fn();
    const dealByPortal = jest.fn();
    const companyWithFields = jest.fn();
    const findByEntity = jest.fn();
    const findByCategoryId = jest.fn();

    const service = new HookReadinessService(
        { portal: { findUnique } } as unknown as PrismaService,
        { resolveWithStored } as unknown as PortalAppSettingsService,
        {
            findWithFieldsByPortalId: leadWithFields,
            findByPortalId: leadByPortal,
        } as unknown as PortalLeadService,
        {
            findWithFieldsByPortalId: dealWithFields,
            findByPortalId: dealByPortal,
        } as unknown as PortalDealService,
        {
            findWithFieldsByPortalId: companyWithFields,
        } as unknown as PortalCompanyService,
        { findByEntity } as unknown as BtxCategoryService,
        { findByCategoryId } as unknown as BtxStageRepository,
    );

    beforeEach(() => {
        jest.resetAllMocks();
        findUnique.mockResolvedValue({ domain: 'gsr.bitrix24.ru' });
        resolveWithStored.mockResolvedValue({
            values: { leadIntakeSlaEnabled: true },
            storedKeys: ['leadIntakeSlaEnabled'],
        });
        leadWithFields.mockResolvedValue({
            fields: [{ code: 'to_base_sales' }],
        });
        dealWithFields.mockResolvedValue({ fields: [] });
        companyWithFields.mockResolvedValue(null);
        leadByPortal.mockResolvedValue({ id: 11 });
        dealByPortal.mockResolvedValue({ id: 22 });
        findByEntity.mockImplementation((entityType: string) =>
            Promise.resolve(
                entityType === 'lead'
                    ? [
                          { id: 100, group: 'service', code: 'lead_service' },
                          { id: 101, group: 'sales', code: 'lead_sales' },
                      ]
                    : [
                          { id: 200, group: 'sales', code: 'sales_xo' },
                          { id: 201, group: 'sales', code: 'sales_base' },
                      ],
            ),
        );
        findByCategoryId.mockImplementation((categoryId: number) =>
            Promise.resolve(
                categoryId === 101
                    ? [
                          { code: 'lead_assigned', bitrixId: 'PBX_ASSIGNED' },
                          // Стадия без STATUS_ID в Битриксе — не сопоставлена.
                          { code: 'lead_taken_in_work', bitrixId: '' },
                      ]
                    : categoryId === 201
                      ? [{ code: 'sales_new' }, { code: 'not_a_stage' }]
                      : [{ code: 'lead_assigned', bitrixId: 'X' }],
            ),
        );
    });

    it('собирает слепок: поля, стадии лида группы sales, воронку sales_base и рубильник', async () => {
        const { domain, readiness } = await service.evaluateOne(7, entry);

        expect(domain).toBe('gsr.bitrix24.ru');
        expect(findByCategoryId).toHaveBeenCalledWith(101);
        expect(findByCategoryId).toHaveBeenCalledWith(201);
        expect(findByCategoryId).not.toHaveBeenCalledWith(100);
        expect(readiness.fields.map(f => [f.code, f.installed])).toEqual([
            ['to_base_sales', true],
            ['deal_from_lead_id', false],
        ]);
        expect(readiness.stages.map(s => [s.code, s.mapped])).toEqual([
            ['lead_assigned', true],
            ['sales_new', true],
        ]);
        expect(readiness.status).toBe('partial');
        expect(readiness.enabled).toBe(true);
        expect(readiness.settings[0]?.stored).toBe(true);
    });

    it('портал без лида и сделки в PortalDB — ничего не установлено, без падения', async () => {
        leadWithFields.mockResolvedValue(null);
        dealWithFields.mockResolvedValue(null);
        leadByPortal.mockResolvedValue(null);
        dealByPortal.mockResolvedValue(null);

        const { readiness } = await service.evaluateOne(7, entry);

        expect(readiness.status).toBe('not-installed');
        expect(findByEntity).not.toHaveBeenCalled();
    });

    it('сбой чтения настроек не роняет оценку: рубильник считается выключенным', async () => {
        resolveWithStored.mockRejectedValue(new Error('redis down'));

        const { readiness } = await service.evaluateOne(7, entry);

        expect(readiness.enabled).toBe(false);
        expect(readiness.settings[0]?.stored).toBe(false);
    });

    it('единственная категория лида без группы (legacy) тоже считается якорем', async () => {
        findByEntity.mockImplementation((entityType: string) =>
            Promise.resolve(
                entityType === 'lead'
                    ? [{ id: 300, group: '', code: '' }]
                    : [{ id: 201, group: 'sales', code: 'sales_base' }],
            ),
        );
        findByCategoryId.mockImplementation((categoryId: number) =>
            Promise.resolve(
                categoryId === 300
                    ? [{ code: 'lead_assigned', bitrixId: 'PBX_ASSIGNED' }]
                    : [{ code: 'sales_new' }],
            ),
        );

        const { readiness } = await service.evaluateOne(7, entry);

        expect(findByCategoryId).toHaveBeenCalledWith(300);
        expect(readiness.stages[0]?.mapped).toBe(true);
    });

    it('портала нет или у него нет домена — 404', async () => {
        findUnique.mockResolvedValue(null);

        await expect(service.evaluateOne(7, entry)).rejects.toThrow(
            NotFoundException,
        );
    });
});
