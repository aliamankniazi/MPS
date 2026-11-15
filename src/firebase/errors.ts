'use client';

type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

/**
 * Raised by the app's data code when a read or write is refused. Kept with
 * its original name and shape because the data hooks construct it.
 */
export class FirestorePermissionError extends Error {
  public readonly request: { method: string; path: string; resource?: { data: any } };

  constructor(context: SecurityRuleContext) {
    super(`Missing or insufficient permissions: ${context.operation} at ${context.path}`);
    this.name = 'FirestorePermissionError';
    this.request = {
      method: context.operation,
      path: context.path,
      resource: context.requestResourceData === undefined ? undefined : { data: context.requestResourceData },
    };
  }
}
