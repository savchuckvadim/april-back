import { offer_templates_visibility } from 'generated/prisma';
import { WordTemplateService } from '../services/word-template.service';
import { WordTemplate } from '../entities/word-template.entity';
import type { OfferTemplateRepository } from '../../offer-template/repositories/offer-template.repository';
import type { OfferTemplatePortalRepository } from '../../portal/repositories/offer-template-portal.repository';
import type { UserSelectedTemplateRepository } from '../../user-selected/repositories/user-selected-template.repository';
import type { StorageService } from '@lib/core/storage/storage.service';

/**
 * Область снятия «по умолчанию» у word-шаблонов КП.
 *
 * Регрессия: раньше область была только `visibility`, и default у
 * портального шаблона снимал default у шаблонов ВСЕХ порталов —
 * у offer_templates нет portal_id, а фильтр по visibility join-таблицу
 * не учитывал.
 */
const summary = (
    id: string,
    over: Partial<{ type: string; is_default: boolean }> = {},
) => ({
    id,
    name: `t${id}`,
    visibility: offer_templates_visibility.private,
    type: 'word',
    is_default: true,
    code: `c${id}`,
    is_active: true,
    counter: 0,
    ...over,
});

const template = (
    id: string,
    visibility: offer_templates_visibility,
    userId?: number,
): WordTemplate =>
    new WordTemplate({
        id,
        name: `t${id}`,
        visibility,
        is_default: false,
        file_path: 'x',
        type: 'word',
        code: `c${id}`,
        is_active: true,
        counter: 0,
        user_id: userId,
    });

const clearedIds = (update: jest.Mock): string[] =>
    update.mock.calls
        .filter(
            ([, data]) =>
                (data as { is_default?: boolean }).is_default === false,
        )
        .map(([id]) => String(id))
        .sort();

describe('WordTemplateService.setDefault — область снятия default', () => {
    let findMany: jest.Mock;
    let findByPortal: jest.Mock;
    let findUserTemplates: jest.Mock;
    let update: jest.Mock;
    let findByTemplate: jest.Mock;
    let service: WordTemplateService;

    beforeEach(() => {
        findMany = jest.fn().mockResolvedValue([]);
        findByPortal = jest.fn().mockResolvedValue([]);
        findUserTemplates = jest.fn().mockResolvedValue([]);
        update = jest.fn().mockImplementation((id: bigint, data: object) =>
            Promise.resolve({
                id,
                name: 'x',
                visibility: offer_templates_visibility.private,
                type: 'word',
                code: 'c',
                file_path: 'x',
                is_active: true,
                counter: 0,
                ...data,
            }),
        );
        findByTemplate = jest.fn().mockResolvedValue([]);

        const offerRepo = {
            findMany,
            findByPortal,
            findUserTemplates,
            update,
        } as unknown as OfferTemplateRepository;
        const portalRepo = {
            findByTemplate,
        } as unknown as OfferTemplatePortalRepository;
        const userRepo = {} as unknown as UserSelectedTemplateRepository;
        const storage = {
            getFilePath: jest.fn().mockReturnValue('p'),
        } as unknown as StorageService;

        service = new WordTemplateService(
            offerRepo,
            portalRepo,
            userRepo,
            storage,
        );
    });

    it('public: снимает default только у других публичных word-шаблонов', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.public),
        );
        findMany.mockResolvedValue([
            summary('1'),
            summary('2'),
            summary('3', { type: 'single' }),
            summary('4', { is_default: false }),
        ]);

        await service.setDefault(1n, true);

        expect(findMany).toHaveBeenCalledWith({
            visibility: offer_templates_visibility.public,
        });
        expect(clearedIds(update)).toEqual(['2']);
        expect(findByPortal).not.toHaveBeenCalled();
    });

    it('private: область — только шаблоны ТЕХ ЖЕ порталов, не всех', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.private),
        );
        findByTemplate.mockResolvedValue([
            { id: 100n, offer_template_id: 1n, portal_id: 7n },
        ]);
        findByPortal.mockImplementation((portalId: bigint) =>
            Promise.resolve(
                portalId === 7n
                    ? [
                          summary('1'),
                          summary('2'),
                          summary('5', { is_default: false }),
                      ]
                    : [summary('9')],
            ),
        );

        await service.setDefault(1n, true);

        expect(findByPortal).toHaveBeenCalledTimes(1);
        expect(findByPortal).toHaveBeenCalledWith(7n);
        // '9' живёт на другом портале и НЕ тронут — в этом вся регрессия
        expect(clearedIds(update)).toEqual(['2']);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('private на двух порталах: область объединяется по обоим', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.private),
        );
        findByTemplate.mockResolvedValue([
            { id: 100n, offer_template_id: 1n, portal_id: 7n },
            { id: 101n, offer_template_id: 1n, portal_id: 12n },
        ]);
        findByPortal.mockImplementation((portalId: bigint) =>
            Promise.resolve(
                portalId === 7n
                    ? [summary('1'), summary('2')]
                    : [summary('1'), summary('3')],
            ),
        );

        await service.setDefault(1n, true);

        expect(clearedIds(update)).toEqual(['2', '3']);
    });

    it('user: область — шаблоны того же создателя на тех же порталах', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.user, 55),
        );
        findByTemplate.mockResolvedValue([
            { id: 100n, offer_template_id: 1n, portal_id: 7n },
        ]);
        findUserTemplates.mockResolvedValue([summary('1'), summary('8')]);

        await service.setDefault(1n, true);

        expect(findUserTemplates).toHaveBeenCalledWith(55n, 7n);
        expect(findByPortal).not.toHaveBeenCalled();
        expect(clearedIds(update)).toEqual(['8']);
    });

    it('сирота без привязок: ничего чужого не снимается', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.private),
        );
        findByTemplate.mockResolvedValue([]);

        await service.setDefault(1n, true);

        expect(findByPortal).not.toHaveBeenCalled();
        expect(clearedIds(update)).toEqual([]);
    });

    it('is_default=false: область не вычисляется вовсе', async () => {
        jest.spyOn(service, 'findById').mockResolvedValue(
            template('1', offer_templates_visibility.private),
        );

        await service.setDefault(1n, false);

        expect(findByTemplate).not.toHaveBeenCalled();
        expect(findMany).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(1n, { is_default: false });
    });
});
