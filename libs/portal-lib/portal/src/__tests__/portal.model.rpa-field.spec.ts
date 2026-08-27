import { PortalModel } from '../services/portal.model';
import { IField, IPortal } from '../interfaces/portal.interface';

/**
 * `bitrixId` RPA-полей в pbx неоднороден: на боевом gsr лежит короткий код,
 * на порталах, установленных typed-инсталлятором, — полное имя Bitrix.
 * Префикс, наклеенный дважды, даёт 400 «Unknown field definition».
 */
describe('PortalModel.getRpaFieldBitrixId', () => {
    const model = new PortalModel({} as IPortal, null as never);

    const field = (bitrixId: string): IField =>
        ({ bitrixId }) as unknown as IField;

    it('клеит префикс к короткому коду', () => {
        expect(model.getRpaFieldBitrixId(9, field('RPA_CRM_BASE_DEAL'))).toBe(
            'UF_RPA_9_RPA_CRM_BASE_DEAL',
        );
    });

    it('не клеит префикс второй раз', () => {
        expect(
            model.getRpaFieldBitrixId(1, field('UF_RPA_1_RPA_CRM_BASE_DEAL')),
        ).toBe('UF_RPA_1_RPA_CRM_BASE_DEAL');
    });

    it('бросает, если поля нет', () => {
        expect(() => model.getRpaFieldBitrixId(9, undefined)).toThrow(
            'Field not found',
        );
    });
});
