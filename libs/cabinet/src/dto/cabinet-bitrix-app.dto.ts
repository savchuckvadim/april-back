import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
    LOCAL_APP_CHECK_RESULTS,
    type LocalAppCheck,
    type LocalAppCheckResult,
    type LocalAppConnection,
} from '@lib/marketplace-core';

export class BitrixAppSetupDto {
    @ApiProperty({
        description:
            'Раздел портала «Разработчикам → Другое», где создают локальное приложение.',
        type: String,
        example: 'https://client.bitrix24.ru/devops/section/standard/',
    })
    devSectionUrl!: string;

    @ApiProperty({
        description: 'Что вставить в поле «Путь вашего обработчика».',
        type: String,
        example: 'https://api.pbx.april-app.ru/api/bitrix-marketplace/app',
    })
    handlerUrl!: string;

    @ApiProperty({
        description: 'Что вставить в поле «Путь для первоначальной установки».',
        type: String,
        example: 'https://api.pbx.april-app.ru/api/bitrix-marketplace/install',
    })
    installUrl!: string;

    @ApiProperty({
        description: 'Права, которые отметить в приложении.',
        type: [String],
        example: ['crm', 'user', 'placement'],
    })
    scopes!: string[];
}

export class BitrixAppKeysStateDto {
    @ApiProperty({
        description: 'Ключи приложения внесены.',
        type: Boolean,
        example: true,
    })
    set!: boolean;

    @ApiProperty({
        description: 'Код приложения (client_id); ключ (secret) не отдаётся.',
        type: String,
        nullable: true,
        example: 'local.5f1a2b3c4d5e6.12345678',
    })
    clientId!: string | null;

    @ApiProperty({
        description: 'Когда ключи внесены или изменены (ISO).',
        type: String,
        nullable: true,
        example: '2026-11-08T10:00:00.000Z',
    })
    updatedAt!: string | null;
}

export class BitrixAppInstallStateDto {
    @ApiProperty({
        description: 'Приложение установлено на портале.',
        type: Boolean,
        example: true,
    })
    installed!: boolean;

    @ApiProperty({
        description: 'Этап установки (installed, error, …).',
        type: String,
        nullable: true,
        example: 'installed',
    })
    status!: string | null;

    @ApiProperty({
        description: 'Когда установлено (ISO).',
        type: String,
        nullable: true,
        example: '2026-11-08T09:00:00.000Z',
    })
    installedAt!: string | null;

    @ApiProperty({
        description: 'До какого момента действует текущий токен (ISO).',
        type: String,
        nullable: true,
        example: '2026-11-08T11:00:00.000Z',
    })
    tokenExpiresAt!: string | null;
}

export class BitrixAppLastRefreshDto {
    @ApiProperty({
        description: 'Когда последний раз обновлялся токен (ISO).',
        type: String,
        nullable: true,
        example: '2026-11-08T10:05:00.000Z',
    })
    at!: string | null;

    @ApiProperty({
        description: 'Обновление прошло успешно.',
        type: Boolean,
        example: true,
    })
    ok!: boolean;

    @ApiProperty({
        description:
            'Ответ Битрикса при ошибке — только в админке April; клиенту — null.',
        type: String,
        nullable: true,
        example: null,
    })
    error!: string | null;
}

export class BitrixAppConnectionDto {
    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        example: 'client.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Что ввести в Битрикс24 при создании приложения.',
        type: BitrixAppSetupDto,
    })
    setup!: BitrixAppSetupDto;

    @ApiProperty({
        description: 'Ключи приложения.',
        type: BitrixAppKeysStateDto,
    })
    keys!: BitrixAppKeysStateDto;

    @ApiProperty({
        description: 'Установка на портале.',
        type: BitrixAppInstallStateDto,
    })
    install!: BitrixAppInstallStateDto;

    @ApiProperty({
        description: 'Последнее обновление токена; null — ещё не было.',
        type: BitrixAppLastRefreshDto,
        nullable: true,
    })
    lastRefresh!: BitrixAppLastRefreshDto | null;
}

export class SaveBitrixAppKeysDto {
    @ApiProperty({
        description:
            'Код приложения (client_id) из карточки локального приложения Битрикс24.',
        type: String,
        example: 'local.5f1a2b3c4d5e6.12345678',
    })
    @IsString()
    @MinLength(8)
    @MaxLength(120)
    clientId!: string;

    @ApiProperty({
        description:
            'Ключ приложения (client_secret). Хранится зашифрованным, обратно не показывается.',
        type: String,
        example: 'AbCdEf0123456789xyz',
    })
    @IsString()
    @MinLength(10)
    @MaxLength(200)
    clientSecret!: string;
}

export class BitrixAppCheckDto implements LocalAppCheck {
    @ApiProperty({
        description:
            'ok — ключи подходят; no_keys — не внесены; not_installed — приложение не установлено; keys_invalid — ключи не от этого приложения; reopen_app — открыть приложение в Битрикс24; unavailable — Битрикс не ответил.',
        enum: LOCAL_APP_CHECK_RESULTS,
        example: 'ok',
    })
    result!: LocalAppCheckResult;

    @ApiProperty({
        description: 'Что это значит и что сделать — по-русски.',
        type: String,
        example: 'Ключи подходят: Битрикс24 выдал новый токен.',
    })
    message!: string;
}

const iso = (value: Date | null): string | null =>
    value ? value.toISOString() : null;

/** Состояние подключения → DTO; ответ Битрикса об ошибке — только админке. */
export function toBitrixAppConnectionDto(
    connection: LocalAppConnection,
    options: { withErrors: boolean },
): BitrixAppConnectionDto {
    const { keys, install, lastRefresh } = connection;
    return {
        domain: connection.domain,
        setup: connection.setup,
        keys: {
            set: keys.set,
            clientId: keys.clientId,
            updatedAt: iso(keys.updatedAt),
        },
        install: {
            installed: install.installed,
            status: install.status,
            installedAt: iso(install.installedAt),
            tokenExpiresAt: iso(install.tokenExpiresAt),
        },
        lastRefresh: lastRefresh
            ? {
                  at: iso(lastRefresh.at),
                  ok: lastRefresh.ok,
                  error: options.withErrors ? lastRefresh.error : null,
              }
            : null,
    };
}
