import { PbxContactBitrixUseCase } from './pbx-contact-bitrix.use-case';
import {
    BxEntityFieldManageService,
    BxEntityFieldsInstallService,
} from '../../shared';

describe('PbxContactBitrixUseCase', () => {
    let pbxService: { init: jest.Mock };
    let parseService: { getParsedData: jest.Mock };
    let useCase: PbxContactBitrixUseCase;

    const initWith = (fields: unknown[]) =>
        pbxService.init.mockResolvedValue({
            bitrix: {
                contact: {
                    getFieldsList: jest
                        .fn()
                        .mockResolvedValue({ result: fields }),
                },
            },
        });

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        parseService = { getParsedData: jest.fn() };
        useCase = new PbxContactBitrixUseCase(
            pbxService as never,
            parseService as never,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('listFields отдаёт только UF_CRM_-поля', async () => {
        initWith([{ FIELD_NAME: 'UF_CRM_OP_STATUS' }, { FIELD_NAME: 'NAME' }]);

        const res = await useCase.listFields('d.bitrix24.ru');

        expect(res.fields.map(f => f.FIELD_NAME)).toEqual(['UF_CRM_OP_STATUS']);
    });

    it('installFields ставит только isNeedUpdate-поля через install-сервис', async () => {
        parseService.getParsedData.mockResolvedValue({
            count: 2,
            fields: [
                { code: 'a', isNeedUpdate: true },
                { code: 'b', isNeedUpdate: false },
            ],
        });
        const installSpy = jest
            .spyOn(BxEntityFieldsInstallService.prototype, 'installBxFields')
            .mockResolvedValue({
                errorCodes: [],
                results: [],
                countSuccess: 1,
                countFailed: 0,
                countTotal: 1,
            });

        const res = await useCase.installFields(
            'd.bitrix24.ru',
            'sales' as never,
            'event' as never,
        );

        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(res.countSuccess).toBe(1);
    });

    it('deleteFields резолвит bxFieldName из живого Bitrix по XML_ID', async () => {
        initWith([{ FIELD_NAME: 'UF_CRM_123', XML_ID: 'op_status' }]);
        const deleteSpy = jest
            .spyOn(BxEntityFieldManageService.prototype, 'deleteFields')
            .mockResolvedValue([
                { code: 'op_status', bxFieldId: '123', deleted: true },
            ]);

        const res = await useCase.deleteFields('d.bitrix24.ru', ['op_status']);

        expect(deleteSpy).toHaveBeenCalledWith([
            { code: 'op_status', bxFieldName: 'UF_CRM_123' },
        ]);
        expect(res).toHaveLength(1);
    });
});
