import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/guards/csrf.guard';
import type { AuthResponse, AuthUser } from '@secure-vault/shared-types';

/**
 * Auth endpoints. Auth routes carry STRICTER rate limits than the global
 * default (brute-force protection). Access tokens are returned in the JSON body
 * (kept in memory by the SPA); the refresh + CSRF tokens are set as cookies.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: CookieService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.authService.register(dto);
    this.cookies.setSessionCookies(res, tokens);
    return { user: user as AuthUser, accessToken: tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.authService.login(dto);
    this.cookies.setSessionCookies(res, tokens);
    return { user: user as AuthUser, accessToken: tokens.accessToken };
  }

  /**
   * Rotates the refresh token. Public (the access token may be expired) but
   * requires the httpOnly refresh cookie + a matching CSRF header.
   */
  @Public()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const raw = req.cookies?.[this.cookies.refreshCookieName];
    const tokens = await this.authService.refresh(raw);
    this.cookies.setSessionCookies(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = req.cookies?.[this.cookies.refreshCookieName];
    await this.authService.logout(raw);
    this.cookies.clearSessionCookies(res);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return (await this.authService.getProfile(user.id)) as AuthUser;
  }
}
