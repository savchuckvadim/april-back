import { BitrixBaseApi } from '@/modules/bitrix';
import { BxListItemRepository } from '../repositories/bx-list-item.repository';
import { BxListItemGetRequestDto } from '../dto/bx-list-item.dto';
import { IBXListItem } from '../interface/bx-list-item.interface';
import { delay } from '@/shared/lib';

export class BxListItemService {
    private repo: BxListItemRepository;
    clone(api: BitrixBaseApi): BxListItemService {
        const instance = new BxListItemService();
        instance.init(api);
        return instance;
    }
    init(api: BitrixBaseApi) {
        this.repo = new BxListItemRepository(api);
    }
    async get(dto: BxListItemGetRequestDto) {
        return await this.repo.get(dto);
    }
    async all(dto: BxListItemGetRequestDto): Promise<IBXListItem[]> {
        const listItems: IBXListItem[] = [];
        let needMore = true;
        let nextId = 0;
        while (needMore) {
            dto.filter = {
                ...dto.filter,
                '>ID': nextId,
            };
            const { result } = (await this.get(dto)) as {
                result: IBXListItem[];
            };

            if (result.length === 0) {
                break;
            }
            nextId = Number(result[result.length - 1]?.ID ?? 0);
            if (nextId === 0) {
                needMore = false;
            }
            listItems.push(...result);
            await delay(300);
        }
        return listItems;
    }
    async *allStream(
        dto: BxListItemGetRequestDto,
    ): AsyncGenerator<IBXListItem[]> {
        let needMore = true;
        let nextId = 0;
        let batchCount = 0;
        while (needMore) {
            dto.filter = {
                ...dto.filter,
                '>ID': nextId,
            };
            const { result } = (await this.get(dto)) as {
                result: IBXListItem[];
            };

            if (result.length === 0) {
                break;
            }
            nextId = Number(result[result.length - 1]?.ID ?? 0);
            if (nextId === 0) {
                needMore = false;
            }

            yield result;
            if ((batchCount + 1) % 3 === 0) {
                await delay(900);
                batchCount = 0;
            }
            batchCount++;
        }
    }
}
