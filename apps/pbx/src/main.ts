import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, { name: 'pbx', defaultPort: 3009 }).catch(
    console.error,
);
