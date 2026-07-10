import { BitrixV3CoreService } from './core/base/bitrix-v3-core.service';
import { CallV3ApiService } from './core/base/call-v3-api.service';
import { BxHrEmployeeService } from './domain/humanresources/employee/services/bx-hr-employee.service';
import { BxHrNodeMemberService } from './domain/humanresources/node-member/services/bx-hr-node-member.service';
import { BxHrNodeService } from './domain/humanresources/node/services/bx-hr-node.service';

/**
 * Клиент REST API 3.0 одного портала.
 *
 * НЕ injectable: инстанс привязан к домену/ключам портала.
 * Создавать через BitrixV3ServiceFactory.create(credentials) в момент
 * обработки запроса. Хранить в this @Injectable-сервисов НЕЛЬЗЯ —
 * будет race condition между порталами (то же правило, что для
 * BitrixService из @lib/bitrix).
 */
export class BitrixV3Service {
    /** Типизированный транспорт: call / callAll / callRaw */
    public readonly api: CallV3ApiService;

    /** Структура компании: отделы, команды, участники, сотрудники */
    public readonly hr: {
        node: BxHrNodeService;
        member: BxHrNodeMemberService;
        employee: BxHrEmployeeService;
    };

    public readonly domain: string;

    constructor(transport: BitrixV3CoreService) {
        this.api = new CallV3ApiService(transport);
        this.domain = transport.domain;
        this.hr = {
            node: new BxHrNodeService(this.api),
            member: new BxHrNodeMemberService(this.api),
            employee: new BxHrEmployeeService(this.api),
        };
    }
}
