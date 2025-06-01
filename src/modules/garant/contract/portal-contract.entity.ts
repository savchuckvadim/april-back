import { ContractEntity } from "./contract.entity";
import { PortalMeasureEntity } from "./portal-measure.entity";

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
    contract?: ContractEntity;
    portal_measure?: PortalMeasureEntity;
} 