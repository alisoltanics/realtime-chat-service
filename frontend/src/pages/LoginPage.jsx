import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { endpoints } from "../lib/api.js";
import { setSession } from "../lib/session.js";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", displayName: "" });
  const [error, setError] = useState(null);
  const [isPending, setPending] = useState(false);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload =
        mode === "login"
          ? { username: form.username.trim(), password: form.password }
          : {
              username: form.username.trim(),
              password: form.password,
              display_name: form.displayName.trim(),
            };
      const session =
        mode === "login" ? await endpoints.login(payload) : await endpoints.register(payload);
      setSession(session);
    } catch (err) {
      setError(err.message || "درخواست ناموفق بود");
    } finally {
      setPending(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        background: "radial-gradient(1200px 600px at 80% -10%, #1e3a8a55, transparent), #0b1220",
      }}
    >
      <Paper sx={{ p: 3, width: "100%", maxWidth: 420, borderRadius: 3 }} elevation={6}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
          چت زنده
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
          Django برای API و ذخیره‌سازی، Socket.IO برای پیام زنده.
        </Typography>

        <Tabs
          value={mode}
          onChange={(_, value) => {
            setMode(value);
            setError(null);
          }}
          variant="fullWidth"
          sx={{ mb: 2 }}
        >
          <Tab value="login" label="ورود" />
          <Tab value="register" label="ثبت‌نام" />
        </Tabs>

        <Stack component="form" spacing={2} onSubmit={submit}>
          <TextField
            label="نام کاربری"
            value={form.username}
            onChange={update("username")}
            autoComplete="username"
            required
            autoFocus
          />
          {mode === "register" && (
            <TextField
              label="نام نمایشی"
              value={form.displayName}
              onChange={update("displayName")}
              autoComplete="name"
            />
          )}
          <TextField
            label="رمز عبور"
            type="password"
            value={form.password}
            onChange={update("password")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            helperText={mode === "register" ? "حداقل ۸ کاراکتر" : undefined}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={isPending}>
            {isPending ? <CircularProgress size={22} /> : mode === "login" ? "ورود" : "ثبت‌نام"}
          </Button>
        </Stack>

        <Box sx={{ mt: 2, textAlign: "center" }}>
          <Typography variant="caption" sx={{ opacity: 0.65 }}>
            حساب آزمایشی:{" "}
            <Link
              component="button"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, username: "ali", password: "ali12345" }))}
              sx={{ p: 0 }}
            >
              ali / ali12345
            </Link>{" "}
            یا{" "}
            <Link
              component="button"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, username: "sara", password: "sara12345" }))}
              sx={{ p: 0 }}
            >
              sara / sara12345
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}