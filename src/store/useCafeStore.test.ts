import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_ITEMS } from '../data/cafeSeedData';
import { useCafeStore } from './useCafeStore';

test('customer cart starts empty and preserves selected quantities', () => {
  const store = useCafeStore.getState();
  store.clearCustomerCart();
  const item = MENU_ITEMS[0];
  const anotherItem = MENU_ITEMS[1];

  assert.equal(store.customerCart.length, 0);

  store.addCustomerItem(item, 3);
  store.addCustomerItem(item, 2);
  store.addCustomerItem(anotherItem);

  const cart = useCafeStore.getState().customerCart;
  assert.equal(cart.find((cartItem) => cartItem.menuItemId === item.id)?.quantity, 5);
  assert.equal(cart.find((cartItem) => cartItem.menuItemId === anotherItem.id)?.quantity, 1);
  useCafeStore.getState().clearCustomerCart();
});

test('customer cart keeps selected variants separate and uses catalog prices', () => {
  const store = useCafeStore.getState();
  store.clearCustomerCart();
  const item = MENU_ITEMS.find((menuItem) => menuItem.id === 'cold-coffee');
  assert.ok(item?.variants);
  const [normal, medium] = item.variants;
  assert.ok(normal);
  assert.ok(medium);

  store.addCustomerItem(item, 1, normal.size);
  store.addCustomerItem(item, 1, medium.size);
  store.addCustomerItem(item, 2, medium.size);

  let cart = useCafeStore.getState().customerCart;
  assert.deepEqual(
    cart.map(({ size, price, quantity }) => ({ size, price, quantity })),
    [
      { size: normal.size, price: normal.price, quantity: 1 },
      { size: medium.size, price: medium.price, quantity: 3 },
    ]
  );

  useCafeStore.getState().updateCustomerQty(item.id, -1, medium.size);
  cart = useCafeStore.getState().customerCart;
  assert.equal(cart.find((cartItem) => cartItem.size === normal.size)?.quantity, 1);
  assert.equal(cart.find((cartItem) => cartItem.size === medium.size)?.quantity, 2);

  useCafeStore.getState().removeCustomerItem(item.id, normal.size);
  cart = useCafeStore.getState().customerCart;
  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.size, medium.size);
  useCafeStore.getState().clearCustomerCart();
});

test('POS cart keeps product sizes separate and uses each catalog variant price', () => {
  const store = useCafeStore.getState();
  store.clearPosCart();
  const item = MENU_ITEMS.find((menuItem) => menuItem.id === 'cold-coffee');
  assert.ok(item?.variants);
  const [regular, medium] = item.variants;
  assert.ok(regular);
  assert.ok(medium);

  store.addPosItem(item, regular);
  store.addPosItem(item, medium);
  store.addPosItem(item, regular);

  let cart = useCafeStore.getState().posCart;
  assert.equal(cart.length, 2);
  assert.deepEqual(
    cart.map(({ size, price, quantity }) => ({ size, price, quantity })),
    [
      { size: regular.size, price: regular.price, quantity: 2 },
      { size: medium.size, price: medium.price, quantity: 1 },
    ]
  );

  useCafeStore.getState().updatePosQty(item.id, -1, regular.size);
  cart = useCafeStore.getState().posCart;
  assert.equal(cart.find((cartItem) => cartItem.size === regular.size)?.quantity, 1);
  assert.equal(cart.find((cartItem) => cartItem.size === medium.size)?.quantity, 1);
  useCafeStore.getState().clearPosCart();
});

test('staff navigation preserves the kitchen route family', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let currentUrl = new URL('http://localhost/kitchen');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get location() {
        return currentUrl;
      },
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          currentUrl = new URL(url, currentUrl);
        },
      },
    },
  });

  try {
    useCafeStore.getState().navigate('order-management', 'staff', { role: 'admin' });
    assert.equal(currentUrl.pathname, '/kitchen/orders');

    currentUrl = new URL('http://localhost/admin');
    useCafeStore.getState().navigate('kitchen-display-system', 'staff', { role: 'kitchen' });
    assert.equal(currentUrl.pathname, '/kitchen');
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    useCafeStore.setState({ activeScreen: 'splash', workspaceMode: 'customer' });
  }
});
