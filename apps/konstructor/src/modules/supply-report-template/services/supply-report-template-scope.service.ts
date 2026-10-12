import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    SupplyReportTemplateRepository,
    type SupplyReportTemplateTxClient,
} from '../repositories/supply-report-template.repository';
import { buildClearOtherDefaultsWhere } from '../utils/supply-report-template.prisma-where.util';

/**
 * Инварианты области шаблона: (портал, поставщик) и единственность
 * «шаблона по умолчанию».
 *
 * Отдельный сервис, потому что оба правила нужны из нескольких операций
 * (create, update, setDefault, setAgent) и ни одно из них не держится базой:
 * у `supply_report_templates.agent_id` нет ни Prisma-связи, ни FK.
 */
@Injectable()
export class SupplyReportTemplateScopeService {
    constructor(
        private readonly repository: SupplyReportTemplateRepository,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * Поставщик обязан принадлежать порталу шаблона.
     *
     * Ничто на уровне схемы не мешает сохранить строку, где портал A
     * ссылается на поставщика портала B. Такая строка подставила бы в отчёт
     * реквизиты чужого юрлица, поэтому проверка обязательна на каждой записи.
     */
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

    /**
     * Проверка пары (портал, поставщик) после изменения.
     *
     * Поставщик без портала невозможен: область шаблона — пара, и «любой
     * портал + конкретный поставщик» смысла не имеет.
     */
    async assertPairValid(
        portalId: bigint | null,
        agentId: bigint | null,
    ): Promise<void> {
        if (agentId != null && portalId == null) {
            throw new BadRequestException(
                'Нельзя оставить поставщика без портала: ' +
                    'сначала привяжите портал или снимите поставщика',
            );
        }
        if (agentId != null && portalId != null) {
            await this.assertAgentBelongsToPortal(agentId, portalId);
        }
    }

    /**
     * Снять флаг «по умолчанию» у остальных шаблонов области.
     *
     * `contract_type` в область НЕ входит: такой колонки у
     * `supply_report_templates` нет.
     */
    async clearOtherDefaults(
        portalId: bigint | null,
        agentId: bigint | null,
        exceptId: bigint,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<void> {
        await this.repository.updateMany(
            buildClearOtherDefaultsWhere(portalId, agentId, exceptId),
            { is_default: false, updated_at: new Date() },
            tx,
        );
    }
}
