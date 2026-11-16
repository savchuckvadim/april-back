import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DealAuditRunNowJobData } from '@lib/queue';
import { DealAuditRunNowProcessor } from '../queue/deal-audit-run-now.processor';

const job = (
    patch: Partial<{ attemptsMade: number; attempts: number }> = {},
): Job<DealAuditRunNowJobData> =>
    ({
        data: { domain: 'a.bitrix24.ru' },
        attemptsMade: patch.attemptsMade ?? 0,
        opts: { attempts: patch.attempts ?? 15 },
    }) as unknown as Job<DealAuditRunNowJobData>;

const setup = (started: boolean) => {
    const runNowAndWait = jest.fn().mockResolvedValue(started);
    const processor = new DealAuditRunNowProcessor({
        runNowAndWait,
    } as never);
    return { processor, runNowAndWait };
};

describe('DealAuditRunNowProcessor (кнопка админки)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('запускает прогон портала и ждёт его конца', async () => {
        const { processor, runNowAndWait } = setup(true);

        await processor.handle(job());

        expect(runNowAndWait).toHaveBeenCalledWith('a.bitrix24.ru');
    });

    it('идёт другой прогон — джоб падает, чтобы Bull повторил его позже', async () => {
        const { processor } = setup(false);

        await expect(processor.handle(job())).rejects.toThrow(
            'идёт другой прогон',
        );
    });

    it('промежуточная неудача молчит, последняя — в Telegram', () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { processor } = setup(false);
        const error = new Error('идёт другой прогон');

        processor.onFailed(job({ attemptsMade: 3, attempts: 15 }), error);
        expect(warn).not.toHaveBeenCalled();

        processor.onFailed(job({ attemptsMade: 15, attempts: 15 }), error);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('не начат за 15 попыток'),
            { telegram: true },
        );
    });
});
