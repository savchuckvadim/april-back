import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { Prisma, PortalAiSettings } from 'generated/prisma';
import { PortalAiSettingsRepository } from './portal-ai-settings.repository';
import {
    PRESENTATION_STRICTNESS_LEVELS,
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
    PortalAiSettingsWithDomain,
    PresentationStrictnessLevel,
} from './portal-ai-settings.types';

/** Поля, которые редактируются снаружи (lastScanAt пишет только планировщик). */
const EDITABLE_FIELDS = [
    'enabled',
    'deepAnalysisEnabled',
    'createSmartEnabled',
    'classifyEnabled',
    'salesOnly',
    'minDurationSec',
    'windowHours',
    'maxPerRun',
    'staleMinutes',
    'llmModel',
    'deepAnalysisModel',
    'scanIntervalMinutes',
    'nightScanIntervalMinutes',
    'nightStartHour',
    'nightEndHour',
] as const satisfies readonly (keyof PortalAiSettingsUpdate)[];

/**
 * Только настроечные колонки, без ключей строки и служебных дат. Отдельный
 * тип нужен потому, что Prisma-типы Create и Update несовместимы: Update
 * допускает операции вида { increment }, и такой объект нельзя спредить в
 * create. Этот же набор подходит обоим.
 */
type PortalAiSettingsColumns = Omit<
    Prisma.PortalAiSettingsUncheckedCreateInput,
    'id' | 'portal_id' | 'domain' | 'createdAt' | 'updatedAt' | 'lastScanAt'
>;

