import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InMemoryMediaLibraryRepository } from '../../../library/__tests__/support/in-memory-media-library.repository';
import { SiteContentTablesMissingException } from '../../../shared/site-content-prisma.errors';
import type { SiteArticleSection } from '../../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../../domain/site-article.messages';
import {
    articleState,
    type SiteArticleCreateInput,
    type SiteArticleListFilter,
    type SiteArticleMediaLink,
    type SiteArticleMediaLinkInput,
    type SiteArticlePropsPatch,
    type SiteArticlePublishedSummary,
    type SiteArticleRecord,
    type SiteArticleRevisionInput,
    type SiteArticleRevisionRecord,
    type SiteArticleRevisionSummary,
    type SiteArticleTransition,
} from '../../domain/site-article.types';
import { SiteArticleMediaLinkRepository } from '../../repositories/site-article-media-link.repository';
import { SiteArticleRepository } from '../../repositories/site-article.repository';
import { SiteArticleRevisionRepository } from '../../repositories/site-article-revision.repository';

type StoredArticle = Omit<SiteArticleRecord, 'state' | 'title'>;
type StoredLink = Omit<SiteArticleMediaLink, 'media'>;

const reject = (error: Error) => Promise.reject(error);
const notFound = () => new NotFoundException(SITE_ARTICLE_MESSAGES.notFound);

/**
 * Статьи, версии и связи в памяти — общая «база» трёх хранилищ для тестов
 * сервисов и ручек. Семантика ошибок — как у Prisma-реализаций; `tablesMissing`
 * изображает непримененную миграцию (P2021).
 */
export class InMemoryArticleStore {
    readonly articles = new Map<string, StoredArticle>();
    readonly revisions: SiteArticleRevisionRecord[] = [];
    readonly links: StoredLink[] = [];
    tablesMissing = false;

    constructor(readonly media = new InMemoryMediaLibraryRepository()) {
        media.usageSource = id =>
            this.links
                .filter(link => link.mediaId === id)
                .map(link => {
                    const article = this.articles.get(link.articleId);
                    return {
                        articleId: link.articleId,
                        section: article?.section ?? '',
                        slug: article?.slug ?? '',
                        title: this.record(link.articleId)?.title ?? null,
                        role: link.role,
                        slot: link.slot,
                    };
                });
    }

    guard(): void {
        if (this.tablesMissing) throw new SiteContentTablesMissingException();
    }

    record(id: string): SiteArticleRecord | null {
        const article = this.articles.get(id);
        if (!article) return null;
        const own = this.revisions.filter(
            revision => revision.articleId === id,
        );
        const latest = own.reduce<SiteArticleRevisionRecord | null>(
            (best, revision) =>
                !best || revision.number > best.number ? revision : best,
            null,
        );
        const published = own.find(
            revision => revision.id === article.publishedRevisionId,
        );
        return {
            ...article,
            state: articleState(latest?.number ?? 0, published?.number ?? null),
            title: latest?.title ?? null,
        };
    }

    linkWithMedia(link: StoredLink): SiteArticleMediaLink {
        const media = this.media.rows.get(link.mediaId);
        if (!media) throw new Error(`нет медиа ${link.mediaId}`);
        return { ...link, media: { ...media, usageCount: 0 } };
    }
}

export class InMemoryArticleRepository extends SiteArticleRepository {
    constructor(private readonly store: InMemoryArticleStore) {
        super();
    }

    list(filter: SiteArticleListFilter): Promise<SiteArticleRecord[]> {
        this.store.guard();
        return Promise.resolve(
            [...this.store.articles.keys()]
                .map(id => this.store.record(id) as SiteArticleRecord)
                .filter(
                    article =>
                        (!filter.section ||
                            article.section === filter.section) &&
                        (!filter.type || article.type === filter.type) &&
                        (!filter.status || article.status === filter.status),
                ),
        );
    }

    findById(id: string): Promise<SiteArticleRecord | null> {
        this.store.guard();
        return Promise.resolve(this.store.record(id));
    }

    findBySlug(
        section: SiteArticleSection,
        slug: string,
    ): Promise<SiteArticleRecord | null> {
        this.store.guard();
        const found = [...this.store.articles.values()].find(
            article => article.section === section && article.slug === slug,
        );
        return Promise.resolve(found ? this.store.record(found.id) : null);
    }

