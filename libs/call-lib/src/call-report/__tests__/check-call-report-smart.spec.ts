import { EUserFieldType, type IUserFieldConfig } from '@/modules/bitrix';
import {
    CALL_REPORT_METHODOLOGY_FIELD_CODES,
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
    buildCallReportUfName,
} from '../config/call-report-smart.config';
import { CheckCallReportSmartUseCase } from '../use-cases/check-call-report-smart.use-case';
import { checkCallReportSmartFields } from '../use-cases/check-call-report-smart.util';

const TYPE_ID = 7;
const DOMAIN = 'gsr.bitrix24.ru';

/** Поле портала по определению конфига: списки — со всеми значениями. */
const fieldOf = (
    code: string,
    overrides: Partial<IUserFieldConfig> = {},
): IUserFieldConfig => {
    const def = CALL_REPORT_SMART_FIELDS.find(item => item.code === code);
    return {
        entityId: `CRM_${TYPE_ID}`,
        fieldName: buildCallReportUfName(TYPE_ID, code),
        userTypeId: EUserFieldType.STRING,
        xmlId: code,
        multiple: 'N',
        mandatory: 'N',
        showFilter: 'N',
        showInList: 'N',
        isSearchable: 'N',
        enum: (def?.items ?? []).map(item => ({
            value: item.VALUE,
            def: 'N' as const,
            sort: item.SORT,
            xmlId: item.CODE,
        })),
        ...overrides,
    };
};

/** Все поля конфига, кроме перечисленных кодов. */
const allFieldsExcept = (codes: readonly string[]): IUserFieldConfig[] =>
    CALL_REPORT_SMART_FIELDS.filter(def => !codes.includes(def.code)).map(def =>
        fieldOf(def.code),
    );

describe('проверка полей смарта «AI-анализ звонков»', () => {
    it('все поля на месте: пропусков, лишних и неполных списков нет', () => {
        const check = checkCallReportSmartFields(TYPE_ID, allFieldsExcept([]));

        expect(check).toMatchObject({
            expected: CALL_REPORT_SMART_FIELDS.length,
            present: CALL_REPORT_SMART_FIELDS.length,
            total: CALL_REPORT_SMART_FIELDS.length,
            methodologyExpected: CALL_REPORT_METHODOLOGY_FIELD_CODES.length,
            methodologyPresent: CALL_REPORT_METHODOLOGY_FIELD_CODES.length,
            missing: [],
            enumGaps: [],
            extra: [],
        });
    });

    it('портал с лимитом полей: создано 2 поля методики из 6 — остальные названы с разделом карточки', () => {
        const absent = [
            'SPIRALS_FULL',
            'DEAL_PROGRESS',
            'CAPS_APPLIED',
            'CHECKPOINTS_TOTAL',
        ];
        const check = checkCallReportSmartFields(
            TYPE_ID,
            allFieldsExcept(absent),
        );

        expect(check.methodologyPresent).toBe(2);
        expect(check.present).toBe(CALL_REPORT_SMART_FIELDS.length - 4);
        expect(check.missing.map(item => item.code).sort()).toEqual(
            [...absent].sort(),
        );
        expect(check.missing.every(item => item.methodology)).toBe(true);
        expect(
            check.missing.find(item => item.code === 'SPIRALS_FULL'),
        ).toEqual({
            fieldName: 'UF_CRM_7_SPIRALS_FULL',
            code: 'SPIRALS_FULL',
            title: 'Полных спиралей презентации',
            section: 'Итоги разбора',
            methodology: true,
        });
    });

    it('поле вне методики помечено как обычное', () => {
        const check = checkCallReportSmartFields(
            TYPE_ID,
            allFieldsExcept(['SCORE']),
        );

        expect(check.missing).toHaveLength(1);
        expect(check.missing[0]).toMatchObject({
            code: 'SCORE',
            methodology: false,
        });
        expect(check.methodologyPresent).toBe(
            CALL_REPORT_METHODOLOGY_FIELD_CODES.length,
        );
    });

    it('в списке не хватает значения — названо словами, а не кодом', () => {
        const coaching = fieldOf('COACHING_PRIORITY');
        const check = checkCallReportSmartFields(TYPE_ID, [
            ...allFieldsExcept(['COACHING_PRIORITY']),
            {
                ...coaching,
                enum: (coaching.enum ?? []).filter(
                    item => item.xmlId !== 'urgent',
                ),
            },
        ]);

        expect(check.missing).toEqual([]);
        expect(check.enumGaps).toEqual([
            {
                fieldName: 'UF_CRM_7_COACHING_PRIORITY',
                title: 'Приоритет разбора (coaching)',
                missing: ['Срочно на разбор'],
            },
        ]);
    });

    it('поля вне конфига — лишние: занимают место в лимите, названы как на портале', () => {
        const check = checkCallReportSmartFields(TYPE_ID, [
            ...allFieldsExcept([]),
            fieldOf('RESUME_GIGACHAT', {
                fieldName: 'UF_CRM_7_RESUME_GIGACHAT',
                editFormLabel: { ru: 'Резюме (GigaChat)' },
            }),
            fieldOf('OLD', { fieldName: 'UF_CRM_7_OLD' }),
        ]);

        expect(check.total).toBe(CALL_REPORT_SMART_FIELDS.length + 2);
        expect(check.extra).toEqual([
            {
                fieldName: 'UF_CRM_7_RESUME_GIGACHAT',
                title: 'Резюме (GigaChat)',
            },
            { fieldName: 'UF_CRM_7_OLD', title: '' },
        ]);
    });
});

