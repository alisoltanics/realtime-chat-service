import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";

import MessageList from "./MessageList.jsx";
import PresenceBar from "./PresenceBar.jsx";
import { useRealtimeRoom } from "../hooks/useRealtimeRoom.js";
import { messageForCode } from "../lib/api.js";
import { getSession } from "../lib/session.js";

export default function ChatRoom({ roomSlug, roomName }) {
  const currentUser = getSession()?.user ?? null;
  const {
    connectionStatus,
    room,
    presenceIds,
    messages,
    sendMessage,
    retryMessage,
    sendError,
    isLoadingHistory,
    historyError,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useRealtimeRoom(roomSlug);

  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (sendMessage(trimmed)) setText("");
  };

  return (
    <Box className="chat-panel" sx={{ display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1 }}>
      <Box
        className="chat-heading"
        sx={{
          px: { xs: 1.5, sm: 2.5 },
          py: 1.6,
          borderBottom: "1px solid rgba(174,194,210,.12)",
          display: "flex",
          alignItems: "center",
          gap: 1.75,
          flexWrap: "wrap",
          background: "rgba(17,27,43,.55)",
        }}
      >
        <Avatar variant="rounded" sx={{ width: 42, height: 42, bgcolor: "rgba(96,213,194,.13)", color: "primary.light" }}><ForumRoundedIcon /></Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.35 }}>
            {room.roomName ?? roomName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            گفت‌وگوی گروهی · {roomSlug}
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <PresenceBar onlineIds={presenceIds} joined={room.joined} />
      </Box>

      {room.error && (
        <Alert severity="warning" sx={{ borderRadius: 0, mx: 1.5, mt: 1 }}>
          اتصال به اتاق ممکن نشد: {room.error}
        </Alert>
      )}
      {historyError && (
        <Alert severity="error" sx={{ borderRadius: 0, mx: 1.5, mt: 1 }}>
          تاریخچه پیام‌ها بارگذاری نشد: {historyError.message}
        </Alert>
      )}

      <MessageList
        stored={messages.stored}
        pending={messages.pending}
        currentUserId={currentUser?.id ?? null}
        isLoadingHistory={isLoadingHistory}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onRetry={retryMessage}
      />

      <Stack
        className="composer"
        component="form"
        direction="row"
        spacing={0}
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
        sx={{ p: { xs: 1.25, sm: 2 }, columnGap: { xs: 1.25, sm: 1.75 }, alignItems: "stretch", borderTop: "1px solid rgba(174,194,210,.12)", background: "rgba(17,27,43,.68)" }}
      >
        <TextField
          fullWidth
          placeholder="پیامتان را اینجا بنویسید…"
          sx={{ flex: 1, minWidth: 0 }}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={connectionStatus !== "connected"}
          inputProps={{ maxLength: 4000, "aria-label": "متن پیام" }}
          multiline
          maxRows={5}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={connectionStatus !== "connected" || text.trim().length === 0}
          sx={{ alignSelf: "stretch", flexShrink: 0, minWidth: { xs: 72, sm: 112 }, px: { xs: 1.5, sm: 2 }, boxShadow: "0 8px 24px rgba(22,143,130,.2)" }}
        >
          ارسال
        </Button>
      </Stack>
      {sendError && (
        <Alert severity="warning" sx={{ borderRadius: 0, py: 0 }}>
          {messageForCode(sendError, "ارسال پیام با خطا مواجه شد.")}
        </Alert>
      )}
    </Box>
  );
}
