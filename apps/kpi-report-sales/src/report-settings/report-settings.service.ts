import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import {
    EReportFilterDateMode,
    REPORT_FILTER_VERSION,
    ReportFilterDatesDto,
    SavedReportFilterDto,
} from './dto/report-filter.dto';

/** Пресеты дат, которые старый фронт писал в колонку dates вместо ISO-дат. */
const LEGACY_DATE_MODES: string[] = [
    EReportFilterDateMode.today,
    EReportFilterDateMode.week,
    EReportFilterDateMode.month,
];

/**
 * Настройки/фильтры KPI-отчёта поверх той же таблицы report_settings,
 * что и legacy Laravel online API (логический ключ portalId + bxUserId).
 *
 * Формат v2 живёт в свободной колонке filters; legacy-колонки
 * (filter=actions, department=userIds, dates) зеркалируются при каждом
 * сохранении, поэтому старый флоу через online API продолжает работать —
 * это и есть путь отката.
 */
@Injectable()
export class ReportSettingsService {
    constructor(private readonly prisma: PrismaService) {}

    async getFilter(
        domain: string,
        userId: number,
    ): Promise<SavedReportFilterDto | null> {
        const settings = await this.findSettings(domain, userId);
        if (!settings) {
            return null;
        }

        const v2 = this.parseJson<SavedReportFilterDto>(settings.filters);
        if (v2 && v2.version === REPORT_FILTER_VERSION) {
            return v2;
        }

        return this.fromLegacyColumns(
            settings.filter,
            settings.department,
            settings.dates,
        );
    }

    async saveFilter(
        domain: string,
        userId: number,
        filter: SavedReportFilterDto,
    ): Promise<void> {
        const portal = await this.findPortal(domain);
        const stored: SavedReportFilterDto = {
            ...filter,
            version: REPORT_FILTER_VERSION,
        };

        const data = {
            domain,
            portalId: Number(portal.id),
            bxUserId: userId,
            filters: JSON.stringify(stored),
            // Зеркало для legacy online API (см. комментарий класса).
            filter: JSON.stringify(stored.actions),
            department: JSON.stringify(
                (stored.legacyUserIds ?? []).map(String),
            ),
            dates: JSON.stringify(this.toLegacyDates(stored.dates)),
        };

        const existing = await this.prisma.report_settings.findFirst({
            where: { portalId: Number(portal.id), bxUserId: userId },
        });
        if (existing) {
            await this.prisma.report_settings.update({
                where: { id: existing.id },
                data,
            });
        } else {
            await this.prisma.report_settings.create({ data });
        }
    }

    /**
     * Аварийный сброс сохранённого фильтра пользователя: v2 (filters) и
     * legacy-зеркало (filter/department/dates) → NULL, отчёт вернётся к
     * дефолтному периоду. Кейс: сохранён неподъёмный период — отчёт не
     * догружается, а сменить фильтр из зависшего UI нельзя. Колонка
     * `other` (ui-настройки, конфиг планов) не трогается.
     */
    async resetFilter(domain: string, userId: number): Promise<boolean> {
        const portal = await this.findPortal(domain);
        const existing = await this.prisma.report_settings.findFirst({
            where: { portalId: Number(portal.id), bxUserId: userId },
        });
        if (!existing) return false;
        await this.prisma.report_settings.update({
            where: { id: existing.id },
            data: {
                filters: null,
                filter: null,
                department: null,
                dates: null,
            },
        });
        return true;
    }

    /**
     * UI-настройки фронта (конверсии, блоки, локальные фильтры) —
     * непрозрачный блоб в свободной колонке `other` (без миграции);
     * envelope с версией и updatedAt позволяет менять формат без миграций.
     */
    async getUiSettings(
        domain: string,
        userId: number,
    ): Promise<{ settings: string | null; updatedAt: string | null }> {
        const settings = await this.findSettings(domain, userId);
        const envelope = this.parseJson<{
            version: number;
            updatedAt: string;
            settings: string;
        }>(settings?.other);
        if (!envelope || typeof envelope.settings !== 'string') {
            return { settings: null, updatedAt: null };
        }
        return {
            settings: envelope.settings,
            updatedAt: envelope.updatedAt ?? null,
        };
    }

    async saveUiSettings(
        domain: string,
        userId: number,
        settingsBlob: string,
    ): Promise<void> {
        const portal = await this.findPortal(domain);
        const other = JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            settings: settingsBlob,
        });

        const existing = await this.prisma.report_settings.findFirst({
            where: { portalId: Number(portal.id), bxUserId: userId },
        });
        if (existing) {
            await this.prisma.report_settings.update({
                where: { id: existing.id },
                data: { other },
            });
        } else {
            await this.prisma.report_settings.create({
                data: {
                    domain,
                    portalId: Number(portal.id),
                    bxUserId: userId,
                    other,
                },
            });
        }
    }

    private async findPortal(domain: string) {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
        });
        if (!portal) {
            throw new NotFoundException(`Портал ${domain} не найден`);
        }
        return portal;
    }

    private async findSettings(domain: string, userId: number) {
        const portal = await this.findPortal(domain);
        return this.prisma.report_settings.findFirst({
            where: { portalId: Number(portal.id), bxUserId: userId },
        });
    }

    /** Запись, сохранённая ещё старым фронтом через Laravel: version=1. */
    private fromLegacyColumns(
        filter: string | null,
        department: string | null,
        dates: string | null,
    ): SavedReportFilterDto | null {
        const actions = this.parseJson<string[]>(filter);
        const userIds = this.parseJson<(string | number)[]>(department);
        const legacyDates = this.parseJson<{ from?: string; to?: string }>(
            dates,
        );
        if (!actions && !userIds && !legacyDates) {
            return null;
        }

        return {
            version: 1,
            actions: Array.isArray(actions) ? actions : [],
            dates: this.fromLegacyDates(legacyDates),
            selection: null,
            legacyUserIds: Array.isArray(userIds)
                ? userIds
                      .map(Number)
                      .filter(id => Number.isFinite(id) && id > 0)
                : null,
        };
    }

    /** Старый формат: пресет дублировался в from и to вместо ISO-дат. */
    private fromLegacyDates(
        legacy: {
            from?: string;
            to?: string;
        } | null,
    ): ReportFilterDatesDto {
        const from = legacy?.from;
        if (from && LEGACY_DATE_MODES.includes(from)) {
            return { mode: from as EReportFilterDateMode };
        }
        if (legacy?.from || legacy?.to) {
            return {
                mode: EReportFilterDateMode.custom,
                from: legacy.from ?? null,
                to: legacy.to ?? null,
            };
        }
        return { mode: EReportFilterDateMode.month };
    }

    private toLegacyDates(dates: ReportFilterDatesDto): {
        from: string;
        to: string;
    } {
        if (dates.mode !== EReportFilterDateMode.custom) {
            return { from: dates.mode, to: dates.mode };
        }
        return { from: dates.from ?? '', to: dates.to ?? '' };
    }

    private parseJson<T>(value: string | null | undefined): T | null {
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value) as T;
        } catch {
            return null;
        }
    }
}
