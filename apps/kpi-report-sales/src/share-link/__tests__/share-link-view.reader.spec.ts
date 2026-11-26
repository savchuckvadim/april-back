import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { PortalViewReader } from '../../portal-view';
import {
    availableIn,
    dependenciesOf,
    metadataList,
} from '../../ai-analytics/__tests__/fixtures/module-di.util';
import { ShareLinkPublicController } from '../controllers/share-link-public.controller';
import { ShareLinkViewReader } from '../services/share-link-view.reader';
import { ShareLinkModule } from '../share-link.module';

const DOMAIN = 'gsr.bitrix24.ru';

function build() {
    const portalView = { labels: jest.fn() };
    const reader = new ShareLinkViewReader(
        portalView as unknown as PortalViewReader,
    );
    return { reader, portalView };
}

describe('ShareLinkViewReader', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('свои названия портала ссылки приходят в view.labels', async () => {
        const { reader, portalView } = build();
        portalView.labels.mockResolvedValue({
            'ev:presentation_plan': 'Назначенная презентация',
        });

        const view = await reader.read(DOMAIN);

        expect(portalView.labels).toHaveBeenCalledWith(DOMAIN);
        expect(view).toEqual({
            labels: { 'ev:presentation_plan': 'Назначенная презентация' },
        });
    });

    it('ошибка чтения настроек — пустые названия и предупреждение, ссылка не ломается', async () => {
        const { reader, portalView } = build();
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        portalView.labels.mockRejectedValue(new Error('база недоступна'));

        const view = await reader.read(DOMAIN);

        expect(view).toEqual({ labels: {} });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('база недоступна'),
        );
    });
});

describe('DI: свои названия в модуле публичных ссылок', () => {
    it('читатель вида портала доступен модулю, читатель названий — его провайдер', () => {
        const available = availableIn(ShareLinkModule);

        expect(available.has(PortalViewReader)).toBe(true);
        for (const dependency of dependenciesOf(ShareLinkViewReader)) {
            expect(available.has(dependency)).toBe(true);
        }
        expect(metadataList(ShareLinkModule, 'providers')).toContain(
            ShareLinkViewReader,
        );
        expect(dependenciesOf(ShareLinkPublicController)).toContain(
            ShareLinkViewReader,
        );
    });
});
