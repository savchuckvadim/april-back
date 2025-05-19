import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../core/redis/redis.service';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class YandexAuthService {
    private readonly logger = new Logger(YandexAuthService.name);
    private readonly tokensUrl: string;
    private readonly keyJsonPath: string;
    private readonly keyData: any;

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) {
        this.tokensUrl = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
        this.keyJsonPath = path.join(process.cwd(), 'keys', 'key.json');

        this.logger.log(`Key JSON path: ${this.keyJsonPath}`);

        if (!fs.existsSync(this.keyJsonPath)) {
            this.logger.error(`Key file not found: ${this.keyJsonPath}`);
            throw new Error(`Key file not found: ${this.keyJsonPath}`);
        }

        this.keyData = JSON.parse(fs.readFileSync(this.keyJsonPath, 'utf8'));
    }

    async getIamToken(): Promise<string | null> {
        try {
            // Check cache
            const redis = this.redisService.getClient();
            const cachedToken = await redis.get('iam_token');

            if (cachedToken) {
                this.logger.log('Using cached IAM token');
                return cachedToken;
            }

            // Generate JWT
            const jwt = this.generateJwt();
            this.logger.log('Generated JWT');

            // Get IAM token
            const response = await fetch(this.tokensUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jwt }),
            });

            if (!response.ok) {
                throw new Error(`Failed to get IAM token: ${response.statusText}`);
            }

            const data = await response.json();
            const iamToken = data.iamToken;

            // Cache token for 11 hours 55 minutes
            await redis.set('iam_token', iamToken, 'EX', 11 * 3600 + 55 * 60);
            this.logger.log('IAM token cached');

            return iamToken;
        } catch (error) {
            this.logger.error('Error getting IAM token:', error);
            return null;
        }
    }

    private generateJwt(): string {
        try {
            const keyId = this.keyData.id;
            const privateKey = this.keyData.private_key;

            // Extract private key between markers
            const startPrivateKey = privateKey.indexOf('-----BEGIN PRIVATE KEY-----');
            const endPrivateKey = privateKey.indexOf('-----END PRIVATE KEY-----') + '-----END PRIVATE KEY-----'.length;
            const privateKeyPEM = privateKey.substring(startPrivateKey, endPrivateKey);

            this.logger.log('Extracted private key');

            const payload = {
                iss: this.keyData.service_account_id,
                aud: this.tokensUrl,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
            };

            return jwt.sign(payload, privateKeyPEM, {
                algorithm: 'PS256',
                keyid: keyId,
            });
        } catch (error) {
            this.logger.error('Error generating JWT:', error);
            throw error;
        }
    }
} 