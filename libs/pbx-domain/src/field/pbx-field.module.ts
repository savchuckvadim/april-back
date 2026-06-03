import { Module } from '@nestjs/common';
import { PbxFieldPrismaRepository } from './repositories/pbx-field.prisma.repository';
import { PbxFieldService } from './services/field/pbx-field.service';
import { PbxFieldRepository } from './repositories/pbx-field.repositry';

@Module({
    providers: [
        {
            provide: PbxFieldRepository,
            useClass: PbxFieldPrismaRepository,
        },
        PbxFieldService,
    ],
    exports: [PbxFieldService],
})
export class PbxFieldModule {}
