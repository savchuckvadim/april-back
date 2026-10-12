import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';

/**
 * Проверка инварианта «поставщик принадлежит порталу шаблона».
 *
 * У `contract_templates.agent_id` нет ни Prisma-связи, ни FK в БД — ничто
 * на уровне схемы не мешает сохранить строку, где портал A ссылается на
 * поставщика портала B. Такая строка отдала бы в договор реквизиты чужого
 * юрлица, поэтому проверка обязательна на каждой записи.
 *
 * Отдельный сервис, потому что это единственное место, где модулю нужен
 * `PrismaService` напрямую (мимо своего репозитория): так зависимость
 * видна в одном файле, а доменный сервис команд остаётся на моках
 * репозитория.
 */
@Injectable()
export class ContractTemplateAgentService {
    constructor(private readonly prisma: PrismaService) {}

    /** Проверяет пару, если оба значения заданы; иначе проверять нечего. */
    async assertScopeAgent(
        agentId: bigint | null,
        portalId: bigint | null,
    ): Promise<void> {
        if (agentId == null || portalId == null) {
            return;
        }
        await this.assertAgentBelongsToPortal(agentId, portalId);
    }

    async assertAgentBelongsToPortal(
        agentId: bigint,
        portalId: bigint,
    ): Promise<void> {
        const agent = await this.prisma.agents.findUnique({
            where: { id: agentId },
        });
        if (!agent) {
            throw new NotFoundException(`Поставщик ${agentId} не найден`);
        }
        if (agent.portalId !== portalId) {
            throw new BadRequestException(
                'Поставщик не принадлежит указанному порталу',
            );
        }
    }
}
