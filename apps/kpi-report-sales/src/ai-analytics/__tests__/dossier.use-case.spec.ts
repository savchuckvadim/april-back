import { ForbiddenException } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_DOSSIER_JOB_OPTIONS,
    AI_DOSSIER_MONTHS,
    buildDossierKey,
    dossierMonthKeys,
} from '../constants/ai-dossier.const';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { DossierUseCase } from '../domain/use-cases/dossier.use-case';
import {
    AiDossierCacheEntry,
    AiDossierDto,
    AiDossierRequestDto,
} from '../dto/ai-dossier.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const DOMAIN = 'april.bitrix24.ru';
const MANAGER = '512';
/** 22.09.2026 12:00 UTC — окно по умолчанию упирается в месяц 2026-09. */
const NOW = new Date('2026-09-22T12:00:00.000Z');
const MONTHS = dossierMonthKeys('2026-09-22', AI_DOSSIER_MONTHS.default);
const KEY = buildDossierKey(
    DOMAIN,
    MANAGER,
    MONTHS[0],
    MONTHS[MONTHS.length - 1],
);

const leader: RequesterAccess = {
    role: 'op',
    visibleManagerIds: ['447', '512'],
};
const cup: RequesterAccess = { role: 'cup', visibleManagerIds: null };

const request = (
    overrides: Partial<AiDossierRequestDto> = {},
): AiDossierRequestDto =>
    ({
        domain: DOMAIN,
        requesterUserId: '447',
        managerId: MANAGER,
        socketId: 'sock',
        ...overrides,
    }) as AiDossierRequestDto;

const dossier = (): AiDossierDto =>
    ({
        managerId: MANAGER,
        passport: null,
        series: null,
        trends: null,
        planFact: null,
        yoy: null,
        style: null,
        objections: null,
        feedbackSummary: null,
        ropMarks: null,
        readiness: null,
        reasons: [],
        meta: {
            calcVersion: 'sam-1.0.0',
            snapshotIds: [],
            generatedAt: NOW.toISOString(),
            months: [...MONTHS],
        },
    }) as AiDossierDto;

interface Harness {
    cached?: AiDossierCacheEntry | null;
    /** Состояние джобы с jobId = requestKey; нет — джобы в очереди нет. */
    jobState?: string;
}

function makeUseCase({ cached = null, jobState }: Harness = {}) {
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
    const useCase = new DossierUseCase(
        settingsLoaderWith(),
        { getJson } as never,
        { dispatch, getJob } as never,
        access,
    );

    return { useCase, getJson, dispatch, getJob };
}

describe('DossierUseCase: конверт ручки досье', () => {
    it('ключ окна детерминирован: три месяца, последний — месяц «сегодня»', () => {
        expect(MONTHS).toEqual(['2026-07', '2026-08', '2026-09']);
        expect(KEY).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:dossier:512:2026-07_2026-09',
        );
    });

    it('попадание в кэш → ready с данными, джоба не ставится', async () => {
        const data = dossier();
        const { useCase, dispatch } = makeUseCase({
            cached: { status: 'ready', data },
        });

        await expect(useCase.lookup(request(), leader, NOW)).resolves.toEqual({
            status: 'ready',
            requestKey: KEY,
            data,
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('промах кэша → queued, jobId = requestKey, опции джобы без ретраев', async () => {
        const { useCase, dispatch } = makeUseCase();

        await expect(useCase.lookup(request(), leader, NOW)).resolves.toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_DOSSIER,
            {
                domain: DOMAIN,
                managerId: MANAGER,
                months: [...MONTHS],
                requestKey: KEY,
                socketId: 'sock',
                requesterUserId: '447',
            },
            KEY,
            AI_DOSSIER_JOB_OPTIONS,
        );
        expect(AI_DOSSIER_JOB_OPTIONS).toEqual({
            priority: 1,
            attempts: 1,
            timeout: 120_000,
            removeOnComplete: true,
            removeOnFail: true,
        });
    });

    it('одинаковые запросы дают один ключ — повтор подписывается на ту же джобу', async () => {
        const first = makeUseCase();
        const second = makeUseCase();
        const one = await first.useCase.lookup(request(), leader, NOW);
        const two = await second.useCase.lookup(
            request({ socketId: 'другой-сокет' }),
            cup,
            NOW,
        );

        expect(one.requestKey).toBe(two.requestKey);
    });

    it('повтор при активной джобе → processing, второй джобы не ставится', async () => {
        const { useCase, dispatch, getJob } = makeUseCase({
            jobState: 'active',
        });

        await expect(useCase.lookup(request(), leader, NOW)).resolves.toEqual({
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
            useCase.lookup(request(), leader, NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('конверт ошибки процессора отдаётся как error и не ставит джобу', async () => {
        const { useCase, dispatch } = makeUseCase({
            cached: { status: 'error', message: 'снапшоты недоступны' },
        });

        await expect(useCase.lookup(request(), leader, NOW)).resolves.toEqual({
            status: 'error',
            requestKey: KEY,
            message: 'снапшоты недоступны',
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('forceRefresh не читает кэш и ставит расчёт заново', async () => {
        const { useCase, getJson, dispatch } = makeUseCase({
            cached: { status: 'ready', data: dossier() },
        });

        await expect(
            useCase.lookup(request({ forceRefresh: true }), leader, NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(getJson).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('окно months меняет ключ и уезжает в джобу', async () => {
        const { useCase, dispatch } = makeUseCase();
        const result = await useCase.lookup(
            request({ months: 1 }),
            leader,
            NOW,
        );

        expect(result.requestKey).toBe(
            buildDossierKey(DOMAIN, MANAGER, '2026-09', '2026-09'),
        );
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_DOSSIER,
            expect.objectContaining({ months: ['2026-09'] }),
            result.requestKey,
            AI_DOSSIER_JOB_OPTIONS,
        );
    });

    it('менеджер вне периметра → 403, джоба не ставится', async () => {
        const { useCase, dispatch } = makeUseCase();

        await expect(
            useCase.lookup(request({ managerId: '999' }), leader, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('у роли cup периметра нет — любой менеджер виден', async () => {
        const { useCase, dispatch } = makeUseCase();

        await expect(
            useCase.lookup(request({ managerId: '999' }), cup, NOW),
        ).resolves.toMatchObject({ status: 'queued' });
        expect(dispatch).toHaveBeenCalledTimes(1);
    });
});
