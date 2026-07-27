/**
 * Установка плановых user-полей находу: перед сохранением планов
 * проверяем наличие UF_USR_A_SALES_PLAN_* на портале и доустанавливаем
 * недостающие тем же инсталл-сервисом, что и pbx-install
 * (@lib/pbx-user-fields, идемпотентный batch add-or-update).
 *
 * НЕ @Injectable: создаётся per-request через `new` (CLAUDE.md про
 * bitrix-состояние).
 */
import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixService } from '@/modules/bitrix';
import {
    buildPlanInstallFields,
    BxUserFieldsInstallService,
    USER_FIELD_PREFIX,
} from '@lib/pbx-user-fields';

export class PlanUserFieldsService {
    private readonly logger = new Logger(PlanUserFieldsService.name);

    constructor(
        private readonly domain: string,
        private readonly pbx: PBXService,
        private readonly bitrix: BitrixService,
    ) {}

    /**
     * Гарантирует наличие всех плановых полей; ставит только недостающие
     * (существующие не трогаем — не дёргаем update без нужды).
     */
    async ensureInstalled(): Promise<void> {
        const { result } = await this.bitrix.user.listFields();
        const existingNames = new Set(
            ((result ?? []) as { FIELD_NAME?: string }[]).map(field =>
                String(field.FIELD_NAME ?? ''),
            ),
        );

        const missing = buildPlanInstallFields().filter(
            field => !existingNames.has(`${USER_FIELD_PREFIX}${field.bxFieldName}`),
        );
        if (!missing.length) return;

        this.logger.log(
            `Устанавливаю плановые user-поля (${this.domain}): ` +
                missing.map(field => field.bxFieldName).join(', '),
        );
        const install = new BxUserFieldsInstallService(
            this.domain,
            this.pbx,
            missing,
        );
        const installResult = await install.installBxFields();
        if (installResult.errorCodes.length) {
            throw new Error(
                `Не удалось установить плановые поля: ${installResult.errorCodes.join(', ')}`,
            );
        }
    }
}
