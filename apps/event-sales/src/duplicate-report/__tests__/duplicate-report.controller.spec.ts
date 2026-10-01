import { DuplicateReportController } from '../controllers/duplicate-report.controller';

const setup = (started: boolean) => {
    const runNow = jest.fn().mockResolvedValue(started);
    const controller = new DuplicateReportController({ runNow } as never);
    return { controller, runNow };
};

describe('DuplicateReportController — ручной прогон отчёта по дублям', () => {
    it('запускает прогон в фоне с режимом «только посчитать» из запроса', async () => {
        const { controller, runNow } = setup(true);

        const response = await controller.runNow({
            domain: 'a.bitrix24.ru',
            dryRun: true,
        });

        expect(runNow).toHaveBeenCalledWith('a.bitrix24.ru', true, undefined);
        expect(response).toEqual({
            started: true,
            message:
                'Прогон начат — итог придёт в Telegram через несколько минут',
        });
    });

    it('без dryRun режим берётся из настроек портала', async () => {
        const { controller, runNow } = setup(true);

        await controller.runNow({ domain: 'a.bitrix24.ru' });

        expect(runNow).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            undefined,
            undefined,
        );
    });

    it('проба одному сотруднику — previewUserId уходит в прогон', async () => {
        const { controller, runNow } = setup(true);

        await controller.runNow({ domain: 'a.bitrix24.ru', previewUserId: 7 });

        expect(runNow).toHaveBeenCalledWith('a.bitrix24.ru', undefined, 7);
    });

    it('идёт другой прогон — не начат, с понятным сообщением', async () => {
        const { controller } = setup(false);

        const response = await controller.runNow({ domain: 'a.bitrix24.ru' });

        expect(response).toEqual({
            started: false,
            message:
                'Уже идёт другой прогон отчёта по дублям — повторите позже',
        });
    });
});
