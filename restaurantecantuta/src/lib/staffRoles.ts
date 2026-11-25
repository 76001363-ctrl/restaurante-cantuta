export type StaffRole = 'admin' | 'cocina' | 'mesero' | 'caja';

export type StaffOrderAction =
  | 'start_preparing'
  | 'ready'
  | 'serve'
  | 'request_bill'
  | 'confirm'
  | 'complete';

export function normalizeStaffRole(value: unknown): StaffRole | null {
  if (value === 'admin' || value === 'cocina') return value;
  if (value === 'mesero' || value === 'mesera' || value === 'moza') return 'mesero';
  if (value === 'caja' || value === 'cajas') return 'caja';
  return null;
}

export function canPerformStaffOrderAction(
  role: StaffRole,
  action: StaffOrderAction
): boolean {
  if (role === 'admin') return true;
  if (role === 'cocina') return action === 'start_preparing' || action === 'ready';
  if (role === 'mesero') return action === 'serve' || action === 'request_bill';
  return role === 'caja' && (action === 'confirm' || action === 'complete');
}
