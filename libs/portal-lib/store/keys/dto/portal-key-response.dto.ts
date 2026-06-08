import { ApiProperty } from '@nestjs/swagger';
import { PORTAL_KEY_NAMES, PortalKeyName } from '../portal-key.const';

export class PortalKeyResponseDto {
    constructor(keyName: PortalKeyName, value: string | null) {
        this.keyName = keyName;
        this.value = value;
    }

    @ApiProperty({
        description: 'Имя ключа интеграции портала.',
        example: 'nestKey',
        enum: PORTAL_KEY_NAMES,
        type: String,
    })
    keyName: PortalKeyName;

    @ApiProperty({
        description:
            'Расшифрованное значение ключа. `null`, если ключ не задан ' +
            'или его не удалось расшифровать текущим секретом.',
        example: 'sk_live_51H...redacted',
        type: String,
        nullable: true,
    })
    value: string | null;
}
