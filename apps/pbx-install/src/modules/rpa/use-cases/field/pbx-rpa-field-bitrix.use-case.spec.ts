import { PbxRpaFieldBitrixUseCase } from './pbx-rpa-field-bitrix.use-case';
import { BxTypedEntityFieldsInstallService } from '@app/pbx-install/shared';

describe('PbxRpaFieldBitrixUseCase', () => {
    let pbxService: { init: jest.Mock };
    let parseRpaService: { getParsedData: jest.Mock };
    let resolver: { resolve: jest.Mock };
    let useCase: PbxRpaFieldBitrixUseCase;

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        parseRpaService = { getParsedData: jest.fn() };
        resolver = { resolve: jest.fn() };
        useCase = new PbxRpaFieldBitrixUseCase(
            pbxService as never,
            parseRpaService as never,
            resolver as never,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('бросает NotFound, если RPA не распарсился', async () => {
        parseRpaService.getParsedData.mockResolvedValue([]);
        await expect(
            useCase.installFields('d', 'order' as never, 'sales' as never),
        ).rejects.toThrow();
    });

    it('возвращает no fields, если у RPA нет полей', async () => {
        parseRpaService.getParsedData.mockResolvedValue([
            { type: 'order', fields: [] },
        ]);
        const res = (await useCase.installFields(
            'd',
            'order' as never,
            'sales' as never,
        )) as { bxResult: null; message: string };
        expect(res.bxResult).toBeNull();
        expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it('устанавливает поля RPA только в Bitrix (без DB)', async () => {
        parseRpaService.getParsedData.mockResolvedValue([
            { type: 'order', fields: [{ code: 'a', isNeedUpdate: true }] },
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
            'order' as never,
            'sales' as never,
        )) as { bxResult: { countSuccess: number } };

        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(res.bxResult.countSuccess).toBe(1);
    });
});
