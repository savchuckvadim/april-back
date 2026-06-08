import { ApiProperty } from '@nestjs/swagger';
import { PortalKeysRecord } from '../portal-key.const';

/**
 * Все ключи интеграций портала в расшифрованном виде.
 * `implements PortalKeysRecord` гарантирует, что DTO не разойдётся
 * с доменным набором ключей.
 */
export class PortalKeysResponseDto implements PortalKeysRecord {
    constructor(keys: PortalKeysRecord) {
        this.nestKey = keys.nestKey;
        this.nestKonstructorKey = keys.nestKonstructorKey;
        this.nestReportKey = keys.nestReportKey;
        this.nestEventsKey = keys.nestEventsKey;
        this.nestServiceKey = keys.nestServiceKey;
        this.nestWebhooksKey = keys.nestWebhooksKey;
        this.nestScheduleKey = keys.nestScheduleKey;
        this.vibeKey = keys.vibeKey;
    }

    @ApiProperty({
        description: 'Ключ основного nest-приложения (back).',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestKey: string | null;

    @ApiProperty({
        description: 'Ключ приложения-конструктора.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestKonstructorKey: string | null;

    @ApiProperty({
        description: 'Ключ приложения отчётов.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestReportKey: string | null;

    @ApiProperty({
        description: 'Ключ приложения event-sales.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestEventsKey: string | null;

    @ApiProperty({
        description: 'Ключ сервисного приложения.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestServiceKey: string | null;

    @ApiProperty({
        description: 'Ключ приложения вебхуков.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestWebhooksKey: string | null;

    @ApiProperty({
        description: 'Ключ приложения планировщика.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    nestScheduleKey: string | null;

    @ApiProperty({
        description: 'Ключ интеграции Vibe.',
        example: 'sk_live_...redacted',
        type: String,
        nullable: true,
    })
    vibeKey: string | null;
}
