import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { evaluateDeal, isForgotten } from '../lib/deal-audit-rules';
import {
    DealAuditRunResult,
    DealAuditThresholds,
    DealAuditVerdict,
} from '../types/deal-audit.types';
import { DealAuditDealsReader } from './deal-audit-deals.reader';
import {
    DealAuditDigestOptions,
    DealAuditDigestService,
} from './deal-audit-digest.service';
import { DealAuditFields } from './deal-audit-fields';
import { DealAuditTasksReader } from './deal-audit-tasks.reader';
import { DealAuditWriterService } from './deal-audit-writer.service';

/** Параметры одного прогона: пороги из админки + режим запуска. */
export interface DealAuditOptions extends DealAuditThresholds {
    /** Считать, но не писать в карточки и не рассылать сводки. */
    readonly dryRun: boolean;
    /** Максимум карточек, размечаемых за прогон. */
    readonly maxPerRun: number;
    readonly digest: DealAuditDigestOptions;
    /**
     * Ограничить прогон этими сделками — только для ручного запуска:
     * крон всегда идёт по всей воронке.
     */
    readonly dealIds?: readonly number[];
}

/**
 * Аудит сделок: считает признаки «забытости» по открытым сделкам воронки
 * ОП, размечает карточки и рассылает сводки.
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
    ) {}

    async runForDomain(
        domain: string,
        options: DealAuditOptions,
    ): Promise<DealAuditRunResult> {
        const warnings: string[] = [];
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const fields = new DealAuditFields(portal);
        if (!fields.isInstalled && !options.dryRun) {
            warnings.push(
                'поля аудита не установлены — прогон выполнен как холостой',
            );
        }

        const tasks = await new DealAuditTasksReader(
            bitrix,
            portal.getTimezone(),
        ).load(warnings);

        const all = await new DealAuditDealsReader(bitrix, portal, fields).load(
            tasks,
            warnings,
        );
        const snapshots = options.dealIds?.length
            ? all.filter(snapshot => options.dealIds?.includes(snapshot.dealId))
            : all;

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
        const canWrite = !options.dryRun && fields.isInstalled;
        const written = canWrite
            ? await new DealAuditWriterService(
                  bitrix,
                  fields,
                  portal.getTimezone(),
              ).write(writable, warnings)
            : 0;

        if (canWrite) {
            await this.digest.send(domain, forgotten, options.digest, warnings);
        }

        this.logger.log(
            `[deal-audit] ${domain}: сделок ${snapshots.length}, забытых ` +
                `${forgotten.length}, размечено ${written}` +
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
            warnings,
        };
    }
}

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
