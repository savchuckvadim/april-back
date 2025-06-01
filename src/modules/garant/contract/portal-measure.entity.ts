import { MeasureEntity } from "./measure.entity";

export class PortalMeasureEntity {
    id: bigint;
    measure_id: bigint;
    portal_id: bigint;
    bitrixId: string | null;
    name: string | null;
    shortName: string | null;
    fullName: string | null;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    measure?: MeasureEntity;
} 