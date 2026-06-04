import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, { name: 'pbx-install', defaultPort: 3002 }).catch(
    console.error,
);
