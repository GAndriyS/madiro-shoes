import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { RealtimeGateway } from './realtime.gateway';

/**
 * Global so any domain service can announce a change without a module import
 * dance — every write path (intake, pricing, sale, return, write-off) is a
 * publisher.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
