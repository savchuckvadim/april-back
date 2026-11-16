import { Injectable, NotFoundException } from '@nestjs/common';
import { pdfFirstPage } from '@app/konstructor/document-generate/lib/pdf-first-page.util';
import { OfferPdfAssetStore } from '../lib/offer-pdf-asset-store';
import { sampleOfferPdfModel } from '../lib/sample-offer-pdf-model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { findPalette } from '../templates/kit/theme/offer-pdf-palette';
import { findOfferPdfTemplate } from '../templates/offer-pdf-template.registry';
import { OfferPdfRenderService } from './offer-pdf-render.service';

export interface OfferPdfStylePreview {
    /** PDF из одной страницы */
    buffer: Buffer;
    /** Все картинки и логотипы стиля на месте; нет — превью собрано без них */
    complete: boolean;
}

/** Собранное превью и подпись файлов стиля, при которой оно собрано */
interface CachedPreview {
    version: string;
    pending: Promise<OfferPdfStylePreview>;
}

/**
 * Превью стиля для выбора: первая страница (титульник или первый лист)
 * на образце «Гарант-Офис». Стили живут в коде и меняются только выкладкой,
 * поэтому превью держится в памяти процесса; параллельные запросы одного
 * стиля ждут один рендер.
 *
 * Картинки и логотипы стиля владелец заносит на сервер руками, поэтому
 * превью привязано к подписи этих файлов: занесли или заменили файл —
 * собирается заново, без перезапуска.
 *
 * Собираются превью по одному: витрина просит все стили разом, а каждый —
 * полный рендер документа. Очередь не даёт им занять процесс целиком и
 * задержать генерацию КП.
 */
@Injectable()
export class OfferPdfStylePreviewService {
    /** Ключ — «стиль:гамма»; неизвестная гамма приводится к первой */
    private readonly cache = new Map<string, CachedPreview>();
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly renderService: OfferPdfRenderService,
        private readonly assetStore: OfferPdfAssetStore,
    ) {}

    async preview(
        code: OfferPdfTemplateCode,
        palette?: string | null,
    ): Promise<OfferPdfStylePreview> {
        const template = findOfferPdfTemplate(code);
        if (!template) {
            throw new NotFoundException(`PDF-стиль КП «${code}» не найден`);
        }
        const paletteCode =
            findPalette(template.palettes ?? [], palette)?.code ?? null;
        const key = `${code}:${paletteCode ?? ''}`;
        const { version } = await this.assetStore.load({
            images: template.assets,
            logos: template.logos,
        });

        const cached = this.cache.get(key);
        if (cached?.version === version) return cached.pending;

        const entry: CachedPreview = {
            version,
            pending: this.enqueue(() => this.build(code, paletteCode)),
        };
        this.cache.set(key, entry);
        // упавший рендер не запоминаем: следующий запрос попробует снова
        entry.pending.catch(() => {
            if (this.cache.get(key) === entry) this.cache.delete(key);
        });
        return entry.pending;
    }

    /** Следующая сборка стартует, когда закончилась предыдущая — удачно или нет */
    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async build(
        code: OfferPdfTemplateCode,
        palette: string | null,
    ): Promise<OfferPdfStylePreview> {
        const rendered = await this.renderService.render(
            sampleOfferPdfModel(code, palette),
        );
        return {
            buffer: await pdfFirstPage(rendered.buffer),
            complete: rendered.missingAssets.length === 0,
        };
    }
}
