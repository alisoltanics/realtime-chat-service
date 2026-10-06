import { useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export default function CreateRoomDialog({ open, onClose, onSubmit, isPending, error }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [username, setUsername] = useState("");
  const [memberUsernames, setMemberUsernames] = useState([]);

  useEffect(() => {
    if (!open) {
      setName("");
      setIsPublic(true);
      setUsername("");
      setMemberUsernames([]);
    }
  }, [open]);

  const addMembers = () => {
    const names = username.split(/[\s,،]+/).map((value) => value.trim()).filter(Boolean);
    setMemberUsernames((previous) => {
      const known = new Set(previous.map((value) => value.toLowerCase()));
      return [...previous, ...names.filter((value) => !known.has(value.toLowerCase()) && known.add(value.toLowerCase()))];
    });
    setUsername("");
  };

  const submit = () => {
    const trimmed = name.trim();
    const pendingNames = username.split(/[\s,،]+/).map((value) => value.trim()).filter(Boolean);
    const seen = new Set();
    const members = [...memberUsernames, ...pendingNames].filter((member) => {
      const key = member.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (trimmed.length < 2 || (!isPublic && members.length === 0)) return;
    onSubmit({ name: trimmed, is_public: isPublic, member_usernames: members });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" dir="rtl">
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5 }}>اتاق جدید</DialogTitle>
      <DialogContent sx={{ px: 3, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography component="label" htmlFor="create-room-name" variant="body2" sx={{ display: "block", fontWeight: 650 }}>
          نام اتاق
        </Typography>
        <TextField
          id="create-room-name"
          autoFocus
          fullWidth
          margin="none"
          value={name}
          onChange={(event) => setName(event.target.value)}
          inputProps={{ "aria-label": "نام اتاق" }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          helperText="نام انگلیسی یا فارسی؛ آدرس اتاق به صورت خودکار ساخته می‌شود."
        />
        <FormControlLabel
          sx={{ mt: 0.5, mr: 0, gap: 1, "& .MuiFormControlLabel-label": { lineHeight: 1.8 } }}
          control={
            <Switch checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          }
          label="عمومی (همه بتوانند وارد شوند)"
        />
        <Typography component="label" htmlFor="create-room-members" variant="body2" sx={{ display: "block", mt: 0.5, fontWeight: 650 }}>
          افزودن افراد با نام کاربری
        </Typography>
        <Stack direction="row" alignItems="stretch" sx={{ gap: 1.5 }}>
          <TextField
            id="create-room-members"
            fullWidth
            size="small"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addMembers();
              }
            }}
            placeholder="مثلاً sara"
            inputProps={{ "aria-label": "نام کاربری اعضا" }}
          />
          <Button onClick={addMembers} disabled={!username.trim()} sx={{ minWidth: 88, px: 2 }}>افزودن</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -0.5, lineHeight: 1.8 }}>
          {isPublic ? "برای اتاق عمومی اختیاری است؛ دیگران هم می‌توانند وارد شوند." : "برای اتاق خصوصی دست‌کم یک نفر دیگر را اضافه کنید."}
        </Typography>
        {memberUsernames.length > 0 && (
          <Stack direction="row" useFlexGap flexWrap="wrap" columnGap={1} rowGap={1} sx={{ mt: 0.25 }}>
            {memberUsernames.map((member) => (
              <Chip key={member} label={member} size="small" onDelete={() => setMemberUsernames((items) => items.filter((item) => item !== member))} />
            ))}
          </Stack>
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5, lineHeight: 1.8 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ px: 2 }}>انصراف</Button>
        <Button onClick={submit} variant="contained" disabled={name.trim().length < 2 || (!isPublic && memberUsernames.length === 0 && !username.split(/[\s,،]+/).some(Boolean)) || isPending} sx={{ px: 2.5 }}>
          بساز
        </Button>
      </DialogActions>
    </Dialog>
  );
}