@Injectable()
export class PortalAiSettingsPrismaRepository
    implements PortalAiSettingsRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findByPortalId(
        portalId: number,
    ): Promise<PortalAiSettingsRecord | null> {
        const row = await this.prisma.portalAiSettings.findUnique({
            where: { portal_id: BigInt(portalId) },
        });
        return row ? this.toRecord(row) : null;
    }

    async findByDomain(domain: string): Promise<PortalAiSettingsRecord | null> {
        const row = await this.prisma.portalAiSettings.findFirst({
            where: { domain },
        });
        return row ? this.toRecord(row) : null;
    }

    async findEnabled(): Promise<PortalAiSettingsWithDomain[]> {
        const rows = await this.prisma.portalAiSettings.findMany({
            where: { enabled: true },
            orderBy: { domain: 'asc' },
        });
        return rows.map(row => ({
            ...this.toRecord(row),
            portalId: Number(row.portal_id),
            domain: row.domain,
        }));
    }

    async upsert(
        portalId: number,
        domain: string,
        update: PortalAiSettingsUpdate,
    ): Promise<PortalAiSettingsRecord> {
        // Текущая строка нужна для слияния JSON-колонки `settings`.
        const current = await this.prisma.portalAiSettings.findUnique({
            where: { portal_id: BigInt(portalId) },
        });
        const data = this.toPrismaData(update, current);
        const row = await this.prisma.portalAiSettings.upsert({
            where: { portal_id: BigInt(portalId) },
            create: {
                id: randomUUID(),
                portal_id: BigInt(portalId),
                domain,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
            },
            update: { ...data, domain, updatedAt: new Date() },
        });
        return this.toRecord(row);
    }

    async touchLastScan(portalId: number, scannedAt: Date): Promise<void> {
        await this.prisma.portalAiSettings.update({
            where: { portal_id: BigInt(portalId) },
            data: { lastScanAt: scannedAt, updatedAt: new Date() },
        });
    }

    /**
     * Только явно переданные поля: отсутствие ключа = «не трогать»,
     * явный null = «сбросить на дефолт». Поэтому проверка именно на
     * `undefined`, а не на falsy.
     *
     * upsert() при записи JSON-параметров передаёт сюда текущую строку
     * (для слияния колонки `settings` — частичный апдейт не должен
     * терять другие ключи JSON).
     */
    private toPrismaData(
        update: PortalAiSettingsUpdate,
        current: PortalAiSettings | null,
    ): PortalAiSettingsColumns {
        const data: PortalAiSettingsColumns = {};
        for (const field of EDITABLE_FIELDS) {
            const value = update[field];
            if (value !== undefined) {
                Object.assign(data, { [field]: value });
            }
        }
        if (update.allowedUserIds !== undefined) {
            data.allowedUserIds = update.allowedUserIds ?? Prisma.DbNull;
        }
        if (
            update.irrelevantConfidence !== undefined ||
            update.revisorEnabled !== undefined ||
            update.presentationAuditEnabled !== undefined ||
            update.presentationStrictness !== undefined ||
            update.weeklyReportEnabled !== undefined ||
            update.weeklyReportRecipients !== undefined ||
            update.weeklyReportFolderId !== undefined
        ) {
            const json = this.toJsonSettings(current?.settings);
            if (update.irrelevantConfidence !== undefined) {
                json.irrelevantConfidence =
                    update.irrelevantConfidence ?? undefined;
            }
            if (update.revisorEnabled !== undefined) {
                json.revisorEnabled = update.revisorEnabled ?? undefined;
            }
            if (update.presentationAuditEnabled !== undefined) {
                json.presentationAuditEnabled =
                    update.presentationAuditEnabled ?? undefined;
            }
            if (update.presentationStrictness !== undefined) {
                json.presentationStrictness =
                    update.presentationStrictness ?? undefined;
            }
            if (update.weeklyReportEnabled !== undefined) {
                json.weeklyReportEnabled =
                    update.weeklyReportEnabled ?? undefined;
            }
            if (update.weeklyReportRecipients !== undefined) {
                json.weeklyReportRecipients =
                    update.weeklyReportRecipients ?? undefined;
            }
            if (update.weeklyReportFolderId !== undefined) {
                json.weeklyReportFolderId =
                    update.weeklyReportFolderId ?? undefined;
            }
            data.settings = JSON.parse(
                JSON.stringify(json),
            ) as Prisma.InputJsonValue;
        }
        return data;
    }

    /** JSON-колонка `settings` → объект (мусор из БД не роняет чтение). */
    private toJsonSettings(value: Prisma.JsonValue | undefined): {
        irrelevantConfidence?: number;
        revisorEnabled?: boolean;
        presentationAuditEnabled?: boolean;
        presentationStrictness?: PresentationStrictnessLevel;
        weeklyReportEnabled?: boolean;
        weeklyReportRecipients?: number[];
        weeklyReportFolderId?: number;
    } {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const raw = value as Record<string, unknown>;
        const confidence = Number(raw.irrelevantConfidence);
        const folderId = Number(raw.weeklyReportFolderId);
        return {
            weeklyReportEnabled:
                typeof raw.weeklyReportEnabled === 'boolean'
                    ? raw.weeklyReportEnabled
                    : undefined,
            // Получатели вводятся строкой «12, 25, 7» — принимаем и массив,
            // и строку (в БД могло лечь и то, и другое).
            weeklyReportRecipients:
                this.toUserIds(
                    raw.weeklyReportRecipients as Prisma.JsonValue,
                ) ?? undefined,
            weeklyReportFolderId:
                Number.isFinite(folderId) && folderId > 0
                    ? folderId
                    : undefined,
            irrelevantConfidence:
                Number.isFinite(confidence) && confidence > 0 && confidence <= 1
                    ? confidence
                    : undefined,
            revisorEnabled:
                typeof raw.revisorEnabled === 'boolean'
                    ? raw.revisorEnabled
                    : undefined,
            presentationAuditEnabled:
                typeof raw.presentationAuditEnabled === 'boolean'
                    ? raw.presentationAuditEnabled
                    : undefined,
            presentationStrictness: (
                PRESENTATION_STRICTNESS_LEVELS as readonly string[]
            ).includes(String(raw.presentationStrictness))
                ? (raw.presentationStrictness as PresentationStrictnessLevel)
                : undefined,
        };
    }

    /** Строка Prisma → доменный тип; Json-колонка приводится к number[]. */
    private toRecord(row: PortalAiSettings): PortalAiSettingsRecord {
        return {
            enabled: row.enabled,
            deepAnalysisEnabled: row.deepAnalysisEnabled,
            createSmartEnabled: row.createSmartEnabled,
            classifyEnabled: row.classifyEnabled,
            salesOnly: row.salesOnly,
            minDurationSec: row.minDurationSec,
            windowHours: row.windowHours,
            maxPerRun: row.maxPerRun,
            staleMinutes: row.staleMinutes,
            llmModel: row.llmModel,
            deepAnalysisModel: row.deepAnalysisModel,
            scanIntervalMinutes: row.scanIntervalMinutes,
            nightScanIntervalMinutes: row.nightScanIntervalMinutes,
            nightStartHour: row.nightStartHour,
            nightEndHour: row.nightEndHour,
            lastScanAt: row.lastScanAt,
            allowedUserIds: this.toUserIds(row.allowedUserIds),
            irrelevantConfidence:
                this.toJsonSettings(row.settings).irrelevantConfidence ?? null,
            revisorEnabled:
                this.toJsonSettings(row.settings).revisorEnabled ?? null,
            presentationAuditEnabled:
                this.toJsonSettings(row.settings).presentationAuditEnabled ??
                null,
            presentationStrictness:
                this.toJsonSettings(row.settings).presentationStrictness ??
                null,
            weeklyReportEnabled:
                this.toJsonSettings(row.settings).weeklyReportEnabled ?? null,
            weeklyReportRecipients:
                this.toJsonSettings(row.settings).weeklyReportRecipients ??
                null,
            weeklyReportFolderId:
                this.toJsonSettings(row.settings).weeklyReportFolderId ?? null,
        };
    }

    /**
     * Json из БД мог быть записан чем угодно (в том числе Laravel-ом),
     * поэтому массив фильтруется до конечных положительных чисел.
     */
    private toUserIds(value: Prisma.JsonValue): number[] | null {
        // Получатели отчёта в админке вводятся строкой через запятую —
        // принимаем и «12, 25, 7», и массив (в БД лежит и то, и другое).
        const source: unknown[] = Array.isArray(value)
            ? value
            : typeof value === 'string'
              ? value.split(/[,;\s]+/)
              : [];
        const ids = source
            .map(item => Number(item))
            .filter(id => Number.isFinite(id) && id > 0);
        return ids.length ? ids : null;
    }
}
