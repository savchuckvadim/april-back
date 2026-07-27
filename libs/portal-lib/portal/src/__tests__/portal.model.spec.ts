/**
 * PortalModel: построение UF_CRM-имён полей.
 *
 * `bitrixId` в БД портала неоднороден: konstructor-строки хранят полное имя
 * («UF_CRM_1684144993»), остальные — суффикс («CONTRACT_TYPE», «1687967605»).
 * Двойной префикс ломал селекты сделок и живой словарь enum-элементов.
 */
import { PortalModel } from '../services/portal.model';
import { IField, IPortal } from '../interfaces/portal.interface';
import { TelegramService } from '@lib/telegram/telegram.service';

const telegramStub = undefined as unknown as TelegramService;

const makeField = (code: string, bitrixId: string): IField =>
    ({
        code,
        bitrixId,
        items: [],
    }) as unknown as IField;

const makePortal = (dealFields: IField[]): IPortal =>
    ({
        deals: [{ bitrixfields: dealFields, categories: [] }],
        company: { bitrixfields: [] },
        measures: [],
    }) as unknown as IPortal;

describe('PortalModel UF_CRM-имена', () => {
    it('приклеивает префикс к суффиксному bitrixId', () => {
        const model = new PortalModel(
            makePortal([makeField('contract_start', 'CONTRACT_START')]),
            telegramStub,
        );
        expect(model.getDealFieldBitrixIdByCode('contract_start')).toBe(
            'UF_CRM_CONTRACT_START',
        );
    });

    it('НЕ дублирует префикс, когда bitrixId уже полное имя (konstructor)', () => {
        const model = new PortalModel(
            makePortal([makeField('contract_type', 'UF_CRM_1684144993')]),
            telegramStub,
        );
        expect(model.getDealFieldBitrixIdByCode('contract_type')).toBe(
            'UF_CRM_1684144993',
        );
    });

    it('числовой суффикс тоже префиксуется', () => {
        const model = new PortalModel(
            makePortal([makeField('contract_end', '1687967605')]),
            telegramStub,
        );
        expect(model.getDealFieldBitrixIdByCode('contract_end')).toBe(
            'UF_CRM_1687967605',
        );
    });

    it('ненастроенное поле → пустая строка', () => {
        const model = new PortalModel(makePortal([]), telegramStub);
        expect(model.getDealFieldBitrixIdByCode('contract_type')).toBe('');
    });

    it('getFieldBitrixId нормализует так же', () => {
        const model = new PortalModel(makePortal([]), telegramStub);
        expect(
            model.getFieldBitrixId(makeField('op_client_type', 'OP_CLIENT_TYPE')),
        ).toBe('UF_CRM_OP_CLIENT_TYPE');
        expect(
            model.getFieldBitrixId(
                makeField('op_client_type', 'UF_CRM_OP_CLIENT_TYPE'),
            ),
        ).toBe('UF_CRM_OP_CLIENT_TYPE');
    });
});
