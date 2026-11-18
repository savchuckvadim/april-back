import { Logger } from '@nestjs/common';
import { buildCallReportSmartFields } from '../services/call-report-smart-fields.builder';
import { CallReportSmartInfo } from '../services/call-report-smart-resolver.service';
import { CallReportSmartItemInput } from '../services/call-report-smart-writer.types';

/**
 * Поля карточки по правилам показа разбора (решения владельца 18.11.2026):
 * показателя нет — поле в запрос не попадает (ни 0, ни затирания значения
 * старой карточки при дописывании).
 */
const SMART_INFO: CallReportSmartInfo = {
    entityTypeId: 1056,
    typeId: 128,
    ufKeyByCode: {},
    enumItems: { CALL_TYPE: { presentation: 51, cold: 50 } },
};

const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;

const fieldsOf = (
    input: Partial<CallReportSmartItemInput>,
): Record<string, unknown> =>
    buildCallReportSmartFields(
        { activityId: '101', transcriptionId: '42', ...input },
        SMART_INFO,
        logger,
    ) as Record<string, unknown>;

describe('поля карточки разбора: соответствие скрипту', () => {
    it('процента нет — поле SCRIPT_COMPLIANCE не пишется', () => {
        expect(fieldsOf({})).not.toHaveProperty('ufCrm128ScriptCompliance');
    });

    it('null из сохранённого разбора не превращается в 0 и в запрос не идёт', () => {
        const fields = fieldsOf({
            scriptCompliance: null as unknown as number,
        });
        expect(fields).not.toHaveProperty('ufCrm128ScriptCompliance');
    });

    it('процент есть — пишется как есть, включая 0', () => {
        expect(
            fieldsOf({ scriptCompliance: 70 }).ufCrm128ScriptCompliance,
        ).toBe(70);
        expect(fieldsOf({ scriptCompliance: 0 }).ufCrm128ScriptCompliance).toBe(
            0,
        );
    });
});
