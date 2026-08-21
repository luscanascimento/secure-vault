import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { PasswordStrengthService } from './password-strength.service';

/**
 * Authentication feature module. JwtModule is registered without a global
 * secret — each sign/verify call passes the correct (access vs refresh) secret
 * explicitly, keeping the two key domains isolated.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, CookieService, PasswordStrengthService],
  exports: [JwtModule],
})
export class AuthModule {}
