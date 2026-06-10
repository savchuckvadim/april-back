import { PbxTaskParseService } from './pbx-task-parse.service';

describe('PbxTaskParseService', () => {
    const service = new PbxTaskParseService();

    it('содержит поле комментария UF_TASK_EVENT_COMMENT', () => {
        const field = service.findByCode('event_comment');
        expect(field).toBeDefined();
        expect(field?.bxFieldName).toBe('EVENT_COMMENT');
        expect(field?.type).toBe('string');
    });

    it('getFieldsForInstall возвращает только isNeedUpdate', () => {
        const fields = service.getFieldsForInstall();
        expect(fields.length).toBeGreaterThan(0);
        expect(fields.every(f => f.isNeedUpdate)).toBe(true);
    });
});
