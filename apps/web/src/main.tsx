import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { queryClient } from './lib/queryClient';
import { router } from './router';
import { Icons } from './components/icons';
import './styles/tokens.css';
import './styles/tailwind.css';
import './styles/app.css';

function InnerApp() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return (
      <div className="grid h-full place-items-center bg-app">
        <span className="grid h-[44px] w-[44px] place-items-center rounded-lg bg-primary text-onprimary [&>svg]:h-6 [&>svg]:w-6">
          <Icons.Logo />
        </span>
      </div>
    );
  }
  return <RouterProvider router={router} context={{ queryClient, auth }} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <InnerApp />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
