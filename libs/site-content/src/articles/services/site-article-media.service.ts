import { BadRequestException, Injectable } from '@nestjs/common';
import { SiteMediaLibraryService } from '../../library/site-media-library.service';
import { cleanTextOrNull } from '../../shared/clean-text';
import {
    SITE_ARTICLE_COVER_SLOT,
    SITE_ARTICLE_SLOT_MAX_LENGTH,
    SITE_ARTICLE_SLOT_PATTERN,
    type SiteArticleMediaRole,
} from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type {
    SiteArticleMediaLink,
    SiteArticleMediaLinkInput,
} from '../domain/site-article.types';
import { SiteArticleMediaLinkRepository } from '../repositories/site-article-media-link.repository';
import { SiteArticlesService } from './site-articles.service';

export interface SiteArticleMediaPutCommand {
    role: SiteArticleMediaRole;
    /** Место в тексте (id блока) — только у inline. */
    slot?: string | null;
    mediaId: string;
    caption?: string | null;
    sort?: number;
}

const badRequest = (message: string): never => {
    throw new BadRequestException(message);
};

/** Место связи по роли: обложка — постоянное, место в тексте — id блока, галерея — без места. */
function slotFor(command: SiteArticleMediaPutCommand): string | null {
    if (command.role === 'cover') return SITE_ARTICLE_COVER_SLOT;
    if (command.role === 'gallery') return null;
    const slot = command.slot?.trim() ?? '';
    if (
        slot.length === 0 ||
        slot.length > SITE_ARTICLE_SLOT_MAX_LENGTH ||
        !SITE_ARTICLE_SLOT_PATTERN.test(slot)
    ) {
        badRequest(SITE_ARTICLE_MESSAGES.slotRequired);
    }
    return slot;
}

/**
 * Медиа в статье: обложка, место в тексте (id блока-скрина или блока
 * media), галерея с порядком. Связь не версионируется — на сайте видна
 * через минуту, без публикации текста.
 *
 * Вид медиа проверяется там, где бэк его знает: обложка — только картинка.
 * Какой блок стоит на месте (скрин или ролик), бэк не видит — у глав из
 * кода текста в базе нет; это сверяет админка по договорённостям сайта.
 */
@Injectable()
export class SiteArticleMediaService {
    constructor(
        private readonly articles: SiteArticlesService,
        private readonly links: SiteArticleMediaLinkRepository,
        private readonly library: SiteMediaLibraryService,
    ) {}

    async list(articleId: string): Promise<SiteArticleMediaLink[]> {
        await this.articles.get(articleId);
        return this.links.listByArticle(articleId);
    }

    async put(
        articleId: string,
        command: SiteArticleMediaPutCommand,
        by: string | null,
    ): Promise<SiteArticleMediaLink> {
        await this.articles.get(articleId);
        const slot = slotFor(command);
        const media = await this.library.get(command.mediaId);
        if (command.role === 'cover' && media.kind !== 'image') {
            badRequest(SITE_ARTICLE_MESSAGES.coverNotImage);
        }
        const input: SiteArticleMediaLinkInput = {
            articleId,
            mediaId: media.id,
            role: command.role,
            slot,
            sort: command.sort ?? null,
            caption: cleanTextOrNull(command.caption),
            createdBy: by,
        };
        return command.role === 'gallery'
            ? this.links.putGallery(input)
            : this.links.putSlot(input);
    }

    async remove(articleId: string, linkId: string): Promise<void> {
        await this.articles.get(articleId);
        await this.links.remove(articleId, linkId);
    }

    async reorderGallery(
        articleId: string,
        linkIds: string[],
    ): Promise<SiteArticleMediaLink[]> {
        await this.articles.get(articleId);
        return this.links.reorderGallery(articleId, linkIds);
    }
}
