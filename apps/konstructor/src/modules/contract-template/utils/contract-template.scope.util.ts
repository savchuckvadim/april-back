import { BadRequestException } from '@nestjs/common';
import {
    ContractTemplateScope,
    type ContractTemplateScopeValue,
} from '../dto/contract-template.enums';

/**
 * Привязка шаблона в терминах колонок БД. Колонки `visibility` у
 * `contract_templates` нет — область целиком выражена парой
 * (`portal_id`, `agent_id`), поэтому scope наружу не сохраняется.
 */
export type ContractTemplateResolvedScope = {
    portal_id: bigint | null;
    agent_id: bigint | null;
};

/**
 * Уровень привязки → колонки.
 *
 *  - `common`   → оба NULL. Поданные portal_id/agent_id ИГНОРИРУЮТСЯ (не
 *                 молча: несогласованный ввод — ошибка, см. ниже);
 *  - `portal`   → нужен portal_id, agent_id сбрасывается в NULL;
 *  - `provider` → нужны оба.
 *
 * `common` с переданным portal_id — противоречивый ввод: администратор
 * либо ошибся уровнем, либо ошибся порталом, и угадывать за него нельзя
 * (угадав «общий», мы отдадим шаблон всем порталам — утечка чужого
 * договора).
 */
export function resolveContractTemplateScope(
    scope: ContractTemplateScopeValue,
    portalId: bigint | null,
    agentId: bigint | null,
): ContractTemplateResolvedScope {
    if (scope === ContractTemplateScope.COMMON) {
        if (portalId != null || agentId != null) {
            throw new BadRequestException(
                'Для scope=common нельзя указывать portal_id или agent_id: ' +
                    'общий шаблон не привязан ни к порталу, ни к поставщику',
            );
        }
        return { portal_id: null, agent_id: null };
    }

    if (scope === ContractTemplateScope.PORTAL) {
        if (portalId == null) {
            throw new BadRequestException('Для scope=portal нужен portal_id');
        }
        if (agentId != null) {
            throw new BadRequestException(
                'Для scope=portal нельзя указывать agent_id: ' +
                    'для привязки к поставщику используйте scope=provider',
            );
        }
        return { portal_id: portalId, agent_id: null };
    }

    if (portalId == null || agentId == null) {
        throw new BadRequestException(
            'Для scope=provider нужны и portal_id, и agent_id',
        );
    }
    return { portal_id: portalId, agent_id: agentId };
}

/**
 * Уровень, выведенный из уже сохранённых колонок — для ответов и логов.
 * Заполненный agent_id без portal_id в БД невозможен по инварианту записи,
 * но если легаси-строка такая есть, считаем её портальной: иначе она
 * попала бы в «общие» и уехала всем порталам.
 */
export function detectContractTemplateScope(
    portalId: bigint | null,
    agentId: bigint | null,
): ContractTemplateScopeValue {
    if (portalId == null) {
        return ContractTemplateScope.COMMON;
    }
    return agentId == null
        ? ContractTemplateScope.PORTAL
        : ContractTemplateScope.PROVIDER;
}

/**
 * Необязательная числовая строка → bigint.
 *
 * Пустая строка трактуется как «сбросить в NULL»: именно так описан
 * контракт `portal_id`/`agent_id` в `UpdateContractTemplateDto`
 * (`@IsString()`, «пустая строка переводит шаблон в общие»).
 */
export function parseOptionalBigInt(
    value: string | null | undefined,
): bigint | null {
    if (value == null || value.trim() === '') {
        return null;
    }
    return BigInt(value);
}
