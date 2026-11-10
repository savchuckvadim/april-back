import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { Prisma, PortalAiSettings } from 'generated/prisma';
import { PortalKeyCryptoService } from '../keys/portal-key-crypto.service';
import { PortalAiSettingsRepository } from './portal-ai-settings.repository';
import {
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
    PortalAiSettingsWithDomain,
} from './portal-ai-settings.types';
import {
    parseAiSettingsJson,
    toOrgNames,
    toProviderOrder,
    toUserIds,
} from './portal-ai-settings.json.util';
import { normalizeTranscriptionRoute } from './portal-transcription-route.types';

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
    private readonly logger = new Logger(PortalAiSettingsPrismaRepository.name);

    constructor(
        private readonly prisma: PrismaService,
        /** Ключ своего Whisper лежит в JSON `settings` зашифрованным — как ключи портала. */
        private readonly crypto: PortalKeyCryptoService,
    ) {}

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
            update.methodologyCode !== undefined ||
            update.weeklyReportEnabled !== undefined ||
            update.weeklyReportRecipients !== undefined ||
            update.weeklyReportFolderId !== undefined ||
            update.weeklyReportDelivery !== undefined ||
            update.complianceReviewEnabled !== undefined ||
            update.ownOrgNames !== undefined ||
            update.llmProviderOrder !== undefined ||
            update.transcriptionMode !== undefined ||
            update.whisperBaseUrl !== undefined ||
            update.whisperModel !== undefined ||
            update.whisperApiKey !== undefined ||
            update.vibecodeTranscriptionModel !== undefined ||
            update.transcriptionRoute !== undefined ||
            update.factsCatchupNightlyBudgetRub !== undefined
        ) {
            const json = parseAiSettingsJson(current?.settings);
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
            if (update.methodologyCode !== undefined) {
                json.methodologyCode =
                    update.methodologyCode?.trim() || undefined;
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
            if (update.weeklyReportDelivery !== undefined) {
                json.weeklyReportDelivery =
                    update.weeklyReportDelivery ?? undefined;
            }
            if (update.complianceReviewEnabled !== undefined) {
                json.complianceReviewEnabled =
                    update.complianceReviewEnabled ?? undefined;
            }
            if (update.ownOrgNames !== undefined) {
                // Пустой список из админки — это «сбросить», а не «сохранить
                // пустоту»: undefined убирает ключ из JSON целиком.
                json.ownOrgNames =
                    toOrgNames(update.ownOrgNames as Prisma.JsonValue) ??
                    undefined;
            }
            if (update.llmProviderOrder !== undefined) {
                // Пустой список — «сбросить на общий порядок», как у названий.
                json.llmProviderOrder =
                    toProviderOrder(
                        update.llmProviderOrder as Prisma.JsonValue,
                    ) ?? undefined;
            }
            if (update.transcriptionMode !== undefined) {
                json.transcriptionMode = update.transcriptionMode ?? undefined;
            }
            if (update.whisperBaseUrl !== undefined) {
                json.whisperBaseUrl =
                    update.whisperBaseUrl?.trim().replace(/\/+$/, '') ||
                    undefined;
            }
            if (update.whisperModel !== undefined) {
                json.whisperModel = update.whisperModel?.trim() || undefined;
            }
            if (update.vibecodeTranscriptionModel !== undefined) {
                json.vibecodeTranscriptionModel =
                    update.vibecodeTranscriptionModel?.trim() || undefined;
            }
            if (update.transcriptionRoute !== undefined) {
                // Маршрут без единой роли — «сбросить на режим»: ключ убираем.
                json.transcriptionRoute =
                    normalizeTranscriptionRoute(update.transcriptionRoute) ??
                    undefined;
            }
            if (update.factsCatchupNightlyBudgetRub !== undefined) {
                // null или 0 — ночной догон выключен: ключ убираем.
                const budget = update.factsCatchupNightlyBudgetRub;
                json.factsCatchupNightlyBudgetRub =
                    typeof budget === 'number' && budget > 0
                        ? budget
                        : undefined;
            }
            if (update.whisperApiKey !== undefined) {
                // Пустая строка или null — убрать ключ; значение — зашифровать.
                const key = update.whisperApiKey?.trim();
                json.whisperApiKeyEncrypted = key
                    ? this.crypto.encrypt(key)
                    : undefined;
            }
            data.settings = JSON.parse(
                JSON.stringify(json),
            ) as Prisma.InputJsonValue;
        }
        return data;
    }

    /** Ключ Whisper из шифртекста; битый шифртекст — null с предупреждением, чтение не падает. */
    private decryptWhisperKey(encrypted: string | undefined): string | null {
        if (!encrypted) return null;
        try {
            return this.crypto.decrypt(encrypted) || null;
        } catch (error) {
            this.logger.warn(
                `Ключ Whisper портала не расшифрован (${(error as Error).message}) — считаем незаданным`,
            );
            return null;
        }
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
            allowedUserIds: toUserIds(row.allowedUserIds),
            irrelevantConfidence:
                parseAiSettingsJson(row.settings).irrelevantConfidence ?? null,
            revisorEnabled:
                parseAiSettingsJson(row.settings).revisorEnabled ?? null,
            presentationAuditEnabled:
                parseAiSettingsJson(row.settings).presentationAuditEnabled ??
                null,
            presentationStrictness:
                parseAiSettingsJson(row.settings).presentationStrictness ??
                null,
            methodologyCode:
                parseAiSettingsJson(row.settings).methodologyCode ?? null,
            weeklyReportEnabled:
                parseAiSettingsJson(row.settings).weeklyReportEnabled ?? null,
            weeklyReportRecipients:
                parseAiSettingsJson(row.settings).weeklyReportRecipients ??
                null,
            weeklyReportFolderId:
                parseAiSettingsJson(row.settings).weeklyReportFolderId ?? null,
            weeklyReportDelivery:
                parseAiSettingsJson(row.settings).weeklyReportDelivery ?? null,
            complianceReviewEnabled:
                parseAiSettingsJson(row.settings).complianceReviewEnabled ??
                null,
            ownOrgNames: parseAiSettingsJson(row.settings).ownOrgNames ?? null,
            llmProviderOrder:
                parseAiSettingsJson(row.settings).llmProviderOrder ?? null,
            transcriptionMode:
                parseAiSettingsJson(row.settings).transcriptionMode ?? null,
            whisperBaseUrl:
                parseAiSettingsJson(row.settings).whisperBaseUrl ?? null,
            whisperModel:
                parseAiSettingsJson(row.settings).whisperModel ?? null,
            whisperApiKey: this.decryptWhisperKey(
                parseAiSettingsJson(row.settings).whisperApiKeyEncrypted,
            ),
            vibecodeTranscriptionModel:
                parseAiSettingsJson(row.settings).vibecodeTranscriptionModel ??
                null,
            factsCatchupNightlyBudgetRub:
                parseAiSettingsJson(row.settings)
                    .factsCatchupNightlyBudgetRub ?? null,
            transcriptionRoute:
                parseAiSettingsJson(row.settings).transcriptionRoute ?? null,
        };
    }
}
