import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixService } from '@/modules/bitrix';
import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '@lib/bx-department';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ETimeZone } from '@lib/shared/lib/date';
import { buildDealAuditDigest } from '../lib/deal-audit-digest.formatter';
import { buildHeadsByUser } from '../lib/deal-audit-heads';
import { departmentScopeOf } from '../lib/deal-audit-department-scope';
import { DealAuditDigestChannels } from '../lib/deal-audit-digest-channels';
import { DealAuditVerdict } from '../types/deal-audit.types';
import { isForgotten } from '../lib/deal-audit-rules';
import { hasDigestRecipients } from '../lib/deal-audit-run-mode';
import { DealAuditDigestTask } from './deal-audit-digest-task';

/** Тег уведомления: новая сводка ЗАМЕЩАЕТ вчерашнюю, а не копится. */
const DIGEST_TAG = 'event-sales-deal-audit';

/** Кому и сколько рассылать — уже разобранные настройки портала. */
export interface DealAuditDigestOptions {
    readonly toManager: boolean;
    readonly toHead: boolean;
    /** Получатели ОБЩЕЙ сводки по всем отделам (Bitrix ID). */
    readonly userIds: readonly number[];
    /** Получатели сводки по своему отделу и подотделам (Bitrix ID). */
    readonly departmentUserIds: readonly number[];
    /** Чьи забытые сделки не попадают ни в одну сводку (Bitrix ID). */
    readonly excludeUserIds: readonly number[];
    readonly limit: number;
    /** Чем доставлять: уведомление портала, личное сообщение, задача. */
    readonly channels: DealAuditDigestChannels;
}

/** Собранная сводка одного получателя. */
interface Digest {
    readonly heading: string;
    /** Сколько забытых сделок в сводке (до обрезки по лимиту). */
    readonly count: number;
    readonly text: string;
}

