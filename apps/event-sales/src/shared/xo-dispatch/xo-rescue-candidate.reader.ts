import { Logger } from '@nestjs/common';
import { Dayjs } from 'dayjs';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';
import { XO_ROUTING_FIELD_CODES } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-xo-event.enum';
import { XoDispatchMarkerModel } from './xo-dispatch-marker.model';
import { XoRescueCandidate } from './xo-rescue.decision';

type BxRow = Record<string, unknown>;

/** Сущность, по которой работает подстраховка. */
export type XoRescueEntityType = 'company' | 'deal';

/** Кандидат вместе с сырой строкой — она нужна для чтения данных хука. */
export interface XoRescueRow {
    entityId: number;
    row: BxRow;
    candidate: XoRescueCandidate;
}

/**
 * Чтение кандидатов подстраховки из Битрикса.
 *
 * Вынесено из сервиса, чтобы решение («брать или нет», decideXoRescue)
 * осталось чистым и тестировалось без моков Битрикса, а здесь жили только
 * запросы и их фильтры.
 *
 * НЕ @Injectable: создаётся `new` с bitrix конкретного портала (CLAUDE.md).
 */
export class XoRescueCandidateReader {
    private readonly logger = new Logger(XoRescueCandidateReader.name);
    private readonly markers: XoDispatchMarkerModel;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly entityType: XoRescueEntityType,
        private readonly timezone: ETimeZone,
    ) {
        this.markers = new XoDispatchMarkerModel(portal, entityType);
    }

    /** Коды маркер-полей, которых нет в слепке — без них подстраховка слепа. */
    missingMarkerFields(): string[] {
        return this.markers.missingFields();
    }

    /**
     * Кандидаты ПО МЕТКЕ: робот взял элемент в очередь.
     *
     * Фильтр по непустому `queued_at` отдаёт Битрикс, а решение о досылке
     * принимается уже по сравнению меток между собой — такое условие на
     * стороне портала не выразить.
     */
    async byMarker(warnings: string[]): Promise<XoRescueRow[]> {
        const queuedName = this.markers.fieldName('queuedAt');
        if (!queuedName) return [];
        const rows = await this.list(
            { [`!${queuedName}`]: '' },
            warnings,
            'по метке «взято в очередь»',
        );
        return rows.map(row => this.toCandidate(row, false));
    }

    /**
     * Кандидаты ПО ДАТЕ ЗВОНКА: `xo_date` попадает в окно поиска.
     *
     * Обе границы окна уходят в фильтр Битрикса — портал отдаёт сразу
     * нужную выборку, а не всю базу с заполненной датой ХО. Наличие
     * ХО-работы проверяется отдельно, одним запросом на всю пачку.
     */
    async byPlanDate(
        notBefore: Dayjs,
        notAfter: Dayjs,
        warnings: string[],
    ): Promise<XoRescueRow[]> {
        const dateName = this.fieldName(XO_ROUTING_FIELD_CODES.date);
        if (!dateName) {
            warnings.push(
                'Поле «ОП Дата Холодного обзвона» не установлено — поиск по дате звонка пропущен',
            );
            return [];
        }
        const rows = await this.list(
            {
                [`>=${dateName}`]: notBefore.format('DD.MM.YYYY HH:mm:ss'),
                [`<=${dateName}`]: notAfter.format('DD.MM.YYYY HH:mm:ss'),
            },
            warnings,
            'по дате звонка',
        );
        const candidates = rows.map(row => this.toCandidate(row, true));
        await this.fillXoWork(candidates, warnings);
        return candidates;
    }

    /**
     * Есть ли по клиенту ХО-работа, созданная НЕ РАНЬШЕ плановой даты.
     *
     * Одним запросом на всю пачку: сделки ХО-воронки по компаниям
     * кандидатов. Сравнение с плановой датой — на нашей стороне, потому что
     * у каждого кандидата она своя.
     *
     * Любой сбой на этом шаге трактуется как «работа есть»: не проверив,
     * досылать нельзя — это ровно тот случай, когда подстраховка начинает
     * забирать лишнее.
     */
    private async fillXoWork(
        candidates: XoRescueRow[],
        warnings: string[],
    ): Promise<void> {
        const assumeWorkExists = (): void => {
            candidates.forEach(item => {
                item.candidate.hasXoWorkSincePlan = true;
            });
        };

        const xoCategory = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_xo,
        );
        if (!xoCategory) {
            warnings.push(
                'ХО-воронка не настроена — наличие работы не проверить, поиск по дате звонка пропущен',
            );
            assumeWorkExists();
            return;
        }

        const companyIds = candidates
            .map(item => this.companyIdOf(item.row))
            .filter((id): id is number => id !== null);
        if (!companyIds.length) {
            // Не к чему привязать проверку — не берём.
            assumeWorkExists();
            return;
        }

        try {
            const { result } = await this.bitrix.deal.getList(
                {
                    CATEGORY_ID: String(xoCategory.bitrixId),
                    COMPANY_ID: [...new Set(companyIds)],
                } as never,
                ['ID', 'COMPANY_ID', 'DATE_CREATE'],
            );
            const createdByCompany = new Map<number, Dayjs[]>();
            for (const deal of (result ?? []) as unknown as BxRow[]) {
                const companyId = Number(deal.COMPANY_ID);
                const createdAt = parseBitrixField(
                    deal.DATE_CREATE,
                    this.timezone,
                );
                if (!Number.isFinite(companyId) || !createdAt) continue;
                const list = createdByCompany.get(companyId) ?? [];
                list.push(createdAt);
                createdByCompany.set(companyId, list);
            }

            for (const item of candidates) {
                const companyId = this.companyIdOf(item.row);
                const planned = item.candidate.xoDate;
                if (companyId === null || !planned) continue;
                const created = createdByCompany.get(companyId) ?? [];
                item.candidate.hasXoWorkSincePlan = created.some(
                    date => !date.isBefore(planned),
                );
            }
        } catch (error) {
            warnings.push(
                `ХО-сделки не прочитаны (${(error as Error).message}) — поиск по дате звонка пропущен`,
            );
            assumeWorkExists();
        }
    }

    private toCandidate(row: BxRow, needsWorkCheck: boolean): XoRescueRow {
        const dateName = this.fieldName(XO_ROUTING_FIELD_CODES.date);
        return {
            entityId: Number(row.ID),
            row,
            candidate: {
                markers: this.markers.read(row, this.timezone),
                xoDate: dateName
                    ? parseBitrixField(row[dateName], this.timezone)
                    : null,
                // До проверки считаем «работа есть»: ошибка чтения не должна
                // оборачиваться массовой досылкой.
                hasXoWorkSincePlan: needsWorkCheck,
            },
        };
    }

    /** Компания клиента: у входа-компании это она сама, у сделки — её COMPANY_ID. */
    private companyIdOf(row: BxRow): number | null {
        const raw = this.entityType === 'company' ? row.ID : row.COMPANY_ID;
        const id = Number(raw);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    private fieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private async list(
        filter: Record<string, unknown>,
        warnings: string[],
        what: string,
    ): Promise<BxRow[]> {
        // `UF_*` забирает все пользовательские поля разом: перечислять
        // маршрутизацию и намерение по одному не нужно.
        const select = ['ID', 'TITLE', 'COMPANY_ID', 'UF_*'];
        try {
            const { result } =
                this.entityType === 'company'
                    ? await this.bitrix.company.getList(filter as never, select)
                    : await this.bitrix.deal.getList(filter as never, select);
            return ((result ?? []) as unknown as BxRow[]).filter(Boolean);
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `[xo-rescue] ${this.entityType}: выборка ${what} не прочитана — ${message}`,
            );
            warnings.push(
                `Выборка ${what} (${this.entityType}) не прочитана: ${message}`,
            );
            return [];
        }
    }
}
