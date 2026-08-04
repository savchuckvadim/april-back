import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { Prisma, PortalAiSettings } from 'generated/prisma';
import { PortalAiSettingsRepository } from './portal-ai-settings.repository';
import {
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
    PortalAiSettingsWithDomain,
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
            update.revisorEnabled !== undefined
        ) {
            const json = this.toJsonSettings(current?.settings);
            if (update.irrelevantConfidence !== undefined) {
                json.irrelevantConfidence =
                    update.irrelevantConfidence ?? undefined;
            }
            if (update.revisorEnabled !== undefined) {
                json.revisorEnabled = update.revisorEnabled ?? undefined;
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
    } {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const raw = value as Record<string, unknown>;
        const confidence = Number(raw.irrelevantConfidence);
        return {
            irrelevantConfidence:
                Number.isFinite(confidence) && confidence > 0 && confidence <= 1
                    ? confidence
                    : undefined,
            revisorEnabled:
                typeof raw.revisorEnabled === 'boolean'
                    ? raw.revisorEnabled
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
        };
    }

    /**
     * Json из БД мог быть записан чем угодно (в том числе Laravel-ом),
     * поэтому массив фильтруется до конечных положительных чисел.
     */
    private toUserIds(value: Prisma.JsonValue): number[] | null {
        if (!Array.isArray(value)) return null;
        const ids = value
            .map(item => Number(item))
            .filter(id => Number.isFinite(id) && id > 0);
        return ids.length ? ids : null;
    }
}
