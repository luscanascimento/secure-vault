import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { PasswordService } from './password.service';

/**
 * Cryptographic primitives (password hashing + AES-256-GCM encryption).
 * Global so auth and notes modules can reuse the same configured instances.
 */
@Global()
@Module({
  providers: [EncryptionService, PasswordService],
  exports: [EncryptionService, PasswordService],
})
export class CryptoModule {}
