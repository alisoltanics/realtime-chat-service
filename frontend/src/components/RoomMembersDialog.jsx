import { useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import PersonRemoveAlt1RoundedIcon from "@mui/icons-material/PersonRemoveAlt1Rounded";

import { initials } from "../lib/format.js";

export default function RoomMembersDialog({ open, onClose, members = [], canManage, onAdd, onRemove, isAdding, isRemoving, removingUserId, error }) {
  const [username, setUsername] = useState("");

  const add = async () => {
    const value = username.trim();
    if (!value) return;
    try {
      await onAdd(value);
      setUsername("");
    } catch {
      // The mutation error is rendered below; keep the entered username for correction.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" dir="rtl">
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5 }}>اعضای اتاق</DialogTitle>
      <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
        {canManage && (
          <Box component="form" onSubmit={(event) => { event.preventDefault(); add(); }} sx={{ mb: 2.5 }}>
            <Typography component="label" htmlFor="room-member-username" variant="body2" sx={{ display: "block", mb: 1, fontWeight: 650 }}>
              افزودن با نام کاربری
            </Typography>
            <Stack direction="row" alignItems="stretch" sx={{ gap: 1.5 }}>
              <TextField
                id="room-member-username"
                fullWidth
                size="small"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="مثلاً sara"
                inputProps={{ "aria-label": "نام کاربری عضو" }}
              />
              <Button type="submit" variant="contained" disabled={!username.trim() || isAdding} sx={{ minWidth: 88, px: 2 }}>
                افزودن
              </Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 1.5, gap: 0.75, alignItems: "center" }}>{error}</Alert>}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {members.length} عضو
        </Typography>
        <Stack spacing={1}>
          {members.map((membership) => {
            const user = membership.user;
            const name = user.display_name || user.username;
            const isOwner = membership.role === "admin";
            return (
              <Box key={membership.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25, borderRadius: 2, bgcolor: "rgba(255,255,255,.03)" }}>
                <Avatar sx={{ width: 36, height: 36, flex: "0 0 auto", bgcolor: isOwner ? "primary.dark" : "secondary.main" }}>{initials(name)}</Avatar>
                <Typography variant="body2" noWrap sx={{ flex: 1, textAlign: "right" }}>{name}</Typography>
                {isOwner && <Chip size="small" icon={<WorkspacePremiumRoundedIcon />} label="مالک" color="primary" variant="outlined" sx={{ px: 0.5, gap: 0.5, "& .MuiChip-icon": { mr: 0, ml: 0.5 } }} />}
                {canManage && !isOwner && (
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`حذف ${name} از اتاق`}
                    title="حذف از اتاق"
                    disabled={isRemoving}
                    onClick={() => onRemove(user.id)}
                  >
                    <PersonRemoveAlt1RoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ px: 2 }}>بستن</Button>
      </DialogActions>
    </Dialog>
  );
}