    create(input: SiteArticleCreateInput): Promise<SiteArticleRecord> {
        this.store.guard();
        if (
            [...this.store.articles.values()].some(
                a => a.section === input.section && a.slug === input.slug,
            )
        ) {
            return reject(
                new ConflictException(SITE_ARTICLE_MESSAGES.slugTaken),
            );
        }
        const now = new Date();
        this.store.articles.set(input.id, {
            ...input,
            status: 'draft',
            publishedRevisionId: null,
            publishedAt: null,
            publishedBy: null,
            updatedBy: input.createdBy,
            createdAt: now,
            updatedAt: now,
        });
        return Promise.resolve(
            this.store.record(input.id) as SiteArticleRecord,
        );
    }

    updateProps(
        id: string,
        patch: SiteArticlePropsPatch,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        this.store.guard();
        const current = this.store.articles.get(id);
        if (!current) return reject(notFound());
        const taken = [...this.store.articles.values()].some(
            a =>
                a.id !== id &&
                a.section === current.section &&
                a.slug === patch.slug,
        );
        if (taken)
            return reject(
                new ConflictException(SITE_ARTICLE_MESSAGES.slugTaken),
            );
        const defined = Object.fromEntries(
            Object.entries(patch).filter(([, v]) => v !== undefined),
        );
        this.store.articles.set(id, {
            ...current,
            ...defined,
            updatedBy: by,
            updatedAt: new Date(),
        });
        return Promise.resolve(this.store.record(id) as SiteArticleRecord);
    }

    transition(
        id: string,
        transition: SiteArticleTransition,
    ): Promise<SiteArticleRecord> {
        this.store.guard();
        const current = this.store.articles.get(id);
        if (!current) return reject(notFound());
        if (!transition.from.includes(current.status)) {
            return reject(
                new ConflictException(SITE_ARTICLE_MESSAGES.stateChanged),
            );
        }
        const now = new Date();
        this.store.articles.set(id, {
            ...current,
            status: transition.status,
            updatedBy: transition.by,
            updatedAt: now,
            ...(transition.publishRevisionId
                ? {
                      publishedRevisionId: transition.publishRevisionId,
                      publishedAt: now,
                      publishedBy: transition.by,
                  }
                : {}),
        });
        return Promise.resolve(this.store.record(id) as SiteArticleRecord);
    }

    remove(id: string): Promise<void> {
        this.store.guard();
        this.store.articles.delete(id);
        const keep = <T extends { articleId: string }>(list: T[]) =>
            list.splice(
                0,
                list.length,
                ...list.filter(item => item.articleId !== id),
            );
        keep(this.store.revisions);
        keep(this.store.links);
        return Promise.resolve();
    }

    listPublished(
        section: SiteArticleSection,
    ): Promise<SiteArticlePublishedSummary[]> {
        this.store.guard();
        const result = [...this.store.articles.values()]
            .filter(
                a =>
                    a.section === section &&
                    a.status === 'published' &&
                    a.publishedRevisionId,
            )
            .sort((a, b) => a.sort - b.sort)
            .map(a => {
                const revision = this.store.revisions.find(
                    r => r.id === a.publishedRevisionId,
                ) as SiteArticleRevisionRecord;
                return {
                    article: this.store.record(a.id) as SiteArticleRecord,
                    revision,
                };
            });
        return Promise.resolve(result);
    }
}

export class InMemoryRevisionRepository extends SiteArticleRevisionRepository {
    constructor(private readonly store: InMemoryArticleStore) {
        super();
    }

    append(
        articleId: string,
        expectedNumber: number,
        input: SiteArticleRevisionInput,
    ): Promise<SiteArticleRevisionRecord> {
        this.store.guard();
        const article = this.store.record(articleId);
        if (!article) return reject(notFound());
        if (article.state.latestNumber !== expectedNumber) {
            return reject(
                new ConflictException(SITE_ARTICLE_MESSAGES.versionConflict),
            );
        }
        const revision = {
            ...input,
            id: randomUUID(),
            articleId,
            number: expectedNumber + 1,
            createdAt: new Date(),
        };
        this.store.revisions.push(revision);
        return Promise.resolve(revision);
    }

    list(articleId: string): Promise<SiteArticleRevisionSummary[]> {
        this.store.guard();
        return Promise.resolve(
            this.store.revisions
                .filter(revision => revision.articleId === articleId)
                .sort((a, b) => b.number - a.number),
        );
    }

