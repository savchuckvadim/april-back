import { Injectable } from '@nestjs/common';
import {
    DocumentTemplateKind,
    TemplateAmbiguityReport,
} from './document-template.criteria';
import { DocumentTemplateRepository } from './document-template.repository';
import {
    findAmbiguousBuckets,
    findKindsRelyingOnCommon,
} from './lib/ambiguity.util';

/**
 * Диагностика справочника шаблонов: где настройка противоречит себе.
 *
 * Отдельный сервис, а не метод `DocumentTemplateService`: тот отвечает на
 * вопрос «какой шаблон взять ПРЯМО СЕЙЧАС под эти признаки» и лежит на
 * горячем пути генерации документа. Диагностика — обратная задача: обход
 * справочника целиком без привязки к запросу, для админки. Одна
 * ответственность на сервис (CLAUDE.md), плюс её можно звать без
 * `PortalStoreService`, который здесь не нужен.
 *
 * Только чтение: ничего не правит и не предлагает «починить автоматом» —
 * какую из двух строк «по умолчанию» снять, решает администратор.
 */
@Injectable()
export class DocumentTemplateDiagnosticsService {
    constructor(private readonly repository: DocumentTemplateRepository) {}

    /**
     * Ящики с несколькими «по умолчанию» + опора портала на общие строки.
     *
     * `portalId = null` — проверяется справочник целиком. Тогда
     * `reliesOnCommon` пуст: «какие виды портал берёт с общих» — вопрос
     * про КОНКРЕТНЫЙ портал, по всем сразу он не имеет смысла, а пустой
     * массив честнее, чем список, который клиент истолкует как «ни один
     * портал ничего своего не имеет».
     */
    async findAmbiguities(
        portalId: bigint | null,
    ): Promise<TemplateAmbiguityReport> {
        const rows = await this.repository.findDefaultRows(portalId);
        const ambiguous = findAmbiguousBuckets(rows);

        const reliesOnCommon =
            portalId === null ? [] : await this.findReliesOnCommon(portalId);

        return {
            portalId: portalId === null ? null : String(portalId),
            ambiguous,
            reliesOnCommon,
        };
    }

    private async findReliesOnCommon(
        portalId: bigint,
    ): Promise<DocumentTemplateKind[]> {
        const own = await this.repository.findKindsWithOwnRows(portalId);
        return findKindsRelyingOnCommon(own);
    }
}
