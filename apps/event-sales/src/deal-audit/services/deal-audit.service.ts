import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { evaluateDeal, isForgotten } from '../lib/deal-audit-rules';
import { resolveDealAuditRunMode } from '../lib/deal-audit-run-mode';
import {
    DealAuditRunResult,
    DealAuditThresholds,
    DealAuditVerdict,
} from '../types/deal-audit.types';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '@lib/bx-department';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { buildDealAuditStaffGroups } from '../lib/deal-audit-staff-groups';
import {
    DealAuditDealRow,
    DealAuditDealsReader,
} from './deal-audit-deals.reader';
import {
    DealAuditDigestOptions,
    DealAuditDigestService,
} from './deal-audit-digest.service';
import { DealAuditFields } from './deal-audit-fields';
import {
    DealAuditTaskTarget,
    DealAuditTasksReader,
} from './deal-audit-tasks.reader';
import { DealAuditWriterService } from './deal-audit-writer.service';

/** Параметры одного прогона: пороги из админки + режим запуска. */
export interface DealAuditOptions extends DealAuditThresholds {
    /** Считать, но не писать в карточки и не рассылать сводки. */
    readonly dryRun: boolean;
    /** Максимум карточек, размечаемых за прогон. */
    readonly maxPerRun: number;
    /**
     * Сколько сделок берётся за прогон по каждому отделу продаж — самые
     * давние по последней активности (владелец, 05.10.2026: не больше 50).
     */
    readonly maxPerDepartment: number;
    readonly digest: DealAuditDigestOptions;
    /**
     * Ограничить прогон этими сделками — только для ручного запуска:
     * крон берёт самые давние сделки отделов.
     */
    readonly dealIds?: readonly number[];
}

/**
 * Аудит сделок: считает признаки «забытости» по открытым сделкам воронки
 * ОП, размечает карточки и рассылает сводки.
 *
 * За прогон смотрит не всю воронку, а самые давние сделки каждого отдела
 * продаж (по дате последней активности) — их отдаёт сам Битрикс одним
 * запросом на все отделы. Задачи читаются только по выбранным сделкам.
 *
 * Ничего не создаёт и не двигает: ни стадий, ни задач, ни звонков. Это
 * граница модуля — разметка и рассылка. Действия по забытым сделкам
 * (поставить звонок, вернуть в работу) остаются за хуками ОП, которые
 * умеют это делать идемпотентно.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова: в поля
 * кладём лишь PBXService и инфраструктуру (CLAUDE.md).
 */
@Injectable()
export class DealAuditService {
    private readonly logger = new Logger(DealAuditService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly digest: DealAuditDigestService,
        private readonly departments: BxDepartmentService,
    ) {}

    async runForDomain(
        domain: string,
        options: DealAuditOptions,
    ): Promise<DealAuditRunResult> {
        const warnings: string[] = [];
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const fields = new DealAuditFields(portal);
        const mode = resolveDealAuditRunMode(
            options.dryRun,
            fields.isInstalled,
        );
        if (mode.warning) warnings.push(mode.warning);

        // Воронка целиком не читается: по каждому отделу продаж Битрикс
        // отдаёт самые давние сделки (не больше лимита на отдел), задачи
        // читаются только по ним. Ручной прогон по конкретным сделкам
        // структуру не трогает.
        const groups = options.dealIds?.length
            ? []
            : buildDealAuditStaffGroups(
                  await this.loadSalesDepartments(domain, warnings),
              );
        const dealsReader = new DealAuditDealsReader(bitrix, portal, fields);
        const rows = await dealsReader.loadMostIdle(
            {
                groups,
                limitPerGroup: options.maxPerDepartment,
                dealIds: options.dealIds,
            },
            warnings,
        );
        const tasks = await new DealAuditTasksReader(
            bitrix,
            portal.getTimezone(),
        ).loadFor(rows.map(toTaskTarget), warnings);
        const snapshots = dealsReader.toSnapshots(rows, tasks);

        const now = Date.now();
        const pairs = snapshots.map(snapshot => ({
            snapshot,
            verdict: evaluateDeal(snapshot, options, now),
        }));

        const byStatus = countByStatus(pairs.map(pair => pair.verdict));
        const forgotten = pairs.map(pair => pair.verdict).filter(isForgotten);

        /*
         * Лимит режет ЗАПИСЬ, а не подсчёт: сводка и ответ ручки должны
         * показывать реальную картину портала целиком, иначе «забытых 20»
         * при тысяче забытых читается как успех.
         */
        const writable = pairs.slice(0, Math.max(0, options.maxPerRun));
        const { canWrite } = mode;
        const written = canWrite
            ? await new DealAuditWriterService(
                  bitrix,
                  fields,
                  portal.getTimezone(),
              ).write(writable, warnings)
            : 0;

        // Сводка — из вердиктов прогона, поля карточки ей не нужны.
        const digestSent = mode.canNotify
            ? await this.digest.send(
                  domain,
                  forgotten,
                  options.digest,
                  warnings,
              )
            : 0;

        this.logger.log(
            `[deal-audit] ${domain}: сделок ${snapshots.length}, забытых ` +
                `${forgotten.length}, размечено ${written}, сводок ${digestSent}` +
                (options.dryRun ? ' (холостой ход)' : '') +
                (warnings.length ? `, warnings ${warnings.length}` : ''),
        );

        return {
            domain,
            scanned: snapshots.length,
            written,
            flagged: forgotten.length,
            byStatus,
            verdicts: forgotten,
            dryRun: !canWrite,
            digestSent,
            warnings,
        };
    }

    /** Отделы продаж со всеми подотделами; ошибка → пусто и предупреждение. */
    private async loadSalesDepartments(
        domain: string,
        warnings: string[],
    ): Promise<IBXDepartment[]> {
        try {
            const response = await this.departments.getFullDepartment(
                domain,
                EDepartamentGroup.sales,
            );
            const data = response.department;
            return [
                ...(data.generalDepartment ?? []),
                ...(data.childrenDepartments ?? []),
            ];
        } catch (error) {
            warnings.push(
                `структура отделов не прочитана: ${(error as Error).message}`,
            );
            return [];
        }
    }
}

/** Сделка → что нужно читателю задач: её id и компания. */
const toTaskTarget = (row: DealAuditDealRow): DealAuditTaskTarget => {
    const companyId = Number(row['COMPANY_ID']);
    return {
        dealId: Number(row['ID']),
        companyId:
            Number.isFinite(companyId) && companyId > 0 ? companyId : null,
    };
};

/** Разбивка «статус → количество»; нулевые статусы в ответ не попадают. */
const countByStatus = (
    verdicts: readonly DealAuditVerdict[],
): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const verdict of verdicts) {
        result[verdict.status] = (result[verdict.status] ?? 0) + 1;
    }
    // «Норма» показываем всегда: ноль в этой строке — сигнал, а не пустота.
    result[DEAL_AUDIT_STATUS.ok] = result[DEAL_AUDIT_STATUS.ok] ?? 0;
    return result;
};
