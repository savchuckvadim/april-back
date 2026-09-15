import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { ETimeZone } from '@lib/shared/lib/date';
import { DealAuditSnapshot, DealAuditVerdict } from '../types/deal-audit.types';
import { DealAuditFields } from './deal-audit-fields';

dayjs.extend(utc);
dayjs.extend(timezone);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
/** Команд в batch: предел Битрикса. */
const BATCH_SIZE = 50;
/** Расшифровка — строковое поле; длинная строка Битриксом молча режется. */
const COMMENT_MAX_LENGTH = 500;

type DealUpdate = Record<string, unknown>;

/**
 * Запись вердиктов аудита в карточки сделок.
 *
 * НЕ `@Injectable` (инстанс Битрикса приходит параметром — CLAUDE.md).
 * Ничего, кроме полей `op_audit_*`, не трогает: аудит размечает, но не
 * двигает стадии и не создаёт задачи — это осознанная граница модуля.
 */
export class DealAuditWriterService {
    private readonly logger = new Logger(DealAuditWriterService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly fields: DealAuditFields,
        private readonly portalTimezone: ETimeZone,
    ) {}

    /**
     * Пишет вердикты пачками. Возвращает число реально обновлённых сделок.
     *
     * Сделки с неизменившимся статусом пропускаются: прогон ежедневный, и
     * без этого история каждой карточки за месяц обрастала бы тридцатью
     * одинаковыми правками.
     */
    async write(
        pairs: readonly {
            snapshot: DealAuditSnapshot;
            verdict: DealAuditVerdict;
        }[],
        warnings: string[],
    ): Promise<number> {
        if (!this.fields.isInstalled) {
            warnings.push(
                'поля аудита (op_audit_status / op_audit_flags) не установлены — разметка пропущена',
            );
            return 0;
        }

        const changed = pairs.filter(
            pair => pair.snapshot.previousStatus !== pair.verdict.status,
        );
        if (!changed.length) return 0;

        const stamp = dayjs()
            .tz(this.portalTimezone)
            .format(CRM_DATETIME_FORMAT);
        let written = 0;

        for (let i = 0; i < changed.length; i += BATCH_SIZE) {
            const chunk = changed.slice(i, i + BATCH_SIZE);
            for (const { verdict } of chunk) {
                this.bitrix.batch.deal.update(
                    `audit_${verdict.dealId}`,
                    verdict.dealId,
                    this.buildUpdate(verdict, stamp) as Partial<IBXDeal>,
                );
            }
            try {
                await this.bitrix.api.callBatchWithConcurrency(1);
                written += chunk.length;
            } catch (error) {
                warnings.push(
                    `запись аудита по сделкам с ${chunk[0].verdict.dealId} упала: ${(error as Error).message}`,
                );
            }
        }
        this.logger.debug(`[deal-audit] размечено сделок: ${written}`);
        return written;
    }

    /** Поля карточки: неустановленные молча пропускаются (self-gate). */
    private buildUpdate(verdict: DealAuditVerdict, stamp: string): DealUpdate {
        const update: DealUpdate = {};
        const names = this.fields.names;

        const statusId = this.fields.statusItemId(verdict.status);
        if (names.status && statusId) update[names.status] = statusId;

        if (names.flags) {
            const ids = verdict.flags
                .map(flag => this.fields.flagItemId(flag))
                .filter((id): id is number => id !== null);
            /*
             * Пустой массив — осознанно: так множественное поле очищается.
             * Иначе признаки прошлого прогона остались бы висеть на сделке,
             * по которой уже началась работа, и фильтр показывал бы её
             * забытой вечно.
             */
            update[names.flags] = ids;
        }

        if (names.auditedAt) update[names.auditedAt] = stamp;
        if (names.idleDays) update[names.idleDays] = verdict.idleDays ?? 0;
        if (names.overdueDays) update[names.overdueDays] = verdict.overdueDays;
        if (names.stageDays) update[names.stageDays] = verdict.stageDays ?? 0;
        if (names.openTasks) update[names.openTasks] = verdict.openTasks;
        if (names.comment) {
            update[names.comment] = verdict.comment.slice(
                0,
                COMMENT_MAX_LENGTH,
            );
        }
        return update;
    }
}
