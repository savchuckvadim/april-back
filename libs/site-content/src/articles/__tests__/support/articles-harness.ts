import { randomUUID } from 'node:crypto';
import type { SiteMediaRecord } from '../../../library/domain/site-media-library.types';
import { SiteMediaLibraryDisk } from '../../../library/site-media-library.disk';
import { SiteMediaLibraryService } from '../../../library/site-media-library.service';
import { SiteArticleDraftsService } from '../../services/site-article-drafts.service';
import { SiteArticleMediaService } from '../../services/site-article-media.service';
import { SiteArticlePublishingService } from '../../services/site-article-publishing.service';
import { SiteArticlesReaderService } from '../../services/site-articles-reader.service';
import { SiteArticlesService } from '../../services/site-articles.service';
import {
    InMemoryArticleRepository,
    InMemoryArticleStore,
    InMemoryMediaLinkRepository,
    InMemoryRevisionRepository,
} from './in-memory-articles';

/** Сервисы статей поверх «базы» в памяти; диск медиатеки статьям не нужен. */
export interface ArticlesHarness {
    store: InMemoryArticleStore;
    articleRepo: InMemoryArticleRepository;
    revisionRepo: InMemoryRevisionRepository;
    linkRepo: InMemoryMediaLinkRepository;
    articles: SiteArticlesService;
    drafts: SiteArticleDraftsService;
    publishing: SiteArticlePublishingService;
    media: SiteArticleMediaService;
    reader: SiteArticlesReaderService;
    /** Строка медиатеки без файлов на диске. */
    addMedia: (over?: Partial<SiteMediaRecord>) => SiteMediaRecord;
}

export const createArticlesHarness = (): ArticlesHarness => {
    const store = new InMemoryArticleStore();
    const articleRepo = new InMemoryArticleRepository(store);
    const revisionRepo = new InMemoryRevisionRepository(store);
    const linkRepo = new InMemoryMediaLinkRepository(store);
    const library = new SiteMediaLibraryService(
        store.media,
        {} as SiteMediaLibraryDisk,
    );
    const articles = new SiteArticlesService(articleRepo);
    const addMedia = (over: Partial<SiteMediaRecord> = {}): SiteMediaRecord => {
        const id = over.id ?? randomUUID();
        const record: SiteMediaRecord = {
            id,
            kind: 'image',
            title: null,
            caption: 'Подпись медиа',
            alt: 'alt',
            fileName: `${id}.0123456789ab.png`,
            darkFileName: null,
            posterFileName: null,
            mime: 'image/png',
            sizeBytes: 100,
            width: 40,
            height: 30,
            durationSec: null,
            embedProvider: null,
            embedUrl: null,
            embedId: null,
            uploadedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            ...over,
        };
        store.media.rows.set(id, record);
        return record;
    };
    return {
        store,
        articleRepo,
        revisionRepo,
        linkRepo,
        articles,
        drafts: new SiteArticleDraftsService(articles, revisionRepo),
        publishing: new SiteArticlePublishingService(
            articles,
            articleRepo,
            revisionRepo,
        ),
        media: new SiteArticleMediaService(articles, linkRepo, library),
        reader: new SiteArticlesReaderService(
            articleRepo,
            revisionRepo,
            linkRepo,
        ),
        addMedia,
    };
};

/** Простейший текст theory-v1. */
export const LEAD_BLOCKS = [{ kind: 'lead', text: 'Подводка' }];
