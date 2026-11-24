import { createContext, useContext } from 'react';

interface CustomerThemeContextValue {
  isLightTheme: boolean;
  toggleTheme: () => void;
}

const CustomerThemeContext = createContext<CustomerThemeContextValue | null>(null);

export const CustomerThemeProvider = CustomerThemeContext.Provider;

export function useCustomerTheme(): CustomerThemeContextValue {
  const context = useContext(CustomerThemeContext);
  if (!context) {
    throw new Error('Customer theme must be used within CustomerThemeProvider.');
  }
  return context;
}
