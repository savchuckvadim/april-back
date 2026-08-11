import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { SkapRunStats } from '../store/skap-store.types';

/** Итог прогона для дайджеста (структурно совместим с use-case результата). */
export interface SkapRunDigestInput {
    domain: string;
    stats: SkapRunStats;
    stopReason: string | null;
}

/**
 * Оповещения о результатах прогона СКАП (контур 2 и 3 плана §11):
 * - Telegram-дайджест — через логгер-транспорт (@lib/logger, форс-флаг
 *   `{ telegram: true }`, троттлинг транспорта защищает от флуда);
 * - сводка ответственному в портале — im.notify.system.add (fail-open).
 * Мгновенные алерты об ошибках формата/падениях шлёт сам конвейер.
 */
@Injectable()
export class SkapRunNotifierService {
    private readonly logger = new Logger(SkapRunNotifierService.name);

    /** Нужно ли слать дайджест при данном уровне. */
    shouldSend(
        stats: SkapRunStats,
        digestLevel: string,
        stopReason: string | null,
    ): boolean {
        if (digestLevel === 'off') return false;
        const hasProblems =
            stats.filesError > 0 ||
            stats.itemsError > 0 ||
            stats.itemsSkippedNoCompany > 0 ||
            stopReason === 'time_budget';
        if (digestLevel === 'errors') return hasProblems;
        // 'all': каждый прогон с работой или проблемами; тихие — молчат.
        return stats.filesProcessed > 0 || hasProblems;
    }

    /**
     * Дайджест прогона: Telegram + (опц.) уведомления в портале.
     * `notifyUserIds` — настройка `notify_user_ids` (app=skap): Bitrix ID
     * сотрудников через запятую; пусто — только Telegram.
     */
    async sendDigest(
        input: SkapRunDigestInput,
        digestLevel: string,
        notifyUserIds: string,
        bitrix: BitrixService | null,
    ): Promise<void> {
        if (!this.shouldSend(input.stats, digestLevel, input.stopReason)) {
            return;
        }
        const text = this.buildDigest(input);

        // Контур Telegram: форс-флаг доставляет лог при любом уровне.
        this.logger.log(`Дайджест СКАП\n${text}`, {
            telegram: true,
            domain: input.domain,
        });

        const userIds = this.parseUserIds(notifyUserIds);
        for (const userId of userIds) {
            if (!bitrix) break;
            await bitrix.imNotify
                .systemAdd({
                    USER_ID: userId,
                    MESSAGE: `[b]СКАП: импорт статистики[/b]\n${text}`,
                    TAG: `skap_digest_${input.domain}`,
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `im-notify не отправлен (${input.domain}, user ${userId}): ${error.message}`,
                    ),
                );
        }
    }

    /** «1, 42;107» → [1, 42, 107] (мусор и нули отбрасываются). */
    parseUserIds(raw: string): number[] {
        return raw
            .split(/[,;\s]+/)
            .map(part => Number(part))
            .filter(id => Number.isInteger(id) && id > 0);
    }

    private buildDigest(input: SkapRunDigestInput): string {
        const { stats } = input;
        const lines = [
            `Портал: ${input.domain}`,
            `Файлов: обработано ${stats.filesProcessed} из ${stats.filesFound}` +
                (stats.filesError ? `, с ошибками ${stats.filesError}` : ''),
            `Элементов: создано ${stats.itemsCreated}, обновлено ${stats.itemsUpdated}`,
            `Сессий сохранено: ${stats.sessionsSaved}, подписок: ${stats.subscriptionsSaved}`,
        ];
        if (stats.itemsSkippedNoCompany) {
            lines.push(
                `⚠️ Без компании (рег-лист не найден): ${stats.itemsSkippedNoCompany}`,
            );
        }
        if (stats.itemsSkippedTooOld) {
            lines.push(`Старше лимита истории: ${stats.itemsSkippedTooOld}`);
        }
        if (stats.itemsError) {
            lines.push(`❌ Ошибок записи: ${stats.itemsError}`);
        }
        if (input.stopReason === 'time_budget') {
            lines.push(
                '⏱ Прогон остановлен по тайм-бюджету — остаток в следующем тике',
            );
        }
        const warnings = stats.warnings.slice(0, 7);
        if (warnings.length) {
            lines.push('Ворнинги:');
            lines.push(...warnings.map(warning => `• ${warning}`));
            if (stats.warnings.length > warnings.length) {
                lines.push(
                    `…и ещё ${stats.warnings.length - warnings.length} (полный список — в админке)`,
                );
            }
        }
        return lines.join('\n');
    }
}
