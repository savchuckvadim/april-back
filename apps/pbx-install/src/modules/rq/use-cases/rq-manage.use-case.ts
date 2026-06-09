import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { RqDeleteResultDto } from '../dto/rq-response.dto';

/**
 * Точечное удаление реквизитной части в Bitrix: пресеты и пользовательские поля.
 * Толерантно к ошибкам по отдельному id (системные/занятые сущности не валят
 * всю операцию).
 */
@Injectable()
export class RqManageUseCase {
    constructor(private readonly pbxService: PBXService) {}

    async deletePresets(
        domain: string,
        bitrixIds: number[],
    ): Promise<RqDeleteResultDto> {
        const { bitrix } = await this.pbxService.init(domain);
        const result: RqDeleteResultDto = { domain, deleted: [], failed: [] };
        for (const id of bitrixIds) {
            try {
                await bitrix.requisitePreset.delete(id);
                result.deleted.push(id);
            } catch (e) {
                result.failed.push({ id, error: this.errorMessage(e) });
            }
        }
        return result;
    }

    async deleteFields(
        domain: string,
        fieldIds: number[],
    ): Promise<RqDeleteResultDto> {
        const { bitrix } = await this.pbxService.init(domain);
        const result: RqDeleteResultDto = { domain, deleted: [], failed: [] };
        for (const id of fieldIds) {
            try {
                await bitrix.requisite.deleteField(id);
                result.deleted.push(id);
            } catch (e) {
                result.failed.push({ id, error: this.errorMessage(e) });
            }
        }
        return result;
    }

    private errorMessage(e: unknown): string {
        if (e instanceof NotFoundException) {
            return e.message;
        }
        return e instanceof Error ? e.message : String(e);
    }
}
