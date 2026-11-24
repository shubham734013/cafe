import type { MenuItem } from '../types/cafe';

export function isRegularOnlyMenuItem(
  item: Pick<MenuItem, 'id' | 'category' | 'name'>
): boolean {
  const category = item.category.toLowerCase();
  return (
    item.id === 'black-coffee' ||
    item.name.trim().toLowerCase() === 'black coffee' ||
    category.includes('pizza') ||
    category.includes('maggi') ||
    category.includes('burger') ||
    category.includes('sandwich') ||
    category.includes('shake')
  );
}

export function getItemVariants(
  item: MenuItem
): Array<{ size: string; price: number; label?: string }> {
  const base = item.price;
  if (isRegularOnlyMenuItem(item)) {
    return [{ size: 'Regular', price: base, label: 'Regular' }];
  }

  if (item.variants && item.variants.length > 0) {
    return item.variants;
  }

  const category = item.category.toLowerCase();

  if (category.includes('beverage') || category.includes('coffee') || category.includes('shake')) {
    return [
      { size: 'Regular', price: base, label: 'Regular (250 ml)' },
      { size: 'Large', price: Math.round(base * 1.25), label: 'Large (350 ml)' },
      { size: 'Extra Large', price: Math.round(base * 1.5), label: 'Extra Large (450 ml)' },
    ];
  }

  if (category.includes('pizza')) {
    return [
      { size: 'Regular 7"', price: base, label: 'Regular (7 Inch)' },
      { size: 'Medium 10"', price: Math.round(base * 1.4), label: 'Medium (10 Inch)' },
      { size: 'Large 12"', price: Math.round(base * 1.8), label: 'Large (12 Inch)' },
    ];
  }

  if (
    category.includes('burger') ||
    category.includes('sandwich') ||
    category.includes('maggi') ||
    category.includes('fries')
  ) {
    return [
      { size: 'Regular', price: base, label: 'Regular / Single' },
      { size: 'Large', price: Math.round(base * 1.35), label: 'Large / Double' },
    ];
  }

  return [
    { size: 'Regular', price: base, label: 'Regular' },
    { size: 'Large', price: Math.round(base * 1.3), label: 'Large' },
  ];
}
