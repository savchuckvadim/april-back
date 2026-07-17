import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, {
    name: 'bitrix-app-client',
    defaultPort: 3011,
}).catch(console.error);
