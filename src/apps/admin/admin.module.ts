import { Module } from '@nestjs/common';
import { AdminClientModule } from './client/client.module';
import { AdminAppModule } from './app/app.module';

@Module({
    imports: [AdminClientModule, AdminAppModule],
})
export class AdminModule { }

