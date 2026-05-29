export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
} as const;

export const EntityType = {
  USER: 'User',
  PROJECT: 'Project',
  TICKET: 'Ticket',
  COMMENT: 'Comment',
} as const;
