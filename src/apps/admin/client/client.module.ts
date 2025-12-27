import { Module } from '@nestjs/common';
import { ClientModule } from '@/modules/client/client.module';
import { AdminClientController } from './controllers/client.controller';

@Module({
    imports: [ClientModule],
    controllers: [AdminClientController],
})
export class AdminClientModule { }

