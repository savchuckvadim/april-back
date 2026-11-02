import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FileLoaderService } from '@lib/ai-rag/infrastructure/file-loader/file-loader.service';
import {
    parseMethodology,
    type Methodology,
} from '@lib/call-lib/call-report/methodology';
import { StructuredLlmGateway, describeLlmError } from '@lib/llm-gateway';
import {
    METHODOLOGY_ASSIST_SCHEMA,
    METHODOLOGY_ASSIST_SCHEMA_NAME,
    buildAssistPrompt,
    cleanAssistDraft,
} from './methodology-assist.contract';
import { extractUploadedText } from './uploaded-text.util';

/** Потолок текста документа для модели, знаков. */
export const ASSIST_TEXT_LIMIT_CHARS = 40_000;
/** Домен-заглушка без портала: общие ключи приложения. */
const NO_PORTAL_DOMAIN = 'admin.april-app.ru';

export interface MethodologyAssistInput {
    text: string | null;
    file: { buffer: Buffer; originalName: string } | null;
    domain: string | null;
    code: string | null;
    title: string | null;
}

export interface MethodologyAssistResult {
    draft: Methodology | null;
    errors: string[];
    warnings: string[];
    textChars: number;
    provider: string | null;
    model: string | null;
}

/**
 * Помощник брифа (решение владельца 01.11.2026 — «сразу вместе с
 * брифом»): документ методики (docx/pdf/txt или вставленный текст) →
 * модель через шлюз разборов раскладывает его по пунктам, правилам и
 * ограничителям в нашем каталоге → валидатор → черновик для формы. Человек
 * правит и сохраняет; автопринятия нет. `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class MethodologyAssistService {
    private readonly logger = new Logger(MethodologyAssistService.name);

    constructor(
        private readonly gateway: StructuredLlmGateway,
        private readonly fileLoader: FileLoaderService,
    ) {}

    async assist(
        input: MethodologyAssistInput,
    ): Promise<MethodologyAssistResult> {
        const warnings: string[] = [];
        const parts: string[] = [];
        if (input.file) {
            parts.push(await extractUploadedText(this.fileLoader, input.file));
        }
        if (input.text?.trim()) parts.push(input.text.trim());
        const full = parts.join('\n\n').trim();
        if (!full) {
            throw new BadRequestException(
                'Нужен документ методики: файл docx/pdf/txt или вставленный текст',
            );
        }
        const text =
            full.length > ASSIST_TEXT_LIMIT_CHARS
                ? full.slice(0, ASSIST_TEXT_LIMIT_CHARS)
                : full;
        if (text.length < full.length) {
            warnings.push(
                `Текст документа усечён до ${ASSIST_TEXT_LIMIT_CHARS.toLocaleString('ru-RU')} знаков из ${full.length.toLocaleString('ru-RU')}`,
            );
        }

        const prompt = buildAssistPrompt({
            code: input.code,
            title: input.title,
        });
        try {
            const response = await this.gateway.structuredCompletionWithUsage(
                prompt,
                `ДОКУМЕНТ МЕТОДИКИ:\n\n${text}`,
                METHODOLOGY_ASSIST_SCHEMA_NAME,
                METHODOLOGY_ASSIST_SCHEMA,
                input.domain ?? NO_PORTAL_DOMAIN,
            );
            const cleaned = cleanAssistDraft(response.result, {
                code: input.code,
                title: input.title,
            });
            warnings.push(...cleaned.warnings);
            const parsed = parseMethodology(cleaned.draft);
            this.logger.log(
                `Помощник методики (${input.domain ?? 'без портала'}): ${text.length} знаков → ${parsed.ok ? `${parsed.value.checkpoints.length} пунктов, ${parsed.value.caps.length} ограничителей` : `ошибок ${parsed.errors.length}`}`,
            );
            return {
                draft: parsed.ok ? parsed.value : null,
                errors: parsed.ok ? [] : parsed.errors,
                warnings,
                textChars: text.length,
                provider: response.provider,
                model: response.model,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const message = describeLlmError(error);
            this.logger.warn(`Помощник методики не ответил: ${message}`);
            return {
                draft: null,
                errors: [`Модель не ответила: ${message}`],
                warnings,
                textChars: text.length,
                provider: null,
                model: null,
            };
        }
    }
}
