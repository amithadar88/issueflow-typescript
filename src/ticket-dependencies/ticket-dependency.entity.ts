import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('ticket_dependencies')
@Unique(['ticketId', 'dependsOnId'])
export class TicketDependency {
  @PrimaryGeneratedColumn()
  id: number;

  // The ticket that is blocked / has a prerequisite.
  @Column()
  ticketId: number;

  // The ticket that must be completed first (the blocker).
  @Column()
  dependsOnId: number;

  @CreateDateColumn()
  createdAt: Date;
}
