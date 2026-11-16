import { SmartController } from '../controllers/smart.controller';
import { CALL_REPORT_SMART_FIELDS } from '@lib/call-lib';

describe('SmartController.getRegistry', () => {
    it('реестр содержит aicall с актуальным числом полей конфига', () => {
        const controller = new SmartController(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
        const registry = controller.getRegistry();

        const aicall = registry.items.find(item => item.kind === 'aicall');
        expect(aicall).toBeDefined();
        expect(aicall?.type).toBe('aicall');
        expect(aicall?.group).toBe('sales');
        expect(aicall?.source).toBe('const');
        expect(aicall?.fieldsCount).toBe(CALL_REPORT_SMART_FIELDS.length);
        expect(aicall?.hasCategories).toBe(false);
    });
});

describe('SmartController.checkAicall', () => {
    it('проверка полей идёт в проверяющий use-case, установка не вызывается', async () => {
        const check = { execute: jest.fn().mockResolvedValue({ ok: true }) };
        const install = { execute: jest.fn() };
        const controller = new SmartController(
            {} as never,
            {} as never,
            install as never,
            check as never,
            {} as never,
        );

        const result = await controller.checkAicall({
            domain: ' gsr.bitrix24.ru ',
        });

        expect(check.execute).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(install.execute).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true });
    });
});
