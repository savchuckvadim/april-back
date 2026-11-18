import { ConflictException, NotFoundException } from '@nestjs/common';
import { SITE_MEDIA_LIBRARY_MESSAGES } from '../../domain/site-media-library.messages';
import type {
    SiteMediaCreateInput,
    SiteMediaListFilter,
    SiteMediaListPage,
    SiteMediaPatch,
    SiteMediaRecord,
    SiteMediaUsage,
} from '../../domain/site-media-library.types';
import { SiteMediaLibraryRepository } from '../../site-media-library.repository';

/** Только заданные поля правки — как Prisma пропускает undefined. */
const definedOnly = (patch: SiteMediaPatch): SiteMediaPatch =>
    Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as SiteMediaPatch;

/**
 * Медиатека в памяти для тестов сервисов и ручек: без базы, с той же
 * семантикой ошибок, что у Prisma-реализации. Где стоит медиа — задаёт
 * тест (`usages`) или хранилище связей статей (`usageSource`).
 */
export class InMemoryMediaLibraryRepository extends SiteMediaLibraryRepository {
    readonly rows = new Map<string, SiteMediaRecord>();
    readonly usages = new Map<string, SiteMediaUsage[]>();
    usageSource: ((id: string) => SiteMediaUsage[]) | null = null;
    /** Следующая вставка падает этой ошибкой (проверка отката файлов). */
    failNextCreate: Error | null = null;
    private clock = Date.parse('2026-11-18T10:00:00.000Z');

    create(input: SiteMediaCreateInput): Promise<SiteMediaRecord> {
        if (this.failNextCreate) {
            const error = this.failNextCreate;
            this.failNextCreate = null;
            return Promise.reject(error);
        }
        const now = this.tick();
        const record = {
            ...input,
            createdAt: now,
            updatedAt: now,
            usageCount: 0,
        };
        this.rows.set(input.id, record);
        return Promise.resolve(this.withCount(record));
    }

    update(id: string, patch: SiteMediaPatch): Promise<SiteMediaRecord> {
        const current = this.rows.get(id);
        if (!current) {
            return Promise.reject(
                new NotFoundException(SITE_MEDIA_LIBRARY_MESSAGES.notFound),
            );
        }
        const next = {
            ...current,
            ...definedOnly(patch),
            updatedAt: this.tick(),
        };
        this.rows.set(id, next);
        return Promise.resolve(this.withCount(next));
    }

    findById(id: string): Promise<SiteMediaRecord | null> {
        const record = this.rows.get(id);
        return Promise.resolve(record ? this.withCount(record) : null);
    }

    list(filter: SiteMediaListFilter): Promise<SiteMediaListPage> {
        const search = filter.search?.trim().toLowerCase();
        const matched = [...this.rows.values()]
            .map(record => this.withCount(record))
            .filter(record => !filter.kind || record.kind === filter.kind)
            .filter(record => !filter.unused || record.usageCount === 0)
            .filter(
                record =>
                    !search ||
                    [record.title, record.caption, record.alt].some(text =>
                        text?.toLowerCase().includes(search),
                    ),
            )
            .sort(
                (a, b) =>
                    (b.createdAt?.getTime() ?? 0) -
                    (a.createdAt?.getTime() ?? 0),
            );
        const start = (filter.page - 1) * filter.pageSize;
        return Promise.resolve({
            items: matched.slice(start, start + filter.pageSize),
            total: matched.length,
            page: filter.page,
            pageSize: filter.pageSize,
        });
    }

    usage(id: string): Promise<SiteMediaUsage[]> {
        return Promise.resolve(this.usageOf(id));
    }

    remove(id: string): Promise<void> {
        if (!this.rows.has(id)) {
            return Promise.reject(
                new NotFoundException(SITE_MEDIA_LIBRARY_MESSAGES.notFound),
            );
        }
        if (this.usageOf(id).length > 0) {
            return Promise.reject(
                new ConflictException(SITE_MEDIA_LIBRARY_MESSAGES.inUseRace),
            );
        }
        this.rows.delete(id);
        return Promise.resolve();
    }

    private usageOf(id: string): SiteMediaUsage[] {
        return this.usageSource?.(id) ?? this.usages.get(id) ?? [];
    }

    private withCount(record: SiteMediaRecord): SiteMediaRecord {
        return { ...record, usageCount: this.usageOf(record.id).length };
    }

    /** Время идёт вперёд на секунду при каждой записи — порядок «свежие первыми» устойчив. */
    private tick(): Date {
        this.clock += 1000;
        return new Date(this.clock);
    }
}
