import { ParseSmartService } from '../services/parse/parse-smart.service';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import {
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_TITLE,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

describe('ParseSmartService — const-ветка (реестр const-смартов)', () => {
    // Excel-зависимости не нужны: const-ветка отрабатывает до чтения файла.
    const service = new ParseSmartService(null as never, null as never);

    it('aicall/sales собирается из констант, без Excel-файла', async () => {
        const parsed = await service.getParsedData(
            SmartNameEnum.AICALL,
            SmartGroupEnum.SALES,
        );

        expect(parsed).toHaveLength(1);
        const smart = parsed[0];
        expect(smart.type).toBe('aicall');
        expect(smart.group).toBe('sales');
        expect(smart.code).toBe(CALL_REPORT_SMART_CODE);
        expect(smart.code).toBe('aicall_sales');
        expect(smart.title).toBe(CALL_REPORT_SMART_TITLE);
        expect(smart.categories).toEqual([]);
        expect(smart.fields).toHaveLength(CALL_REPORT_SMART_FIELDS.length);
    });

    it('поля const-шаблона соответствуют установочному контракту Field', async () => {
        const [smart] = await service.getParsedData(
            SmartNameEnum.AICALL,
            SmartGroupEnum.SALES,
        );
        for (const field of smart.fields) {
            expect(field.code).toBeTruthy();
            expect(field.bxFieldName).toBe(field.code);
            expect(typeof field.isMultiple).toBe('boolean');
            expect(Array.isArray(field.list)).toBe(true);
        }
        const enumField = smart.fields.find(field => field.list.length > 0);
        expect(enumField).toBeDefined();
        expect(enumField?.list[0]).toMatchObject({
            VALUE: expect.any(String) as string,
            CODE: expect.any(String) as string,
            XML_ID: expect.any(String) as string,
        });
    });

    it('excel-смарты идут прежним путём (файл не найден → NotFound)', async () => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue('nope.xlsx'),
            fileExistsByType: jest.fn().mockResolvedValue(false),
        };
        const excelService = new ParseSmartService(
            storage as never,
            null as never,
        );
        await expect(
            excelService.getParsedData(
                SmartNameEnum.PRESENTATION,
                SmartGroupEnum.SALES,
            ),
        ).rejects.toThrow('File not found');
    });
});
