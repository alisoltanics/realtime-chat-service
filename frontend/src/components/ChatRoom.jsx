import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

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
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1 }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: "1px solid rgba(148,163,184,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {room.roomName ?? roomName}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          /{roomSlug}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <PresenceBar onlineIds={presenceIds} joined={room.joined} />
      </Box>

      {room.error && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          اتصال به اتاق ممکن نشد: {room.error}
        </Alert>
      )}
      {historyError && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
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
        component="form"
        direction="row"
        spacing={1}
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
        sx={{ p: 1.5, borderTop: "1px solid rgba(148,163,184,0.15)" }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="پیام بنویسید…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={connectionStatus !== "connected"}
          inputProps={{ maxLength: 4000, "aria-label": "متن پیام" }}
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
          sx={{ minWidth: 96 }}
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