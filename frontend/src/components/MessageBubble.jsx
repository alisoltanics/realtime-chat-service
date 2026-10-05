import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
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
      sx={{ display: "flex", justifyContent: mine ? "flex-start" : "flex-end", px: 0.5 }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1.1,
          px: 1.6,
          maxWidth: "min(72%, 640px)",
          borderRadius: 3,
          bgcolor: mine ? "primary.dark" : "background.paper",
          border: "1px solid",
          borderColor: failed ? "error.main" : mine ? "primary.main" : "rgba(148,163,184,0.2)",
          borderStyle: failed ? "dashed" : "solid",
          opacity: pending && !failed ? 0.65 : 1,
        }}
      >
        {showSender && (
          <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.3 }}>
            {mine ? "من" : displayName}
            <Box component="span" sx={{ opacity: 0.6, ms: 1 }}>
              ({initials(displayName)})
            </Box>
          </Typography>
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