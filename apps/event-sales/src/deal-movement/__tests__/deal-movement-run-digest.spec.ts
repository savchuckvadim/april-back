import {
    buildRun,
    DIGEST_ON,
    DOMAIN,
    entry,
    NOW,
} from './deal-movement-run.fixture';

/** Прошлой ночью обе сделки «двигались»; сегодня 1 откатилась. */
const lastNight = () => ({
    lastRunAt: '2026-11-16T23:30:00.000Z',
    previous: new Map([
        ['1', entry('moving')],
        ['2', entry('moving')],
    ]),
});

describe('прогон движения сделок: сводка руководителям', () => {
    it('ночной счёт: сводка после записей и до снимка; в неё — все сделки ночи, новая — с прошлым статусом', async () => {
        const { service, digest, snapshots, order } = buildRun({
            ...lastNight(),
            digest: DIGEST_ON,
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(order).toEqual(['state', 'digest', 'snapshot', 'deals', 'mark']);
        const [request] = digest.send.mock.calls[0] as unknown as [
            {
                domain: string;
                day: string;
                deals: {
                    dealId: string;
                    status: string;
                    newFrom: string | null;
                }[];
            },
        ];
        expect(request.domain).toBe(DOMAIN);
        expect(request.day).toBe('2026-11-18');
        expect(request.deals).toEqual([
            expect.objectContaining({
                dealId: '1',
                status: 'rolled_back',
                newFrom: 'moving',
            }),
            expect.objectContaining({
                dealId: '2',
                status: 'moving',
                newFrom: null,
            }),
        ]);
        expect(outcome).toMatchObject({
            status: {
                digest: { enabled: true, recipients: 3, sent: 2, failed: 1 },
            },
        });
        expect(snapshots.save).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                digest: expect.objectContaining({ sent: 2 }) as unknown,
            }),
        );
    });

    it('ручной счёт из админки сводку не шлёт — «только после ночного счёта»', async () => {
        const { service, digest } = buildRun({
            ...lastNight(),
            digest: DIGEST_ON,
        });

        const outcome = await service.run(DOMAIN, 'count', 'admin', NOW);

        expect(digest.send).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            status: { digest: { enabled: true, skipped: 'manual' } },
        });
    });

    it('«Посчитать» — без сводки; выключена — пропуск без рассылки', async () => {
        const dry = buildRun({ ...lastNight(), digest: DIGEST_ON });
        const counted = await dry.service.run(DOMAIN, 'dry-run', 'admin', NOW);
        expect(dry.digest.send).not.toHaveBeenCalled();
        expect(counted.kind === 'ran' ? counted.status.digest : null).toBe(
            undefined,
        );

        const off = buildRun(lastNight());
        const nightly = await off.service.run(DOMAIN, 'count', 'nightly', NOW);
        expect(off.digest.send).not.toHaveBeenCalled();
        expect(nightly).toMatchObject({
            status: { digest: { enabled: false, skipped: 'disabled' } },
        });
    });

    it('сбой сводки прогон не роняет — причина в предупреждениях', async () => {
        const { service, digest, runState } = buildRun({
            ...lastNight(),
            digest: DIGEST_ON,
        });
        digest.send.mockImplementationOnce(() =>
            Promise.reject(new Error('структура недоступна')),
        );

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(outcome.kind).toBe('ran');
        const status = outcome.kind === 'ran' ? outcome.status : null;
        expect(status?.warnings).toContain(
            'сводка руководителям не разослана: структура недоступна',
        );
        expect(runState.markRun).toHaveBeenCalled();
    });
});
