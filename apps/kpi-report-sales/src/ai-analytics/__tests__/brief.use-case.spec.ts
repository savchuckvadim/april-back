import { ForbiddenException } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { buildBriefKey } from '../brief/brief-cache-key.util';
import { AI_ANALYTICS_BRIEF_JOB_OPTIONS } from '../constants/ai-brief.const';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import { AiBriefCacheEntry, AiBriefRequestDto } from '../dto/ai-brief.dto';
import {
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_NOW,
    BRIEF_TO,
    briefPack,
} from './fixtures/brief.fixture';

const PACK = briefPack();
const KEY = buildBriefKey(BRIEF_DOMAIN, PACK.hash);
const leader: RequesterAccess = { role: 'op', visibleManagerIds: ['10', '20'] };
const cup: RequesterAccess = { role: 'cup', visibleManagerIds: null };

const request = (
    overrides: Partial<AiBriefRequestDto> = {},
): AiBriefRequestDto =>
    ({
        domain: BRIEF_DOMAIN,
        requesterUserId: '447',
        from: BRIEF_FROM,
        to: BRIEF_TO,
        socketId: 'sock',
        ...overrides,
    }) as AiBriefRequestDto;

interface Harness {
    cached?: AiBriefCacheEntry | null;
    /** Состояние джобы с jobId = requestKey; нет — джобы в очереди нет. */
    jobState?: string;
}

function makeUseCase({ cached = null, jobState }: Harness = {}) {
    const build = jest.fn().mockResolvedValue(PACK);
    const getJson = jest.fn().mockResolvedValue(cached);
    const dispatch = jest.fn().mockResolvedValue({ id: KEY });
    const getJob = jest
        .fn()
        .mockResolvedValue(
            jobState === undefined
                ? null
                : { getState: jest.fn().mockResolvedValue(jobState) },
        );
    // assertVisible — настоящий: правило периметра проверяется, а не мок.
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        {} as never,
    );
    const useCase = new BriefUseCase(
        { build } as never,
        { getJson } as never,
        { dispatch, getJob } as never,
        access,
    );

    return { useCase, build, getJson, dispatch, getJob };
}

describe('BriefUseCase: конверт ручки резюме', () => {
    it('попадание в кэш → ready с данными и ключом пакета', async () => {
        const data = {
            headline: 'Сводка',
            bullets: [],
            tone: 'calm' as const,
            source: 'llm' as const,
            packHash: PACK.hash,
            generatedAt: '2026-09-08T06:00:00.000Z',
            promptVersion: 'brief-1.0.0',
        };
        const { useCase, dispatch } = makeUseCase({
            cached: { status: 'ready', data },
        });

        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).resolves.toEqual({ status: 'ready', requestKey: KEY, data });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('промах кэша → queued, jobId = requestKey, опции джобы без ретраев', async () => {
        const { useCase, dispatch } = makeUseCase();

        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).resolves.toEqual({ status: 'queued', requestKey: KEY, jobId: KEY });
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_BRIEF,
            {
                domain: BRIEF_DOMAIN,
                from: BRIEF_FROM,
                to: BRIEF_TO,
                managerIds: [10, 20],
                requestKey: KEY,
                packHash: PACK.hash,
                socketId: 'sock',
                requesterUserId: '447',
            },
            KEY,
            AI_ANALYTICS_BRIEF_JOB_OPTIONS,
        );
        expect(AI_ANALYTICS_BRIEF_JOB_OPTIONS).toEqual({
            priority: 1,
            attempts: 1,
            timeout: 120_000,
            removeOnComplete: true,
            removeOnFail: true,
        });
    });

    it('повтор при активной джобе → processing, второй джобы не ставится', async () => {
        const { useCase, dispatch, getJob } = makeUseCase({
            jobState: 'active',
        });

        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).resolves.toEqual({
            status: 'processing',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(getJob).toHaveBeenCalledWith(QueueNames.SALES_KPI_REPORT, KEY);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('завершённая джоба не даёт processing — считается заново', async () => {
        const { useCase, dispatch } = makeUseCase({ jobState: 'completed' });

        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('конверт ошибки процессора отдаётся как error и не ставит джобу', async () => {
        const { useCase, dispatch } = makeUseCase({
            cached: { status: 'error', message: 'модель недоступна' },
        });

        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).resolves.toEqual({
            status: 'error',
            requestKey: KEY,
            message: 'модель недоступна',
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('forceRefresh не читает кэш и ставит расчёт заново', async () => {
        const { useCase, getJson, dispatch } = makeUseCase({
            cached: {
                status: 'ready',
                data: {
                    headline: 'Старое',
                    bullets: [],
                    tone: 'calm',
                    source: 'template',
                    packHash: PACK.hash,
                    generatedAt: '2026-09-07T06:00:00.000Z',
                    promptVersion: 'brief-1.0.0',
                },
            },
        });

        await expect(
            useCase.lookup(request({ forceRefresh: true }), leader, BRIEF_NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(getJson).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('без списка менеджеров берётся периметр requester’а, у cup — весь портал', async () => {
        const perimeter = makeUseCase();
        await perimeter.useCase.lookup(request(), leader, BRIEF_NOW);
        expect(perimeter.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [10, 20] }),
        );

        const all = makeUseCase();
        await all.useCase.lookup(request(), cup, BRIEF_NOW);
        expect(all.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [] }),
        );
    });

    it('менеджер вне периметра в списке → 403, пакет не собирается', async () => {
        const { useCase, build } = makeUseCase();

        await expect(
            useCase.lookup(
                request({ managerIds: [10, 99] }),
                leader,
                BRIEF_NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(build).not.toHaveBeenCalled();
    });
});
