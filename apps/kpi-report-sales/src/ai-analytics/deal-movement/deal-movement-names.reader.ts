import { Injectable, Logger } from '@nestjs/common';
import { BxDepartmentStructureService } from '@lib/bx-department';
import type { BxSalesDepartmentDto } from '@lib/bx-department/dto/bx-department-structure.dto';
import type { BXUserDto } from '@lib/bx-department/dto/bx-user.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { normalizeUserId } from '../domain/access/perimeter.util';

/** Структура читается без привязки к пользователю: ростер от него не зависит. */
const ROSTER_PROBE_USER_ID = 0;

const nameOf = (user: BXUserDto): string | null => {
    const name = [user.LAST_NAME, user.NAME]
        .map(part => (part ?? '').trim())
        .filter(Boolean)
        .join(' ');
    return name || null;
};

/** Отделы продаж → Bitrix-id → «Фамилия Имя» (сотрудники и группы). */
export function managerNamesOf(
    salesDepartments: readonly BxSalesDepartmentDto[],
): Record<string, string> {
    const names: Record<string, string> = {};
    for (const sales of salesDepartments) {
        const users = [
            ...(sales.allUsers ?? []),
            ...(sales.groups ?? []).flatMap(group => group.USERS ?? []),
        ];
        for (const user of users) {
            const id = normalizeUserId(user.ID);
            const name = nameOf(user);
            if (id !== null && name !== null) names[id] = name;
        }
    }
    return names;
}

/**
 * Имена менеджеров витрины «Движение сделок» — из структуры отделов
 * продаж (та же структура, по которой считается периметр, она в кэше).
 * Своих запросов в Битрикс витрина не делает; структура не прочиталась —
 * имён нет, фронт показывает «#id».
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementNamesReader {
    private readonly logger = new Logger(DealMovementNamesReader.name);

    constructor(private readonly structure: BxDepartmentStructureService) {}

    async names(domain: string): Promise<Record<string, string>> {
        try {
            const { salesDepartments } = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                ROSTER_PROBE_USER_ID,
            );
            return managerNamesOf(salesDepartments ?? []);
        } catch (error) {
            this.logger.warn(
                `Имена менеджеров ${domain} для движения сделок не прочитаны: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
