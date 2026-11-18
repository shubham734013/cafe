import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_ITEMS } from '../data/cafeSeedData';
import { useCafeStore } from './useCafeStore';

test('customer cart starts empty and preserves selected quantities', () => {
  const store = useCafeStore.getState();
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
