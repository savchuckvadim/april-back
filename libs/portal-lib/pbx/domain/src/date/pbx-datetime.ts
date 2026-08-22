import { Dayjs } from 'dayjs';
import {
    BitrixDateTime,
    ETimeZone,
    nowCrmDateTime,
} from '@lib/shared/lib/date';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * PBX-обёртка над {@link BitrixDateTime}: та же семантика, но таймзона
 * берётся из портала сама.
 *
 * Зачем: `BitrixDateTime` о портале не знает принципиально (TZ — параметр),
 * из-за чего каждый вызывающий писал `portal.getTimezone()` руками, а чаще —
 * вообще обходил класс и звал `dayjs(...).tz(...).format('DD.MM.YYYY HH:mm:ss')`,
 * дублируя формат поля Bitrix по всему коду. Здесь TZ подставляется один раз.
 *
 * Использование (сервис НЕ @Injectable либо создаётся per-request — правило
 * из CLAUDE.md про инстанс портала):
 *
 * ```ts
 * const dt = new PBXDateTime(portal);
 * fields.UF_CRM_EVENT_DATE = dt.crmDateTime(ctx.nowDate);
 * task.DEADLINE = dt.taskDeadline(dto.plan.deadline);
 * ```
 */
export class PBXDateTime {
    constructor(private readonly portal: PortalModel) {}

    /** Таймзона портала, в которой трактуются все значения. */
    get timezone(): ETimeZone {
        return this.portal.getTimezone();
    }

    /**
     * Значение из сырого ввода hook/фронта (`01.07.2026 02:14:00`, ISO и др.)
     * — трактуется как локальное время портала.
     *
     * @throws Error если строка не парсится.
     */
    fromInput(raw: string): BitrixDateTime {
        return BitrixDateTime.fromPortalInput(raw, this.timezone);
    }

    /** Значение из уже абсолютного момента (`Date` из БД, `ctx.nowDate`). */
    fromInstant(date: Date | Dayjs): BitrixDateTime {
        return BitrixDateTime.fromInstant(date, this.timezone);
    }

    /** «Сейчас» как значение. */
    now(): BitrixDateTime {
        return BitrixDateTime.now(this.timezone);
    }

    /**
     * Момент → строка CRM datetime-поля (`DD.MM.YYYY HH:mm:ss` в TZ портала).
     * Принимает и сырой ввод, и `Date`.
     */
    crmDateTime(value: Date | Dayjs | string): string {
        return this.valueOf(value).toCrmDateTime();
    }

    /** «Сейчас» в формате CRM datetime-поля. */
    nowCrmDateTime(): string {
        return nowCrmDateTime(this.timezone);
    }

    /** Момент → DEADLINE задачи (`YYYY-MM-DD HH:mm:ss`, server-time Москва). */
    taskDeadline(value: Date | Dayjs | string): string {
        return this.valueOf(value).toTaskDeadline();
    }

    /** Момент → «26 мая 2026» в TZ портала. */
    ruHuman(value: Date | Dayjs | string): string {
        return this.valueOf(value).toRuHuman();
    }

    /** Момент → «28 мая 14:30» в TZ портала. */
    ruHumanDateTime(value: Date | Dayjs | string): string {
        return this.valueOf(value).toRuHumanDateTime();
    }

    /**
     * Строка трактуется как локальное время портала, `Date`/`Dayjs` — как
     * готовый абсолютный момент. Разница принципиальная, поэтому один вход.
     */
    private valueOf(value: Date | Dayjs | string): BitrixDateTime {
        return typeof value === 'string'
            ? this.fromInput(value)
            : this.fromInstant(value);
    }
}
