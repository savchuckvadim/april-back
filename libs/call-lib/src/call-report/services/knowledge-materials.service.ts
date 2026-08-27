import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeContentService } from '@lib/ai-rag';

/** Запрос материалов одного вида с личным бюджетом символов. */
export interface KnowledgeMaterialRequest {
    kind: string;
    /** Сколько символов этого вида готовы отдать промпту. */
    budgetChars: number;
}

/** Собранный блок материалов одного вида. */
export interface KnowledgeMaterialBlock {
    kind: string;
    text: string;
    chars: number;
    /** Материалы не поместились в бюджет и были обрезаны. */
    truncated: boolean;
}

/**
 * Сбор материалов базы знаний по ролям (Фаза 2 плана
 * ai/tasks/rag-driven-analysis-plan.md).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СЕРВИС: раньше каждый потребитель читал базу сам,
 * склеивал всё в одну строку и резал общим лимитом — в итоге вид с
 * важной нормой мог полностью вытесниться объёмным документом другого
 * вида. Здесь у каждого вида СВОЙ бюджет, и вытеснить друг друга они не
 * могут; кто и куда подмешивает блоки — решает вызывающий.
 *
 * Сбой одного вида (битый файл, недоступная папка) не мешает остальным:
 * блок приходит пустым, в лог уходит предупреждение.
 */
@Injectable()
export class KnowledgeMaterialsService {
    private readonly logger = new Logger(KnowledgeMaterialsService.name);

    constructor(private readonly knowledgeContent: KnowledgeContentService) {}

    /**
     * @param domain портал (материалы портала переопределяют общие)
     * @param requests виды и их бюджеты
     */
    async collect(
        domain: string,
        requests: KnowledgeMaterialRequest[],
    ): Promise<KnowledgeMaterialBlock[]> {
        const blocks: KnowledgeMaterialBlock[] = [];
        for (const request of requests) {
            blocks.push(await this.collectOne(domain, request));
        }
        // Телеметрия обязательна: без неё «вид молча исчез» замечают
        // только по деградации оценок через недели.
        const report = blocks
            .map(block =>
                block.chars
                    ? `${block.kind} ${block.chars}/${this.budgetOf(requests, block.kind)}` +
                      (block.truncated ? ' (усечён)' : '')
                    : `${block.kind} —`,
            )
            .join(', ');
        this.logger.log(`Материалы базы знаний (${domain}): ${report}`);
        return blocks;
    }

    /** Тексты одного вида, склеенные и ужатые под его бюджет. */
    private async collectOne(
        domain: string,
        request: KnowledgeMaterialRequest,
    ): Promise<KnowledgeMaterialBlock> {
        const empty: KnowledgeMaterialBlock = {
            kind: request.kind,
            text: '',
            chars: 0,
            truncated: false,
        };
        try {
            const documents = await this.knowledgeContent.readAll(
                domain,
                request.kind,
            );
            const texts = documents
                // Хранилище подмешивает general к любому виду — берём
                // строго запрошенный вид, иначе бюджеты видов «поплывут».
                .filter(doc => doc.kind === request.kind)
                .map(doc => doc.text.trim())
                .filter(Boolean);
            if (!texts.length) return empty;

            const joined = texts.join('\n\n---\n\n');
            if (joined.length <= request.budgetChars) {
                return {
                    kind: request.kind,
                    text: joined,
                    chars: joined.length,
                    truncated: false,
                };
            }
            const cut = joined.slice(0, request.budgetChars);
            return {
                kind: request.kind,
                text: `${cut}\n\n… материалы вида усечены по бюджету`,
                chars: cut.length,
                truncated: true,
            };
        } catch (error) {
            this.logger.warn(
                `Материалы вида ${request.kind} недоступны (${domain}): ` +
                    (error as Error).message,
            );
            return empty;
        }
    }

    private budgetOf(
        requests: KnowledgeMaterialRequest[],
        kind: string,
    ): number {
        return (
            requests.find(request => request.kind === kind)?.budgetChars ?? 0
        );
    }
}

/** Блок с заголовком для промпта; пустой блок ничего не добавляет. */
export function renderMaterialBlock(
    heading: string,
    block: KnowledgeMaterialBlock | undefined,
): string {
    if (!block?.text) return '';
    return `${heading}\n\n${block.text}`;
}
