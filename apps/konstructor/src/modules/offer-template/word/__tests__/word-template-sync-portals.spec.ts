import { offer_templates_visibility } from 'generated/prisma';
import { WordTemplateService } from '../services/word-template.service';
import { WordTemplate } from '../entities/word-template.entity';
import type { OfferTemplateRepository } from '../../offer-template/repositories/offer-template.repository';
import type { OfferTemplatePortalRepository } from '../../portal/repositories/offer-template-portal.repository';
import type { UserSelectedTemplateRepository } from '../../user-selected/repositories/user-selected-template.repository';
import type { StorageService } from '@lib/core/storage/storage.service';

const binding = (id: bigint, portalId: bigint) => ({
    id,
    offer_template_id: 1n,
    portal_id: portalId,
    is_default: false,
    is_active: true,
});

describe('WordTemplateService.syncPortals — синхронизация привязок', () => {
    let findByTemplate: jest.Mock;
    let create: jest.Mock;
    let remove: jest.Mock;
    let service: WordTemplateService;

    beforeEach(() => {
        findByTemplate = jest.fn();
        create = jest.fn().mockResolvedValue(undefined);
        remove = jest.fn().mockResolvedValue(undefined);

        const portalRepo = {
            findByTemplate,
            create,
            delete: remove,
        } as unknown as OfferTemplatePortalRepository;

        service = new WordTemplateService(
            {} as unknown as OfferTemplateRepository,
            portalRepo,
            {} as unknown as UserSelectedTemplateRepository,
            {} as unknown as StorageService,
        );
        jest.spyOn(service, 'findById').mockResolvedValue(
            new WordTemplate({
                id: '1',
                name: 't',
                visibility: offer_templates_visibility.private,
                is_default: false,
                file_path: 'x',
                type: 'word',
                code: 'c',
                is_active: true,
                counter: 0,
            }),
        );
    });

    it('добавляет недостающие, удаляет лишние, существующие не трогает', async () => {
        findByTemplate
            .mockResolvedValueOnce([binding(100n, 7n), binding(101n, 12n)])
            .mockResolvedValueOnce([binding(101n, 12n), binding(102n, 20n)]);

        const result = await service.syncPortals(1n, ['12', '20']);

        expect(remove).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(100n);
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith({
            offer_template_id: 1n,
            portal_id: 20n,
            is_default: false,
            is_active: true,
        });
        expect(result.map(b => String(b.portal_id))).toEqual(['12', '20']);
    });

    it('новая привязка создаётся АКТИВНОЙ (в join-таблице default false)', async () => {
        findByTemplate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await service.syncPortals(1n, ['7']);

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: true }),
        );
    });

    it('пустой список снимает все привязки', async () => {
        findByTemplate
            .mockResolvedValueOnce([binding(100n, 7n), binding(101n, 12n)])
            .mockResolvedValueOnce([]);

        await service.syncPortals(1n, []);

        expect(remove).toHaveBeenCalledTimes(2);
        expect(create).not.toHaveBeenCalled();
    });

    it('дубли и ведущие нули в id нормализуются', async () => {
        findByTemplate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await service.syncPortals(1n, ['007', '7', '7']);

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ portal_id: 7n }),
        );
    });

    it('идемпотентно: совпадающее состояние ничего не пишет', async () => {
        findByTemplate
            .mockResolvedValueOnce([binding(100n, 7n)])
            .mockResolvedValueOnce([binding(100n, 7n)]);

        await service.syncPortals(1n, ['7']);

        expect(remove).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});
