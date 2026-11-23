import { BadRequestException, Logger } from '@nestjs/common';
import { ProviderImageEntity, ProviderImageService } from '../provider-image';
import { MemoryProviderImageRepository } from '../provider-image/__tests__/memory-provider-image.repository';
import {
    createTempStorage,
    makePng,
    TempStorage,
} from '../provider-image/__tests__/support/image-fixtures';
import { ProviderImageAdminController } from './provider-image.admin.controller';

type ServiceMock = Record<'list' | 'put' | 'readFile' | 'remove', jest.Mock>;

const image = (
    over: Partial<ProviderImageEntity> = {},
): ProviderImageEntity => ({
    id: 'img-1',
    rqId: 15,
    role: 'stamp',
    path: 'konstructor/provider-images/15/img-1.png',
    format: 'png',
    width: 400,
    height: 300,
    size: 1000,
    originalName: 'pechat.png',
    legacyFileId: null,
    createdAt: new Date('2026-11-23T10:00:00Z'),
    updatedAt: new Date('2026-11-23T11:00:00Z'),
    ...over,
});

describe('ProviderImageAdminController', () => {
    describe('делегирование сервису', () => {
        let service: ServiceMock;
        let controller: ProviderImageAdminController;

        beforeEach(() => {
            service = {
                list: jest.fn(),
                put: jest.fn(),
                readFile: jest.fn(),
                remove: jest.fn(),
            };
            controller = new ProviderImageAdminController(
                service as unknown as ProviderImageService,
            );
        });

        it('список: записи превращаются в DTO без пути, даты — строками ISO', async () => {
            service.list.mockResolvedValue([
                image(),
                image({ updatedAt: null }),
            ]);

            const result = await controller.listImages(15);

            expect(service.list).toHaveBeenCalledWith(15);
            expect(result[0]).toEqual({
                id: 'img-1',
                rqId: 15,
                role: 'stamp',
                format: 'png',
                width: 400,
                height: 300,
                size: 1000,
                originalName: 'pechat.png',
                createdAt: '2026-11-23T10:00:00.000Z',
                updatedAt: '2026-11-23T11:00:00.000Z',
            });
            expect(result[1].updatedAt).toBeNull();
        });

        it('загрузка: в сервис уходят байты и имя файла, ответ — DTO', async () => {
            service.put.mockResolvedValue(image());
            const file = {
                buffer: Buffer.from('png'),
                originalname: 'pechat.png',
            } as Express.Multer.File;

            const result = await controller.uploadImage(15, 'stamp', file);

            expect(service.put).toHaveBeenCalledWith(15, 'stamp', {
                buffer: file.buffer,
                originalName: 'pechat.png',
            });
            expect(result.role).toBe('stamp');
        });

        it('загрузка без файла: в сервис уходит пустой буфер, ошибку даёт сервис', async () => {
            service.put.mockResolvedValue(image());

            await controller.uploadImage(15, 'stamp', undefined);

            expect(service.put).toHaveBeenCalledWith(15, 'stamp', {
                buffer: undefined,
                originalName: undefined,
            });
        });

        it('удаление делегирует в сервис', async () => {
            service.remove.mockResolvedValue(undefined);
            await controller.removeImage(15, 'logo');
            expect(service.remove).toHaveBeenCalledWith(15, 'logo');
        });
    });

    describe('с настоящим сервисом', () => {
        let temp: TempStorage;
        let controller: ProviderImageAdminController;

        beforeEach(() => {
            jest.spyOn(Logger.prototype, 'log').mockImplementation(
                () => undefined,
            );
            temp = createTempStorage();
            controller = new ProviderImageAdminController(
                new ProviderImageService(
                    new MemoryProviderImageRepository([15]),
                    temp.storage,
                ),
            );
        });

        afterEach(() => {
            temp.cleanup();
            jest.restoreAllMocks();
        });

        it('неизвестная роль — 400 на загрузке, чтении файла и удалении', async () => {
            const file = {
                buffer: await makePng(),
                originalname: 'pechat.png',
            } as Express.Multer.File;
            const res = {} as never;

            await expect(
                controller.uploadImage(15, 'seal', file),
            ).rejects.toThrow(BadRequestException);
            await expect(
                controller.getImageFile(15, 'seal', res),
            ).rejects.toThrow(BadRequestException);
            await expect(controller.removeImage(15, 'seal')).rejects.toThrow(
                'Неизвестная роль картинки «seal»',
            );
        });
    });
});
