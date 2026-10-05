import { useEffect, useLayoutEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import MessageBubble from "./MessageBubble.jsx";
import { formatDay, isSameDay } from "../lib/format.js";

const NEAR_BOTTOM_PX = 120;

/**
 * Renders the merged message list: persisted messages (history + live) and
 * optimistic bubbles. Both live in the same scroll container so the ordering is
 * always chronological.
 */
export default function MessageList({
  stored,
  pending,
  currentUserId,
  isLoadingHistory,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
}) {
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const scrollSnapshotRef = useRef(null);

  const totalCount = stored.length + pending.length;

  useLayoutEffect(() => {
    // Newer messages only steal the view when the reader is already at the
    // bottom (i.e. following the conversation live).
    if (stickToBottomRef.current) {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
      return;
    }
    // An older page was prepended: keep the message the reader was looking at
    // at the same visual position instead of jumping.
    const element = scrollRef.current;
    const snapshot = scrollSnapshotRef.current;
    if (!element || !snapshot) return;
    scrollSnapshotRef.current = null;
    const delta = element.scrollHeight - snapshot.height;
    if (delta > 0) element.scrollTop = snapshot.top + delta;
  }, [totalCount, stored.length, pending.length, isLoadingHistory]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      stickToBottomRef.current = distance < NEAR_BOTTOM_PX;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  const handleLoadMore = () => {
    const element = scrollRef.current;
    if (element) {
      scrollSnapshotRef.current = { height: element.scrollHeight, top: element.scrollTop };
      stickToBottomRef.current = false;
    }
    onLoadMore();
  };

  return (
    <Box
      ref={scrollRef}
      data-testid="message-list"
      className="message-scroll"
      sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", px: { xs: 0.75, sm: 1.25 }, py: { xs: 1.5, sm: 2 }, scrollBehavior: "smooth" }}
    >
      {hasMore && (
        <Box sx={{ display: "flex", justifyContent: "center", pb: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? <CircularProgress size={16} sx={{ ml: 1 }} /> : null}
            نمایش پیام‌های قبلی
          </Button>
        </Box>
      )}

      {isLoadingHistory && totalCount === 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {!isLoadingHistory && totalCount === 0 && (
        <Typography variant="body2" sx={{ textAlign: "center", opacity: 0.6, py: 6 }}>
          هنوز پیامی در این اتاق نیست. اولین پیام را بفرست!
        </Typography>
      )}

      <Stack className="message-column" spacing={1} sx={{ width: "100%" }}>
        {stored.map((message, index) => {
          const previous = stored[index - 1];
          const showDay = !previous || !isSameDay(previous.created_at, message.created_at);
          const showSender =
            showDay ||
            !previous ||
            previous.sender?.id !== message.sender?.id ||
            new Date(message.created_at) - new Date(previous.created_at) > 5 * 60 * 1000;
          return (
            <Box key={message.id}>
              {showDay && <DayDivider label={formatDay(message.created_at)} />}
              <MessageBubble
                message={message}
                mine={message.sender?.id === currentUserId}
                showSender={showSender}
              />
            </Box>
          );
        })}

        {pending.map((message) => (
          <MessageBubble
            key={`pending-${message.clientId}`}
            message={{ ...message, sender: { id: currentUserId, display_name: "شما" } }}
            mine
            showSender
            pending
            onRetry={onRetry}
          />
        ))}
      </Stack>
    </Box>
  );
}

function DayDivider({ label }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ my: 2 }}>
      <Divider sx={{ flexGrow: 1 }} />
      <Paper variant="outlined" sx={{ px: 1.5, py: 0.3, borderRadius: 999 }}>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {label}
        </Typography>
      </Paper>
      <Divider sx={{ flexGrow: 1 }} />
    </Stack>
  );
}