/**
 * Рассылка сводок по забытым сделкам.
 *
 * Три независимых адресата (владелец, 15.09.2026): сам менеджер, его РОП
 * и общий список «по всем отделам». Каждый включается отдельно — на
 * обкатке сводку обычно хотят видеть только руководители.
 *
 * Канал доставки — настройка (владелец, 09.11.2026): уведомление портала
 * теряется в колокольчике, поэтому сводку можно ставить задачей и/или
 * слать личным сообщением, как это делал легаси deals-order.
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

    /** Отправляет сводки; возвращает число получателей, до которых дошло. */
    async send(
        domain: string,
        verdicts: readonly DealAuditVerdict[],
        options: DealAuditDigestOptions,
        warnings: string[],
    ): Promise<number> {
        // Исключённые (тестовые, руководство) не попадают ни в одну сводку.
        const excluded = new Set(options.excludeUserIds);
        const forgotten = verdicts.filter(
            verdict =>
                isForgotten(verdict) &&
                !(verdict.assignedById && excluded.has(verdict.assignedById)),
        );
        if (!forgotten.length) return 0;
        if (!hasDigestRecipients(options)) return 0;

        const byManager = groupByManager(forgotten);
        const structure = await this.loadDepartments(domain, warnings);
        const userNames = collectUserNames(structure);
        const digests = new Map<number, Digest>();

        if (options.toManager) {
            for (const [managerId, list] of byManager) {
                this.collect(digests, managerId, {
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
                this.collect(digests, headId, {
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

        this.collectByDepartment(digests, structure, forgotten, {
            domain,
            options,
            userNames,
            warnings,
        });

        for (const userId of options.userIds) {
            this.collect(digests, userId, {
                domain,
                heading: 'Забытые сделки: сводка по всем отделам',
                verdicts: forgotten,
                limit: options.limit,
                userNames,
            });
        }

        return this.deliver(domain, digests, options.channels, warnings);
    }

    /**
     * Сводка «по своему отделу»: каждому получателю — забытые сделки
     * сотрудников его отдела и подотделов ({@link departmentScopeOf}).
     */
    private collectByDepartment(
        digests: Map<number, Digest>,
        structure: readonly IBXDepartment[],
        forgotten: readonly DealAuditVerdict[],
        input: {
            domain: string;
            options: DealAuditDigestOptions;
            userNames: ReadonlyMap<number, string>;
            warnings: string[];
        },
    ): void {
        const { domain, options, userNames, warnings } = input;
        if (!options.departmentUserIds.length) return;
        if (!structure.length) {
            warnings.push(
                'структура отдела продаж не прочитана — сводка по своему отделу не отправлена',
            );
            return;
        }
        for (const userId of options.departmentUserIds) {
            const scope = departmentScopeOf(structure, userId);
            this.collect(digests, userId, {
                domain,
                heading: 'Забытые сделки вашего отдела',
                verdicts: forgotten.filter(
                    verdict =>
                        !!verdict.assignedById &&
                        scope.has(verdict.assignedById),
                ),
                limit: options.limit,
                userNames,
            });
        }
    }

    /**
     * Сводка копится в одну карту по получателю: РОП, который сам ведёт
     * сделки и стоит в общем списке, получит ОДНУ сводку, а не три —
     * приоритет у более широкой (она добавляется позже).
     */
    private collect(
        digests: Map<number, Digest>,
        userId: number,
        input: Parameters<typeof buildDealAuditDigest>[0],
    ): void {
        if (!userId) return;
        const text = buildDealAuditDigest(input);
        if (text) {
            digests.set(userId, {
                heading: input.heading,
                count: input.verdicts.length,
                text,
            });
        }
    }

    /**
     * Доставка по включённым каналам. Получатель считается охваченным,
     * если дошёл хотя бы один канал; сбой канала — предупреждение, другие
     * каналы и получатели не страдают.
     */
    private async deliver(
        domain: string,
        digests: ReadonlyMap<number, Digest>,
        channels: DealAuditDigestChannels,
        warnings: string[],
    ): Promise<number> {
        if (!digests.size) return 0;
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const tasks = channels.task
            ? new DealAuditDigestTask(bitrix, PortalModel.getTimezone())
            : null;
        let reached = 0;
        for (const [userId, digest] of digests) {
            const outcomes = await Promise.all([
                channels.notify
                    ? this.notify(bitrix, userId, digest, warnings)
                    : false,
                channels.message
                    ? this.message(bitrix, userId, digest, warnings)
                    : false,
                tasks
                    ? (await tasks.replace(userId, digest, warnings)) !== null
                    : false,
            ]);
            if (outcomes.some(Boolean)) reached += 1;
        }
        this.logger.log(
            `[deal-audit] ${domain}: сводок доставлено ${reached} из ${digests.size} ` +
                `(каналы: ${describeChannels(channels)})`,
        );
        return reached;
    }

    private async notify(
        bitrix: BitrixService,
        userId: number,
        digest: Digest,
        warnings: string[],
    ): Promise<boolean> {
        try {
            await bitrix.imNotify.systemAdd({
                USER_ID: userId,
                MESSAGE: digest.text,
                TAG: DIGEST_TAG,
            });
            return true;
        } catch (error) {
            warnings.push(
                `уведомление сотруднику ${userId} не отправлено: ${(error as Error).message}`,
            );
            return false;
        }
    }

    /** Личное сообщение от имени интеграции — как слал легаси deals-order. */
    private async message(
        bitrix: BitrixService,
        userId: number,
        digest: Digest,
        warnings: string[],
    ): Promise<boolean> {
        try {
            await bitrix.message.add({
                DIALOG_ID: String(userId),
                MESSAGE: digest.text,
                SYSTEM: 'N',
                // Двадцать ссылок на карточки — двадцать превью; текста хватает.
                URL_PREVIEW: 'N',
            });
            return true;
        } catch (error) {
            warnings.push(
                `сообщение сотруднику ${userId} не отправлено: ${(error as Error).message}`,
            );
            return false;
        }
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

const describeChannels = (channels: DealAuditDigestChannels): string =>
    [
        channels.notify ? 'уведомление' : null,
        channels.message ? 'сообщение' : null,
        channels.task ? 'задача' : null,
    ]
        .filter(Boolean)
        .join(', ') || 'нет';

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

// ETimeZone нужен только типу DealAuditDigestTask; импорт оставлен явным,
// чтобы замена часового пояса портала не прошла мимо этого файла.
export type DealAuditDigestTimezone = ETimeZone;