    get(
        articleId: string,
        revisionId: string,
    ): Promise<SiteArticleRevisionRecord | null> {
        this.store.guard();
        return Promise.resolve(
            this.store.revisions.find(
                r => r.id === revisionId && r.articleId === articleId,
            ) ?? null,
        );
    }

    latest(articleId: string): Promise<SiteArticleRevisionRecord | null> {
        this.store.guard();
        const own = this.store.revisions.filter(r => r.articleId === articleId);
        return Promise.resolve(
            own.sort((a, b) => b.number - a.number)[0] ?? null,
        );
    }
}

export class InMemoryMediaLinkRepository extends SiteArticleMediaLinkRepository {
    constructor(private readonly store: InMemoryArticleStore) {
        super();
    }

    listByArticle(articleId: string): Promise<SiteArticleMediaLink[]> {
        this.store.guard();
        return Promise.resolve(
            this.store.links
                .filter(link => link.articleId === articleId)
                .sort((a, b) => a.sort - b.sort)
                .map(link => this.store.linkWithMedia(link)),
        );
    }

    coversOf(articleIds: string[]): Promise<SiteArticleMediaLink[]> {
        this.store.guard();
        return Promise.resolve(
            this.store.links
                .filter(
                    link =>
                        link.role === 'cover' &&
                        articleIds.includes(link.articleId),
                )
                .map(link => this.store.linkWithMedia(link)),
        );
    }

    putSlot(input: SiteArticleMediaLinkInput): Promise<SiteArticleMediaLink> {
        return this.upsert(
            input,
            link => link.role === input.role && link.slot === input.slot,
        );
    }

    putGallery(
        input: SiteArticleMediaLinkInput,
    ): Promise<SiteArticleMediaLink> {
        return this.upsert(
            input,
            link => link.role === 'gallery' && link.mediaId === input.mediaId,
        );
    }

    remove(articleId: string, linkId: string): Promise<void> {
        this.store.guard();
        const index = this.store.links.findIndex(
            l => l.id === linkId && l.articleId === articleId,
        );
        if (index < 0)
            return reject(
                new NotFoundException(SITE_ARTICLE_MESSAGES.linkNotFound),
            );
        this.store.links.splice(index, 1);
        return Promise.resolve();
    }

    reorderGallery(
        articleId: string,
        linkIds: string[],
    ): Promise<SiteArticleMediaLink[]> {
        this.store.guard();
        const gallery = this.store.links.filter(
            l => l.articleId === articleId && l.role === 'gallery',
        );
        const same =
            new Set(linkIds).size === linkIds.length &&
            linkIds.length === gallery.length &&
            gallery.every(link => linkIds.includes(link.id));
        if (!same)
            return reject(
                new ConflictException(SITE_ARTICLE_MESSAGES.galleryChanged),
            );
        gallery.forEach(link => {
            link.sort = (linkIds.indexOf(link.id) + 1) * 10;
        });
        return this.listByArticle(articleId).then(links =>
            links.filter(l => l.role === 'gallery'),
        );
    }

    private upsert(
        input: SiteArticleMediaLinkInput,
        same: (link: StoredLink) => boolean,
    ): Promise<SiteArticleMediaLink> {
        this.store.guard();
        if (!this.store.media.rows.has(input.mediaId)) {
            return reject(
                new NotFoundException(SITE_ARTICLE_MESSAGES.mediaNotFound),
            );
        }
        const now = new Date();
        const existing = this.store.links.find(
            link => link.articleId === input.articleId && same(link),
        );
        if (existing) {
            Object.assign(existing, {
                mediaId: input.mediaId,
                caption: input.caption,
                sort: input.sort ?? existing.sort,
                updatedAt: now,
            });
            return Promise.resolve(this.store.linkWithMedia(existing));
        }
        const gallerySorts = this.store.links
            .filter(
                l => l.articleId === input.articleId && l.role === 'gallery',
            )
            .map(l => l.sort);
        const link: StoredLink = {
            ...input,
            id: randomUUID(),
            sort:
                input.sort ??
                (input.role === 'gallery'
                    ? Math.max(0, ...gallerySorts) + 10
                    : 500),
            createdAt: now,
            updatedAt: now,
        };
        this.store.links.push(link);
        return Promise.resolve(this.store.linkWithMedia(link));
    }
}
