import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    fallbackWorkingHours,
    isWithinWorkingHours,
    PortalWorkingHours,
    toPortalWorkingHours,
} from './working-hours.model';

/** Сколько держим график портала в памяти: настройка меняется раз в годы. */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
    hours: PortalWorkingHours;
    expiresAt: number;
}

/**
 * Производственный календарь портала для КРОНОВ: «можно ли сейчас
 * тревожить клиента».
 *
 * Зачем: реанимация отказников, дожим заявок и перераспределение работают
 * по расписанию, но звонят живым людям — ставить задачу на 3 часа ночи или
 * 1 января бессмысленно. График берём ОТТУДА, ГДЕ ЕГО И ТАК ВЕДЁТ КЛИЕНТ
 * (`calendar.settings.get`), чтобы он не разъезжался с портальным
 * календарём и не требовал отдельной настройки в админке.
 *
 * Нет scope `calendar`, коробка без модуля, сбой — не падаем и не работаем
 * круглосуточно, а деградируем на консервативный дефолт (пн–пт 9–18,
 * праздники РФ): ошибиться лучше в сторону «промолчали».
 *
 * @Injectable, но инстанс Битрикса в поля НЕ кладём — только PBXService,
 * который отдаёт клиента по домену (CLAUDE.md: иначе race condition между
 * порталами).
 */
@Injectable()
export class PortalWorkingHoursService {
    private readonly logger = new Logger(PortalWorkingHoursService.name);
    private readonly cache = new Map<string, CacheEntry>();

    constructor(private readonly pbx: PBXService) {}

    /** Рабочее ли сейчас время на портале; ошибка чтения → дефолтный график. */
    async isWorkingTime(
        domain: string,
        at: Date = new Date(),
    ): Promise<boolean> {
        const { hours, timezone } = await this.resolve(domain);
        return isWithinWorkingHours(hours, at, timezone);
    }

    /** График портала (с кэшем) и его таймзона. */
    async resolve(domain: string): Promise<{
        hours: PortalWorkingHours;
        timezone: ETimeZone;
    }> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const timezone = portal.getTimezone();

        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) {
            return { hours: cached.hours, timezone };
        }

        const result = await bitrix.calendar.settingsGetSafe();
        const hours = result.ok
            ? toPortalWorkingHours(result.settings)
            : fallbackWorkingHours();

        if (!result.ok) {
            /*
             * Один сигнал на домен в час (дальше отдаём из кэша) — и он
             * уходит в телеграм, а не только в лог: молча работать по
             * чужому графику хуже, чем разбудить. Причина важна для того,
             * кто чинит: 'access-denied' лечится выдачей scope calendar,
             * 'method-not-found' не лечится вовсе (коробка без модуля
             * календаря) и означает «дефолт здесь навсегда».
             */
            this.logger.warn(
                `[working-hours] ${domain}: календарь портала не прочитан ` +
                    `(${result.reason}) — кроны работают по дефолтному ` +
                    `графику пн–пт ${hours.startHour}–${hours.endHour}`,
                { telegram: true, domain, reason: result.reason },
            );
        }

        this.cache.set(domain, { hours, expiresAt: Date.now() + CACHE_TTL_MS });
        return { hours, timezone };
    }

    /** Сброс кэша (админка меняет график портала → следующий тик читает заново). */
    invalidate(domain?: string): void {
        if (domain) this.cache.delete(domain);
        else this.cache.clear();
    }
}
