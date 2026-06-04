import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { SetBitrixSecretDto } from '@lib/bitrix-setup/token';

export class SetSecretDto extends SetBitrixSecretDto {
    domain: string;
    code: BITRIX_APP_CODES;
}
