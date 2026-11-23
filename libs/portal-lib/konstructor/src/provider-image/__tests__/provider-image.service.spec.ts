import { existsSync, readdirSync } from 'fs';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
    PROVIDER_IMAGE_MAX_BYTES,
    PROVIDER_IMAGE_MAX_SIDE,
} from '../lib/provider-image-file.util';
import { PROVIDER_IMAGE_MESSAGES } from '../provider-image.messages';
import { ProviderImageService } from '../provider-image.service';
import { MemoryProviderImageRepository } from './memory-provider-image.repository';
import {
    brokenPng,
    createTempStorage,
    fakeHtml,
    makeGif,
    makeJpg,
    makePng,
    TempStorage,
} from './support/image-fixtures';

const RQ = 15;
const OTHER_RQ = 16;

describe('картинки поставщика: сервис', () => {
    let temp: TempStorage;
    let repository: MemoryProviderImageRepository;
    let service: ProviderImageService;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        temp = createTempStorage();
        repository = new MemoryProviderImageRepository([RQ, OTHER_RQ]);
        service = new ProviderImageService(repository, temp.storage);
    });

    afterEach(() => {
        temp.cleanup();
        jest.restoreAllMocks();
    });

    const upload = (buffer: Buffer | undefined, originalName?: string) => ({
        buffer,
        originalName,
    });

    describe('загрузка', () => {
        it('файл ложится по относительному пути, запись несёт формат, размеры и размер файла', async () => {
            const png = await makePng(120, 80);
            const image = await service.put(
                RQ,
                'stamp',
                upload(png, 'pechat.png'),
            );

            expect(image).toMatchObject({
                rqId: RQ,
                role: 'stamp',
                format: 'png',
                width: 120,
                height: 80,
                size: png.length,
                originalName: 'pechat.png',
            });
            expect(image.path).toBe(
                `konstructor/provider-images/${RQ}/${image.id}.png`,
            );
            expect(image.path).not.toContain(temp.root);
            expect(existsSync(temp.fullPath(image.path))).toBe(true);
            expect(repository.rows).toHaveLength(1);
        });

        it('JPEG получает расширение jpg', async () => {
            const image = await service.put(
                RQ,
                'logo',
                upload(await makeJpg()),
            );
            expect(image.format).toBe('jpg');
            expect(image.path.endsWith(`${image.id}.jpg`)).toBe(true);
        });

        it('у реквизитов по одной картинке каждой роли, у разных реквизитов — свои', async () => {
            await service.put(RQ, 'stamp', upload(await makePng()));
            await service.put(
                RQ,
                'signature_director',
                upload(await makePng()),
            );
            await service.put(OTHER_RQ, 'stamp', upload(await makePng()));

            expect((await service.list(RQ)).map(i => i.role).sort()).toEqual([
                'signature_director',
                'stamp',
            ]);
            expect(await service.list(OTHER_RQ)).toHaveLength(1);
        });
    });

    describe('замена', () => {
        it('новый файл записывается, прежний удаляется, запись одна', async () => {
            const first = await service.put(
                RQ,
                'stamp',
                upload(await makePng(40, 40)),
            );
            const second = await service.put(
                RQ,
                'stamp',
                upload(await makeJpg(60, 30)),
            );

            expect(second.id).not.toBe(first.id);
            expect(second.format).toBe('jpg');
            expect(existsSync(temp.fullPath(second.path))).toBe(true);
            expect(existsSync(temp.fullPath(first.path))).toBe(false);
            expect(repository.rows).toHaveLength(1);
            expect(repository.rows[0].path).toBe(second.path);
        });

        it('сбой записи в базу убирает новый файл и оставляет прежний', async () => {
            const first = await service.put(
                RQ,
                'stamp',
                upload(await makePng()),
            );
            repository.failNextUpsert = new Error('база недоступна');

            await expect(
                service.put(RQ, 'stamp', upload(await makeJpg())),
            ).rejects.toThrow('база недоступна');

            expect(existsSync(temp.fullPath(first.path))).toBe(true);
            expect(repository.rows[0].path).toBe(first.path);
            const dir = temp.fullPath(`konstructor/provider-images/${RQ}`);
            expect(readdirSync(dir)).toEqual([`${first.id}.png`]);
        });

        it('параллельные загрузки в одну роль идут по очереди: остаётся последний файл', async () => {
            const [a, b] = await Promise.all([
                makePng(10, 10),
                makePng(20, 20),
            ]);
            await Promise.all([
                service.put(RQ, 'stamp', upload(a)),
                service.put(RQ, 'stamp', upload(b)),
            ]);

            expect(repository.rows).toHaveLength(1);
            expect(repository.rows[0].width).toBe(20);
            const dir = temp.fullPath(`konstructor/provider-images/${RQ}`);
            expect(readdirSync(dir)).toHaveLength(1);
        });
    });

    describe('удаление', () => {
        it('убирает запись и файл', async () => {
            const image = await service.put(
                RQ,
                'logo',
                upload(await makePng()),
            );

            await service.remove(RQ, 'logo');

            expect(repository.rows).toHaveLength(0);
            expect(existsSync(temp.fullPath(image.path))).toBe(false);
        });

        it('проходит, когда файла на диске уже нет: запись всё равно удаляется', async () => {
            const image = await service.put(
                RQ,
                'logo',
                upload(await makePng()),
            );
            await temp.storage.remove(image.path);

            await expect(service.remove(RQ, 'logo')).resolves.toBeUndefined();
            expect(repository.rows).toHaveLength(0);
        });

        it('картинки нет — 404 с понятным текстом', async () => {
            await expect(service.remove(RQ, 'stamp')).rejects.toThrow(
                NotFoundException,
            );
            await expect(service.remove(RQ, 'stamp')).rejects.toThrow(
                PROVIDER_IMAGE_MESSAGES.imageNotFound(RQ, 'stamp'),
            );
        });

        it('сбой удаления файла не роняет операцию: в лог уходит строка', async () => {
            const image = await service.put(
                RQ,
                'logo',
                upload(await makePng()),
            );
            jest.spyOn(temp.storage, 'remove').mockRejectedValue(
                new Error('EACCES'),
            );
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);

            await expect(service.remove(RQ, 'logo')).resolves.toBeUndefined();

            expect(repository.rows).toHaveLength(0);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain(image.path);
        });
    });

    describe('проверка загрузки: 400 с текстом по-русски', () => {
        const rejects = async (
            role: string,
            buffer: Buffer | undefined,
            message: string,
        ) => {
            const attempt = service.put(RQ, role, upload(buffer));
            await expect(attempt).rejects.toThrow(BadRequestException);
            await expect(attempt).rejects.toThrow(message);
            expect(repository.rows).toHaveLength(0);
        };

        it('неизвестная роль', async () => {
            await rejects(
                'seal',
                await makePng(),
                PROVIDER_IMAGE_MESSAGES.unknownRole('seal'),
            );
            await expect(service.get(RQ, 'seal')).rejects.toThrow(
                BadRequestException,
            );
            await expect(service.remove(RQ, 'seal')).rejects.toThrow(
                BadRequestException,
            );
            await expect(service.readFile(RQ, 'seal')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('файл не передан или пуст', async () => {
            await rejects('stamp', undefined, PROVIDER_IMAGE_MESSAGES.noFile);
            await rejects(
                'stamp',
                Buffer.alloc(0),
                PROVIDER_IMAGE_MESSAGES.noFile,
            );
        });

        it('чужой формат: GIF и HTML под видом картинки', async () => {
            await rejects(
                'stamp',
                await makeGif(),
                PROVIDER_IMAGE_MESSAGES.unsupportedFormat,
            );
            await rejects(
                'stamp',
                fakeHtml(),
                PROVIDER_IMAGE_MESSAGES.unsupportedFormat,
            );
        });

        it('PNG без картинки внутри', async () => {
            await rejects(
                'stamp',
                brokenPng(),
                PROVIDER_IMAGE_MESSAGES.unreadable,
            );
        });

        it('файл больше 2 МБ', async () => {
            const png = await makePng();
            const huge = Buffer.concat([
                png,
                Buffer.alloc(PROVIDER_IMAGE_MAX_BYTES, 0),
            ]);
            await rejects('stamp', huge, PROVIDER_IMAGE_MESSAGES.tooLarge);
        });

        it('картинка больше потолка по стороне', async () => {
            const wide = await makePng(PROVIDER_IMAGE_MAX_SIDE + 1, 1);
            await rejects('stamp', wide, PROVIDER_IMAGE_MESSAGES.tooBig);
        });

        it('реквизиты указаны неверно', async () => {
            await expect(
                service.put(0, 'stamp', upload(await makePng())),
            ).rejects.toThrow(PROVIDER_IMAGE_MESSAGES.badRq);
            await expect(
                service.put(1.5, 'stamp', upload(await makePng())),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('реквизитов нет', () => {
        it('загрузка и список — 404', async () => {
            await expect(
                service.put(999, 'stamp', upload(await makePng())),
            ).rejects.toThrow(NotFoundException);
            await expect(service.list(999)).rejects.toThrow(
                PROVIDER_IMAGE_MESSAGES.rqNotFound(999),
            );
        });
    });

    describe('чтение файла для админки', () => {
        it('отдаёт запись и содержимое', async () => {
            const png = await makePng();
            await service.put(RQ, 'stamp', upload(png));

            const { image, content } = await service.readFile(RQ, 'stamp');
            expect(image.role).toBe('stamp');
            expect(content.equals(png)).toBe(true);
        });

        it('записи нет или файла нет на диске — 404', async () => {
            await expect(service.readFile(RQ, 'stamp')).rejects.toThrow(
                NotFoundException,
            );
            const image = await service.put(
                RQ,
                'stamp',
                upload(await makePng()),
            );
            await temp.storage.remove(image.path);
            await expect(service.readFile(RQ, 'stamp')).rejects.toThrow(
                PROVIDER_IMAGE_MESSAGES.fileMissing(RQ, 'stamp'),
            );
        });
    });

    describe('содержимое для печати в документе', () => {
        it('отдаёт байты запрошенных ролей; остальные роли не читает', async () => {
            const png = await makePng();
            await service.put(RQ, 'stamp', upload(png));
            await service.put(
                RQ,
                'signature_accountant',
                upload(await makeJpg()),
            );

            const contents = await service.loadContents(RQ, ['stamp', 'logo']);

            expect(contents).toHaveLength(1);
            expect(contents[0]).toMatchObject({ role: 'stamp', format: 'png' });
            expect(contents[0].data.equals(png)).toBe(true);
        });

        it('нет файла на диске — картинка пропускается, в лог уходит одна строка', async () => {
            const stamp = await service.put(
                RQ,
                'stamp',
                upload(await makePng()),
            );
            await service.put(RQ, 'logo', upload(await makeJpg()));
            await temp.storage.remove(stamp.path);
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);

            const contents = await service.loadContents(RQ, ['stamp', 'logo']);

            expect(contents.map(c => c.role)).toEqual(['logo']);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).not.toContain('\n');
        });

        it('ошибка чтения записей уходит вызывающему', async () => {
            jest.spyOn(repository, 'findByRq').mockRejectedValue(
                new Error('нет таблицы'),
            );
            await expect(service.loadContents(RQ, ['stamp'])).rejects.toThrow(
                'нет таблицы',
            );
        });
    });
});
