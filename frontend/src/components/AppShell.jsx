import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import RefreshIcon from "@mui/icons-material/Refresh";

import { endpoints } from "../lib/api.js";
import { EVENTS } from "../lib/config.js";
import { getSocket } from "../lib/socket.js";
import ChatRoom from "./ChatRoom.jsx";
import ConnectionBadge from "./ConnectionBadge.jsx";
import CreateRoomDialog from "./CreateRoomDialog.jsx";
import { useConnectionStatus } from "../hooks/useConnectionStatus.js";

const DRAWER_WIDTH = 360;

function sortRoomsByLatestMessage(rooms = []) {
  return [...rooms].sort((a, b) => {
    const aHasMessage = Boolean(a.last_message);
    const bHasMessage = Boolean(b.last_message);
    if (aHasMessage !== bHasMessage) return aHasMessage ? -1 : 1;

    const aDate = Date.parse(a.last_message?.created_at ?? a.created_at) || 0;
    const bDate = Date.parse(b.last_message?.created_at ?? b.created_at) || 0;
    if (aDate !== bDate) return bDate - aDate;

    return (b.last_message?.id ?? b.id) - (a.last_message?.id ?? a.id);
  });
}

function roomFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/chat\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function AppShell({ session, onLogout }) {
  const queryClient = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState(() => roomFromPath());
  const [dialogOpen, setDialogOpen] = useState(false);
  const connectionStatus = useConnectionStatus();

  const selectRoom = useCallback((slug, { replace = false } = {}) => {
    setSelectedSlug(slug);
    const nextPath = slug ? `/chat/${encodeURIComponent(slug)}` : "/";
    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({ room: slug }, "", nextPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => setSelectedSlug(roomFromPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const token = session.access;
  const rooms = useQuery({
    queryKey: ["rooms", token],
    queryFn: ({ signal }) => endpoints.rooms(token, signal),
    refetchInterval: 10_000,
  });

  const sortedRooms = useMemo(
    () => sortRoomsByLatestMessage(rooms.data?.results ?? []),
    [rooms.data]
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handleNewMessage = ({ room: slug, message } = {}) => {
      if (!slug || !message) return;
      queryClient.setQueryData(["rooms", token], (previous) => {
        if (!previous?.results) return previous;
        const results = previous.results.map((room) =>
          room.slug === slug
            ? {
                ...room,
                last_message: {
                  id: message.id,
                  sender: message.sender_username ?? message.sender?.username ?? "",
                  text: (message.text ?? "").slice(0, 120),
                  created_at: message.created_at,
                },
              }
            : room
        );
        return { ...previous, results: sortRoomsByLatestMessage(results) };
      });
    };

    socket.on(EVENTS.MESSAGE_NEW, handleNewMessage);
    return () => socket.off(EVENTS.MESSAGE_NEW, handleNewMessage);
  }, [queryClient, token]);

  useEffect(() => {
    const list = rooms.data?.results ?? [];
    if (!rooms.isSuccess) return;

    if (selectedSlug && list.some((room) => room.slug === selectedSlug)) return;

    if (list.length > 0) {
      selectRoom(list[0].slug, { replace: true });
    } else if (selectedSlug) {
      selectRoom(null, { replace: true });
    }
  }, [rooms.data, rooms.isSuccess, selectedSlug, selectRoom]);

  const createRoom = useMutation({
    mutationFn: (payload) => endpoints.createRoom(token, payload),
    onSuccess: (room) => {
      queryClient.setQueryData(["rooms", token], (prev) => {
        const results = prev ? [room, ...prev.results] : [room];
        return { ...(prev ?? {}), results: sortRoomsByLatestMessage(results) };
      });
      setDialogOpen(false);
      selectRoom(room.slug);
    },
  });

  const selectedRoom = useMemo(
    () => (rooms.data?.results ?? []).find((room) => room.slug === selectedSlug) ?? null,
    [rooms.data, selectedSlug]
  );

  return (
    <Box className="app-shell" sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: "1px solid rgba(174,194,210,.12)",
          backdropFilter: "blur(18px)",
          background: "rgba(8,15,27,.82)",
          px: { xs: 1, sm: 2.5 },
          zIndex: 2,
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: { xs: 60, sm: 68 } }}>
          <Avatar className="brand-mark" variant="rounded" sx={{ width: 38, height: 38, bgcolor: "primary.main", color: "primary.contrastText" }}>
            <ForumRoundedIcon fontSize="small" />
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>سرچ‌وایز چت</Typography>
            <Typography variant="caption" color="text.secondary" className="topbar-caption">گفت‌وگوهای زنده، ساده و سریع</Typography>
          </Box>
          <ConnectionBadge status={connectionStatus} />
          <Chip
            className="account-chip"
            size="small"
            avatar={<Avatar>{(session.user.display_name || session.user.username).slice(0, 1)}</Avatar>}
            label={session.user.display_name || session.user.username}
            variant="outlined"
            sx={{ borderColor: "divider", maxWidth: 180, fontWeight: 600 }}
          />
          <Tooltip title="خروج">
            <IconButton onClick={onLogout} size="small" color="inherit">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box className="app-body" sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        {/* Sidebar. A plain <aside> instead of <Drawer variant="permanent">:
            the docked drawer positions its paper with `position: fixed`, which
            escapes the flex layout in an RTL container. */}
        <Box
          component="aside"
          className="room-sidebar"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderInlineEnd: "1px solid rgba(174,194,210,.12)",
            background: "linear-gradient(180deg, rgba(17,27,43,.96), rgba(13,22,36,.96))",
          }}
        >
          <Box sx={{ px: 2.25, pt: 2.5, pb: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.8 }}>
              <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 800 }}>فضاهای گفتگو</Typography>
              <Chip size="small" label={sortedRooms.length} sx={{ height: 23, bgcolor: "rgba(96,213,194,.1)", color: "primary.light", fontWeight: 700 }} />
            </Box>
            <Typography variant="caption" color="text.secondary">اتاقی را انتخاب کنید یا گفت‌وگوی تازه‌ای بسازید.</Typography>
          </Box>
          <Box className="room-toolbar" sx={{ display: "flex", px: 2, pb: 1.25, gap: 1 }}>
            <Tooltip title="اتاق جدید">
              <IconButton className="create-room-button" aria-label="اتاق جدید" onClick={() => setDialogOpen(true)}>
                <AddRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="تازه‌سازی">
              <IconButton className="refresh-room-button" aria-label="تازه‌سازی لیست اتاق‌ها" onClick={() => rooms.refetch()}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Divider />
          {rooms.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={22} />
            </Box>
          ) : rooms.isError ? (
            <Typography variant="body2" color="error" sx={{ p: 2 }}>
              بارگذاری اتاق‌ها ناموفق بود.
            </Typography>
          ) : (
            <List dense className="room-list" sx={{ overflowY: "auto", py: 1.25, px: 1 }}>
              {sortedRooms.map((room) => (
                <ListItemButton
                  key={room.slug}
                  selected={room.slug === selectedSlug}
                  onClick={() => selectRoom(room.slug)}
                  sx={{ mx: 1, borderRadius: 2, alignItems: "flex-start", py: 1 }}
                  className="room-item"
                >
                  <Avatar variant="rounded" sx={{ ml: 1.2, mt: 0.2, width: 40, height: 40, fontSize: 14, fontWeight: 800, bgcolor: room.slug === selectedSlug ? "rgba(96,213,194,.18)" : "rgba(169,154,255,.13)", color: room.slug === selectedSlug ? "primary.light" : "secondary.main" }}>
                    {room.name.slice(0, 1)}
                  </Avatar>
                  <ListItemText
                    primary={room.name}
                    secondary={
                      room.last_message
                        ? `${room.last_message.sender}: ${room.last_message.text}`
                        : `${room.member_count} عضو · هنوز پیامی نیست`
                    }
                    primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: 11, noWrap: true }}
                  />
                </ListItemButton>
              ))}
              {sortedRooms.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  هنوز اتاقی ندارید. با دکمهٔ + اولین اتاق را بسازید.
                </Typography>
              )}
            </List>
          )}
        </Box>

        <Box component="main" className="chat-main" sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", p: { xs: 0, md: 2 } }}>
          {selectedSlug ? (
            <ChatRoom key={selectedSlug} roomSlug={selectedSlug} roomName={selectedRoom?.name ?? selectedSlug} />
          ) : (
            <Box sx={{ m: "auto", opacity: 0.6 }}>
              <Typography>یک اتاق انتخاب کن</Typography>
            </Box>
          )}
        </Box>
      </Box>

      <CreateRoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(payload) => createRoom.mutate(payload)}
        isPending={createRoom.isPending}
        error={createRoom.error?.message ?? null}
      />
    </Box>
  );
}
