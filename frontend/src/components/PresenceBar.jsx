import { useEffect, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";

import { initials } from "../lib/format.js";
import { getSession } from "../lib/session.js";

const PREVIEW_LIMIT = 5;

function OnlineMemberRow({ id, user, membership, currentUserId }) {
  const name = membership?.user?.display_name || user?.display_name || membership?.user?.username || user?.username || `کاربر #${id}`;
  const isOwner = membership?.role === "admin";
  const isCurrentUser = String(id) === String(currentUserId);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
        px: 1,
        py: 0.8,
        borderRadius: 2,
        bgcolor: "rgba(255,255,255,.025)",
      }}
    >
      <Box sx={{ position: "relative", flex: "0 0 auto" }}>
        <Avatar sx={{ width: 34, height: 34, fontSize: 12, bgcolor: isOwner ? "primary.dark" : "secondary.main" }}>
          {initials(name)}
        </Avatar>
        <Box
          sx={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: "#51d69a",
            border: "2px solid #111b2b",
          }}
        />
      </Box>
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, textAlign: "right", fontWeight: 600 }}>
        {name}{isCurrentUser ? " (شما)" : ""}
      </Typography>
      {isOwner && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, flex: "0 0 auto", color: "primary.light" }}>
          <WorkspacePremiumRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>مالک</Typography>
        </Box>
      )}
    </Box>
  );
}

export default function PresenceBar({ onlineIds = [], onlineUsers = [], members = [], joined = false }) {
  const currentUserId = getSession()?.user?.id ?? null;
  const memberByUserId = new Map(
    members.map((membership) => [String(membership.user.id), membership])
  );
  const [anchorEl, setAnchorEl] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const closeTimer = useRef(null);
  const userById = new Map(onlineUsers.map((user) => [String(user.id), user]));
  const onlineMembers = onlineIds.map((id) => ({
    id,
    user: userById.get(String(id)),
    membership: memberByUserId.get(String(id)),
  }));
  const previewMembers = onlineMembers.slice(0, PREVIEW_LIMIT);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setAnchorEl(null), 300);
  };

  useEffect(() => () => cancelClose(), []);

  const openPopover = (event) => {
    cancelClose();
    setAnchorEl(event.currentTarget);
  };

  const ensurePopoverOpen = (event) => {
    cancelClose();
    setAnchorEl((current) => current ?? event.currentTarget);
  };

  if (!joined) {
    return <Typography variant="caption" color="text.secondary">در حال ورود به اتاق…</Typography>;
  }

  if (onlineMembers.length === 0) {
    return <Typography variant="caption" color="text.secondary">فعلاً کسی آنلاین نیست</Typography>;
  }

  return (
    <>
      <Button
        size="small"
        color="inherit"
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
        onClick={ensurePopoverOpen}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorEl)}
        startIcon={<GroupsRoundedIcon />}
        endIcon={(
          <Box
            component="span"
            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#51d69a", flex: "0 0 auto" }}
          />
        )}
        sx={{
          minHeight: 34,
          px: 1.5,
          gap: 1,
          border: "1px solid rgba(174,194,210,.16)",
          borderRadius: 2.5,
          color: "text.secondary",
          whiteSpace: "nowrap",
          "& .MuiButton-startIcon, & .MuiButton-endIcon": { m: 0 },
          "&:hover": { borderColor: "rgba(96,213,194,.4)", bgcolor: "rgba(96,213,194,.06)" },
        }}
      >
        {onlineMembers.length} نفر آنلاین
      </Button>

      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-end"
        modifiers={[{ name: "offset", options: { offset: [0, 3] } }]}
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
      >
        <Paper
          role="dialog"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          dir="rtl"
          sx={{ p: 1, width: 290, maxWidth: "calc(100vw - 32px)", bgcolor: "#111b2b", border: "1px solid rgba(174,194,210,.14)" }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 1, pt: 0.5, pb: 1 }}>
            افراد آنلاین در این اتاق
          </Typography>
          <Box sx={{ display: "grid", gap: 0.6 }}>
            {previewMembers.map(({ id, user, membership }) => (
              <OnlineMemberRow key={id} id={id} user={user} membership={membership} currentUserId={currentUserId} />
            ))}
          </Box>
          {onlineMembers.length > PREVIEW_LIMIT && (
            <Button
              fullWidth
              size="small"
              onClick={() => {
                setAnchorEl(null);
                setAllOpen(true);
              }}
              sx={{ mt: 1, justifyContent: "center" }}
            >
              نمایش همهٔ {onlineMembers.length} نفر
            </Button>
          )}
        </Paper>
      </Popper>

      <Dialog open={allOpen} onClose={() => setAllOpen(false)} fullWidth maxWidth="xs" dir="rtl">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 2, pl: 1 }}>
          <GroupsRoundedIcon color="primary" />
          <Box sx={{ flex: 1 }}>افراد آنلاین</Box>
          <Typography variant="caption" color="text.secondary">{onlineMembers.length} نفر</Typography>
          <IconButton aria-label="بستن" onClick={() => setAllOpen(false)} size="small">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 0.75, maxHeight: "60vh" }}>
          {onlineMembers.map(({ id, user, membership }) => (
            <OnlineMemberRow key={id} id={id} user={user} membership={membership} currentUserId={currentUserId} />
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
