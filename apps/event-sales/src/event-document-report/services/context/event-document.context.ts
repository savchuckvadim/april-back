import {
    SalesDocumentEventJobData,
    SalesDocumentKind,
    SalesDocumentProductRow,
} from '@lib/queue';
import { IBXCompany, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBXDateTime } from '@lib/portal-lib/pbx-domain/date/pbx-datetime';
import {
    EVENT_DOCUMENT_KIND_RULES,
    EventDocumentKindRule,
    orderDocumentKinds,
} from '../../types/event-document.kind-rules';
import { EventDocumentSnapshot } from '../init/event-document-init.types';

/**
 * Контекст одного события «документ сформирован»: событие из очереди, снимок
 * карточек и производные от них признаки. Единственное место, где сырые
 * данные события превращаются в то, чем пользуются сервисы записи, — как
 * `EventReportContext` у отчёта о звонке.
 */
export class EventDocumentContext {
    private dateTimeVo?: PBXDateTime;

    constructor(
        readonly event: SalesDocumentEventJobData,
        readonly portal: PortalModel,
        readonly snapshot: EventDocumentSnapshot,
    ) {}

    /** Дата и время в поясе портала — единая точка форматирования. */
    get dateTime(): PBXDateTime {
        return (this.dateTimeVo ??= new PBXDateTime(this.portal));
    }

    // === Кто и что ===
    get domain(): string {
        return this.event.domain;
    }
    get userId(): number {
        return this.event.userId;
    }
    get companyId(): number {
        return this.event.companyId;
    }
    get baseDealId(): number {
        return Number(this.snapshot.baseDeal.ID);
    }

    /** Виды документов события в порядке применения правил. */
    get kinds(): SalesDocumentKind[] {
        return orderDocumentKinds(this.event.kinds);
    }
    get rules(): EventDocumentKindRule[] {
        return this.kinds.map(kind => EVENT_DOCUMENT_KIND_RULES[kind]);
    }

    // === Снимок ===
    get company(): IBXCompany | null {
        return this.snapshot.company;
    }
    get baseDeal(): IBXDeal {
        return this.snapshot.baseDeal;
    }
    get presentationDeal(): IBXDeal | null {
        return this.snapshot.presentationDeal;
    }
    get presentationDealId(): number | null {
        const id = Number(this.snapshot.presentationDeal?.ID);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    /** Документ сформирован в продолжение презентации. */
    get isAfterPresentation(): boolean {
        return Boolean(this.event.presentation);
    }

    // === Содержимое документа ===
    /** Момент формирования документа в формате CRM-поля портала. */
    get documentCrmDateTime(): string {
        return this.dateTime.crmDateTime(this.documentDate);
    }
    /**
     * Сумма документа; null — не передана. Ноль и мусор тоже считаются
     * «не передана»: иначе пустая сумма затёрла бы в сделке настоящую.
     */
    get sum(): number | null {
        const sum = this.event.sum;
        return typeof sum === 'number' && Number.isFinite(sum) && sum > 0
            ? sum
            : null;
    }
    get summary(): string {
        return this.event.summary?.trim() ?? '';
    }
    get productRows(): readonly SalesDocumentProductRow[] {
        return this.event.productRows ?? [];
    }

    /**
     * «ОП Текущий статус» карточки: статус последнего документа события,
     * у КП и счёта после презентации — с этой пометкой.
     */
    get statusText(): string {
        const rule = this.rules[this.rules.length - 1];
        if (!rule) return '';
        return this.isAfterPresentation && rule.afterPresentation
            ? rule.afterPresentation.statusText
            : rule.statusText;
    }

    /** Битая дата события не должна ронять поток: берём «сейчас». */
    private get documentDate(): Date {
        const date = new Date(this.event.createdAt);
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }
}
