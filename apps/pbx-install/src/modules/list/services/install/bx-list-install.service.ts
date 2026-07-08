import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXList } from '@/modules/bitrix';
import { List } from '../../type/parse.type';

export interface IBxEnsuredList {
    bitrixId: number;
    /** Фактический IBLOCK_CODE списка в Bitrix (существующего или созданного) */
    code: string;
    created: boolean;
    updated: boolean;
}

/**
 * Создание/актуализация самого универсального списка (инфоблока) в Bitrix.
 *
 * Существующий список ищется по кандидатам кода: код из шаблона,
 * `${group}_${type}`, `${type}` — на реальных порталах живут все варианты
 * (см. EBxListCode), поиск по кандидатам не даёт плодить дубликаты.
 *
 * НЕ `@Injectable()` — создаётся через `new` в use-case (правило CLAUDE.md
 * про race condition с this.bitrix).
 */
export class BxListInstallService {
    private readonly logger = new Logger(BxListInstallService.name);

    constructor(
        private readonly domain: string,
        private readonly pbxService: PBXService,
    ) {}

    async ensureList(
        parsedList: List,
        /** IBLOCK_ID из строки `bitrixlists`, если зеркало уже существует */
        knownBitrixId?: number | null,
    ): Promise<IBxEnsuredList> {
        const { bitrix } = await this.pbxService.init(this.domain);
        const candidates = this.getCodeCandidates(parsedList);

        const response = await bitrix.list.getList();
        const existingLists: IBXList[] = Array.isArray(response.result)
            ? response.result
            : [];
        // Сначала по кандидатам кода; если список создан не нашим установщиком
        // (другой код, например легаси service_ork_history) — по сохранённому
        // в БД IBLOCK_ID, чтобы не плодить дубликат инфоблока.
        const existing =
            existingLists.find(l => candidates.includes(this.getListCode(l))) ??
            (knownBitrixId != null
                ? existingLists.find(l => Number(l.ID) === knownBitrixId)
                : undefined);

        if (existing) {
            const code = this.getListCode(existing) || parsedList.code;
            let updated = false;
            if (existing.NAME !== parsedList.name) {
                await bitrix.list.update(
                    { IBLOCK_ID: existing.ID },
                    { NAME: parsedList.name },
                );
                updated = true;
            }
            this.logger.log(
                `List "${code}" already exists on ${this.domain} (id=${existing.ID})`,
            );
            return {
                bitrixId: Number(existing.ID),
                code,
                created: false,
                updated,
            };
        }

        const added = await bitrix.list.add(parsedList.code, {
            NAME: parsedList.name,
            SORT: parsedList.order,
        });
        this.logger.log(
            `List "${parsedList.code}" created on ${this.domain} (id=${added.result})`,
        );
        return {
            bitrixId: Number(added.result),
            code: parsedList.code,
            created: true,
            updated: false,
        };
    }

    async deleteList(bitrixId: number): Promise<boolean> {
        const { bitrix } = await this.pbxService.init(this.domain);
        const response = await bitrix.list.delete({ IBLOCK_ID: bitrixId });
        return Boolean(response.result);
    }

    private getCodeCandidates(parsedList: List): string[] {
        return [
            parsedList.code,
            `${parsedList.group}_${parsedList.type}`,
            parsedList.type,
        ];
    }

    private getListCode(list: IBXList): string {
        return String(list.CODE ?? list.IBLOCK_CODE ?? '');
    }
}
