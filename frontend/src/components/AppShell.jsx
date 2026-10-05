import { useEffect, useMemo, useState } from "react";
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
import LogoutIcon from "@mui/icons-material/Logout";
import RefreshIcon from "@mui/icons-material/Refresh";

import { endpoints } from "../lib/api.js";
import ChatRoom from "./ChatRoom.jsx";
import ConnectionBadge from "./ConnectionBadge.jsx";
import CreateRoomDialog from "./CreateRoomDialog.jsx";
import { useConnectionStatus } from "../hooks/useConnectionStatus.js";

const DRAWER_WIDTH = 300;

export default function AppShell({ session, onLogout }) {
  const queryClient = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const connectionStatus = useConnectionStatus();

  const token = session.access;
  const rooms = useQuery({
    queryKey: ["rooms", token],
    queryFn: ({ signal }) => endpoints.rooms(token, signal),
  });

  useEffect(() => {
    const list = rooms.data?.results ?? [];
    if (list.length > 0 && !list.some((room) => room.slug === selectedSlug)) {
      setSelectedSlug(list[0].slug);
    }
  }, [rooms.data, selectedSlug]);

  const createRoom = useMutation({
    mutationFn: (payload) => endpoints.createRoom(token, payload),
    onSuccess: (room) => {
      queryClient.setQueryData(["rooms", token], (prev) =>
        prev ? { ...prev, results: [room, ...prev.results] } : { results: [room] }
      );
      setDialogOpen(false);
      setSelectedSlug(room.slug);
    },
  });

  const selectedRoom = useMemo(
    () => (rooms.data?.results ?? []).find((room) => room.slug === selectedSlug) ?? null,
    [rooms.data, selectedSlug]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: "1px solid rgba(148,163,184,0.15)",
          backdropFilter: "blur(6px)",
          px: 2,
          zIndex: 2,
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 56 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            چت زنده
          </Typography>
          <ConnectionBadge status={connectionStatus} />
          <Chip size="small" variant="outlined" label={session.user.display_name} />
          <Tooltip title="خروج">
            <IconButton onClick={onLogout} size="small" color="inherit">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        {/* Sidebar. A plain <aside> instead of <Drawer variant="permanent">:
            the docked drawer positions its paper with `position: fixed`, which
            escapes the flex layout in an RTL container. */}
        <Box
          component="aside"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderInlineEnd: "1px solid rgba(148,163,184,0.15)",
            backgroundColor: "background.paper",
          }}
        >
          <Toolbar variant="dense" sx={{ gap: 1, px: 2 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1, opacity: 0.8 }}>
              اتاق‌ها
            </Typography>
            <Tooltip title="اتاق جدید">
              <IconButton size="small" aria-label="اتاق جدید" onClick={() => setDialogOpen(true)}>
                <Typography sx={{ fontSize: 20, lineHeight: 1 }}>+</Typography>
              </IconButton>
            </Tooltip>
            <Tooltip title="تازه‌سازی">
              <IconButton size="small" aria-label="تازه‌سازی لیست اتاق‌ها" onClick={() => rooms.refetch()}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Toolbar>
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
            <List dense sx={{ overflowY: "auto", py: 1 }}>
              {(rooms.data?.results ?? []).map((room) => (
                <ListItemButton
                  key={room.slug}
                  selected={room.slug === selectedSlug}
                  onClick={() => setSelectedSlug(room.slug)}
                  sx={{ mx: 1, borderRadius: 2, alignItems: "flex-start", py: 1 }}
                >
                  <Avatar sx={{ ml: 1.2, width: 34, height: 34, fontSize: 14 }}>
                    {room.name.slice(0, 2)}
                  </Avatar>
                  <ListItemText
                    primary={room.name}
                    secondary={
                      room.last_message
                        ? `${room.last_message.sender}: ${room.last_message.text}`
                        : `${room.member_count} عضو - بدون پیام`
                    }
                    primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: 11, noWrap: true }}
                  />
                </ListItemButton>
              ))}
              {(rooms.data?.results ?? []).length === 0 && (
                <Typography variant="body2" sx={{ p: 2, opacity: 0.6 }}>
                  اتاقی وجود ندارد. با دکمه + یک اتاق بساز.
                </Typography>
              )}
            </List>
          )}
        </Box>

        <Box component="main" sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
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