import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '@lib/bx-department';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { buildDealAuditDigest } from '../lib/deal-audit-digest.formatter';
import { buildHeadsByUser } from '../lib/deal-audit-heads';
import { DealAuditVerdict } from '../types/deal-audit.types';
import { isForgotten } from '../lib/deal-audit-rules';

/** Тег уведомления: новая сводка ЗАМЕЩАЕТ вчерашнюю, а не копится. */
const DIGEST_TAG = 'event-sales-deal-audit';

/** Кому и сколько рассылать — уже разобранные настройки портала. */
export interface DealAuditDigestOptions {
    readonly toManager: boolean;
    readonly toHead: boolean;
    /** Получатели ОБЩЕЙ сводки по всем отделам (Bitrix ID). */
    readonly userIds: readonly number[];
    readonly limit: number;
}

/**
 * Рассылка сводок по забытым сделкам уведомлениями портала.
 *
 * Три независимых адресата (владелец, 15.09.2026): сам менеджер, его РОП
 * и общий список «по всем отделам». Каждый включается отдельно — на
 * обкатке сводку обычно хотят видеть только руководители.
 *
 * `@Injectable`, но инстанс Битрикса в поля НЕ кладём: берём по домену
 * через PBXService (CLAUDE.md — иначе гонка между порталами).
 */
@Injectable()
export class DealAuditDigestService {
    private readonly logger = new Logger(DealAuditDigestService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly departments: BxDepartmentService,
    ) {}

    /** Отправляет сводки; возвращает число доставленных уведомлений. */
    async send(
        domain: string,
        verdicts: readonly DealAuditVerdict[],
        options: DealAuditDigestOptions,
        warnings: string[],
    ): Promise<number> {
        const forgotten = verdicts.filter(isForgotten);
        if (!forgotten.length) return 0;
        const wanted =
            options.toManager || options.toHead || options.userIds.length > 0;
        if (!wanted) return 0;

        const byManager = groupByManager(forgotten);
        const structure = await this.loadDepartments(domain, warnings);
        const userNames = collectUserNames(structure);
        const messages = new Map<number, string>();

        if (options.toManager) {
            for (const [managerId, list] of byManager) {
                this.collect(messages, managerId, {
                    domain,
                    heading: 'Ваши забытые сделки',
                    verdicts: list,
                    limit: options.limit,
                });
            }
        }

        if (options.toHead && structure.length) {
            const headsByUser = buildHeadsByUser(structure);
            const byHead = new Map<number, DealAuditVerdict[]>();
            for (const [managerId, list] of byManager) {
                for (const headId of headsByUser.get(managerId) ?? []) {
                    const bucket = byHead.get(headId) ?? [];
                    bucket.push(...list);
                    byHead.set(headId, bucket);
                }
            }
            for (const [headId, list] of byHead) {
                this.collect(messages, headId, {
                    domain,
                    heading: 'Забытые сделки ваших сотрудников',
                    verdicts: list,
                    limit: options.limit,
                    userNames,
                });
            }
        } else if (options.toHead) {
            warnings.push(
                'структура отдела продаж не прочитана — сводка РОПам не отправлена',
            );
        }

        for (const userId of options.userIds) {
            this.collect(messages, userId, {
                domain,
                heading: 'Забытые сделки: сводка по всем отделам',
                verdicts: forgotten,
                limit: options.limit,
                userNames,
            });
        }

        return this.deliver(domain, messages, warnings);
    }

    /**
     * Сообщение копится в одну карту по получателю: РОП, который сам
     * ведёт сделки и стоит в общем списке, получит ОДНО уведомление, а
     * не три — приоритет у более широкой сводки (она добавляется позже).
     */
    private collect(
        messages: Map<number, string>,
        userId: number,
        input: Parameters<typeof buildDealAuditDigest>[0],
    ): void {
        if (!userId) return;
        const message = buildDealAuditDigest(input);
        if (message) messages.set(userId, message);
    }

    private async deliver(
        domain: string,
        messages: ReadonlyMap<number, string>,
        warnings: string[],
    ): Promise<number> {
        if (!messages.size) return 0;
        const { bitrix } = await this.pbx.init(domain);
        let sent = 0;
        for (const [userId, message] of messages) {
            try {
                await bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: DIGEST_TAG,
                });
                sent += 1;
            } catch (error) {
                warnings.push(
                    `сводка сотруднику ${userId} не отправлена: ${(error as Error).message}`,
                );
            }
        }
        this.logger.log(`[deal-audit] ${domain}: сводок отправлено ${sent}`);
        return sent;
    }

    /** Отделы продаж со всеми подотделами и родителями; ошибка → пусто. */
    private async loadDepartments(
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
                ...(data.parentDepartments ?? []),
            ];
        } catch (error) {
            warnings.push(
                `структура отделов не прочитана: ${(error as Error).message}`,
            );
            return [];
        }
    }
}

const groupByManager = (
    verdicts: readonly DealAuditVerdict[],
): Map<number, DealAuditVerdict[]> => {
    const result = new Map<number, DealAuditVerdict[]>();
    for (const verdict of verdicts) {
        if (!verdict.assignedById) continue;
        const list = result.get(verdict.assignedById) ?? [];
        list.push(verdict);
        result.set(verdict.assignedById, list);
    }
    return result;
};

const collectUserNames = (
    departments: readonly IBXDepartment[],
): Map<number, string> => {
    const names = new Map<number, string>();
    for (const department of departments) {
        for (const user of department.USERS ?? []) {
            const id = Number(user?.ID);
            if (!Number.isFinite(id) || id <= 0 || names.has(id)) continue;
            const name = [user.LAST_NAME, user.NAME]
                .filter(Boolean)
                .join(' ')
                .trim();
            names.set(id, name || `ID ${id}`);
        }
    }
    return names;
};
