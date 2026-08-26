import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';

type BxRow = Record<string, unknown>;

/**
 * Кому назначать реанимационный звонок.
 *
 * `same` — ответственному сделки (история клиента у него).
 * `random` — случайному АКТИВНОМУ сотруднику отдела продаж из слепка портала
 * (`portal.departament`, group=sales); отдел пуст/не настроен — честный
 * фолбэк на `same` с warning: реанимация не должна молчать из-за кадровой
 * настройки.
 *
 * НЕ @Injectable: создаётся `new` с bitrix конкретного портала (CLAUDE.md).
 */
export class RejectReviveResponsibleResolver {
    private readonly logger = new Logger(RejectReviveResponsibleResolver.name);
    /** Кэш кандидатов на прогон: отдел один, дёргать user.get на сделку — расточительно. */
    private candidates: number[] | null = null;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async resolve(
        mode: 'same' | 'random',
        assignedById: number,
        warnings: string[],
    ): Promise<number> {
        if (mode !== 'random') return assignedById;

        const pool = await this.loadCandidates(warnings);
        if (!pool.length) return assignedById;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private async loadCandidates(warnings: string[]): Promise<number[]> {
        if (this.candidates) return this.candidates;
        this.candidates = [];

        const departament = this.portal.getDepartamentIdByCode(
            EDepartamentGroup.sales,
        );
        if (!departament?.bitrixId) {
            warnings.push(
                'random-режим: отдел продаж не настроен в слепке портала — фолбэк на того же ответственного',
            );
            return this.candidates;
        }

        try {
            const response = await this.bitrix.user.get({
                ACTIVE: true,
                UF_DEPARTMENT: departament.bitrixId,
            } as never);
            const rows = (response?.result ?? []) as BxRow[];
            this.candidates = rows
                .map(row => Number(row.ID))
                .filter(id => Number.isFinite(id) && id > 0);
            if (!this.candidates.length) {
                warnings.push(
                    `random-режим: в отделе ${departament.bitrixId} нет активных сотрудников — фолбэк на того же`,
                );
            }
        } catch (error) {
            warnings.push(
                `random-режим: user.get упал (${(error as Error).message}) — фолбэк на того же`,
            );
        }
        return this.candidates;
    }
}
