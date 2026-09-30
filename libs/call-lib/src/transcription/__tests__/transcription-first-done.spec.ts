import { TranscriptionPrismaRepository } from '../repository/transcription.prisma.repository';
import { TranscriptionStoreService } from '../services/transcription.store.service';

/**
 * Дата начала AI-разбора на портале (витрина AI-аналитики, 30.09.2026):
 * самая ранняя готовая строка автоконвейера по тем же условиям, что
 * выборки за период, — время звонка, а без него created_at.
 */
const DOMAIN = 'garant.bitrix24.ru';

interface MinByCall {
    _min: { call_started_at: Date | null };
}
interface MinByCreated {
    _min: { created_at: Date | null };
}

/** Prisma с двумя агрегатами: по времени звонка и по created_at. */
function prismaWith(byCall: Date | null, byCreated: Date | null) {
    const aggregate = jest
        .fn<Promise<MinByCall | MinByCreated>, [unknown]>()
        .mockResolvedValueOnce({ _min: { call_started_at: byCall } })
        .mockResolvedValueOnce({ _min: { created_at: byCreated } });
    return { prisma: { transcription: { aggregate } }, aggregate };
}

describe('TranscriptionPrismaRepository.findFirstDonePipelineAt', () => {
    it('условия — готовые строки конвейера домена; без времени звонка — по created_at', async () => {
        const { prisma, aggregate } = prismaWith(null, null);
        const repository = new TranscriptionPrismaRepository(prisma as never);

        await repository.findFirstDonePipelineAt(DOMAIN);

        const done = {
            status: 'done',
            dedup_key: { not: null },
            domain: DOMAIN,
        };
        expect(aggregate).toHaveBeenCalledWith({
            where: { ...done, call_started_at: { not: null } },
            _min: { call_started_at: true },
        });
        expect(aggregate).toHaveBeenCalledWith({
            where: { ...done, call_started_at: null },
            _min: { created_at: true },
        });
    });

    it('берёт более ранний из двух моментов', async () => {
        const call = new Date('2026-07-23T09:00:00Z');
        const created = new Date('2026-07-21T15:00:00Z');
        const { prisma } = prismaWith(call, created);

        await expect(
            new TranscriptionPrismaRepository(
                prisma as never,
            ).findFirstDonePipelineAt(DOMAIN),
        ).resolves.toEqual(created);
    });

    it('одна из дат пустая — отдаётся другая; обе пустые — null', async () => {
        const call = new Date('2026-07-23T09:00:00Z');

        await expect(
            new TranscriptionPrismaRepository(
                prismaWith(call, null).prisma as never,
            ).findFirstDonePipelineAt(DOMAIN),
        ).resolves.toEqual(call);
        await expect(
            new TranscriptionPrismaRepository(
                prismaWith(null, null).prisma as never,
            ).findFirstDonePipelineAt(DOMAIN),
        ).resolves.toBeNull();
    });
});

describe('TranscriptionStoreService.findFirstDoneAt', () => {
    it('проксирует домен в репозиторий и отдаёт его ответ', async () => {
        const first = new Date('2026-07-21T15:00:00Z');
        const repository = {
            findFirstDonePipelineAt: jest.fn().mockResolvedValue(first),
        };
        const service = new TranscriptionStoreService(repository as never);

        await expect(service.findFirstDoneAt(DOMAIN)).resolves.toEqual(first);
        expect(repository.findFirstDonePipelineAt).toHaveBeenCalledWith(DOMAIN);
    });
});
