import { PbxSmartFieldBitrixUseCase } from './pbx-smart-field-bitrix.use-case';
import { BxTypedEntityFieldsInstallService } from '@app/pbx-install/shared';

describe('PbxSmartFieldBitrixUseCase', () => {
    let pbxService: { init: jest.Mock };
    let parseSmartService: { getParsedData: jest.Mock };
    let resolver: { resolve: jest.Mock };
    let useCase: PbxSmartFieldBitrixUseCase;

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        parseSmartService = { getParsedData: jest.fn() };
        resolver = { resolve: jest.fn() };
        useCase = new PbxSmartFieldBitrixUseCase(
            pbxService as never,
            parseSmartService as never,
            resolver as never,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('бросает NotFound, если смарт не распарсился', async () => {
        parseSmartService.getParsedData.mockResolvedValue([]);
        await expect(
            useCase.installFields('d', 'invoice' as never, 'sales' as never),
        ).rejects.toThrow();
    });

    it('возвращает no fields, если у смарта нет полей', async () => {
        parseSmartService.getParsedData.mockResolvedValue([
            { type: 'invoice', fields: [] },
        ]);
        const res = (await useCase.installFields(
            'd',
            'invoice' as never,
            'sales' as never,
        )) as { bxResult: null; message: string };
        expect(res.bxResult).toBeNull();
        expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it('устанавливает поля смарта только в Bitrix (без DB)', async () => {
        parseSmartService.getParsedData.mockResolvedValue([
            { type: 'invoice', fields: [{ code: 'a', isNeedUpdate: true }] },
        ]);
        resolver.resolve.mockResolvedValue({ bxCtx: {}, owner: {} });
        const installSpy = jest
            .spyOn(BxTypedEntityFieldsInstallService.prototype, 'installFields')
            .mockResolvedValue({
                errorCodes: [],
                results: [],
                countSuccess: 1,
                countFailed: 0,
                countTotal: 1,
            } as never);

        const res = (await useCase.installFields(
            'd',
            'invoice' as never,
            'sales' as never,
        )) as { bxResult: { countSuccess: number } };

        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(res.bxResult.countSuccess).toBe(1);
    });
});
