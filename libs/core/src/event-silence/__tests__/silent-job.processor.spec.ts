import 'reflect-metadata';
import { BULL_MODULE_QUEUE_PROCESS } from '@nestjs/bull/dist/bull.constants';
import {
    EVENT_SILENT_COLLECTORS,
    EventSilentJobProcessor,
} from '../silent-job.processor';

type ProcessMeta = { name?: string; concurrency?: number };

describe('сборщики окон тишины', () => {
    it('ловят все задания очереди и работают по 8 одновременно', () => {
        const handle = Object.getOwnPropertyDescriptor(
            EventSilentJobProcessor.prototype,
            'handle',
        )?.value as object;

        const meta = Reflect.getMetadata(
            BULL_MODULE_QUEUE_PROCESS,
            handle,
        ) as ProcessMeta;

        expect(EVENT_SILENT_COLLECTORS).toBe(8);
        expect(meta).toEqual({ name: '*', concurrency: 8 });
    });

    it('задание отдаётся менеджеру окна целиком', async () => {
        const process = jest.fn().mockResolvedValue(undefined);
        const processor = new EventSilentJobProcessor({ process } as never);
        const data = {
            keyPrefix: 'p',
            data: { id: '1' },
            jobName: 'cold-call-v2',
            domain: 'gsr.bitrix24.ru',
        };

        await processor.handle({ id: 1, data } as never);

        expect(process).toHaveBeenCalledWith(data);
    });
});
