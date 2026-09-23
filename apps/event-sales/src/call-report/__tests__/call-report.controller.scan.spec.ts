import { CallReportController } from '../controllers/call-report.controller';

/**
 * Ручной запуск скана: порог длительности без явного значения берётся у
 * портала (минимум карты порогов — решение А.1), а не из дефолта реестра.
 * Раньше POST /call-report/scan без minDurationSec уходил на 300 даже на
 * портале, где крон разбирает звонки от 60 секунд.
 */
describe('CallReportController.scan — порог длительности', () => {
    const DOMAIN = 'a.bitrix24.ru';

    function makeController() {
        const scanUseCase = { execute: jest.fn().mockResolvedValue({}) };
        const settingsService = { minDurationFor: jest.fn() };
        const controller = new CallReportController(
            {} as never,
            scanUseCase as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            settingsService as never,
        );
        return { controller, scanUseCase, settingsService };
    }

    it('без явного порога — минимум карты портала', async () => {
        const { controller, scanUseCase, settingsService } = makeController();
        settingsService.minDurationFor.mockResolvedValue(60);

        await controller.scan({ domain: DOMAIN } as never);

        expect(settingsService.minDurationFor).toHaveBeenCalledWith(DOMAIN);
        expect(scanUseCase.execute).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ minDurationSec: 60 }),
        );
    });

    it('явный порог в запросе — как есть, портал не спрашиваем', async () => {
        const { controller, scanUseCase, settingsService } = makeController();

        await controller.scan({ domain: DOMAIN, minDurationSec: 120 } as never);

        expect(settingsService.minDurationFor).not.toHaveBeenCalled();
        expect(scanUseCase.execute).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ minDurationSec: 120 }),
        );
    });

    it('ignoreDurationGate (смоук B12) пробрасывается в опции скана как есть', async () => {
        const { controller, scanUseCase } = makeController();

        await controller.scan({
            domain: DOMAIN,
            minDurationSec: 60,
            ignoreDurationGate: true,
        } as never);

        expect(scanUseCase.execute).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                minDurationSec: 60,
                ignoreDurationGate: true,
            }),
        );
    });
});
