import { SmartController } from '../controllers/smart.controller';
import { CALL_REPORT_SMART_FIELDS } from '@lib/call-lib';

describe('SmartController.getRegistry', () => {
    it('реестр содержит aicall с актуальным числом полей конфига', () => {
        const controller = new SmartController(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
        const registry = controller.getRegistry();

        const aicall = registry.items.find(item => item.kind === 'aicall');
        expect(aicall).toBeDefined();
        expect(aicall?.type).toBe('aicall');
        expect(aicall?.group).toBe('report');
        expect(aicall?.source).toBe('const');
        expect(aicall?.fieldsCount).toBe(CALL_REPORT_SMART_FIELDS.length);
        expect(aicall?.hasCategories).toBe(false);
    });
});
