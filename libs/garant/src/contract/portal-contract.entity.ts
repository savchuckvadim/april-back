import { ContractEntity } from './contract.entity';
import { PortalMeasureEntity } from './portal-measure.entity';

export class PortalContractEntity {
    id: bigint;
    title: string;

    template: string | null;
    order: number | null;
    portal_id: bigint;
    contract_id: bigint;
    portal_measure_id: bigint;
    bitrixfield_item_id: bigint;
    productName: string | null;
    description: string | null;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    /**
     * Договор. Имя — как у связи в схеме Prisma (`contracts`), иначе
     * репозиторий отдаёт Prisma-объект с полем `contracts`, а читающий
     * код берёт `contract` и молча получает undefined: prepayment,
     * discount и название уходили во фронт нулями и пустыми строками,
     * а деление на prepayment давало NaN.
     */
    contracts?: ContractEntity;
    portal_measure?: PortalMeasureEntity;
}
