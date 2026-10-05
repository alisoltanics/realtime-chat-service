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
import Avatar from "@mui/material/Avatar";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";

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
      className="login-page"
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 1.5, sm: 3 },
        background: "radial-gradient(ellipse at 18% 12%, rgba(64,120,151,.16), transparent 32%), radial-gradient(ellipse at 90% 90%, rgba(87,69,153,.17), transparent 30%), #080f1b",
      }}
    >
      <Paper className="auth-card" elevation={0} sx={{ display: "flex", width: "100%", maxWidth: 960, minHeight: 590, overflow: "hidden", border: "1px solid rgba(174,194,210,.13)", borderRadius: { xs: 4, sm: 5 }, background: "rgba(15,25,40,.92)", boxShadow: "0 32px 100px rgba(0,0,0,.42)" }}>
        <Box className="auth-story" sx={{ width: "46%", p: { sm: 4.5, md: 6 }, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", background: "linear-gradient(145deg, rgba(19,87,91,.9), rgba(22,39,61,.96) 58%, rgba(41,36,82,.96))" }}>
          <Box className="story-orb story-orb-one" />
          <Box className="story-orb story-orb-two" />
          <Stack direction="row" spacing={0} alignItems="center" sx={{ position: "relative" }}>
            <Avatar className="auth-brand-avatar" variant="rounded" sx={{ width: 44, height: 44, bgcolor: "primary.main", color: "primary.contrastText" }}><ForumRoundedIcon /></Avatar>
            <Typography variant="subtitle1" fontWeight={800}>سرچ‌وایز چت</Typography>
          </Stack>
          <Box sx={{ my: "auto", py: 5, position: "relative" }}>
            <ChipStory icon={<BoltRoundedIcon />} label="گفت‌وگو، همین حالا" />
            <Typography variant="h3" sx={{ fontWeight: 900, lineHeight: 1.45, mt: 2.5, mb: 1.5, fontSize: { sm: 34, md: 42 } }}>
              حرف‌هایتان را زنده با هم شریک شوید.
            </Typography>
            <Typography color="rgba(237,244,247,.72)" sx={{ lineHeight: 2, maxWidth: 350 }}>
              وارد فضای گفت‌وگو شوید، پیام بفرستید و حضور دوستانتان را همان لحظه ببینید.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0} alignItems="center" sx={{ position: "relative", p: 1.5, borderRadius: 3, bgcolor: "rgba(6,14,25,.23)", border: "1px solid rgba(255,255,255,.08)" }}>
            <GroupsRoundedIcon sx={{ color: "primary.light", marginInlineEnd: 1.25 }} />
            <Typography variant="body2" color="rgba(237,244,247,.8)">اتاق‌های عمومی و خصوصی، در یک جا</Typography>
          </Stack>
        </Box>
        <Box className="auth-form-side" sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2.5, sm: 4, md: 6 } }}>
          <Box sx={{ width: "100%", maxWidth: 360 }}>
        <Typography variant="h5" sx={{ fontWeight: 850, mb: 0.6 }}>
          {mode === "login" ? "خوش برگشتی" : "به سرچ‌وایز چت بپیوند"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {mode === "login" ? "برای ادامه وارد حساب کاربری‌ات شو." : "حساب بساز و گفت‌وگو را شروع کن."}
        </Typography>

        <Tabs
          value={mode}
          onChange={(_, value) => {
            setMode(value);
            setError(null);
          }}
          variant="fullWidth"
          sx={{ mb: 2.5, "& .MuiTab-root": { minHeight: 44, fontWeight: 700 } }}
        >
          <Tab value="login" label="ورود" />
          <Tab value="register" label="ثبت‌نام" />
        </Tabs>

        <Stack component="form" spacing={2} onSubmit={submit}>
          <Box>
            <Typography component="label" htmlFor="login-username" variant="body2" sx={{ display: "block", mb: 0.8, fontWeight: 650 }}>نام کاربری</Typography>
            <TextField
              id="login-username"
              fullWidth
              value={form.username}
              onChange={update("username")}
              autoComplete="username"
              inputProps={{ "aria-label": "نام کاربری" }}
              required
              autoFocus
            />
          </Box>
          {mode === "register" && (
            <Box>
              <Typography component="label" htmlFor="login-display-name" variant="body2" sx={{ display: "block", mb: 0.8, fontWeight: 650 }}>نام نمایشی</Typography>
              <TextField
                id="login-display-name"
                fullWidth
                value={form.displayName}
                onChange={update("displayName")}
                autoComplete="name"
                inputProps={{ "aria-label": "نام نمایشی" }}
              />
            </Box>
          )}
          <Box>
            <Typography component="label" htmlFor="login-password" variant="body2" sx={{ display: "block", mb: 0.8, fontWeight: 650 }}>رمز عبور</Typography>
            <TextField
              id="login-password"
              fullWidth
              type="password"
              value={form.password}
              onChange={update("password")}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              inputProps={{ "aria-label": "رمز عبور" }}
              required
              helperText={mode === "register" ? "حداقل ۸ کاراکتر" : undefined}
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={isPending} sx={{ mt: 0.5, minHeight: 48 }}>
            {isPending ? <CircularProgress size={22} /> : mode === "login" ? "ورود" : "ثبت‌نام"}
          </Button>
        </Stack>

        <Box sx={{ mt: 2, textAlign: "center" }}>
          <Typography variant="caption" sx={{ opacity: 0.65 }}>
            حساب آزمایشی:{" "}
            <Link component="button" type="button" onClick={() => setForm((prev) => ({ ...prev, username: "ali", password: "ali12345" }))} sx={{ p: 0 }}>
              ali / ali12345
            </Link>{" "}
            یا{" "}
            <Link component="button" type="button" onClick={() => setForm((prev) => ({ ...prev, username: "sara", password: "sara12345" }))} sx={{ p: 0 }}>
              sara / sara12345
            </Link>
          </Typography>
        </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

function ChipStory({ icon, label }) {
  return (
    <Box className="story-chip" sx={{ display: "inline-flex", alignItems: "center", gap: 0, px: 1.2, py: 0.65, borderRadius: 999, bgcolor: "rgba(96,213,194,.12)", color: "primary.light", fontSize: 12, fontWeight: 700 }}>
      {icon}{label}
    </Box>
  );
}
