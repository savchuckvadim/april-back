import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeContentService } from '@lib/ai-rag';
import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_TYPE_PROFILES,
    CallReportTypeProfile,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/** Kind базы знаний с JSON-реестром типов звонков. */
export const CALL_TYPE_REGISTRY_KNOWLEDGE_KIND = 'call-type-registry';

/** Допустимый код типа звонка (слаг). */
const TYPE_CODE_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** TTL кэша реестра в памяти, мс. */
const REGISTRY_CACHE_TTL_MS = 60_000;

/** Один тип звонка в резолвленном реестре. */
export interface CallTypeDefinition extends CallReportTypeProfile {
    code: string;
    /** Человеческое название (для UI/смарта). */
    title: string;
}

/** Резолвленный реестр типов домена. */
export interface CallTypeRegistry {
    /** Коды в порядке определения (встроенные, затем добавленные). */
    codes: string[];
    /** Профиль каждого типа. */
    types: Record<string, CallTypeDefinition>;
    /** Источник: builtin — только конфиг смарта; knowledge — с документами. */
    source: 'builtin' | 'knowledge';
}

/** Формат JSON-документа реестра (частичное переопределение допустимо). */
interface RegistryDocument {
    types?: Partial<CallTypeDefinition>[];
}

/**
 * Реестр типов звонков — управляемый без деплоя:
 *
 * 1) встроенные типы: CALL_REPORT_TYPE_PROFILES + названия из конфига
 *    смарта (источник правды по умолчанию);
 * 2) общий JSON-документ kind='call-type-registry' — переопределяет
 *    профили встроенных типов и/или добавляет новые общие типы;
 * 3) клиентский документ того же kind (домен) — переопределяет/добавляет
 *    ПОВЕРХ общего: у клиента могут быть свои типы звонков.
 *
 * Слияние по code, поле за полем (частичный документ валиден). Невалидные
 * записи пропускаются с warn, битый JSON — игнор документа (fallback
 * не ломается). Кэш в памяти 60с, invalidate() — после правки документов.
 *
 * ВАЖНО: новый тип попадёт в enum-поле смарта только после добавления
 * item'а в CALL_REPORT_CALL_TYPE_ITEMS + переустановки смарта
 * (install-smart идемпотентен); до этого смарт-элементы пишутся без
 * CALL_TYPE (graceful), а классификация/анализ/отчёты работают полностью.
 */
@Injectable()
export class CallTypeRegistryService {
    private readonly logger = new Logger(CallTypeRegistryService.name);
    private readonly cache = new Map<
        string,
        { registry: CallTypeRegistry; expiresAt: number }
    >();

    constructor(private readonly knowledgeContent: KnowledgeContentService) {}

    /** Встроенный реестр (без документов) — синхронный fallback. */
    builtin(): CallTypeRegistry {
        const types: Record<string, CallTypeDefinition> = {};
        const codes: string[] = [];
        for (const item of CALL_REPORT_CALL_TYPE_ITEMS) {
            const code = item.CODE;
            codes.push(code);
            types[code] = {
                code,
                title: item.VALUE,
                ...CALL_REPORT_TYPE_PROFILES[code],
            };
        }
        return { codes, types, source: 'builtin' };
    }

