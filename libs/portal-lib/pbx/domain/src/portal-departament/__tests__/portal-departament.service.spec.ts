/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import type { departaments } from 'generated/prisma';
import { PortalDepartamentService } from '../services/portal-departament.service';
import { PortalDepartamentRepository } from '../repositories/portal-departament.repository';
import { EDepartamentGroup } from '../entity/portal-departament.entity';

function makeRow(over: Partial<departaments> = {}): departaments {
    return {
        id: BigInt(10),
        type: 'department',
        group: 'sales',
        name: 'Отдел продаж',
        title: 'Отдел продаж',
        bitrixId: BigInt(5),
        portal_id: BigInt(1),
        is_multiple: false,
        multiple_tag: null,
        ...over,
    } as departaments;
}

describe('PortalDepartamentService', () => {
    let repo: jest.Mocked<PortalDepartamentRepository>;
    let service: PortalDepartamentService;

    beforeEach(() => {
        repo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByTypeGroupPortal: jest.fn(),
            findByPortalId: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as unknown as jest.Mocked<PortalDepartamentRepository>;
        service = new PortalDepartamentService(repo);
    });

    describe('create', () => {
        it('создаёт строку с дефолтами isMultiple=false, multipleTag=null', async () => {
            repo.create.mockResolvedValue(makeRow());

            const result = await service.create({
                portalId: 1,
                group: EDepartamentGroup.sales,
                name: 'Отдел продаж',
                title: 'Отдел продаж',
                bitrixId: 5,
            });

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    is_multiple: false,
                    multiple_tag: null,
                }),
            );
            expect(result.isMultiple).toBe(false);
            expect(result.multipleTag).toBeNull();
        });

        it('прокидывает isMultiple и multipleTag в prisma-запись', async () => {
            repo.create.mockResolvedValue(
                makeRow({ is_multiple: true, multiple_tag: 'ОП' }),
            );

            const result = await service.create({
                portalId: 1,
                group: EDepartamentGroup.sales,
                name: 'Отдел продаж',
                title: 'Отдел продаж',
                bitrixId: 5,
                isMultiple: true,
                multipleTag: 'ОП',
            });

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    is_multiple: true,
                    multiple_tag: 'ОП',
                }),
            );
            expect(result.isMultiple).toBe(true);
            expect(result.multipleTag).toBe('ОП');
        });
    });

    describe('findById / findMany', () => {
        it('кидает NotFound, если строки нет', async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.findById(404)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('маппит новые поля в response-dto', async () => {
            repo.findMany.mockResolvedValue([
                makeRow({ is_multiple: true, multiple_tag: 'ОС' }),
            ]);

            const [row] = await service.findMany();

            expect(row.isMultiple).toBe(true);
            expect(row.multipleTag).toBe('ОС');
        });
    });

    describe('update', () => {
        it('обновляет isMultiple и multipleTag', async () => {
            repo.findById.mockResolvedValue(makeRow());
            repo.update.mockResolvedValue(
                makeRow({ is_multiple: true, multiple_tag: 'custom' }),
            );

            const result = await service.update(10, {
                isMultiple: true,
                multipleTag: 'custom',
            });

            expect(repo.update).toHaveBeenCalledWith(10, {
                is_multiple: true,
                multiple_tag: 'custom',
            });
            expect(result.isMultiple).toBe(true);
            expect(result.multipleTag).toBe('custom');
        });

        it('multipleTag=null сбрасывает тэг, undefined — не трогает поле', async () => {
            repo.findById.mockResolvedValue(
                makeRow({ is_multiple: true, multiple_tag: 'ОП' }),
            );
            repo.update.mockResolvedValue(makeRow({ multiple_tag: null }));

            await service.update(10, { multipleTag: null });
            expect(repo.update).toHaveBeenCalledWith(10, {
                multiple_tag: null,
            });

            await service.update(10, { name: 'Новое имя' });
            expect(repo.update).toHaveBeenLastCalledWith(10, {
                name: 'Новое имя',
            });
        });
    });

    describe('upsertByKey', () => {
        it('создаёт строку, если отдела с таким ключом нет', async () => {
            repo.findByTypeGroupPortal.mockResolvedValue(null);
            repo.create.mockResolvedValue(makeRow());

            const result = await service.upsertByKey(
                1,
                EDepartamentGroup.sales,
                { name: 'Отдел продаж', title: 'Отдел продаж', bitrixId: 5 },
            );

            expect(repo.findByTypeGroupPortal).toHaveBeenCalledWith(
                'department',
                EDepartamentGroup.sales,
                1,
            );
            expect(repo.create).toHaveBeenCalledTimes(1);
            expect(repo.update).not.toHaveBeenCalled();
            expect(result.bitrixId).toBe(5);
            expect(result.group).toBe(EDepartamentGroup.sales);
        });

        it('обновляет существующую строку по ключу type+group+portalId', async () => {
            repo.findByTypeGroupPortal.mockResolvedValue(
                makeRow({ id: BigInt(7) }),
            );
            repo.update.mockResolvedValue(
                makeRow({ id: BigInt(7), bitrixId: BigInt(99) }),
            );

            const result = await service.upsertByKey(
                1,
                EDepartamentGroup.sales,
                { name: 'Отдел продаж', title: 'Отдел продаж', bitrixId: 99 },
            );

            expect(repo.update).toHaveBeenCalledWith(7, {
                name: 'Отдел продаж',
                title: 'Отдел продаж',
                bitrixId: BigInt(99),
            });
            expect(repo.create).not.toHaveBeenCalled();
            expect(result.id).toBe(7);
            expect(result.bitrixId).toBe(99);
        });

        it('upsert не перетирает isMultiple/multipleTag существующей строки', async () => {
            repo.findByTypeGroupPortal.mockResolvedValue(
                makeRow({ is_multiple: true, multiple_tag: 'ОП' }),
            );
            repo.update.mockResolvedValue(
                makeRow({ is_multiple: true, multiple_tag: 'ОП' }),
            );

            await service.upsertByKey(1, EDepartamentGroup.sales, {
                name: 'Отдел продаж',
                title: 'Отдел продаж',
                bitrixId: 5,
            });

            const patch = repo.update.mock.calls[0][1];
            expect(patch).not.toHaveProperty('is_multiple');
            expect(patch).not.toHaveProperty('multiple_tag');
        });
    });

    describe('delete', () => {
        it('кидает NotFound, если строки нет', async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.delete(123)).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(repo.delete).not.toHaveBeenCalled();
        });

        it('удаляет существующую строку', async () => {
            repo.findById.mockResolvedValue(makeRow());
            await service.delete(10);
            expect(repo.delete).toHaveBeenCalledWith(10);
        });
    });
});
