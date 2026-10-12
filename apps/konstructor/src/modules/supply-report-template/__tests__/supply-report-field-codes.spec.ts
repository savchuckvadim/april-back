import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
    parseTemplateListStrict,
    serializeTemplateList,
} from '@lib/portal-lib/konstructor/document-template';
import {
    SUPPLY_REPORT_FIELD_CODES,
    findUnknownFieldCodes,
    isSupplyReportFieldCode,
} from '../lib/supply-report-field-codes';
import { UpdateSupplyReportTemplateDto } from '../dto/update-supply-report-template.dto';

/** Два кода, которые реально есть в форме отчёта о поставке. */
const KNOWN_CODES = ['sale_date', 'situation_comments'];

describe('SUPPLY_REPORT_FIELD_CODES (белый список из самой формы)', () => {
    it('список непуст и выведен из формы, а не переписан руками', () => {
        expect(SUPPLY_REPORT_FIELD_CODES.length).toBeGreaterThan(0);
        for (const code of KNOWN_CODES) {
            expect(SUPPLY_REPORT_FIELD_CODES).toContain(code);
        }
    });

    it('без дубликатов', () => {
        expect(new Set(SUPPLY_REPORT_FIELD_CODES).size).toBe(
            SUPPLY_REPORT_FIELD_CODES.length,
        );
    });

    it('type в список не входит: это селект типа клиента, а не поле отчёта', () => {
        expect(SUPPLY_REPORT_FIELD_CODES).not.toContain('type');
    });

    it('isSupplyReportFieldCode различает свой код и опечатку', () => {
        expect(isSupplyReportFieldCode('sale_date')).toBe(true);
        expect(isSupplyReportFieldCode('sale_dat')).toBe(false);
    });

    it('findUnknownFieldCodes возвращает только незнакомые, без повторов', () => {
        expect(findUnknownFieldCodes(KNOWN_CODES)).toEqual([]);
        expect(
            findUnknownFieldCodes(['sale_date', 'sale_dat', 'sale_dat']),
        ).toEqual(['sale_dat']);
    });
});

describe('required_fields / optional_fields: round-trip через колонку LongText', () => {
    it('массив кодов → JSON → тот же массив', () => {
        const raw = serializeTemplateList(KNOWN_CODES);
        expect(typeof raw).toBe('string');
        expect(
            parseTemplateListStrict(raw, SUPPLY_REPORT_FIELD_CODES).list,
        ).toEqual(KNOWN_CODES);
    });

    it('пустой массив → NULL: «обязательность как в форме по умолчанию»', () => {
        expect(serializeTemplateList([])).toBeNull();
        expect(serializeTemplateList(undefined)).toBeNull();
        expect(serializeTemplateList(null)).toBeNull();
    });

    it('NULL в колонке читается как null, а не как пустой массив', () => {
        expect(
            parseTemplateListStrict(null, SUPPLY_REPORT_FIELD_CODES).list,
        ).toBeNull();
    });

    it('дубликаты при записи схлопываются', () => {
        const raw = serializeTemplateList(['sale_date', 'sale_date']);
        expect(
            parseTemplateListStrict(raw, SUPPLY_REPORT_FIELD_CODES).list,
        ).toEqual(['sale_date']);
    });

    it('легаси-строка с мусором читается fail-open и сообщает об отбросе', () => {
        const raw = JSON.stringify(['sale_date', 'sale_dat']);
        const parsed = parseTemplateListStrict(raw, SUPPLY_REPORT_FIELD_CODES);
        expect(parsed.list).toEqual(['sale_date']);
        expect(parsed.dropped).toBe(true);
    });
});

describe('UpdateSupplyReportTemplateDto: валидация кодов полей НА ЗАПИСИ', () => {
    const errorsFor = async (
        plain: Record<string, unknown>,
    ): Promise<string[]> => {
        const dto = plainToInstance(UpdateSupplyReportTemplateDto, plain);
        const errors = await validate(dto);
        return errors.map(error => error.property);
    };

    it('известные коды проходят', async () => {
        await expect(
            errorsFor({
                required_fields: KNOWN_CODES,
                optional_fields: ['invoice_number'],
            }),
        ).resolves.toEqual([]);
    });

    it('код вне белого списка отклоняется, а не отбрасывается молча', async () => {
        await expect(
            errorsFor({ required_fields: ['sale_date', 'sale_dat'] }),
        ).resolves.toEqual(['required_fields']);
    });

    it('optional_fields проверяется тем же справочником', async () => {
        await expect(
            errorsFor({ optional_fields: ['совсем_не_код'] }),
        ).resolves.toEqual(['optional_fields']);
    });

    it('не массив строк отклоняется', async () => {
        await expect(errorsFor({ required_fields: [1, 2] })).resolves.toEqual([
            'required_fields',
        ]);
    });

    it('пустой список валиден: это осознанный сброс в NULL', async () => {
        await expect(errorsFor({ required_fields: [] })).resolves.toEqual([]);
    });

    it('сообщение об ошибке называет конкретный неизвестный код', async () => {
        const dto = plainToInstance(UpdateSupplyReportTemplateDto, {
            required_fields: ['sale_dat'],
        });
        const errors = await validate(dto);
        expect(Object.values(errors[0].constraints ?? {}).join()).toContain(
            'sale_dat',
        );
    });

    it('строка через запятую из multipart разбирается в массив', async () => {
        const dto = plainToInstance(UpdateSupplyReportTemplateDto, {
            required_fields: 'sale_date, situation_comments',
        });
        expect(dto.required_fields).toEqual(KNOWN_CODES);
        await expect(validate(dto)).resolves.toEqual([]);
    });
});
