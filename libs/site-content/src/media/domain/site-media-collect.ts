import { SITE_MEDIA_FORMATS } from './media-format';
import { parseMediaFileName } from './media-file-name';
import type {
    SiteMediaItem,
    SiteMediaKind,
    SiteMediaStoredFile,
} from './site-media.types';

interface Candidate {
    file: SiteMediaStoredFile;
    slot: string;
    kind: SiteMediaKind;
}

/** Свежее — по времени изменения, при равенстве — по имени (порядок без случайностей). */
const isNewer = (a: SiteMediaStoredFile, b: SiteMediaStoredFile): boolean =>
    a.modifiedAt.getTime() !== b.modifiedAt.getTime()
        ? a.modifiedAt.getTime() > b.modifiedAt.getTime()
        : a.name > b.name;

const keepNewest = (
    target: Map<string, Candidate>,
    candidate: Candidate,
): void => {
    const current = target.get(candidate.slot);
    if (!current || isNewer(candidate.file, current.file)) {
        target.set(candidate.slot, candidate);
    }
};

/**
 * Файлы каталога раздела → что стоит на каждом месте кадра.
 *
 * Чужие имена (временные файлы недописанной загрузки, ручные копии)
 * пропускаются. Если у места почему-то два кадра, берётся свежий. Постер
 * бывает только у видео: у картинки он игнорируется.
 */
export function collectSiteMedia(
    files: readonly SiteMediaStoredFile[],
): SiteMediaItem[] {
    const mains = new Map<string, Candidate>();
    const posters = new Map<string, Candidate>();

    for (const file of files) {
        const parsed = parseMediaFileName(file.name);
        if (!parsed) continue;
        keepNewest(parsed.role === 'poster' ? posters : mains, {
            file,
            slot: parsed.slot,
            kind: SITE_MEDIA_FORMATS[parsed.extension].kind,
        });
    }

    return [...mains.values()]
        .sort((a, b) => a.slot.localeCompare(b.slot))
        .map(({ file, slot, kind }): SiteMediaItem => {
            const poster =
                kind === 'video' ? posters.get(slot)?.file.name : undefined;
            return {
                slot,
                kind,
                file: file.name,
                size: file.size,
                updatedAt: file.modifiedAt,
                ...(poster ? { poster } : {}),
            };
        });
}
