import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditActor {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: number;

  @Column({ nullable: true })
  performedBy: number | null;

  @Column({ type: 'enum', enum: AuditActor, default: AuditActor.USER })
  actor: AuditActor;

  @CreateDateColumn()
  timestamp: Date;
}
