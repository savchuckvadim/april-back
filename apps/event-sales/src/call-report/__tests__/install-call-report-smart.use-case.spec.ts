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
            getListFull: jest.fn().mockResolvedValue(
                options.existingType
                    ? [
                          {
                              code: CALL_REPORT_SMART_CODE,
                              entityTypeId: 128,
                          },
                      ]
                    : [],
            ),
            add: jest.fn().mockResolvedValue({
                result: { type: { id: 5, entityTypeId: 128 } },
            }),
        },
        userFieldConfig: {
            getAllWithItems: jest.fn().mockResolvedValue(
                (options.existingFieldCodes ?? []).map(code => ({
                    fieldName: `UF_CRM_128_${code}`,
                })),
            ),
            add: jest.fn().mockResolvedValue({ result: {} }),
        },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const resolver = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const useCase = new InstallCallReportSmartUseCase(
        pbxService as never,
        resolver as never,
    );
    return { useCase, bitrix, resolver };
};

describe('InstallCallReportSmartUseCase', () => {
    it('создаёт тип и все поля на чистом портале', async () => {
        const { useCase, bitrix, resolver } = makeDeps({});
        const result = await useCase.execute(DOMAIN);

        expect(bitrix.smartType.add).toHaveBeenCalled();
        expect(result.created).toBe(true);
        expect(result.entityTypeId).toBe(128);
        expect(result.fieldsAdded).toHaveLength(
            CALL_REPORT_SMART_FIELDS.length,
        );
        expect(bitrix.userFieldConfig.add).toHaveBeenCalledTimes(
            CALL_REPORT_SMART_FIELDS.length,
        );
        expect(resolver.invalidate).toHaveBeenCalledWith(DOMAIN);
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
