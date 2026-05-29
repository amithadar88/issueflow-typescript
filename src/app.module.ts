import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import { ProjectsModule } from './projects/projects.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TicketDependenciesModule } from './ticket-dependencies/ticket-dependencies.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';
import { WorkloadModule } from './workload/workload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: parseInt(config.get('DB_PORT')),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthModule,
    ProjectsModule,
    TicketsModule,
    CommentsModule,
    AuditLogModule,
    TicketDependenciesModule,
    AttachmentsModule,
    SchedulerModule,
    WorkloadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
