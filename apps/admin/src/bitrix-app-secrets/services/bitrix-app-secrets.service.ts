import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import { bitrix_app_secrets } from 'generated/prisma';
import { AppSecretDto, UpsertAppSecretDto } from '../dto/bitrix-app-secret.dto';

/**
 * Управление OAuth-кредами приложений (bitrix_app_secrets) из админки.
 *
 * Эту таблицу читает MarketplaceTokenService (@lib/marketplace-core) при
 * рефреше токенов установок: строка code='garant_manager' — источник истины,
 * env MARKETPLACE_CLIENT_ID/SECRET — фолбэк. Кэш кред в токен-сервисе — 1 мин,
 * т.е. правка здесь подхватывается без рестарта приложений.
 *
 * client_secret ШИФРУЕТСЯ при записи (crypt.util — общий APP_KEY, как токены
 * установок); старые строки открытым текстом читаются как есть (обратная
 * совместимость). Наружу секрет не отдаётся — только маска (первые/последние 4).
 */
@Injectable()
export class BitrixAppSecretsService {
    private readonly logger = new Logger(BitrixAppSecretsService.name);

    constructor(private readonly prisma: PrismaService) {}

    async findAll(): Promise<AppSecretDto[]> {
        const rows = await this.prisma.bitrix_app_secrets.findMany({
            orderBy: { code: 'asc' },
        });
        return rows.map(row => this.toDto(row));
    }

    async findByCode(code: string): Promise<AppSecretDto> {
        const row = await this.prisma.bitrix_app_secrets.findFirst({
            where: { code },
        });
        if (!row) {
            throw new NotFoundException(
                `Креды приложения "${code}" не найдены`,
            );
        }
        return this.toDto(row);
    }

    /** Идемпотентный upsert по code (создать или перезаписать креды) */
    async upsert(code: string, dto: UpsertAppSecretDto): Promise<AppSecretDto> {
        const existing = await this.prisma.bitrix_app_secrets.findFirst({
            where: { code },
        });
        const encryptedSecret = encrypt(dto.clientSecret);
        const row = existing
            ? await this.prisma.bitrix_app_secrets.update({
                  where: { id: existing.id },
                  data: {
                      client_id: dto.clientId,
                      client_secret: encryptedSecret,
                      group: dto.group ?? existing.group,
                      type: dto.type ?? existing.type,
                      updated_at: new Date(),
                  },
              })
            : await this.prisma.bitrix_app_secrets.create({
                  data: {
                      code,
                      client_id: dto.clientId,
                      client_secret: encryptedSecret,
                      group: dto.group,
                      type: dto.type,
                      created_at: new Date(),
                      updated_at: new Date(),
                  },
              });
        this.logger.log(
            `App secrets ${existing ? 'updated' : 'created'}: code=${code}`,
        );
        return this.toDto(row);
    }

    async delete(code: string): Promise<void> {
        const existing = await this.prisma.bitrix_app_secrets.findFirst({
            where: { code },
        });
        if (!existing) {
            throw new NotFoundException(
                `Креды приложения "${code}" не найдены`,
            );
        }
        await this.prisma.bitrix_app_secrets.delete({
            where: { id: existing.id },
        });
        this.logger.log(`App secrets deleted: code=${code}`);
    }

    private toDto(row: bitrix_app_secrets): AppSecretDto {
        return {
            id: row.id.toString(),
            code: row.code,
            clientId: row.client_id,
            clientSecretMasked: this.mask(row.client_secret),
            group: row.group ?? undefined,
            type: row.type ?? undefined,
            updatedAt: row.updated_at?.toISOString(),
        };
    }

    /** Маска строится по РАСШИФРОВАННОМУ значению (шифротекст маскировать бессмысленно) */
    private mask(storedSecret: string): string {
        let secret: string;
        try {
            secret = decrypt(storedSecret);
        } catch {
            secret = storedSecret; // legacy-строка открытым текстом
        }
        if (secret.length <= 8) {
            return '…';
        }
        return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
    }
}
