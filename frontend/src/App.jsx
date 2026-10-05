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
    primary: { main: "#60d5c2", light: "#91ecdc", dark: "#168f82", contrastText: "#062b2c" },
    secondary: { main: "#a99aff" },
    background: { default: "#080f1b", paper: "#111b2b" },
    text: { primary: "#edf4f7", secondary: "#9bacbc" },
    divider: "rgba(174, 194, 210, 0.12)",
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Vazirmatn, "Segoe UI", Tahoma, system-ui, sans-serif',
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#080f1b", color: "#edf4f7" },
        "*": { scrollbarColor: "rgba(148,163,184,.28) transparent" },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 12, minHeight: 42 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 13,
          backgroundColor: "rgba(6, 14, 25, .5)",
          "& fieldset": { borderColor: "rgba(174,194,210,.16)" },
          "&:hover fieldset": { borderColor: "rgba(96,213,194,.42)" },
        },
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
