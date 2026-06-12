import { bootstrapApp } from '@/core';
import { AppModule } from './app.module';

bootstrapApp(AppModule, { name: 'rq', defaultPort: 3008 }).catch(console.error);
