import { ForbiddenException } from '@nestjs/common';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import { AI_DOSSIER_ROUTE } from '../constants/ai-dossier.const';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAnalyticsDossierController } from '../dossier/ai-analytics-dossier.controller';
import { AiAnalyticsDossierModule } from '../dossier/ai-analytics-dossier.module';
import { AiDossierRequestDto } from '../dto/ai-dossier.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const KEY =
    'sales-ai-analytics:v1:april.bitrix24.ru:dossier:512:2026-07_2026-09';

const leader: RequesterAccess = {
    role: 'op',
    visibleManagerIds: ['447', '512'],
};
const manager: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['512'],
};

const request = (): AiDossierRequestDto =>
    ({
        domain: 'april.bitrix24.ru',
        requesterUserId: '447',
        managerId: '512',
    }) as AiDossierRequestDto;

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
    const controller = new AiAnalyticsDossierController(accessService, {
        lookup,
    } as never);

    return { controller, lookup };
}

describe('AiAnalyticsDossierController: POST /ai-analytics/dossier', () => {
    it('руководителю отдаётся конверт use-case’а с его периметром', async () => {
        const { controller, lookup } = makeController(leader);

        await expect(controller.getDossier(request())).resolves.toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(lookup).toHaveBeenCalledWith(request(), leader);
    });

    it('менеджеру при ai_analytics_self_view_enabled = false — 403 (решение В1)', async () => {
        const { controller, lookup } = makeController(manager, false);

        await expect(controller.getDossier(request())).rejects.toThrow(
            new ForbiddenException(AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE),
        );
        expect(lookup).not.toHaveBeenCalled();
    });

    it('менеджеру при включённой настройке ручка доступна по своему периметру', async () => {
        const { controller, lookup } = makeController(manager, true);

        await expect(controller.getDossier(request())).resolves.toMatchObject({
            status: 'queued',
        });
        expect(lookup).toHaveBeenCalledWith(request(), manager);
    });

    it('ready-конверт отдаётся ручкой как есть — контроллер ничего не считает', async () => {
        const { controller, lookup } = makeController(leader);
        const data = { managerId: '512', reasons: [] };
        lookup.mockResolvedValue({ status: 'ready', requestKey: KEY, data });

        await expect(controller.getDossier(request())).resolves.toEqual({
            status: 'ready',
            requestKey: KEY,
            data,
        });
    });
});

describe('AiAnalyticsDossierModule: периметр среза', () => {
    const metadata = (key: string): unknown[] =>
        (Reflect.getMetadata(key, AiAnalyticsDossierModule) ?? []) as unknown[];
    const names = (key: string): string[] =>
        metadata(key).map(item => (item as { name: string }).name);

    it('срез публикует ровно один контроллер — ручку досье', () => {
        expect(names('controllers')).toEqual(['AiAnalyticsDossierController']);
    });

    it('оба use-case’а экспортированы: джобу забирает процессор очереди', () => {
        expect(names('exports')).toEqual([
            'DossierUseCase',
            'DossierJobUseCase',
        ]);
    });

    it('стор меток и загрузчик стиля не объявлены повторно — берутся у владельцев', () => {
        expect(names('providers')).toEqual([
            'DossierSourcesLoader',
            'DossierUseCase',
            'DossierJobUseCase',
        ]);
        expect(names('imports')).toContain('AiAnalyticsRopMarkModule');
        expect(names('imports')).toContain('AiAnalyticsStyleModule');
    });

    it('роут ручки — dossier (он же секция ключа кэша)', () => {
        expect(AI_DOSSIER_ROUTE).toBe('dossier');
    });
});
