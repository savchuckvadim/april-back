import { ForbiddenException } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { buildBriefKey } from '../brief/brief-cache-key.util';
import {
    AI_ANALYTICS_BRIEF_JOB_OPTIONS,
    AI_BRIEF_EMPTY_PERIMETER_MESSAGE,
} from '../constants/ai-brief.const';
import { AI_MANAGER_SCOPE_EMPTY_MESSAGE } from '../domain/access/ai-manager-scope.util';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import type { AiCallReportStatus } from '../domain/loaders/settings.loader';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import { AiBriefCacheEntry, AiBriefRequestDto } from '../dto/ai-brief.dto';
import {
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_NOW,
    BRIEF_TO,
    briefPack,
} from './fixtures/brief.fixture';
import {
    callReportWith,
    scopeResolverWith,
} from './fixtures/manager-scope.fixture';

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
    /** Статус разбора звонков; нет — статус не прочитан (без ограничения). */
    callReport?: AiCallReportStatus;
    /** Ростер ОП по структуре. */
    roster?: number[];
}

function makeUseCase({
    cached = null,
    jobState,
    callReport,
    roster = [10, 20, 30],
}: Harness = {}) {
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
    const scope = scopeResolverWith(roster, callReport ? { callReport } : {});
    const useCase = new BriefUseCase(
        { build } as never,
        { getJson } as never,
        { dispatch, getJob } as never,
        access,
        scope.resolver,
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
            comparable: false,
            previousPeriod: null,
            generatedAt: '2026-09-08T06:00:00.000Z',
            promptVersion: 'brief-2.0.0',
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
                    comparable: false,
                    previousPeriod: null,
                    generatedAt: '2026-09-07T06:00:00.000Z',
                    promptVersion: 'brief-2.0.0',
                },
            },
        });

        await expect(
            useCase.lookup(request({ forceRefresh: true }), leader, BRIEF_NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(getJson).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledTimes(1);
        // Джоба узнаёт о пересчёте: готовое резюме такого же пакета из
        // кэша она не возьмёт.
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_BRIEF,
            expect.objectContaining({ forceRefresh: true }),
            KEY,
            AI_ANALYTICS_BRIEF_JOB_OPTIONS,
        );
    });

    it('без списка менеджеров берётся периметр requester’а, у cup — весь ростер ОП (не «весь портал» пустым списком)', async () => {
        const perimeter = makeUseCase();
        await perimeter.useCase.lookup(request(), leader, BRIEF_NOW);
        expect(perimeter.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [10, 20] }),
        );

        const all = makeUseCase();
        await all.useCase.lookup(request(), cup, BRIEF_NOW);
        expect(all.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [10, 20, 30] }),
        );
    });

    it('список разбора: явный список сужается до проверки видимости — чужой вне разбора не даёт 403', async () => {
        const { useCase, build } = makeUseCase({
            callReport: callReportWith([10]),
        });

        await useCase.lookup(
            request({ managerIds: [10, 99] }),
            leader,
            BRIEF_NOW,
        );

        expect(build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [10] }),
        );
    });

    it('список разбора: периметр requester’а и cup без списка — только сотрудники из разбора', async () => {
        const perimeter = makeUseCase({ callReport: callReportWith([20]) });
        await perimeter.useCase.lookup(request(), leader, BRIEF_NOW);
        expect(perimeter.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [20] }),
        );

        const all = makeUseCase({ callReport: callReportWith([512, 20]) });
        await all.useCase.lookup(request(), cup, BRIEF_NOW);
        expect(all.build).toHaveBeenCalledWith(
            expect.objectContaining({ managerIds: [20, 512] }),
        );
    });

    it('в фильтре никого из разбора — отказ с понятным текстом, пакет и джоба не собираются', async () => {
        const { useCase, build, dispatch } = makeUseCase({
            callReport: callReportWith([512]),
        });

        await expect(
            useCase.lookup(request({ managerIds: [10, 20] }), cup, BRIEF_NOW),
        ).rejects.toThrow(AI_MANAGER_SCOPE_EMPTY_MESSAGE);
        await expect(
            useCase.lookup(request(), leader, BRIEF_NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(build).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
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

    it('периметр без единого менеджера — отказ, а не резюме по всему порталу', async () => {
        const empties: RequesterAccess[] = [
            { role: 'group', visibleManagerIds: [] },
            // Битый id пользователя нормализацией отбрасывается.
            { role: 'manager', visibleManagerIds: ['NaN'] },
        ];
        for (const access of empties) {
            const { useCase, build, dispatch } = makeUseCase();

            await expect(
                useCase.lookup(request(), access, BRIEF_NOW),
            ).rejects.toThrow(AI_BRIEF_EMPTY_PERIMETER_MESSAGE);
            expect(build).not.toHaveBeenCalled();
            expect(dispatch).not.toHaveBeenCalled();
        }
    });
});
