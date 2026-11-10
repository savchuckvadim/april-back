import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    DocumentTemplateKind,
    TemplateCriteria,
    TemplateMatch,
    TemplateResolutionSource,
} from './document-template.criteria';
import { DocumentTemplateRepository } from './document-template.repository';
import { describeMissingContractTemplate } from './lib/missing-template.util';
import { rankTemplates } from './lib/resolve-template.util';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/** Сырые признаки «как пришли из DTO генерации». */
export type ResolveTemplateInput = {
    domain: string;
    /** dto.providerId; 0/NaN/отрицательное трактуется как «не выбран». */
    providerId?: number | null;
    contractType?: CONTRACT_LTYPE | null;
    /** Приходит и строкой-кодом, и объектом SelectItem — нормализуется. */
    clientType?: unknown;
    supplyType?: string | null;
};

export type ResolvedTemplate = {
    source: TemplateResolutionSource;
    /** null — когда сработал откат на файл из storage. */
    match: TemplateMatch | null;
    criteria: TemplateCriteria;
};

const CLIENT_TYPES = Object.values(ClientTypeEnum) as string[];
const SUPPLY_TYPES = Object.values(SupplyTypeEnum) as string[];

@Injectable()
export class DocumentTemplateService {
    private readonly logger = new Logger(DocumentTemplateService.name);

    constructor(
        private readonly repository: DocumentTemplateRepository,
        private readonly portalStore: PortalStoreService,
    ) {}

    /**
     * Нормализация признаков.
     *
     * `providerId` обязателен в DTO генерации (`@IsNumber()`), поэтому
     * «поставщик не выбран» приходит не как undefined, а как 0/NaN/устаревший
     * id. Любое неположительное значение сводим к null: резолвер тогда
     * ищет только шаблоны без поставщика и НИКОГДА не берёт шаблон
     * произвольного поставщика — иначе в договор уедут реквизиты не того
     * юрлица.
     */
    async buildCriteria(
        input: ResolveTemplateInput,
    ): Promise<TemplateCriteria> {
        const portal = await this.portalStore.getPortalByDomain(input.domain);
        if (!portal) {
            this.logger.warn(
                `Портал по домену ${input.domain} не найден — шаблон будет искаться только среди общих`,
            );
        }

        const portalId =
            portal?.id != null && portal.id !== undefined
                ? BigInt(portal.id)
                : null;

        const providerId = Number(input.providerId);
        const agentId =
            Number.isFinite(providerId) && providerId > 0
                ? BigInt(providerId)
                : null;

        return {
            portalId,
            agentId,
            contractType: input.contractType ?? null,
            clientType: this.normalizeClientType(input.clientType),
            supplyType: this.normalizeSupplyType(input.supplyType),
        };
    }

    /**
     * Шаблон ДОГОВОРА: портальный или общий из БД. Тип договора обязателен.
     *
     * Отката на файл нет: единственный файл `contract/template.docx` — это
     * коммерческий договор услуг, и бюджетник получал по нему договор с
     * авансом. Нет шаблона — 404 с текстом, какой шаблон завести и где.
     */
    async resolveContract(
        input: ResolveTemplateInput,
    ): Promise<ResolvedTemplate> {
        const criteria = await this.buildCriteria(input);

        if (!criteria.contractType) {
            throw new BadRequestException(
                'Не передан тип договора: шаблона договора «по умолчанию» не существует',
            );
        }

        const resolved = await this.resolve(
            DocumentTemplateKind.CONTRACT,
            criteria,
        );
        if (resolved.match) {
            return resolved;
        }

        const message = describeMissingContractTemplate(criteria);
        this.logger.warn(`${input.domain}: ${message}`);
        throw new NotFoundException(message);
    }

    /**
     * Шаблон ОТЧЁТА О ПОСТАВКЕ. Откат на файл из storage законен всегда:
     * сегодня отчёт собирается только из файла, таблица пока пуста.
     */
    async resolveSupplyReport(
        input: ResolveTemplateInput,
    ): Promise<ResolvedTemplate> {
        const criteria = await this.buildCriteria(input);
        const resolved = await this.resolve(
            DocumentTemplateKind.SUPPLY_REPORT,
            criteria,
        );
        if (resolved.match) {
            return resolved;
        }
        return {
            source: TemplateResolutionSource.STORAGE_FALLBACK,
            match: null,
            criteria,
        };
    }

    /**
     * Шаблон СЧЁТА. Отката на файл нет: счёт всегда собирается по строке из
     * БД, поэтому отсутствие шаблона — это ошибка настройки.
     */
    async resolveInvoice(
        input: ResolveTemplateInput,
    ): Promise<ResolvedTemplate> {
        const criteria = await this.buildCriteria(input);
        return this.resolve(DocumentTemplateKind.INVOICE, criteria);
    }

    private async resolve(
        kind: DocumentTemplateKind,
        criteria: TemplateCriteria,
    ): Promise<ResolvedTemplate> {
        const candidates = await this.repository.findCandidates(kind, criteria);
        const { winner, ranked, ambiguous } = rankTemplates(
            candidates,
            criteria,
        );

        if (ambiguous && winner) {
            // Дефект ДАННЫХ, а не повод падать: документ нужен менеджеру
            // здесь и сейчас. Победитель детерминирован (ничью разрешает id),
            // но админ должен об этом узнать.
            this.logger.warn(
                `${kind}: неоднозначный подбор шаблона — ${ranked
                    .slice(0, 2)
                    .map(m => `#${m.candidate.id}`)
                    .join(
                        ' и ',
                    )} равнозначны (портал ${String(criteria.portalId)}, поставщик ${String(criteria.agentId)}). Выбран #${winner.candidate.id}`,
            );
        }

        return {
            source: TemplateResolutionSource.DB,
            match: winner,
            criteria,
        };
    }

    /** Принимает строку-код и объект {code} — обе формы ходят по проводу. */
    private normalizeClientType(raw: unknown): ClientTypeEnum | null {
        const code =
            typeof raw === 'string'
                ? raw
                : ((raw as { code?: string } | null)?.code ?? '');
        return CLIENT_TYPES.includes(code) ? (code as ClientTypeEnum) : null;
    }

    /**
     * Тип поставки приходит как `'internet' | 'proxima'` под `@IsString()`,
     * то есть БЕЗ валидации — любая строка проходит DTO. Поэтому сверяем со
     * справочником здесь, иначе мусор молча станет критерием отбора.
     */
    private normalizeSupplyType(raw: unknown): SupplyTypeEnum | null {
        if (typeof raw !== 'string' || !SUPPLY_TYPES.includes(raw)) {
            return null;
        }
        return raw as SupplyTypeEnum;
    }
}
