import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import AppShell from "./components/AppShell.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { ApiError, setUnauthorizedHandler } from "./lib/api.js";
import { clearSession, getSession, subscribe } from "./lib/session.js";
import { disconnectSocket } from "./lib/socket.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

const theme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
    primary: { main: "#38bdf8" },
    secondary: { main: "#a78bfa" },
    background: { default: "#0b1220", paper: "#111c31" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Vazirmatn, "Segoe UI", Tahoma, system-ui, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#0b1220" },
      },
    },
  },
});

export default function App() {
  const [session, setSessionState] = useState(() => getSession());

  useEffect(() => subscribe(setSessionState), []);

  const logout = useCallback(() => {
    disconnectSocket();
    queryClient.clear();
    clearSession();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      disconnectSocket();
      clearSession();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {session?.access ? (
          <AppShell session={session} onLogout={logout} />
        ) : (
          <LoginPage />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export { ApiError };