import { InstallCallReportSmartUseCase } from '../use-cases/install-call-report-smart.use-case';
import {
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
} from '../config/call-report-smart.config';

const DOMAIN = 'test.bitrix24.ru';

const makeDeps = (options: {
    existingType?: boolean;
    existingFieldCodes?: string[];
}) => {
    const bitrix = {
        smartType: {
            // id (128) ≠ entityTypeId (1056): UF-имена строятся по id!
            getListFull: jest.fn().mockResolvedValue(
                options.existingType
                    ? [
                          {
                              code: CALL_REPORT_SMART_CODE,
                              id: 128,
                              entityTypeId: 1056,
                          },
                      ]
                    : [],
            ),
            add: jest.fn().mockResolvedValue({
                result: { type: { id: 128, entityTypeId: 1056 } },
            }),
            // Существующему типу best-effort доводятся relations.parent.
            update: jest.fn().mockResolvedValue({ result: {} }),
        },
        userFieldConfig: {
            getAllWithItems: jest.fn().mockResolvedValue(
                (options.existingFieldCodes ?? []).map(code => ({
                    fieldName: `UF_CRM_128_${code}`,
                })),
            ),
            add: jest.fn().mockResolvedValue({ result: {} }),
            update: jest.fn().mockResolvedValue({ result: {} }),
        },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const resolver = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const portalSmart = {
        upsertFromBitrix: jest.fn().mockResolvedValue(undefined),
    };
    const aicallSmart = {
        mirrorFields: jest.fn().mockResolvedValue(5),
    };
    const useCase = new InstallCallReportSmartUseCase(
        pbxService as never,
        resolver as never,
        portalSmart as never,
        aicallSmart as never,
    );
    return { useCase, bitrix, resolver, portalSmart, aicallSmart };
};

describe('InstallCallReportSmartUseCase', () => {
    it('создаёт тип и все поля на чистом портале', async () => {
        const { useCase, bitrix, resolver } = makeDeps({});
        const result = await useCase.execute(DOMAIN);

        expect(bitrix.smartType.add).toHaveBeenCalled();
        expect(result.created).toBe(true);
        expect(result.entityTypeId).toBe(1056);
        expect(result.fieldsAdded).toHaveLength(
            CALL_REPORT_SMART_FIELDS.length,
        );
        expect(bitrix.userFieldConfig.add).toHaveBeenCalledTimes(
            CALL_REPORT_SMART_FIELDS.length,
        );
        expect(resolver.invalidate).toHaveBeenCalledWith(DOMAIN);
    });

    it('зеркалит смарт в smarts и поля в PortalDB; сбои зеркал не роняют установку', async () => {
        const { useCase, portalSmart, aicallSmart, resolver } = makeDeps({
            existingType: true,
        });
        await useCase.execute(DOMAIN);
        expect(portalSmart.upsertFromBitrix).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ entityTypeId: 1056 }),
            'aicall',
            'sales',
        );
        // Зеркало полей и UF-имена — по id типа (128), НЕ по entityTypeId;
        // entityTypeId передаётся для чтения фактических camel-ключей.
        expect(aicallSmart.mirrorFields).toHaveBeenCalledWith(
            DOMAIN,
            128,
            expect.any(Array),
            1056,
        );
        expect(resolver.invalidate).toHaveBeenCalledWith(DOMAIN);

        portalSmart.upsertFromBitrix.mockRejectedValue(
            new Error('Portal not found'),
        );
        aicallSmart.mirrorFields.mockRejectedValue(new Error('no smarts row'));
        const result = await useCase.execute(DOMAIN);
        expect(result.entityTypeId).toBe(1056);
    });

    it('идемпотентность: существующий тип не пересоздаётся, добавляются только новые поля', async () => {
        const { useCase, bitrix } = makeDeps({
            existingType: true,
            existingFieldCodes: ['ACTIVITY_ID', 'SUMMARY'],
        });
        const result = await useCase.execute(DOMAIN);

        expect(bitrix.smartType.add).not.toHaveBeenCalled();
        expect(result.created).toBe(false);
        expect(result.fieldsExisting).toEqual([
            'UF_CRM_128_ACTIVITY_ID',
            'UF_CRM_128_SUMMARY',
        ]);
        expect(result.fieldsAdded).toHaveLength(
            CALL_REPORT_SMART_FIELDS.length - 2,
        );
    });

    it('чинит существующее crm-поле без привязки к сделке (иначе D_123 не сохраняется)', async () => {
        const { useCase, bitrix } = makeDeps({ existingType: true });
        bitrix.userFieldConfig.getAllWithItems.mockResolvedValue([
            // Создано до 22.07.2026 — settings пустые, значения молча теряются.
            { id: 900, fieldName: 'UF_CRM_128_DEAL_MAIN' },
            // Уже с привязкой — трогать не надо.
            {
                id: 901,
                fieldName: 'UF_CRM_128_DEAL_PRESENTATION',
                settings: { DEAL: 'Y' },
            },
            // Не crm-поле — привязка не применима.
            { id: 902, fieldName: 'UF_CRM_128_SUMMARY' },
        ]);

        await useCase.execute(DOMAIN);

        expect(bitrix.userFieldConfig.update).toHaveBeenCalledTimes(1);
        expect(bitrix.userFieldConfig.update).toHaveBeenCalledWith({
            moduleId: 'crm',
            id: 900,
            field: { settings: { DEAL: 'Y' } },
        });
    });

    it('сбой починки привязки не роняет установку', async () => {
        const { useCase, bitrix } = makeDeps({ existingType: true });
        bitrix.userFieldConfig.getAllWithItems.mockResolvedValue([
            { id: 900, fieldName: 'UF_CRM_128_DEAL_MAIN' },
        ]);
        bitrix.userFieldConfig.update.mockRejectedValue(
            new Error('access denied'),
        );

        const result = await useCase.execute(DOMAIN);
        expect(result.entityTypeId).toBe(1056);
    });

    it('ошибка создания одного поля не прерывает установку остальных', async () => {
        const { useCase, bitrix } = makeDeps({ existingType: true });
        bitrix.userFieldConfig.add
            .mockRejectedValueOnce(new Error('bitrix error'))
            .mockResolvedValue({ result: {} });
        const result = await useCase.execute(DOMAIN);

        expect(result.fieldsFailed).toHaveLength(1);
        expect(result.fieldsAdded).toHaveLength(
            CALL_REPORT_SMART_FIELDS.length - 1,
        );
    });
});
