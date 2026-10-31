import { GoneException, HttpException } from '@nestjs/common';
import type { AppCacheService } from '@lib/app-cache';
import type { KonstructorInitDataDto } from '../../../init/dto/response-init-data.dto';
import type { KonstructorInitUseCase } from '../../../init/konstructor-init.use-case';
import type { ComplectDescriptionService } from '../../complect-description/services/complect-description.service';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicDescriptionService } from '../services/public-description.service';
import type { PublicLinkService } from '../services/public-link.service';

const ACTIVE = {
    id: 'link-1',
    expiresAt: null,
    domain: 'april-garant.bitrix24.ru',
};

const INIT = {
    contracts: { current: [], items: [] },
    measures: [],
} as unknown as KonstructorInitDataDto;

const makeLinks = () => ({
    requireActive: jest.fn().mockResolvedValue(ACTIVE),
    registerView: jest.fn().mockResolvedValue(undefined),
});

describe('PublicCatalogService', () => {
    const makeService = (
        links: ReturnType<typeof makeLinks>,
        remember: jest.Mock,
    ) => {
        const init = { init: jest.fn().mockResolvedValue(INIT) };
        const service = new PublicCatalogService(
            links as unknown as PublicLinkService,
            init as unknown as KonstructorInitUseCase,
            { remember } as unknown as AppCacheService,
        );
        return { service, init };
    };

    it('кэширует на портал ссылки и считает просмотр', async () => {
        const links = makeLinks();
        const remember = jest.fn((_ref, factory: () => Promise<unknown>) =>
            factory(),
        );
        const { service, init } = makeService(links, remember);

        await service.getByToken('token-1');

        expect(remember.mock.calls[0][0]).toMatchObject({
            domain: ACTIVE.domain,
            ttlSeconds: 300,
        });
        expect(init.init).toHaveBeenCalledWith(ACTIVE.domain);
        expect(links.registerView).toHaveBeenCalledWith('link-1');
    });

    it('сбой кэша не закрывает страницу: каталог считается напрямую', async () => {
        const links = makeLinks();
        const remember = jest.fn().mockRejectedValue(new Error('redis down'));
        const { service, init } = makeService(links, remember);

        await expect(service.getByToken('token-1')).resolves.toBeDefined();
        expect(init.init).toHaveBeenCalledTimes(1);
    });

    it('отозванная ссылка не доходит до init и не считается просмотром', async () => {
        const links = makeLinks();
        links.requireActive.mockRejectedValue(new GoneException());
        const remember = jest.fn();
        const { service, init } = makeService(links, remember);

        await expect(service.getByToken('token-1')).rejects.toBeInstanceOf(
            GoneException,
        );
        expect(remember).not.toHaveBeenCalled();
        expect(init.init).not.toHaveBeenCalled();
        expect(links.registerView).not.toHaveBeenCalled();
    });
});

describe('PublicDescriptionService', () => {
    const DTO = { complectName: 'Проф', supply: '1 ОД', groups: [] };
    const RENDERED = {
        buffer: Buffer.from('docx'),
        documentName: 'Описание.docx',
        infoblocksCount: 0,
    };

    const makeService = (links = makeLinks()) => {
        const description = {
            render: jest.fn().mockResolvedValue(RENDERED),
        };
        const service = new PublicDescriptionService(
            links as unknown as PublicLinkService,
            description as unknown as ComplectDescriptionService,
        );
        return { service, description };
    };

    it('собирает файл по действующей ссылке', async () => {
        const { service, description } = makeService();

        await expect(service.render('token-1', DTO)).resolves.toBe(RENDERED);
        expect(description.render).toHaveBeenCalledWith(DTO);
    });

    it('отозванная ссылка файл не получает', async () => {
        const links = makeLinks();
        links.requireActive.mockRejectedValue(new GoneException());
        const { service, description } = makeService(links);

        await expect(service.render('token-1', DTO)).rejects.toBeInstanceOf(
            GoneException,
        );
        expect(description.render).not.toHaveBeenCalled();
    });

    it('сверх лимита — 429, файл не собирается', async () => {
        const { service, description } = makeService();
        for (let i = 0; i < 30; i += 1) {
            await service.render('token-1', DTO);
        }
        description.render.mockClear();

        const failure = await service
            .render('token-1', DTO)
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(HttpException);
        expect((failure as HttpException).getStatus()).toBe(429);
        expect(description.render).not.toHaveBeenCalled();
    });
});
