import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, { name: 'bot', defaultPort: 3010 }).catch(
    console.error,
);
