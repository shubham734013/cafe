import test from 'node:test';
import assert from 'node:assert/strict';
import { getPathForScreen, isKitchenPath, isManagerPath, resolveCafeRoute } from './routes';
import { canStaffRoleAccessScreen, getDefaultStaffScreenForRole } from '../utils/rbac';

test('customer and staff screens have stable URL routes', () => {
  assert.equal(getPathForScreen('menu'), '/customer/menu');
  assert.equal(getPathForScreen('profile'), '/customer/profile');
  assert.deepEqual(resolveCafeRoute('/customer/profile'), {
    screen: 'profile',
    mode: 'customer',
  });
  assert.equal(getPathForScreen('pos-terminal'), '/manager/pos');
  assert.equal(getPathForScreen('pos-terminal', { kitchen: true }), '/kitchen/pos');
  assert.equal(getPathForScreen('order-management', { kitchen: true }), '/kitchen/orders');
  assert.equal(getPathForScreen('table-layout', { kitchen: true }), '/kitchen/tables-management');
  assert.equal(getPathForScreen('inventory-stock', { kitchen: true }), '/kitchen/inventory');
  assert.equal(getPathForScreen('staff-home'), '/manager');
  assert.equal(getPathForScreen('kitchen-display-system'), '/kitchen');
  assert.equal(getPathForScreen('pos-orders'), '/kitchen/pos-orders');
  assert.equal(getPathForScreen('kitchen-tables'), '/kitchen/tables');
  assert.equal(getPathForScreen('kitchen-display-system', { manager: true }), '/manager/kitchen');
  assert.equal(getPathForScreen('kitchen-tables', { manager: true }), '/manager/table-details');
  assert.equal(getPathForScreen('admin-dashboard'), '/admin');
  assert.equal(resolveCafeRoute('/customer/menu').screen, 'menu');
  assert.deepEqual(resolveCafeRoute('/staff/orders'), {
    screen: 'order-management',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/manager/orders'), {
    screen: 'order-management',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/staff'), {
    screen: 'staff-home',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/manager'), {
    screen: 'staff-home',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen'), {
    screen: 'kitchen-display-system',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/pos-orders'), {
    screen: 'pos-orders',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/tables'), {
    screen: 'kitchen-tables',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/manager/table-details'), {
    screen: 'kitchen-tables',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/manager/kitchen'), {
    screen: 'kitchen-display-system',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/pos'), {
    screen: 'pos-terminal',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/orders'), {
    screen: 'order-management',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/tables-management'), {
    screen: 'table-layout',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/kitchen/inventory'), {
    screen: 'inventory-stock',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/admin'), {
    screen: 'admin-dashboard',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/staff/dashboard'), {
    screen: 'admin-dashboard',
    mode: 'staff',
  });
});

test('legacy QR links and invalid paths resolve safely', () => {
  assert.deepEqual(resolveCafeRoute('/', '?autostart=1'), {
    screen: 'home',
    mode: 'customer',
  });
  assert.deepEqual(resolveCafeRoute('/', '?autostart=1&table=T4'), {
    screen: 'menu',
    mode: 'customer',
  });
  assert.deepEqual(resolveCafeRoute('/', '?screen=menu&table=T4'), {
    screen: 'menu',
    mode: 'customer',
  });
  assert.deepEqual(resolveCafeRoute('/', '?screen=admin-dashboard'), {
    screen: 'splash',
    mode: 'customer',
  });
  assert.equal(resolveCafeRoute('/unknown/path').screen, 'splash');
});

test('kitchen route detection includes kitchen subroutes only', () => {
  assert.equal(isKitchenPath('/kitchen'), true);
  assert.equal(isKitchenPath('/kitchen/orders'), true);
  assert.equal(isKitchenPath('/manager/orders'), false);
  assert.equal(isKitchenPath('/admin'), false);
  assert.equal(isManagerPath('/manager'), true);
  assert.equal(isManagerPath('/manager/table-details'), true);
  assert.equal(isManagerPath('/admin'), true);
  assert.equal(isManagerPath('/kitchen/tables'), false);
});

test('staff routes follow the role permission matrix and role-specific landing routes', () => {
  assert.equal(canStaffRoleAccessScreen('super-admin', 'staff-home'), true);
  assert.equal(canStaffRoleAccessScreen('owner', 'staff-home'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'staff-home'), true);
  assert.equal(canStaffRoleAccessScreen('cashier', 'staff-home'), false);
  assert.equal(canStaffRoleAccessScreen('barista', 'staff-home'), false);
  assert.equal(canStaffRoleAccessScreen('server', 'staff-home'), false);
  assert.equal(canStaffRoleAccessScreen(null, 'staff-home'), false);

  assert.equal(canStaffRoleAccessScreen('super-admin', 'settings-cafe-profile'), true);
  assert.equal(canStaffRoleAccessScreen('super-admin', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'admin-dashboard'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'settings-cafe-profile'), true);
  assert.equal(canStaffRoleAccessScreen('owner', 'admin-dashboard'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'kitchen-display-system'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'admin-dashboard'), false);
  assert.equal(canStaffRoleAccessScreen('cashier', 'admin-dashboard'), false);
  assert.equal(canStaffRoleAccessScreen('barista', 'pos-orders'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'pos-orders'), true);
  assert.equal(canStaffRoleAccessScreen('cashier', 'pos-orders'), false);
  assert.equal(canStaffRoleAccessScreen('barista', 'kitchen-tables'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'order-management'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'inventory-stock'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'pos-terminal'), false);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'inventory-stock'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'kitchen-display-system'), true);

  assert.equal(canStaffRoleAccessScreen('owner', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('manager', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('cashier', 'staff-roles'), false);
  assert.equal(canStaffRoleAccessScreen('barista', 'staff-roles'), false);
  assert.equal(canStaffRoleAccessScreen('server', 'staff-roles'), false);

  assert.equal(getDefaultStaffScreenForRole('super-admin'), 'admin-dashboard');
  assert.equal(getDefaultStaffScreenForRole('owner'), 'admin-dashboard');
  assert.equal(getDefaultStaffScreenForRole('manager'), 'admin-dashboard');
  assert.equal(getDefaultStaffScreenForRole('cashier'), 'pos-terminal');
  assert.equal(getDefaultStaffScreenForRole('barista'), 'kitchen-display-system');
  assert.equal(getDefaultStaffScreenForRole('kitchen'), 'kitchen-display-system');
  assert.equal(getDefaultStaffScreenForRole('server'), 'table-layout');
  assert.equal(getDefaultStaffScreenForRole('waiter'), 'table-layout');

  assert.equal(canStaffRoleAccessScreen('cashier', 'order-management'), true);
  assert.equal(canStaffRoleAccessScreen('cashier', 'reports-analytics'), false);
  assert.equal(canStaffRoleAccessScreen('barista', 'kitchen-display-system'), true);
  assert.equal(canStaffRoleAccessScreen('barista', 'pos-terminal'), false);
  assert.equal(canStaffRoleAccessScreen('server', 'table-layout'), true);
  assert.equal(canStaffRoleAccessScreen('server', 'inventory-stock'), true);
  assert.equal(canStaffRoleAccessScreen('waiter', 'inventory-stock'), true);
});
