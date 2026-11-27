import type { PBXService } from '@lib/pbx';
import { runInnAction } from '../lib/inn-http.errors';
import { resolveInnActor } from './inn-actor.resolver';
import {
    IInnManualSetResult,
    IInnManualTarget,
    InnManualSetService,
} from './inn-manual-set.service';

/** Что присылает фрейм, когда человек ввёл ИНН руками в шапке. */
export interface IInnManualSetInput extends IInnManualTarget {
    domain: string;
    inn: string;
    /** Id сотрудника Битрикса — имя для ленты берётся у портала. */
    userId?: number;
}

/**
 * Вход «ИНН из шапки» для ручек приложений: инстанс Битрикса по домену,
 * автор действия, запись через `InnManualSetService` и перевод доменных
 * ошибок в 400 / 409.
 *
 * Одна точка для event-sales (`POST inn/set`) и konstructor
 * (`POST konstructor/inn/set`): запись идёт одним кодом, контроллеры
 * приложений остаются тонкими.
 *
 * Инстанс Битрикса свой на каждый домен и каждый запрос: он создаётся здесь
 * и нигде не хранится.
 */
export async function setInnManually(
    pbx: Pick<PBXService, 'init'>,
    input: IInnManualSetInput,
): Promise<IInnManualSetResult> {
    const { bitrix, PortalModel } = await pbx.init(input.domain);
    const actor = await resolveInnActor(bitrix, input.userId);
    const service = new InnManualSetService(bitrix, PortalModel, input.domain);
    return runInnAction(() =>
        service.set(
            {
                dealId: input.dealId,
                companyId: input.companyId,
                leadId: input.leadId,
            },
            input.inn,
            actor,
        ),
    );
}
