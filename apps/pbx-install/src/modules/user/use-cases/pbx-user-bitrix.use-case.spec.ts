import { PbxUserBitrixUseCase } from './pbx-user-bitrix.use-case';
import {
    BxUserFieldManageService,
    BxUserFieldsInstallService,
} from '../../shared';

describe('PbxUserBitrixUseCase', () => {
    let pbxService: { init: jest.Mock };
    let parseService: {
        getFieldsForInstall: jest.Mock;
        findByCode: jest.Mock;
        getFields: jest.Mock;
    };
    let useCase: PbxUserBitrixUseCase;

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        parseService = {
            getFieldsForInstall: jest.fn(),
            findByCode: jest.fn(),
            getFields: jest.fn(),
        };
        useCase = new PbxUserBitrixUseCase(
            pbxService as never,
            parseService as never,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('listFields отдаёт только поля с префиксом UF_USR_', async () => {
        pbxService.init.mockResolvedValue({
            bitrix: {
                user: {
                    listFields: jest.fn().mockResolvedValue({
                        result: [
                            { FIELD_NAME: 'UF_USR_EVENT_COMMENT' },
                            { FIELD_NAME: 'UF_CRM_OTHER' },
                            { FIELD_NAME: 'UF_USR_X' },
                        ],
                    }),
                },
            },
        });

        const res = await useCase.listFields('d.bitrix24.ru');

        expect(res.domain).toBe('d.bitrix24.ru');
        expect(res.fields.map(f => f.FIELD_NAME)).toEqual([
            'UF_USR_EVENT_COMMENT',
            'UF_USR_X',
        ]);
    });

    it('installFields маппит результат install-сервиса (bxFieldName из Bitrix)', async () => {
        parseService.getFieldsForInstall.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
        ]);
        jest.spyOn(
            BxUserFieldsInstallService.prototype,
            'installBxFields',
        ).mockResolvedValue({
            errorCodes: [],
            countTotal: 1,
            countSuccess: 1,
            countFailed: 0,
            results: [
                {
                    code: 'event_comment',
                    result: 123,
                    parsedField: { bxFieldName: 'EVENT_COMMENT' } as never,
                    bxField: { FIELD_NAME: 'UF_USR_EVENT_COMMENT' } as never,
                },
            ],
        });

        const res = await useCase.installFields('d.bitrix24.ru');

        expect(res.countSuccess).toBe(1);
        expect(res.results[0]).toEqual({
            code: 'event_comment',
            bxFieldName: 'UF_USR_EVENT_COMMENT',
            result: 123,
        });
    });

    it('installFields берёт bxFieldName из шаблона, если bxField пуст', async () => {
        parseService.getFieldsForInstall.mockReturnValue([]);
        jest.spyOn(
            BxUserFieldsInstallService.prototype,
            'installBxFields',
        ).mockResolvedValue({
            errorCodes: ['ERR'],
            countTotal: 1,
            countSuccess: 0,
            countFailed: 1,
            results: [
                {
                    code: 'event_comment',
                    result: false,
                    parsedField: { bxFieldName: 'EVENT_COMMENT' } as never,
                    bxField: undefined,
                },
            ],
        });

        const res = await useCase.installFields('d.bitrix24.ru');

        expect(res.results[0].bxFieldName).toBe('EVENT_COMMENT');
        expect(res.errorCodes).toEqual(['ERR']);
    });

    it('deleteFields резолвит bxFieldName из шаблона по code (fallback на code)', async () => {
        parseService.findByCode.mockImplementation((code: string) =>
            code === 'event_comment'
                ? { bxFieldName: 'EVENT_COMMENT' }
                : undefined,
        );
        const deleteSpy = jest
            .spyOn(BxUserFieldManageService.prototype, 'deleteFields')
            .mockResolvedValue([
                { code: 'event_comment', bxFieldId: '5', deleted: true },
            ]);

        const res = await useCase.deleteFields('d.bitrix24.ru', [
            'event_comment',
            'unknown',
        ]);

        expect(deleteSpy).toHaveBeenCalledWith([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
            { code: 'unknown', bxFieldName: 'unknown' },
        ]);
        expect(res.domain).toBe('d.bitrix24.ru');
        expect(res.results).toHaveLength(1);
    });
});
