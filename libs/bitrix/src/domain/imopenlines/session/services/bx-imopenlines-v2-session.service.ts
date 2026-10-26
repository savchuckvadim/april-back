import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImOpenlinesV2SessionRepository } from '../repository/bx-imopenlines-v2-session.repository';
import {
    BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT,
    IBXImOpenlinesV2Session,
    IBXImOpenlinesV2SessionListRequest,
} from '../interface/bx-imopenlines-v2-session.interface';

/** Потолок страниц `listAll`: защита от бесконечного обхода при сбое пагинации. */
const LIST_ALL_MAX_PAGES = 20;

export class BxImOpenlinesV2SessionService {
    private repo: BxImOpenlinesV2SessionRepository;

    clone(api: BitrixBaseApi): BxImOpenlinesV2SessionService {
        const instance = new BxImOpenlinesV2SessionService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesV2SessionRepository(api);
    }

    async list(data: IBXImOpenlinesV2SessionListRequest) {
        return await this.repo.list(data);
    }

    /**
     * Все сессии по фильтру: страницы по `hasNextPage`, максимум
     * {@link LIST_ALL_MAX_PAGES}. `offset`/`limit` вызывающего не нужны —
     * обход всегда с начала максимальной страницей.
     */
    async listAll(
        data: Omit<IBXImOpenlinesV2SessionListRequest, 'offset' | 'limit'>,
        maxPages: number = LIST_ALL_MAX_PAGES,
    ): Promise<IBXImOpenlinesV2Session[]> {
        const sessions: IBXImOpenlinesV2Session[] = [];
        const limit = BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT;
        for (let page = 0; page < maxPages; page += 1) {
            const response = await this.repo.list({
                ...data,
                offset: page * limit,
                limit,
            });
            sessions.push(...(response.result?.sessions ?? []));
            if (!response.result?.hasNextPage) break;
        }
        return sessions;
    }
}
