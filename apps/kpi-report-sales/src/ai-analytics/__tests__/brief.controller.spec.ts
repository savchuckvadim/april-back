import { ForbiddenException } from '@nestjs/common';
import { AiAnalyticsBriefController } from '../ai-analytics-brief.controller';
import { buildBriefKey } from '../brief/brief-cache-key.util';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiBriefRequestDto } from '../dto/ai-brief.dto';
import {
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_TO,
    briefPack,
} from './fixtures/brief.fixture';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const KEY = buildBriefKey(BRIEF_DOMAIN, briefPack().hash);
const leader: RequesterAccess = { role: 'op', visibleManagerIds: ['10'] };
const manager: RequesterAccess = { role: 'manager', visibleManagerIds: ['10'] };

const request = (): AiBriefRequestDto =>
    ({
        domain: BRIEF_DOMAIN,
        requesterUserId: '447',
        from: BRIEF_FROM,
        to: BRIEF_TO,
    }) as AiBriefRequestDto;

function makeController(access: RequesterAccess, selfViewEnabled = false) {
    // resolve подменён; resolveViewer — настоящий: правило self_view проверяется.
    const accessService = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({ selfViewEnabled }),
    );
    jest.spyOn(accessService, 'resolve').mockResolvedValue(access);
    const lookup = jest.fn().mockResolvedValue({
        status: 'queued',
        requestKey: KEY,
        jobId: KEY,
    });
    const controller = new AiAnalyticsBriefController(accessService, {
        lookup,
    } as never);

    return { controller, lookup };
}

describe('AiAnalyticsBriefController: POST /ai-analytics/brief', () => {
    it('руководителю отдаётся конверт use-case’а с периметром', async () => {
        const { controller, lookup } = makeController(leader);

        await expect(controller.getBrief(request())).resolves.toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(lookup).toHaveBeenCalledWith(request(), leader);
    });

    it('менеджеру при ai_analytics_self_view_enabled = false — 403', async () => {
        const { controller, lookup } = makeController(manager, false);

        await expect(controller.getBrief(request())).rejects.toThrow(
            new ForbiddenException(AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE),
        );
        expect(lookup).not.toHaveBeenCalled();
    });

    it('менеджеру при включённой настройке ручка доступна по своему периметру', async () => {
        const { controller, lookup } = makeController(manager, true);

        await expect(controller.getBrief(request())).resolves.toMatchObject({
            status: 'queued',
        });
        expect(lookup).toHaveBeenCalledWith(request(), manager);
    });

    it('ready-конверт отдаётся ручкой как есть', async () => {
        const { controller, lookup } = makeController(leader);
        const data = {
            headline: 'Итоги недели',
            bullets: [],
            tone: 'calm' as const,
            source: 'template' as const,
            packHash: briefPack().hash,
            generatedAt: '2026-09-08T06:00:00.000Z',
            promptVersion: 'brief-1.0.0',
        };
        lookup.mockResolvedValue({
            status: 'ready',
            requestKey: KEY,
            data,
        });

        await expect(controller.getBrief(request())).resolves.toEqual({
            status: 'ready',
            requestKey: KEY,
            data,
        });
    });
});