    async resolve(domain: string): Promise<CallTypeRegistry> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.registry;
        }

        const registry = this.builtin();
        try {
            // Слои поверх встроенного: сначала ОБЩИЙ документ, затем
            // КЛИЕНТСКИЙ. База знаний сама по себе замещающая (клиентская
            // папка вместо общей), поэтому оба слоя читаются явно, а
            // клиентские документы отличаются по doc.source === domain.
            const sharedDocs = await this.knowledgeContent.readAll(
                undefined,
                CALL_TYPE_REGISTRY_KNOWLEDGE_KIND,
            );
            const clientDocs = (
                await this.knowledgeContent.readAll(
                    domain,
                    CALL_TYPE_REGISTRY_KNOWLEDGE_KIND,
                )
            ).filter(doc => doc.source === domain);

            let applied = 0;
            for (const doc of [...sharedDocs, ...clientDocs]) {
                if (doc.kind !== CALL_TYPE_REGISTRY_KNOWLEDGE_KIND) continue;
                applied += this.applyDocument(registry, doc.fileName, doc.text);
            }
            if (applied > 0) {
                registry.source = 'knowledge';
                this.logger.log(
                    `Реестр типов (${domain}): применено ${applied} записей ` +
                        `(общих докум. ${sharedDocs.length}, клиентских ${clientDocs.length}), ` +
                        `итого типов ${registry.codes.length}`,
                );
            }
        } catch (error) {
            this.logger.warn(
                `Реестр типов из базы знаний недоступен (${domain}): ` +
                    `${(error as Error).message} — используется встроенный`,
            );
        }

        this.cache.set(domain, {
            registry,
            expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
        });
        return registry;
    }

    /** Сброс кэша (после правки документов реестра в админке). */
    invalidate(domain?: string): void {
        if (domain) this.cache.delete(domain);
        else this.cache.clear();
        this.logger.log(`Кэш реестра типов сброшен (${domain ?? 'все'})`);
    }

    /** Применяет один JSON-документ к реестру; возвращает число записей. */
    private applyDocument(
        registry: CallTypeRegistry,
        fileName: string,
        text: string,
    ): number {
        let parsed: RegistryDocument;
        try {
            parsed = JSON.parse(text) as RegistryDocument;
        } catch {
            this.logger.warn(
                `Документ реестра ${fileName} — битый JSON, пропущен`,
            );
            return 0;
        }
        if (!Array.isArray(parsed.types)) {
            this.logger.warn(
                `Документ реестра ${fileName} без массива types, пропущен`,
            );
            return 0;
        }

        let applied = 0;
        for (const entry of parsed.types) {
            const code = entry.code;
            if (typeof code !== 'string' || !TYPE_CODE_PATTERN.test(code)) {
                this.logger.warn(
                    `Реестр ${fileName}: запись без валидного code пропущена ` +
                        `(${JSON.stringify(entry.code)})`,
                );
                continue;
            }
            const base =
                registry.types[code] ??
                ({
                    code,
                    title: code,
                    focus: '',
                    sectionRelevance: {
                        GREETING: 50,
                        NEEDS: 50,
                        PRESENTATION: 50,
                        OBJECTIONS: 50,
                        PRICE: 50,
                        CLOSING: 50,
                        REFUSAL: 50,
                    },
                    talkRatioNorm: null,
                    questionsNorm: null,
                    knowledgeKind: `call-analysis-${code}`,
                } satisfies CallTypeDefinition);
            // Слияние поле-за-полем: частичное переопределение валидно.
            registry.types[code] = {
                ...base,
                ...this.pickDefined(entry),
                code,
            };
            if (!registry.codes.includes(code)) registry.codes.push(code);
            applied++;
        }
        return applied;
    }

    /** Только заданные поля записи (undefined не затирают базу). */
    private pickDefined(
        entry: Partial<CallTypeDefinition>,
    ): Partial<CallTypeDefinition> {
        const result: Partial<CallTypeDefinition> = {};
        if (entry.title !== undefined) result.title = entry.title;
        if (entry.focus !== undefined) result.focus = entry.focus;
        if (entry.sectionRelevance !== undefined) {
            result.sectionRelevance = entry.sectionRelevance;
        }
        if (entry.talkRatioNorm !== undefined) {
            result.talkRatioNorm = entry.talkRatioNorm;
        }
        if (entry.questionsNorm !== undefined) {
            result.questionsNorm = entry.questionsNorm;
        }
        if (entry.knowledgeKind !== undefined) {
            result.knowledgeKind = entry.knowledgeKind;
        }
        return result;
    }
}
