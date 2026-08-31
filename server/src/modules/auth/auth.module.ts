import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      // One hour, not a week. A JWT cannot be revoked once signed, so its lifetime is
      // the whole of its damage window — a token copied out of a browser used to be
      // good for seven days. The client renews silently against /auth/refresh, which
      // *can* be revoked, so this costs the user nothing.
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}