describe('CheckCallReportSmartUseCase', () => {
    const makeDeps = (options: {
        types: { id: number; entityTypeId: number; code: string }[];
        fields?: IUserFieldConfig[];
    }) => {
        const bitrix = {
            smartType: {
                getListFull: jest.fn().mockResolvedValue(options.types),
                add: jest.fn(),
                update: jest.fn(),
            },
            userFieldConfig: {
                getAllWithItems: jest
                    .fn()
                    .mockResolvedValue(options.fields ?? []),
                add: jest.fn(),
                update: jest.fn(),
            },
        };
        const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
        const useCase = new CheckCallReportSmartUseCase(pbxService as never);
        return { useCase, bitrix, pbxService };
    };

    it('смарт установлен: поля читаются по id типа, на портал ничего не пишется', async () => {
        const { useCase, bitrix, pbxService } = makeDeps({
            types: [
                {
                    id: TYPE_ID,
                    entityTypeId: 1056,
                    code: CALL_REPORT_SMART_CODE,
                },
            ],
            fields: allFieldsExcept(['CAPS_APPLIED']),
        });

        const result = await useCase.execute(DOMAIN);

        expect(pbxService.init).toHaveBeenCalledWith(DOMAIN);
        expect(bitrix.userFieldConfig.getAllWithItems).toHaveBeenCalledWith(
            'crm',
            { entityId: 'CRM_7' },
        );
        expect(result).toMatchObject({
            domain: DOMAIN,
            installed: true,
            entityTypeId: 1056,
            methodologyPresent: CALL_REPORT_METHODOLOGY_FIELD_CODES.length - 1,
        });
        expect(result.missing.map(item => item.code)).toEqual(['CAPS_APPLIED']);
        // Проверка только читает.
        expect(bitrix.smartType.add).not.toHaveBeenCalled();
        expect(bitrix.smartType.update).not.toHaveBeenCalled();
        expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        expect(bitrix.userFieldConfig.update).not.toHaveBeenCalled();
    });

    it('смарта нет: поля не запрашиваются, список пропусков пуст — сначала нужна установка', async () => {
        const { useCase, bitrix } = makeDeps({
            types: [{ id: 3, entityTypeId: 140, code: 'other_smart' }],
        });

        const result = await useCase.execute(DOMAIN);

        expect(result).toMatchObject({
            installed: false,
            entityTypeId: null,
            present: 0,
            total: 0,
            missing: [],
            extra: [],
        });
        expect(bitrix.userFieldConfig.getAllWithItems).not.toHaveBeenCalled();
    });
});
