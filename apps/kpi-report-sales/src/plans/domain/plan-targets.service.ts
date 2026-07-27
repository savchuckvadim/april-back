/**
 * Чтение/запись значений планов из Bitrix user-полей сотрудников
 * (UF_USR_A_SALES_PLAN_*). Значение null/пусто — план не задан.
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix
 * из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 */
import { BitrixService } from '@/modules/bitrix';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    PLAN_INDICATORS,
    PlanIndicatorCode,
    planIndicatorUfName,
} from '../constants/plan-indicators.const';
import {
    PlanTargetSaveItemDto,
    PlanUserTargetsDto,
} from '../dto/plan-targets.dto';

/** Ключ поля Bitrix (ID юзера приходит строкой). */
const USER_ID_KEY = 'ID';

export class PlanTargetsService {
    constructor(private readonly bitrix: BitrixService) {}

    /** Планы сотрудников: одно user.get со всеми плановыми UF-полями. */
    async getTargets(userIds: number[]): Promise<PlanUserTargetsDto[]> {
        const ids = [...new Set(userIds.filter(id => id > 0))];
        if (!ids.length) return [];

        const ufNames = PLAN_INDICATORS.map(indicator =>
            planIndicatorUfName(indicator.code),
        );
        const { result } = await this.bitrix.user.get(
            { [`=${USER_ID_KEY}`]: ids.map(String) } as Partial<IBXUser>,
            [USER_ID_KEY, ...ufNames],
        );
        const users = (result ?? []) as unknown as Record<string, unknown>[];
        const byId = new Map<number, Record<string, unknown>>(
            users.map(user => [Number(user[USER_ID_KEY]), user]),
        );

        return ids.map(userId => ({
            userId,
            values: PLAN_INDICATORS.map(indicator => ({
                code: indicator.code,
                value: this.parseValue(
                    byId.get(userId)?.[planIndicatorUfName(indicator.code)],
                ),
            })),
        }));
    }

    /**
     * Запись планов: изменения группируются по сотруднику — один
     * user.update на сотрудника (batch). Возвращает число обновлённых.
     */
    async saveTargets(items: PlanTargetSaveItemDto[]): Promise<number> {
        const byUser = new Map<number, Map<PlanIndicatorCode, number | null>>();
        for (const item of items) {
            const fields =
                byUser.get(item.userId) ??
                new Map<PlanIndicatorCode, number | null>();
            fields.set(item.code, item.value ?? null);
            byUser.set(item.userId, fields);
        }
        if (!byUser.size) return 0;

        for (const [userId, fields] of byUser) {
            const data: Record<string, unknown> = {};
            for (const [code, value] of fields) {
                // Пустая строка стирает значение UF-поля в Bitrix.
                data[planIndicatorUfName(code)] = value === null ? '' : value;
            }
            this.bitrix.batch.user.update(
                `plan_targets_${userId}`,
                userId,
                data as Partial<IBXUser>,
            );
        }
        await this.bitrix.api.callBatchWithConcurrency(1);
        return byUser.size;
    }

    /** UF-значение Bitrix → число плана; пусто/не число → null. */
    private parseValue(raw: unknown): number | null {
        if (raw === null || raw === undefined || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }
}
