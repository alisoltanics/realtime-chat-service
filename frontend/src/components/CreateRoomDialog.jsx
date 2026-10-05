import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export default function CreateRoomDialog({ open, onClose, onSubmit, isPending, error }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    onSubmit({ name: trimmed, is_public: isPublic });
    setName("");
    setIsPublic(true);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>اتاق جدید</DialogTitle>
      <DialogContent>
        <Typography component="label" htmlFor="create-room-name" variant="body2" sx={{ display: "block", mb: 0.8, mt: 0.5, fontWeight: 650 }}>
          نام اتاق
        </Typography>
        <TextField
          id="create-room-name"
          autoFocus
          fullWidth
          margin="dense"
          value={name}
          onChange={(event) => setName(event.target.value)}
          inputProps={{ "aria-label": "نام اتاق" }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          helperText="نام انگلیسی یا فارسی؛ آدرس اتاق به صورت خودکار ساخته می‌شود."
        />
        <FormControlLabel
          sx={{ mt: 2 }}
          control={
            <Switch checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          }
          label="عمومی (همه بتوانند وارد شوند)"
        />
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>انصراف</Button>
        <Button onClick={submit} variant="contained" disabled={name.trim().length < 2 || isPending}>
          بساز
        </Button>
      </DialogActions>
    </Dialog>
  );
}
