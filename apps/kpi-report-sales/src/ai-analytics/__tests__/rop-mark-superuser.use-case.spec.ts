import { ForbiddenException } from '@nestjs/common';
import { AI_ROP_MARK_SUPER_USER_FORBIDDEN_MESSAGE } from '../domain/use-cases/rop-mark.use-case';
import {
    cup,
    DOMAIN,
    makeUseCase,
    mark,
    NOW,
    savedPick,
    vendor,
    WEEK,
} from './fixtures/rop-mark-use-case.fixture';

describe('RopMarkUseCase: суперпользователь вендора калибровку не пишет', () => {
    it('save — 403 с русским сообщением, метка не пишется', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        const attempt = useCase.save(
            {
                domain: DOMAIN,
                requesterUserId: '447',
                weekKey: WEEK,
                transcriptionId: '103',
                agree: true,
            },
            vendor,
            NOW,
        );

        await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        await expect(attempt).rejects.toThrow(
            AI_ROP_MARK_SUPER_USER_FORBIDDEN_MESSAGE,
        );
        expect(store.saveMark).not.toHaveBeenCalled();
    });

    it('pick с forceRefresh — 403, подбор не пересобирается', async () => {
        const { useCase, store, loadLite } = makeUseCase({ pick: savedPick() });

        await expect(
            useCase.pick(
                {
                    domain: DOMAIN,
                    requesterUserId: '447',
                    weekKey: WEEK,
                    forceRefresh: true,
                },
                vendor,
                NOW,
            ),
        ).rejects.toThrow(AI_ROP_MARK_SUPER_USER_FORBIDDEN_MESSAGE);
        expect(loadLite).not.toHaveBeenCalled();
        expect(store.savePick).not.toHaveBeenCalled();
    });

    it('pick без пересборки и list — только чтение, доступны', async () => {
        const { useCase, store } = makeUseCase({
            pick: savedPick(),
            marks: [mark()],
        });

        const picked = await useCase.pick(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            vendor,
            NOW,
        );
        const listed = await useCase.list(
            { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK },
            vendor,
            NOW,
        );

        expect(picked.calls.map(call => call.transcriptionId)).toEqual([
            '102',
            '103',
        ]);
        expect(listed.calls).toHaveLength(2);
        expect(store.savePick).not.toHaveBeenCalled();
        expect(store.saveMark).not.toHaveBeenCalled();
    });

    it('pick без сохранённого подбора — тот же подбор как предпросмотр, без записи', async () => {
        const request = {
            domain: DOMAIN,
            requesterUserId: '447',
            weekKey: WEEK,
        };
        const vendorRun = makeUseCase();
        const leaderRun = makeUseCase();

        const preview = await vendorRun.useCase.pick(request, vendor, NOW);
        const picked = await leaderRun.useCase.pick(
            request,
            { ...cup, isSuperUser: false },
            NOW,
        );

        expect(vendorRun.loadLite).toHaveBeenCalledTimes(1);
        expect(vendorRun.store.savePick).not.toHaveBeenCalled();
        expect(leaderRun.store.savePick).toHaveBeenCalledTimes(1);
        expect(preview.calls.length).toBeGreaterThan(0);
        expect(preview.calls.map(call => call.transcriptionId)).toEqual(
            picked.calls.map(call => call.transcriptionId),
        );
    });

    it('обычный cup-руководитель по-прежнему ставит метку', async () => {
        const { useCase, store } = makeUseCase({ pick: savedPick() });

        await useCase.save(
            {
                domain: DOMAIN,
                requesterUserId: '447',
                weekKey: WEEK,
                transcriptionId: '103',
                agree: true,
            },
            { ...cup, isSuperUser: false },
            NOW,
        );

        expect(store.saveMark).toHaveBeenCalledTimes(1);
    });
});
