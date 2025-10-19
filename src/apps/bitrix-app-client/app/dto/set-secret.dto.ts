import { BITRIX_APP_CODES } from "@/modules/bitrix-setup/app/enums/bitrix-app.enum";
import { SetBitrixSecretDto } from "@/modules/bitrix-setup/token";

export class SetSecretDto extends SetBitrixSecretDto {
    domain: string;
    code: BITRIX_APP_CODES
}
