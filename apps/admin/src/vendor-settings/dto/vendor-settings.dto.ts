import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
    VENDOR_SECRET_MASK,
    VENDOR_SETTING_GROUPS,
    VENDOR_SETTING_GROUP_INFO,
    VENDOR_SETTING_KEYS,
    VENDOR_SETTING_SOURCES,
    type VendorSettingGroup,
    type VendorSettingKey,
    type VendorSettingSource,
} from '@lib/vendor-settings';
import type { VendorSettingView } from '@lib/portal-lib/store/vendor-settings/vendor-settings.service';

/**
 * Одна настройка вендора: описание из реестра и текущее состояние.
 * `updatedAt` в DTO — ISO-строка, поэтому зеркалится всё, кроме него.
 */
export class VendorSettingDto implements Omit<VendorSettingView, 'updatedAt'> {
    @ApiProperty({
        description:
            'Ключ настройки — он же имя переменной окружения, которую она перекрывает.',
        enum: VENDOR_SETTING_KEYS,
        example: 'GROQ_API_KEY',
    })
    key: VendorSettingKey;

    @ApiProperty({
        description: 'Группа на странице админки.',
        enum: VENDOR_SETTING_GROUPS,
        example: 'ai-keys',
    })
    group: VendorSettingGroup;

    @ApiProperty({
        description: 'Название поля по-русски.',
        type: String,
        example: 'Ключ Groq',
    })
    label: string;

    @ApiProperty({
        description: 'Что делает настройка и на что влияет.',
        type: String,
        example:
            'Один ключ закрывает запасной LLM разборов и резервную транскрибацию.',
    })
    description: string;

    @ApiProperty({
        description:
            'Где взять значение и как заполнить — шаги для администратора.',
        type: String,
        example: 'console.groq.com → API Keys → Create API Key.',
    })
    howTo: string;

    @ApiProperty({
        description:
            'Секрет: хранится зашифрованным, значение наружу не отдаётся — только признак isSet.',
        type: Boolean,
        example: true,
    })
    secret: boolean;

    @ApiProperty({
        description: 'Пример значения для подсказки в поле.',
        type: String,
        example: 'gsk_…',
    })
    example: string;

    @ApiProperty({
        description:
            'Значение, заданное в админке, для несекретных настроек; у секретов всегда null.',
        type: String,
        nullable: true,
        example: 'https://eu-proxy.april-app.ru/p',
    })
    value: string | null;

    @ApiProperty({
        description: 'Задано ли значение в админке.',
        type: Boolean,
        example: true,
    })
    isSet: boolean;

    @ApiProperty({
        description:
            'Есть ли значение в окружении приложения — оно действует, пока в админке пусто.',
        type: Boolean,
        example: false,
    })
    envSet: boolean;

    @ApiProperty({
        description:
            'Что действует сейчас: admin — значение из админки, env — из окружения, none — не задано нигде.',
        enum: VENDOR_SETTING_SOURCES,
        example: 'admin',
    })
    source: VendorSettingSource;

    @ApiProperty({
        description:
            'Когда значение менялось в админке (ISO); null — не менялось.',
        type: String,
        nullable: true,
        example: '2026-10-29T15:00:00.000Z',
    })
    updatedAt: string | null;

    @ApiProperty({
        description: 'Кто менял — логин администратора; null — неизвестно.',
        type: String,
        nullable: true,
        example: 'vadim',
    })
    updatedBy: string | null;

    constructor(view: VendorSettingView) {
        this.key = view.key;
        this.group = view.group;
        this.label = view.label;
        this.description = view.description;
        this.howTo = view.howTo;
        this.secret = view.secret;
        this.example = view.example;
        this.value = view.value;
        this.isSet = view.isSet;
        this.envSet = view.envSet;
        this.source = view.source;
        this.updatedAt = view.updatedAt ? view.updatedAt.toISOString() : null;
        this.updatedBy = view.updatedBy;
    }
}

/** Группа настроек с заголовком для страницы админки. */
export class VendorSettingGroupDto {
    @ApiProperty({
        description:
            'Код группы из реестра: по нему берутся заголовок и описание, порядок групп задан реестром.',
        enum: VENDOR_SETTING_GROUPS,
        example: 'egress-proxy',
    })
    group: VendorSettingGroup;

    @ApiProperty({
        description: 'Заголовок группы по-русски.',
        type: String,
        example: 'Исходящий прокси за рубеж',
    })
    title: string;

    @ApiProperty({
        description: 'Зачем нужна группа настроек.',
        type: String,
        example:
            'Сервисы за пределами России с наших серверов напрямую не отвечают…',
    })
    description: string;

    @ApiProperty({
        description: 'Настройки группы в порядке показа.',
        type: [VendorSettingDto],
    })
    items: VendorSettingDto[];

    constructor(group: VendorSettingGroup, items: VendorSettingDto[]) {
        this.group = group;
        this.title = VENDOR_SETTING_GROUP_INFO[group].title;
        this.description = VENDOR_SETTING_GROUP_INFO[group].description;
        this.items = items;
    }
}

/** Все настройки вендора по группам. */
export class VendorSettingsResponseDto {
    @ApiProperty({
        description: 'Группы настроек в порядке показа на странице.',
        type: [VendorSettingGroupDto],
    })
    groups: VendorSettingGroupDto[];

    @ApiProperty({
        description:
            'Маска заданного секрета. Отправить её в PUT — оставить прежнее значение.',
        type: String,
        example: VENDOR_SECRET_MASK,
    })
    secretMask: string;

    constructor(views: VendorSettingView[]) {
        this.secretMask = VENDOR_SECRET_MASK;
        this.groups = VENDOR_SETTING_GROUPS.map(
            group =>
                new VendorSettingGroupDto(
                    group,
                    views
                        .filter(view => view.group === group)
                        .map(view => new VendorSettingDto(view)),
                ),
        ).filter(group => group.items.length > 0);
    }
}

/** Новое значение настройки. */
export class UpdateVendorSettingDto {
    @ApiPropertyOptional({
        description: `Новое значение. Пусто или null — снять значение из админки, снова действует переменная окружения. Для секрета маска «${VENDOR_SECRET_MASK}» означает «оставить прежнее».`,
        type: String,
        nullable: true,
        example: 'https://eu-proxy.april-app.ru/p',
    })
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    value?: string | null;
}
