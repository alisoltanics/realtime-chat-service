import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

import { formatTime, initials } from "../lib/format.js";

/**
 * One message bubble. `pending` marks an optimistic (not yet stored) message:
 * it is dimmed and, on failure, offers a retry.
 */
export default function MessageBubble({
  message,
  mine = false,
  showSender = true,
  pending = false,
  onRetry,
}) {
  const sender = message.sender ?? {};
  const displayName = sender.display_name ?? sender.username ?? "ناشناس";
  const failed = Boolean(message.failed);

  return (
    <Box
      data-testid="message-bubble"
      data-message-id={message.id ?? message.clientId}
      sx={{ display: "flex", justifyContent: mine ? "flex-start" : "flex-end", px: 0.5, animation: "message-in .18s ease-out" }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1.2,
          px: 1.65,
          maxWidth: "min(78%, 680px)",
          borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px",
          bgcolor: mine ? "rgba(22,143,130,.24)" : "rgba(24,38,57,.92)",
          border: "1px solid",
          borderColor: failed ? "error.main" : mine ? "rgba(96,213,194,.34)" : "rgba(174,194,210,.12)",
          borderStyle: failed ? "dashed" : "solid",
          opacity: pending && !failed ? 0.65 : 1,
        }}
      >
        {showSender && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.45 }}>
            <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: mine ? "primary.dark" : "secondary.dark" }}>
              {initials(displayName)}
            </Avatar>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {mine ? "شما" : displayName}
            </Typography>
          </Box>
        )}
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.text}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 0.5,
            mt: 0.4,
            opacity: 0.65,
          }}
        >
          <Typography variant="caption">
            {formatTime(message.created_at ?? message.createdAt)}
          </Typography>
          {pending && !failed && <ScheduleIcon sx={{ fontSize: 13 }} />}
          {failed && (
            <Tooltip title="ارسال نشد">
              <ErrorOutlineIcon sx={{ fontSize: 14, color: "error.main" }} />
            </Tooltip>
          )}
          {failed && onRetry && (
            <Typography
              component="button"
              type="button"
              variant="caption"
              onClick={() => onRetry(message.clientId)}
              sx={{
                background: "none",
                border: 0,
                p: 0,
                cursor: "pointer",
                textDecoration: "underline",
                color: "inherit",
              }}
            >
              تلاش دوباره
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
