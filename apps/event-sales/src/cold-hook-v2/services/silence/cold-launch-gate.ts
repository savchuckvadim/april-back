import { Logger } from '@nestjs/common';
import {
    decideXoLaunch,
    XoLaunchRef,
    XoLaunchRegistry,
    xoLaunchEntityKey,
} from '../../../shared/xo-dispatch/launch/xo-launch.rule';
import { IColdCallData } from '../../type/cold-hook-silence.interface';
import { ColdTarget } from '../target/cold-target.types';

/** Цели окна после проверки запусков. */
export interface ColdLaunchSplit {
    /** Работать как обычно. */
    proceed: ColdTarget[];
    /** Повторный запуск, пока выполнялся предыдущий: объяснить в карточке. */
    repeated: ColdTarget[];
    /** То же окно доставлено второй раз: пропустить молча. */
    redelivered: ColdTarget[];
}

/**
 * Клиент для правила «выигрывает первый» — компания; без компании —
 * основная сделка, а без неё — сделка запуска. Так запуск из компании и
 * запуск из её сделки опознаются как один клиент.
 */
export const coldClientKey = (target: ColdTarget): string => {
    if (target.companyId) return xoLaunchEntityKey('company', target.companyId);
    const dealId =
        target.rootDealId ??
        Number(target.entryDeal?.ID ?? target.hook.entityId);
    return xoLaunchEntityKey('deal', dealId);
};

/**
 * Привратник окна холодного старта: какие цели выполнять, какие — повторы.
 *
 * Не @Injectable: живёт одно окно и знает его портал (как остальные сервисы
 * обработчика). Реестр приходит снаружи — для тестов его легко подменить.
 */
export class ColdLaunchGate {
    private readonly logger = new Logger(ColdLaunchGate.name);

    constructor(
        private readonly registry: XoLaunchRegistry,
        private readonly domain: string,
    ) {}

    async split(targets: readonly ColdTarget[]): Promise<ColdLaunchSplit> {
        const keys = [
            ...new Set(
                targets.filter(t => t.hook.launch).map(t => coldClientKey(t)),
            ),
        ];
        const lastDone = await this.registry.lastDone(this.domain, keys);
        const result: ColdLaunchSplit = {
            proceed: [],
            repeated: [],
            redelivered: [],
        };
        for (const target of targets) {
            const verdict = decideXoLaunch(
                target.hook.launch,
                lastDone.get(coldClientKey(target)) ?? null,
            );
            if (verdict === 'repeat') result.repeated.push(target);
            else if (verdict === 'redelivered') result.redelivered.push(target);
            else result.proceed.push(target);
        }
        if (result.repeated.length || result.redelivered.length) {
            this.logger.warn(
                `[launch] ${this.domain}: повторных запусков ${result.repeated.length} ` +
                    `(${result.repeated.map(t => coldClientKey(t)).join(', ')}), ` +
                    `повторных доставок ${result.redelivered.length} — не выполняются`,
            );
        }
        return result;
    }

    /** Запуски, создавшие работу или уступившие чужой, — завершены. */
    async markDone(
        targets: readonly ColdTarget[],
        finishedAt = Date.now(),
    ): Promise<void> {
        const items = targets.flatMap(target =>
            target.hook.launch
                ? [
                      {
                          clientKey: coldClientKey(target),
                          launch: target.hook.launch,
                      },
                  ]
                : [],
        );
        await this.registry.markDone(this.domain, items, finishedAt);
    }

    /** Все хуки окна больше не ждут обработки — и выполненные, и пропущенные. */
    async clearPending(hooks: Record<string, IColdCallData>): Promise<void> {
        const refs: XoLaunchRef[] = Object.values(hooks).flatMap(hook =>
            hook.launch
                ? [
                      {
                          entityKey: xoLaunchEntityKey(
                              hook.entityType,
                              hook.entityId,
                          ),
                          launchId: hook.launch.id,
                      },
                  ]
                : [],
        );
        await this.registry.clearPending(this.domain, refs);
    }
}
