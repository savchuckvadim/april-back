import { PbxUserParseService } from './pbx-user-parse.service';

describe('PbxUserParseService', () => {
    const service = new PbxUserParseService();

    it('содержит стартовое поле пользователя', () => {
        const fields = service.getFields();
        expect(fields.length).toBeGreaterThan(0);
        expect(fields[0].appType).toBe('user');
    });

    it('getFieldsForInstall возвращает только isNeedUpdate', () => {
        const fields = service.getFieldsForInstall();
        expect(fields.every(f => f.isNeedUpdate)).toBe(true);
    });
});
