import { existsSync, readdirSync } from 'fs';
import sharp from 'sharp';
import {
    createTempStorage,
    type TempStorage,
} from '../../../media/__tests__/support/media-fixtures';
import { SiteMediaService } from '../../../media/site-media.service';
import { SITE_MEDIA_LIBRARY_DIR } from '../../domain/site-media-library.const';
import { SiteMediaLibraryDisk } from '../../site-media-library.disk';
import { SiteMediaLibraryFilesService } from '../../site-media-library-files.service';
import { SiteMediaLibraryService } from '../../site-media-library.service';
import { InMemoryMediaLibraryRepository } from './in-memory-media-library.repository';

/** Настоящая картинка: sharp должен прочитать её размеры. */
export const realImage = (
    width: number,
    height: number,
    format: 'png' | 'jpeg' | 'webp' = 'png',
    background = '#3366ff',
): Promise<Buffer> =>
    sharp({ create: { width, height, channels: 3, background } })
        .toFormat(format)
        .toBuffer();

/**
 * Медиатека на настоящем диске (временный storage) и строках в памяти:
 * SiteMediaService пишет файлы как в проде, база подменена.
 */
export interface LibraryHarness {
    temp: TempStorage;
    media: SiteMediaService;
    disk: SiteMediaLibraryDisk;
    repository: InMemoryMediaLibraryRepository;
    library: SiteMediaLibraryService;
    files: SiteMediaLibraryFilesService;
    /** Файлы раздела library на диске, по алфавиту. */
    filesOnDisk: () => string[];
}

export const createLibraryHarness = (): LibraryHarness => {
    const temp = createTempStorage();
    const media = new SiteMediaService(temp.storage);
    const disk = new SiteMediaLibraryDisk(media);
    const repository = new InMemoryMediaLibraryRepository();
    const library = new SiteMediaLibraryService(repository, disk);
    const files = new SiteMediaLibraryFilesService(library, repository, disk);
    const filesOnDisk = (): string[] => {
        const dir = temp.storage.sectionDir(SITE_MEDIA_LIBRARY_DIR);
        return existsSync(dir) ? readdirSync(dir).sort() : [];
    };
    return { temp, media, disk, repository, library, files, filesOnDisk };
};
