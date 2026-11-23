import { EventSilentJobManagerService } from '../silent-job-manager.service';
import { EventSilentJobManagerData } from '../event-silence.type';
import { JobNames } from '@lib/queue';
import { FakeSilenceRedis } from './fake-silence-redis';

const DOMAIN = 'gsr.bitrix24.ru';
const PREFIX = 'XO2_event_sales_cold_call_gsr_bitrix24_ru_from_card';

const item = (entityId: string): EventSilentJobManagerData<{ id: string }> => ({
    keyPrefix: PREFIX,
    data: { id: entityId },
    jobName: JobNames.EVENT_COLD_CALL_V2,
    domain: DOMAIN,
});

const build = () => {
    const redis = new FakeSilenceRedis();
    const dispatch = jest.fn().mockResolvedValue({ id: 'job' });
    const emitAsync = jest.fn().mockResolvedValue([]);
    const service = new EventSilentJobManagerService(
        { getClient: () => redis } as never,
        { dispatch } as never,
        { emitAsync } as never,
    );
    return { redis, dispatch, emitAsync, service };
};

describe('окно тишины: приём и сбор хуков', () => {
    it('первый хук окна ставит задание сборщику, следующие — нет', async () => {
        const { service, dispatch } = build();

        await service.handle(item('1'));
        await service.handle(item('2'));

        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('собранные хуки живут час, а страж задания — 30 секунд', async () => {
        const { service, redis } = build();

        await service.handle(item('1'));

        expect(redis.ttlMs(`${PREFIX}_data`)).toBe(3_600_000);
        expect(redis.ttlMs(`${PREFIX}_seq`)).toBe(3_600_000);
        expect(redis.ttlMs(`${PREFIX}_job`)).toBe(30_000);
        expect(redis.ttlMs(`${PREFIX}_lock`)).toBe(1500);
    });

    it('хук не пропадает, если сборщик пришёл через минуту (раньше — 30 с)', async () => {
        const { service, redis, emitAsync } = build();
        await service.handle(item('81925'));

        redis.advance(60_000);
        await service.process(item('81925'));

        expect(emitAsync).toHaveBeenCalledWith(
            `silence:${JobNames.EVENT_COLD_CALL_V2}`,
            {
                collected: { '1': { id: '81925' } },
                payload: { domain: DOMAIN },
            },
        );
    });

    it('сбор забирает окно и освобождает ключ: следующий хук ставит новое задание', async () => {
        const { service, redis, dispatch } = build();
        await service.handle(item('1'));
        redis.advance(2000);

        await service.process(item('1'));

        expect(redis.exists(`${PREFIX}_data`)).toBe(0);
        expect(redis.exists(`${PREFIX}_job`)).toBe(0);
        await service.handle(item('2'));
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it('окно забирается одним MULTI — второй сбор того же окна пуст', async () => {
        const { service, redis, emitAsync } = build();
        await service.handle(item('1'));
        redis.advance(2000);

        await Promise.all([
            service.process(item('1')),
            service.process(item('1')),
        ]);

        expect(redis.multiCalls).toBe(2);
        expect(emitAsync).toHaveBeenCalledTimes(1);
    });

    it('пустое окно: событие не эмитится, страж снят', async () => {
        const { service, redis, emitAsync } = build();
        await redis.set(`${PREFIX}_job`, '1', 'PX', 30_000, 'NX');

        await service.process(item('1'));

        expect(emitAsync).not.toHaveBeenCalled();
        expect(redis.exists(`${PREFIX}_job`)).toBe(0);
    });
});
