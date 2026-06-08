import dayjs, { Dayjs } from 'dayjs';
import { Logger } from '@nestjs/common';
import { ETimeZone } from './timezone';
import { parsePortalInput } from './parse-portal-input';

const logger = new Logger('PortalDeadline');

const TASK_SERVER_TIMEZONE: ETimeZone = ETimeZone.EUROPE_MOSCOW;
const TASK_DEADLINE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/**
 * Объект-значение дедлайна события (холодный звонок и т.п.).
 *
 * Зачем: сырой `deadline` из hook/фронта приходит БЕЗ таймзоны (например
 * `01.07.2026 02:14:00`) и трактуется как локальное время портала. Раньше
 * каждый потребитель заново парсил строку (а `EventEntityModel` вообще писал
 * её сырой), из-за чего на не-московских порталах время разъезжалось.
 *
 * Здесь парсим один раз как локальное время портала → храним абсолютный момент,
 * и отдаём целевые форматы: task DEADLINE (server-time Москва), CRM datetime
 * (локаль портала), человекочитаемую строку. TZ портала всегда берётся из
 * {@link PortalModel.getTimezone}.
 */
export class PortalDeadline {
    private constructor(
        private readonly instant: Dayjs,
        private readonly portalTz: ETimeZone,
        private readonly rawInput: string,
    ) {}

    /**
     * Создаёт дедлайн из сырого ввода hook/фронта, трактуя его как локальное
     * время портала.
     *
     * @throws Error если строка не парсится (см. parsePortalInput).
     */
    static fromPortalInput(raw: string, portalTz: ETimeZone): PortalDeadline {
        const deadline = new PortalDeadline(
            parsePortalInput(raw, portalTz),
            portalTz,
            raw,
        );
        logger.debug(
            `[DEADLINE][create] fromPortalInput raw="${raw}" portalTz=${portalTz} ` +
                `→ ${JSON.stringify(deadline.debug())}`,
        );
        return deadline;
    }

    /**
     * Все представления дедлайна для диагностики TZ-преобразований.
     * Удобно логировать одним объектом на каждом шаге потока.
     */
    debug(): {
        rawInput: string;
        portalTz: ETimeZone;
        instantUtc: string;
        taskDeadlineMoscow: string;
        crmDateTimePortal: string;
        ruHuman: string;
    } {
        return {
            rawInput: this.rawInput,
            portalTz: this.portalTz,
            instantUtc: this.instant.toISOString(),
            taskDeadlineMoscow: this.toTaskDeadline(),
            crmDateTimePortal: this.toCrmDateTime(),
            ruHuman: this.toRuHuman(),
        };
    }

    /**
     * DEADLINE для `tasks.task.add` / `tasks.task.update`.
     * Bitrix API задач хранит DEADLINE в server-time (Europe/Moscow).
     * Формат `YYYY-MM-DD HH:mm:ss`.
     */
    toTaskDeadline(): string {
        const taskDeadline = this.instant
            .tz(TASK_SERVER_TIMEZONE)
            .format(TASK_DEADLINE_FORMAT);
        logger.debug(
            `[DEADLINE][toTaskDeadline] instant(UTC)="${this.instant.toISOString()}" ` +
                `→ Москва(${TASK_SERVER_TIMEZONE})="${taskDeadline}" ` +
                `(формат для tasks.task.add — server-time Москва)`,
        );
        return taskDeadline;
    }

    /**
     * Значение для CRM datetime-полей (UF_CRM_*) сущностей/сделок/смартов.
     * Bitrix хранит их как локальное время портала — оставляем TZ портала.
     * Формат `DD.MM.YYYY HH:mm:ss`.
     */
    toCrmDateTime(): string {
        const crmDateTime = this.instant
            .tz(this.portalTz)
            .format(CRM_DATETIME_FORMAT);
        logger.debug(
            `[DEADLINE][toCrmDateTime] instant(UTC)="${this.instant.toISOString()}" ` +
                `→ локаль портала(${this.portalTz})="${crmDateTime}" ` +
                `(формат для CRM UF-полей)`,
        );
        return crmDateTime;
    }

    /**
     * Человекочитаемая строка «26 мая 2026» (без «г.») в TZ портала.
     * Используется в заголовках/комментариях.
     */
    toRuHuman(): string {
        const formatted = new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: this.portalTz,
        }).format(this.instant.toDate());
        return formatted.replace(/\s*г\.?\s*$/u, '').trim();
    }

    /** Копия абсолютного момента, если нужен нестандартный формат. */
    toDayjs(): Dayjs {
        return this.instant.clone();
    }

    /** TZ портала, в которой был интерпретирован дедлайн. */
    getPortalTimezone(): ETimeZone {
        return this.portalTz;
    }
}

/**
 * «Сейчас» в формате CRM datetime (`DD.MM.YYYY HH:mm:ss`) в TZ портала.
 * Вынесено сюда, чтобы «текущее время» и дедлайн считались в одной TZ.
 */
export function nowCrmDateTime(portalTz: ETimeZone): string {
    return dayjs().tz(portalTz).format(CRM_DATETIME_FORMAT);
}
