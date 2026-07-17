import { NotFoundException } from '@nestjs/common';
import { FrontPortalBuilderService } from '../services/front-portal-builder.service';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';
import {
    aggregateFixture,
    callingRow,
    categoryRow,
    dealRow,
    departamentRow,
    fieldRow,
    listRow,
    portalRow,
    smartRow,
} from './fixtures';

describe('FrontPortalBuilderService', () => {
    const createService = (repositoryMock: {
        findByDomain: jest.Mock;
        findById?: jest.Mock;
    }): FrontPortalBuilderService =>
        new FrontPortalBuilderService(
            repositoryMock as unknown as PortalAggregateRepository,
        );

    it('кидает NotFoundException, если портала нет', async () => {
        const service = createService({
            findByDomain: jest.fn().mockResolvedValue(null),
        });

        await expect(
            service.buildByDomain('unknown.bitrix24.ru'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('собирает модель в форме Laravel PortalFrontResource', async () => {
        const aggregate = aggregateFixture(
            portalRow({
                btx_deals: [dealRow({ id: 3n })],
                smarts: [smartRow({ id: 4n })],
                bitrixlists: [listRow({ id: 6n })],
                departaments: [departamentRow()],
                callings: [callingRow()],
            }),
            [
                fieldRow({
                    entity_type: 'App\\Models\\BtxDeal',
                    entity_id: 3n,
                }),
            ],
            [categoryRow({ entity_id: 3n })],
        );
        const service = createService({
            findByDomain: jest.fn().mockResolvedValue(aggregate),
        });

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.id).toBe(1);
        expect(portal.departament?.group).toBe('sales');
        expect(portal.bitrixCallingTasksGroup?.name).toBe('sales_calling');
        expect(portal.bitrixSmart?.id).toBe(4);
        expect(portal.bitrixDeal?.id).toBe(3);
        expect(portal.bitrixDeal?.bitrixfields).toHaveLength(1);
        expect(portal.bitrixDeal?.categories).toHaveLength(1);
        expect(portal.smarts).toHaveLength(1);
        expect(portal.deals).toHaveLength(1);
        expect(portal.bitrixLists).toHaveLength(1);
    });

    it('nullable-синглтоны равны null при пустых коллекциях (семантика first())', async () => {
        const service = createService({
            findByDomain: jest
                .fn()
                .mockResolvedValue(aggregateFixture(portalRow())),
        });

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.departament).toBeNull();
        expect(portal.bitrixCallingTasksGroup).toBeNull();
        expect(portal.bitrixSmart).toBeNull();
        expect(portal.bitrixDeal).toBeNull();
        expect(portal.user).toBeNull();
        expect(portal.company).toBeNull();
        expect(portal.lead).toBeNull();
        expect(portal.contact).toBeNull();
        expect(portal.smarts).toEqual([]);
        expect(portal.rpas).toEqual([]);
    });

    it('не выбирает departament/calling других групп (без фолбэка на не-sales)', async () => {
        const service = createService({
            findByDomain: jest.fn().mockResolvedValue(
                aggregateFixture(
                    portalRow({
                        departaments: [departamentRow({ group: 'service' })],
                        callings: [callingRow({ group: 'service' })],
                    }),
                ),
            ),
        });

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.departament).toBeNull();
        expect(portal.bitrixCallingTasksGroup).toBeNull();
    });
});
