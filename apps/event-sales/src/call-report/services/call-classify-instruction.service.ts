import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeContentService } from '@lib/ai-rag';
import { DEFAULT_CLASSIFICATION_SYSTEM_PROMPT } from '@lib/call-lib';

/** Kind базы знаний с подменной инструкцией классификации типа звонка. */
export const CALL_CLASSIFY_KNOWLEDGE_KIND = 'call-classify';

/**
 * Резолюция инструкции классификации типа звонка:
 * документы базы знаний kind='call-classify' (клиентская база домена,
 * иначе общая) → их текст становится системным промптом классификатора;
 * документов нет — дефолтная инструкция из кода.
 *
 * Так инструкция подменяется БЕЗ деплоя — загрузкой/заменой документа
 * через POST /ai-rag/knowledge/call-classify (или для домена —
 * /agent/knowledge). Коды ответа классификатора зафиксированы strict
 * JSON-схемой и от инструкции не зависят.
 */
@Injectable()
export class CallClassifyInstructionService {
    private readonly logger = new Logger(CallClassifyInstructionService.name);

    constructor(private readonly knowledgeContent: KnowledgeContentService) {}

    async resolve(domain: string): Promise<string> {
        try {
            const documents = await this.knowledgeContent.readAll(
                domain,
                CALL_CLASSIFY_KNOWLEDGE_KIND,
            );
            // listDocuments подмешивает general/ — для инструкции берём
            // строго документы самого kind, иначе промпт «зарастёт» общими
            // материалами базы.
            const instructions = documents
                .filter(doc => doc.kind === CALL_CLASSIFY_KNOWLEDGE_KIND)
                .map(doc => doc.text.trim())
                .filter(Boolean);
            if (instructions.length) {
                this.logger.log(
                    `Инструкция классификации из базы знаний (${domain}): ${instructions.length} докум.`,
                );
                return instructions.join('\n\n');
            }
        } catch (error) {
            this.logger.warn(
                `База знаний ${CALL_CLASSIFY_KNOWLEDGE_KIND} недоступна (${domain}): ${(error as Error).message}`,
            );
        }
        return DEFAULT_CLASSIFICATION_SYSTEM_PROMPT;
    }
}
