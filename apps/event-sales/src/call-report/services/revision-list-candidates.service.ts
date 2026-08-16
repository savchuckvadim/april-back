import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { TranscriptionPipelineView } from '@lib/call-lib';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    RevisionListCandidate,
    RevisionListCandidates,
} from '../contracts/call-revision.contract';
import { CallPassport } from './call-context-builder.service';

/** Окно поиска «рядом по времени» вокруг звонков сущности, дней. */
const TIME_WINDOW_DAYS = 3;
/** Лимит кандидатов на список — модель выбирает из короткого списка. */
const CANDIDATES_LIMIT = 10;
/** Лимит полей и длины значений в preview записи. */
const PREVIEW_FIELDS_LIMIT = 4;
const PREVIEW_VALUE_LIMIT = 120;

/**
 * Поиск записей-кандидатов в списках отчётности менеджера (sales_kpi /
 * sales_history) для привязки ночным ревизором.
 *
 * Два уровня (идея владельца):
 *  1. По CRM-полю самой записи (multiple, тип crm — может ссылаться на
 *     сделку/компанию/лид/контакт): записи, привязанные к владельцу
 *     звонка, — строгие кандидаты.
 *  2. Пусто — «кто был рядом»: записи в окне ±TIME_WINDOW_DAYS вокруг
 *     звонков сущности, созданные менеджером звонка.
 *
 * Семантический выбор из кандидатов делает LLM-ревизия; сервис только
 * собирает и оформляет. Полностью fail-open: любая ошибка → пустой
 * список (ревизия проходит без привязки).
 *
 * НЕ @Injectable: создаётся `new` рядом с BitrixService (см. CLAUDE.md
 * про race condition инстансов битрикса).
 */
export class RevisionListCandidatesService {
    private readonly logger = new Logger(RevisionListCandidatesService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async find(
        passport: CallPassport,
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionListCandidates> {
        return {
            kpi: await this.findForList('sales_kpi', passport, rows),
            history: await this.findForList('sales_history', passport, rows),
        };
    }

    private async findForList(
        listCode: 'sales_kpi' | 'sales_history',
        passport: CallPassport,
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionListCandidate[]> {
        try {
            const list = this.portal.getListByCode(listCode);
            if (!list?.bitrixId) return [];

            const byCrm = await this.findByCrmBinding(list, passport);
            if (byCrm.length) return byCrm;
            return await this.findByTimeWindow(list, rows);
        } catch (error) {
            this.logger.warn(
                `Кандидаты ${listCode} не собраны: ${(error as Error).message}`,
            );
            return [];
        }
    }

    /** Уровень 1: записи, привязанные к владельцу звонка CRM-полем. */
    private async findByCrmBinding(
        list: IPBXList,
        passport: CallPassport,
    ): Promise<RevisionListCandidate[]> {
        const crmField = this.portal.getIdByCodeFieldList(list, 'crm');
        const crmRefs = this.buildCrmRefs(passport);
        if (!crmField?.bitrixId || !crmRefs.length) return [];

        const items = await this.loadItems(list, {
            [`=${crmField.bitrixId}`]: crmRefs,
        });
        return items.map(item => this.toCandidate(list, item, 'crm'));
    }

    /** Уровень 2: записи менеджера рядом по времени со звонками. */
    private async findByTimeWindow(
        list: IPBXList,
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionListCandidate[]> {
        const dates = rows
            .map(row => row.callStartedAt)
            .filter((date): date is Date => Boolean(date))
            .map(date => new Date(date).getTime());
        if (!dates.length) return [];

        const dayMs = 24 * 60 * 60_000;
        const filter: Record<string, unknown> = {
            '>=DATE_CREATE': new Date(
                Math.min(...dates) - TIME_WINDOW_DAYS * dayMs,
            ).toISOString(),
            '<=DATE_CREATE': new Date(
                Math.max(...dates) + TIME_WINDOW_DAYS * dayMs,
            ).toISOString(),
        };
        const managerId = rows.find(row => row.userId)?.userId;
        if (managerId) filter.CREATED_BY = String(managerId);

        const items = await this.loadItems(list, filter);
        return items.map(item => this.toCandidate(list, item, 'time'));
    }

    /**
     * CRM-ссылки владельца звонка в формате значений crm-поля списка:
     * D_{id} сделка, L_{id} лид, CO_{id} компания, C_{id} контакт.
     */
    private buildCrmRefs(passport: CallPassport): string[] {
        const refs: string[] = [];
        if (passport.entityType === 'deal' && passport.entityId) {
            refs.push(`D_${passport.entityId}`);
        }
        if (passport.entityType === 'lead' && passport.entityId) {
            refs.push(`L_${passport.entityId}`);
        }
        if (passport.crmCompanyId) refs.push(`CO_${passport.crmCompanyId}`);
        if (passport.crmContactId) refs.push(`C_${passport.crmContactId}`);
        return refs;
    }

    private async loadItems(
        list: IPBXList,
        filter: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> {
        const response = (await this.bitrix.listItem.get({
            IBLOCK_ID: String(list.bitrixId),
            filter,
        })) as unknown as { result?: Record<string, unknown>[] };
        return (response?.result ?? []).slice(0, CANDIDATES_LIMIT);
    }

    /** Запись списка → кандидат: id, имя, дата и preview заполненных полей. */
    private toCandidate(
        list: IPBXList,
        item: Record<string, unknown>,
        matchedBy: 'crm' | 'time',
    ): RevisionListCandidate {
        const rawId = item.ID;
        return {
            id:
                typeof rawId === 'string' || typeof rawId === 'number'
                    ? String(rawId)
                    : '',
            name: typeof item.NAME === 'string' ? item.NAME : '',
            createdAt:
                typeof item.DATE_CREATE === 'string' ? item.DATE_CREATE : null,
            matchedBy,
            preview: this.renderPreview(list, item),
        };
    }

    /**
     * Человекочитаемые заполненные поля записи («название: значение») —
     * комментарии менеджера из записи и есть контекст для ревизии.
     */
    private renderPreview(
        list: IPBXList,
        item: Record<string, unknown>,
    ): string {
        const parts: string[] = [];
        for (const field of list.bitrixfields ?? []) {
            if (parts.length >= PREVIEW_FIELDS_LIMIT) break;
            if (!field.bitrixId) continue;
            const value = this.flattenValue(item[field.bitrixId]);
            if (!value) continue;
            parts.push(`${field.name}: ${value}`);
        }
        return parts.join('; ');
    }

    /** Значение свойства списка (строка/число/массив/объект Bitrix) → текст. */
    private flattenValue(raw: unknown): string | null {
        if (raw == null) return null;
        if (Array.isArray(raw)) {
            const joined = raw
                .map(entry => this.flattenValue(entry))
                .filter(Boolean)
                .join(', ');
            return joined || null;
        }
        // Свойства списков приходят и объектами {id: value} — берём значения.
        if (typeof raw === 'object') {
            return this.flattenValue(Object.values(raw));
        }
        if (
            typeof raw !== 'string' &&
            typeof raw !== 'number' &&
            typeof raw !== 'boolean'
        ) {
            return null;
        }
        const text = String(raw).trim();
        if (!text) return null;
        return text.length > PREVIEW_VALUE_LIMIT
            ? `${text.slice(0, PREVIEW_VALUE_LIMIT)}…`
            : text;
    }
}
