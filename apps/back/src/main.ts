import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, { name: 'back', defaultPort: 3000 }).catch(
    console.error,
);
