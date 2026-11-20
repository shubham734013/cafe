import test from 'node:test';
import assert from 'node:assert/strict';
import { getPathForScreen, isAdminPath, isKitchenPath, resolveCafeRoute } from './routes';
import { canStaffRoleAccessScreen, getDefaultStaffScreenForRole } from '../utils/rbac';

test('customer and staff screens have stable URL routes', () => {
  assert.equal(getPathForScreen('menu'), '/customer/menu');
  assert.equal(getPathForScreen('profile'), '/customer/profile');
  assert.deepEqual(resolveCafeRoute('/customer/profile'), {
    screen: 'profile',
    mode: 'customer',
  });
  assert.equal(getPathForScreen('pos-terminal'), '/admin/pos');
  assert.equal(getPathForScreen('pos-terminal', { kitchen: true }), '/kitchen/pos');
  assert.equal(getPathForScreen('order-management', { kitchen: true }), '/kitchen/orders');
  assert.equal(getPathForScreen('table-layout', { kitchen: true }), '/kitchen/tables-management');
  assert.equal(getPathForScreen('inventory-stock', { kitchen: true }), '/kitchen/inventory');
  assert.equal(getPathForScreen('settings-cafe-profile', { kitchen: true }), '/kitchen/settings');
  assert.equal(getPathForScreen('staff-home'), '/admin/home');
  assert.equal(getPathForScreen('kitchen-display-system'), '/admin/kitchen');
  assert.equal(getPathForScreen('pos-orders'), '/admin/pos-orders');
  assert.equal(getPathForScreen('pos-orders', { kitchen: true }), '/kitchen/pos-orders');
  assert.equal(getPathForScreen('kitchen-tables'), '/admin/kitchen/tables');
  assert.equal(getPathForScreen('kitchen-tables', { kitchen: true }), '/kitchen/tables');
  assert.equal(getPathForScreen('kitchen-display-system', { admin: true }), '/admin/kitchen');
  assert.equal(getPathForScreen('kitchen-tables', { admin: true }), '/admin/kitchen/tables');
  assert.equal(getPathForScreen('admin-dashboard'), '/admin');
  assert.equal(resolveCafeRoute('/customer/menu').screen, 'menu');
  assert.deepEqual(resolveCafeRoute('/admin/orders'), {
    screen: 'order-management',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/admin/home'), {
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
  assert.deepEqual(resolveCafeRoute('/admin/kitchen/tables'), {
    screen: 'kitchen-tables',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/admin/kitchen'), {
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
  assert.deepEqual(resolveCafeRoute('/kitchen/settings'), {
    screen: 'settings-cafe-profile',
    mode: 'staff',
  });
  assert.deepEqual(resolveCafeRoute('/admin'), {
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
  assert.deepEqual(resolveCafeRoute('/customer/tracking'), {
    screen: 'tracking',
    mode: 'customer',
  });
  assert.deepEqual(resolveCafeRoute('/customer/tracking', '?orderId=SSCB100'), {
    screen: 'tracking',
    mode: 'customer',
  });
  assert.deepEqual(resolveCafeRoute('/', '?orderId=SSCB100'), {
    screen: 'tracking',
    mode: 'customer',
  });
  assert.equal(resolveCafeRoute('/menu').screen, 'splash');
  assert.equal(resolveCafeRoute('/cart').screen, 'splash');
  assert.equal(resolveCafeRoute('/manager/orders').screen, 'splash');
  assert.equal(resolveCafeRoute('/staff/dashboard').screen, 'splash');
  assert.deepEqual(resolveCafeRoute('/', '?screen=admin-dashboard'), {
    screen: 'splash',
    mode: 'customer',
  });
  assert.equal(resolveCafeRoute('/unknown/path').screen, 'splash');
});

test('kitchen route detection includes kitchen subroutes only', () => {
  assert.equal(isKitchenPath('/kitchen'), true);
  assert.equal(isKitchenPath('/kitchen/orders'), true);
  assert.equal(isKitchenPath('/admin/orders'), false);
  assert.equal(isKitchenPath('/admin'), false);
  assert.equal(isAdminPath('/admin'), true);
  assert.equal(isAdminPath('/admin/orders'), true);
  assert.equal(isAdminPath('/manager'), false);
  assert.equal(isKitchenPath('/kitchen/tables'), true);
});

test('only admin and kitchen roles receive staff access', () => {
  assert.equal(canStaffRoleAccessScreen('admin', 'staff-home'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'staff-home'), false);
  assert.equal(canStaffRoleAccessScreen(null, 'staff-home'), false);

  assert.equal(canStaffRoleAccessScreen('admin', 'settings-cafe-profile'), true);
  assert.equal(canStaffRoleAccessScreen('admin', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('admin', 'admin-dashboard'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'kitchen-display-system'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'admin-dashboard'), false);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'pos-orders'), true);
  assert.equal(canStaffRoleAccessScreen('admin', 'pos-orders'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'kitchen-tables'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'order-management'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'inventory-stock'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'pos-terminal'), false);

  assert.equal(canStaffRoleAccessScreen('admin', 'staff-roles'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'staff-roles'), false);

  assert.equal(getDefaultStaffScreenForRole('admin'), 'admin-dashboard');
  assert.equal(getDefaultStaffScreenForRole('kitchen'), 'kitchen-display-system');
  assert.equal(canStaffRoleAccessScreen('admin', 'reports-analytics'), true);
  assert.equal(canStaffRoleAccessScreen('kitchen', 'reports-analytics'), false);
});
